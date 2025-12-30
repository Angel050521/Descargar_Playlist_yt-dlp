const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const fs = require('fs');

// Mantener referencia global de la ventana
let mainWindow;
let serverProcess;

// Función para encontrar yt-dlp
function findYtDlp() {
    const possiblePaths = [
        // En recursos de la app (para producción)
        path.join(process.resourcesPath, 'bin', 'yt-dlp.exe'),
        // En la carpeta bin del proyecto (para desarrollo)
        path.join(__dirname, 'bin', 'yt-dlp.exe'),
        // En el PATH del sistema
        'yt-dlp'
    ];

    for (const ytdlpPath of possiblePaths) {
        try {
            if (ytdlpPath === 'yt-dlp') {
                // Verificar si está en el PATH
                execSync('yt-dlp --version', { stdio: 'ignore' });
                return 'yt-dlp';
            } else if (fs.existsSync(ytdlpPath)) {
                return ytdlpPath;
            }
        } catch (e) {
            continue;
        }
    }
    return null;
}

// Función para verificar y descargar yt-dlp si es necesario
async function ensureYtDlp() {
    const ytdlpPath = findYtDlp();

    if (ytdlpPath) {
        console.log('✅ yt-dlp encontrado:', ytdlpPath);
        process.env.YTDLP_PATH = ytdlpPath;
        return true;
    }

    // Crear directorio bin si no existe
    const binDir = path.join(__dirname, 'bin');
    if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
    }

    const ytdlpExe = path.join(binDir, 'yt-dlp.exe');

    console.log('⏬ Descargando yt-dlp...');

    try {
        const https = require('https');
        const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';

        await new Promise((resolve, reject) => {
            const file = fs.createWriteStream(ytdlpExe);

            const request = (urlToGet) => {
                https.get(urlToGet, (response) => {
                    if (response.statusCode === 302 || response.statusCode === 301) {
                        request(response.headers.location);
                        return;
                    }

                    response.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        resolve();
                    });
                }).on('error', (err) => {
                    fs.unlink(ytdlpExe, () => { });
                    reject(err);
                });
            };

            request(url);
        });

        console.log('✅ yt-dlp descargado correctamente');
        process.env.YTDLP_PATH = ytdlpExe;
        return true;

    } catch (error) {
        console.error('❌ Error descargando yt-dlp:', error);
        return false;
    }
}

// Función para iniciar el servidor
function startServer() {
    return new Promise((resolve, reject) => {
        const serverPath = path.join(__dirname, 'server.js');

        // Configurar variables de entorno
        const env = {
            ...process.env,
            ELECTRON_RUN_AS_NODE: '1'
        };

        serverProcess = spawn(process.execPath, [serverPath], {
            env,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        serverProcess.stdout.on('data', (data) => {
            console.log(`Server: ${data}`);
            if (data.toString().includes('Servidor corriendo')) {
                resolve();
            }
        });

        serverProcess.stderr.on('data', (data) => {
            console.error(`Server Error: ${data}`);
        });

        serverProcess.on('error', (error) => {
            console.error('Error iniciando servidor:', error);
            reject(error);
        });

        // Timeout por si el servidor no inicia
        setTimeout(resolve, 3000);
    });
}

// Función para crear la ventana principal
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        backgroundColor: '#0a0a0f',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        },
        autoHideMenuBar: true,
        show: false
    });

    // Cargar la aplicación desde el servidor local
    mainWindow.loadURL('http://localhost:3000');

    // Mostrar ventana cuando esté lista
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Abrir links externos en el navegador
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Manejar cierre de ventana
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Función para mostrar pantalla de carga
function createLoadingWindow() {
    const loadingWin = new BrowserWindow({
        width: 400,
        height: 300,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        webPreferences: {
            nodeIntegration: false
        }
    });

    loadingWin.loadURL(`data:text/html;charset=utf-8,
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {
                    margin: 0;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    background: linear-gradient(135deg, #0a0a0f 0%, #1a1a24 100%);
                    font-family: 'Segoe UI', sans-serif;
                    color: white;
                    border-radius: 20px;
                }
                .spinner {
                    width: 50px;
                    height: 50px;
                    border: 3px solid rgba(139, 92, 246, 0.3);
                    border-top-color: #8b5cf6;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                h2 {
                    margin-top: 20px;
                    font-size: 18px;
                    font-weight: 500;
                    background: linear-gradient(135deg, #8b5cf6, #ec4899);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                p {
                    color: rgba(255,255,255,0.6);
                    font-size: 14px;
                }
            </style>
        </head>
        <body>
            <div class="spinner"></div>
            <h2>Playlist Downloader</h2>
            <p>Iniciando...</p>
        </body>
        </html>
    `);

    return loadingWin;
}

// Inicialización de la aplicación
app.whenReady().then(async () => {
    const loadingWin = createLoadingWindow();

    try {
        // Verificar/descargar yt-dlp
        const ytdlpReady = await ensureYtDlp();

        if (!ytdlpReady) {
            dialog.showErrorBox(
                'Error',
                'No se pudo encontrar o descargar yt-dlp. Por favor, instálalo manualmente.'
            );
            app.quit();
            return;
        }

        // Iniciar servidor
        await startServer();

        // Cerrar pantalla de carga y mostrar app
        loadingWin.close();
        createWindow();

    } catch (error) {
        console.error('Error en inicialización:', error);
        loadingWin.close();
        dialog.showErrorBox('Error', `Error iniciando la aplicación: ${error.message}`);
        app.quit();
    }
});

// Cerrar servidor cuando se cierra la app
app.on('before-quit', () => {
    if (serverProcess) {
        serverProcess.kill();
    }
});

app.on('window-all-closed', () => {
    if (serverProcess) {
        serverProcess.kill();
    }
    app.quit();
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
