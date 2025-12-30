const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const archiver = require('archiver');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const YTDLP_CMD = process.env.YTDLP_PATH || 'yt-dlp';

// Crear directorio de descargas si no existe
if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/downloads', express.static(DOWNLOADS_DIR));

// Obtener información de la playlist
app.post('/api/playlist-info', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL es requerida' });
    }

    try {
        const ytdlp = spawn(YTDLP_CMD, [
            '--flat-playlist',
            '-J',
            '--no-warnings',
            url
        ]);

        let output = '';
        let errorOutput = '';

        ytdlp.stdout.on('data', (data) => {
            output += data.toString();
        });

        ytdlp.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        ytdlp.on('close', (code) => {
            if (code !== 0) {
                console.error('yt-dlp error:', errorOutput);
                return res.status(500).json({
                    error: 'Error al obtener información de la playlist',
                    details: errorOutput
                });
            }

            try {
                const playlistData = JSON.parse(output);

                // Función para estimar tamaño de archivo
                const estimateFileSize = (duration, format) => {
                    if (!duration) return null;
                    // MP3 320kbps ≈ 40KB/s, MP3 192kbps ≈ 24KB/s, MP4 720p ≈ 150KB/s
                    const bytesPerSecond = format === 'mp3' ? 40 * 1024 : 150 * 1024;
                    return Math.round(duration * bytesPerSecond);
                };

                const songs = playlistData.entries ? playlistData.entries.map((entry, index) => ({
                    id: entry.id,
                    title: entry.title || `Video ${index + 1}`,
                    duration: entry.duration,
                    url: `https://www.youtube.com/watch?v=${entry.id}`,
                    thumbnail: entry.thumbnails ? entry.thumbnails[0]?.url : null,
                    channel: entry.channel || entry.uploader || 'Desconocido',
                    // Información adicional para metadatos
                    artist: entry.channel || entry.uploader || entry.artist || 'Desconocido',
                    album: playlistData.title || 'YouTube Playlist',
                    // Estimaciones de tamaño
                    estimatedSizeMp3: estimateFileSize(entry.duration, 'mp3'),
                    estimatedSizeMp4: estimateFileSize(entry.duration, 'mp4')
                })) : [];

                // Calcular totales
                const totalDuration = songs.reduce((acc, song) => acc + (song.duration || 0), 0);
                const totalSizeMp3 = songs.reduce((acc, song) => acc + (song.estimatedSizeMp3 || 0), 0);
                const totalSizeMp4 = songs.reduce((acc, song) => acc + (song.estimatedSizeMp4 || 0), 0);

                res.json({
                    title: playlistData.title || 'Playlist',
                    channel: playlistData.channel || playlistData.uploader || 'Desconocido',
                    count: songs.length,
                    totalDuration,
                    estimatedSizes: {
                        mp3: totalSizeMp3,
                        mp4: totalSizeMp4
                    },
                    songs
                });
            } catch (parseError) {
                console.error('Parse error:', parseError);
                res.status(500).json({ error: 'Error al procesar la información' });
            }
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Endpoint para descargar archivo individual
app.get('/api/download/:sessionId/:filename', (req, res) => {
    const { sessionId, filename } = req.params;
    const filePath = path.join(DOWNLOADS_DIR, sessionId, decodeURIComponent(filename));

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    const stat = fs.statSync(filePath);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
});

// Endpoint para descargar todos los archivos como ZIP
app.get('/api/download-zip/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const sessionDir = path.join(DOWNLOADS_DIR, sessionId);

    if (!fs.existsSync(sessionDir)) {
        return res.status(404).json({ error: 'Sesión no encontrada' });
    }

    const zipFilename = `playlist_${sessionId}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

    const archive = archiver('zip', { zlib: { level: 5 } });

    archive.on('error', (err) => {
        console.error('Error creando ZIP:', err);
        res.status(500).json({ error: 'Error al crear ZIP' });
    });

    archive.pipe(res);
    archive.directory(sessionDir, false);
    archive.finalize();
});

// Función para descargar en paralelo con límite de concurrencia
async function downloadWithConcurrency(songs, sessionDir, format, socket, concurrency = 6, options = {}) {
    const results = [];
    const queue = [...songs.map((song, index) => ({ song, index }))];
    const activeDownloads = new Map();
    let completedCount = 0;
    const startTime = Date.now();
    let totalBytesDownloaded = 0;

    // Estadísticas globales mejoradas
    const globalStats = {
        totalSongs: songs.length,
        completedSongs: 0,
        activeSpeeds: new Map(), // Velocidades activas por canción
        activeProgress: new Map(), // Progreso activo por canción (0-100)
        startTime: startTime,
        completionTimes: [], // Tiempos de completado de cada canción
        lastETA: null // Para suavizado del ETA
    };

    // Emitir estadísticas globales periódicamente
    const statsInterval = setInterval(() => {
        const elapsedSeconds = (Date.now() - startTime) / 1000;

        // Calcular velocidad total
        let totalSpeed = 0;
        globalStats.activeSpeeds.forEach(speed => totalSpeed += speed);

        // Calcular ETA basado en múltiples factores
        let estimatedRemainingTime = 0;
        const remainingSongs = globalStats.totalSongs - globalStats.completedSongs;

        if (remainingSongs > 0) {
            // Método 1: Basado en tiempos de completado anteriores
            let avgCompletionTime = 30; // Default 30 segundos
            if (globalStats.completionTimes.length > 0) {
                // Usar promedio ponderado de los últimos tiempos (más peso a los recientes)
                const recentTimes = globalStats.completionTimes.slice(-5);
                const weights = recentTimes.map((_, i) => i + 1);
                const totalWeight = weights.reduce((a, b) => a + b, 0);
                avgCompletionTime = recentTimes.reduce((sum, time, i) => sum + time * weights[i], 0) / totalWeight;
            }

            // Método 2: Basado en progreso actual de descargas activas
            let activeRemaining = 0;
            let activeCount = 0;
            globalStats.activeProgress.forEach((progress, songId) => {
                const speed = globalStats.activeSpeeds.get(songId) || 0;
                if (progress > 0 && progress < 100) {
                    // Estimar tiempo restante para esta descarga
                    const remainingProgress = 100 - progress;
                    if (speed > 0) {
                        // Asumimos que la velocidad es constante para esta descarga
                        const elapsedForThis = (progress / 100) * avgCompletionTime;
                        const estimatedTotalTime = elapsedForThis / (progress / 100);
                        activeRemaining += estimatedTotalTime - elapsedForThis;
                    } else {
                        activeRemaining += (remainingProgress / 100) * avgCompletionTime;
                    }
                    activeCount++;
                }
            });

            // Calcular descargas en cola (no activas aún)
            const queuedSongs = remainingSongs - activeCount;
            const concurrentBatches = Math.ceil(queuedSongs / Math.min(concurrency, queuedSongs || 1));
            const queueTime = concurrentBatches * avgCompletionTime;

            // Tiempo restante = máximo tiempo de descarga activa + tiempo de cola
            const maxActiveRemaining = activeCount > 0 ? activeRemaining / activeCount : 0;
            estimatedRemainingTime = maxActiveRemaining + queueTime;

            // Suavizado exponencial para evitar saltos bruscos
            if (globalStats.lastETA !== null && globalStats.lastETA > 0) {
                const smoothingFactor = 0.3; // 0 = sin cambio, 1 = cambio total
                estimatedRemainingTime = globalStats.lastETA * (1 - smoothingFactor) + estimatedRemainingTime * smoothingFactor;
            }
            globalStats.lastETA = estimatedRemainingTime;
        }

        socket.emit('global-stats', {
            totalSpeed: totalSpeed,
            elapsedTime: elapsedSeconds,
            estimatedRemainingTime: estimatedRemainingTime,
            completedSongs: globalStats.completedSongs,
            totalSongs: globalStats.totalSongs,
            activeSongs: activeDownloads.size
        });
    }, 500);

    return new Promise((resolve) => {
        const startNext = () => {
            while (activeDownloads.size < concurrency && queue.length > 0) {
                const { song, index } = queue.shift();

                socket.emit('song-progress', {
                    index,
                    songId: song.id,
                    status: 'downloading',
                    title: song.title,
                    progress: 0,
                    speed: null,
                    eta: null,
                    downloaded: null,
                    totalSize: null
                });

                // Registrar tiempo de inicio de esta descarga
                const songStartTime = Date.now();
                globalStats.activeProgress.set(song.id, 0);

                const downloadPromise = downloadSong(song, sessionDir, format, options, (progressData) => {
                    // Actualizar velocidad y progreso activo
                    if (progressData.speed) {
                        globalStats.activeSpeeds.set(song.id, progressData.speedBytes || 0);
                    }
                    globalStats.activeProgress.set(song.id, progressData.progress);

                    socket.emit('song-progress', {
                        index,
                        songId: song.id,
                        status: 'downloading',
                        title: song.title,
                        progress: progressData.progress,
                        speed: progressData.speed,
                        eta: progressData.eta,
                        downloaded: progressData.downloaded,
                        totalSize: progressData.totalSize
                    });
                })
                    .then(() => {
                        // Registrar tiempo de completado
                        const completionTime = (Date.now() - songStartTime) / 1000;
                        globalStats.completionTimes.push(completionTime);

                        completedCount++;
                        globalStats.completedSongs++;
                        globalStats.activeSpeeds.delete(song.id);
                        globalStats.activeProgress.delete(song.id);

                        socket.emit('song-progress', {
                            index,
                            songId: song.id,
                            status: 'completed',
                            title: song.title,
                            progress: 100
                        });
                        results.push({ success: true, song });
                    })
                    .catch((error) => {
                        // También registramos el tiempo aunque falle
                        const completionTime = (Date.now() - songStartTime) / 1000;
                        globalStats.completionTimes.push(completionTime);

                        completedCount++;
                        globalStats.completedSongs++;
                        globalStats.activeSpeeds.delete(song.id);
                        globalStats.activeProgress.delete(song.id);

                        console.error(`Error descargando ${song.title}:`, error);
                        socket.emit('song-progress', {
                            index,
                            songId: song.id,
                            status: 'error',
                            title: song.title,
                            error: error.message
                        });
                        results.push({ success: false, song, error: error.message });
                    })
                    .finally(() => {
                        activeDownloads.delete(song.id);
                        if (queue.length > 0) {
                            startNext();
                        } else if (activeDownloads.size === 0) {
                            clearInterval(statsInterval);
                            resolve(results);
                        }
                    });

                activeDownloads.set(song.id, downloadPromise);
            }
        };

        startNext();
    });
}

// Socket.io para descargas en tiempo real
io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);

    socket.on('start-download', async (data) => {
        const { songs, format, quality, filenameTemplate, embedMetadata } = data;
        const sessionId = `session_${Date.now()}`;
        const sessionDir = path.join(DOWNLOADS_DIR, sessionId);

        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        // Opciones de descarga
        const downloadOptions = {
            filenameTemplate: filenameTemplate || '%(title)s',
            embedMetadata: embedMetadata !== false, // Por defecto true
            quality: quality || (format === 'mp3' ? '256' : '720') // Calidad por defecto
        };

        socket.emit('download-started', {
            total: songs.length,
            sessionDir: sessionId
        });

        // Descargar con 6 descargas simultáneas
        await downloadWithConcurrency(songs, sessionDir, format, socket, 6, downloadOptions);

        // Obtener lista de archivos descargados
        let files = [];
        try {
            const dirContents = fs.readdirSync(sessionDir);
            files = dirContents
                .filter(file => !file.endsWith('.part') && !file.endsWith('.ytdl'))
                .map(file => {
                    const filePath = path.join(sessionDir, file);
                    const stats = fs.statSync(filePath);
                    return {
                        name: file,
                        path: `/downloads/${sessionId}/${encodeURIComponent(file)}`,
                        size: stats.size
                    };
                })
                .filter(file => file.size > 0);
        } catch (err) {
            console.error('Error leyendo directorio:', err);
        }

        socket.emit('download-complete', {
            files,
            sessionDir: sessionId
        });
    });

    socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
    });
});

function downloadSong(song, outputDir, format, options, onProgress) {
    return new Promise((resolve, reject) => {
        // Construir plantilla de nombre de archivo
        const template = options.filenameTemplate || '%(title)s';
        const outputTemplate = path.join(outputDir, `${template}.%(ext)s`);
        const quality = options.quality || (format === 'mp3' ? '256' : '720');

        const args = [
            '-o', outputTemplate,
            '--no-playlist',
            '--no-warnings',
            '--newline',
            '--progress',
            '--progress-template', '%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress._downloaded_bytes_str)s|%(progress._total_bytes_str)s'
        ];

        if (format === 'mp3') {
            // Convertir calidad numérica a parámetro de yt-dlp (0=mejor, 9=peor)
            // 320k=0, 256k=2, 192k=5, 128k=7
            const qualityMap = { '320': '0', '256': '2', '192': '5', '128': '7' };
            const audioQuality = qualityMap[quality] || '2';

            args.push('-x', '--audio-format', 'mp3', '--audio-quality', audioQuality);

            // Metadatos automáticos para MP3
            if (options.embedMetadata) {
                args.push(
                    '--embed-thumbnail',           // Carátula
                    '--embed-metadata',            // Metadatos generales
                    '--add-metadata',              // Añadir metadatos al archivo
                    '--parse-metadata', `title:%(title)s`,
                    '--parse-metadata', `${song.artist || song.channel}:%(artist)s`,
                    '--parse-metadata', `${song.album || 'YouTube'}:%(album)s`,
                    '--convert-thumbnails', 'jpg'  // Convertir thumbnail a jpg para compatibilidad
                );
            }
        } else if (format === 'mp4') {
            // Seleccionar calidad de video específica
            // 2160=4K, 1080=Full HD, 720=HD, 480=SD, 360=Low
            const heightFilter = quality === '2160' ? '2160' : quality;
            const formatString = `bestvideo[height<=${heightFilter}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${heightFilter}][ext=mp4]/best`;

            args.push('-f', formatString);

            // Metadatos para MP4
            if (options.embedMetadata) {
                args.push(
                    '--embed-thumbnail',
                    '--embed-metadata'
                );
            }
        }

        args.push(song.url);

        const ytdlp = spawn(YTDLP_CMD, args);
        let lastProgress = 0;

        ytdlp.stdout.on('data', (data) => {
            const output = data.toString();

            // Intentar parsear el formato detallado
            // Formato: porcentaje|velocidad|eta|descargado|total
            const lines = output.split('\n').filter(line => line.trim());

            for (const line of lines) {
                // Intentar parsear formato con plantilla
                const parts = line.split('|');
                if (parts.length >= 3) {
                    const percentStr = parts[0]?.trim();
                    const speedStr = parts[1]?.trim();
                    const etaStr = parts[2]?.trim();
                    const downloadedStr = parts[3]?.trim();
                    const totalStr = parts[4]?.trim();

                    const progressMatch = percentStr?.match(/([\d.]+)/);
                    if (progressMatch) {
                        const progress = parseFloat(progressMatch[1]);
                        if (progress >= lastProgress) {
                            lastProgress = progress;

                            // Parsear velocidad a bytes para estadísticas globales
                            let speedBytes = 0;
                            if (speedStr && speedStr !== 'N/A' && speedStr !== 'Unknown') {
                                const speedMatch = speedStr.match(/([\d.]+)\s*(\w+)/i);
                                if (speedMatch) {
                                    const value = parseFloat(speedMatch[1]);
                                    const unit = speedMatch[2].toUpperCase();
                                    if (unit.includes('G')) speedBytes = value * 1024 * 1024 * 1024;
                                    else if (unit.includes('M')) speedBytes = value * 1024 * 1024;
                                    else if (unit.includes('K')) speedBytes = value * 1024;
                                    else speedBytes = value;
                                }
                            }

                            onProgress({
                                progress: progress,
                                speed: speedStr !== 'N/A' && speedStr !== 'Unknown' ? speedStr : null,
                                speedBytes: speedBytes,
                                eta: etaStr !== 'N/A' && etaStr !== 'Unknown' ? etaStr : null,
                                downloaded: downloadedStr !== 'N/A' && downloadedStr !== 'Unknown' ? downloadedStr : null,
                                totalSize: totalStr !== 'N/A' && totalStr !== 'Unknown' ? totalStr : null
                            });
                        }
                    }
                } else {
                    // Fallback al formato simple de porcentaje
                    const progressMatch = line.match(/(\d+\.?\d*)%/);
                    if (progressMatch) {
                        const progress = parseFloat(progressMatch[1]);
                        if (progress > lastProgress) {
                            lastProgress = progress;
                            onProgress({
                                progress: progress,
                                speed: null,
                                speedBytes: 0,
                                eta: null,
                                downloaded: null,
                                totalSize: null
                            });
                        }
                    }
                }
            }
        });

        ytdlp.stderr.on('data', (data) => {
            // Silenciar errores stderr para no saturar la consola
            // console.error(`stderr: ${data}`);
        });

        ytdlp.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`yt-dlp terminó con código ${code}`));
            }
        });

        ytdlp.on('error', (error) => {
            reject(error);
        });
    });
}

// Limpiar descargas antiguas (más de 1 hora)
function cleanOldDownloads() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);

    if (fs.existsSync(DOWNLOADS_DIR)) {
        fs.readdirSync(DOWNLOADS_DIR).forEach(dir => {
            const dirPath = path.join(DOWNLOADS_DIR, dir);
            const stat = fs.statSync(dirPath);

            if (stat.isDirectory() && stat.mtimeMs < oneHourAgo) {
                fs.rmSync(dirPath, { recursive: true, force: true });
                console.log(`Limpiado directorio antiguo: ${dir}`);
            }
        });
    }
}

// Limpiar cada 30 minutos
setInterval(cleanOldDownloads, 30 * 60 * 1000);

httpServer.listen(PORT, () => {
    console.log(`🎵 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`📁 Descargas se guardan en: ${DOWNLOADS_DIR}`);
});
