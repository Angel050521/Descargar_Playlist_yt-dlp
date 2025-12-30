class PlaylistDownloader {
    constructor() {
        // DOM Elements
        this.elements = {
            // Input Section
            playlistUrl: document.getElementById('playlistUrl'),
            loadPlaylist: document.getElementById('loadPlaylist'),
            errorMessage: document.getElementById('errorMessage'),
            errorText: document.getElementById('errorText'),

            // Playlist Info Section
            playlistInfo: document.getElementById('playlistInfo'),
            playlistTitle: document.getElementById('playlistTitle'),
            playlistChannel: document.getElementById('playlistChannel'),
            songCount: document.getElementById('songCount'),
            totalDuration: document.getElementById('totalDuration'),
            selectAll: document.getElementById('selectAll'),
            selectedCount: document.getElementById('selectedCount'),
            songList: document.getElementById('songList'),
            downloadBtn: document.getElementById('downloadBtn'),

            // Advanced Options
            toggleOptions: document.getElementById('toggleOptions'),
            optionsContent: document.getElementById('optionsContent'),
            filenameTemplate: document.getElementById('filenameTemplate'),
            embedMetadata: document.getElementById('embedMetadata'),
            estimatedSize: document.getElementById('estimatedSize'),

            // Download Progress Section
            downloadProgress: document.getElementById('downloadProgress'),
            progressText: document.getElementById('progressText'),
            overallProgressBar: document.getElementById('overallProgressBar'),
            downloadList: document.getElementById('downloadList'),

            // Completed Section
            completedSection: document.getElementById('completedSection'),
            completedMessage: document.getElementById('completedMessage'),
            fileList: document.getElementById('fileList'),
            newDownload: document.getElementById('newDownload'),

            // Real-time Statistics
            globalSpeed: document.getElementById('globalSpeed'),
            elapsedTime: document.getElementById('elapsedTime'),
            estimatedTime: document.getElementById('estimatedTime'),
            activeDownloads: document.getElementById('activeDownloads'),

            // Quality Selector
            mp3Quality: document.getElementById('mp3Quality'),
            mp4Quality: document.getElementById('mp4Quality')
        };

        // State
        this.songs = [];
        this.selectedSongs = new Set();
        this.format = 'mp3';
        this.quality = { mp3: '256', mp4: '720' }; // Calidad por defecto para cada formato
        this.socket = null;
        this.downloading = false;
        this.currentSessionDir = null;
        this.estimatedSizes = { mp3: 0, mp4: 0 }; // Tamaños estimados totales

        this.init();
    }

    init() {
        this.initSocket();
        this.bindEvents();
        this.elements.playlistUrl.focus();
    }

    initSocket() {
        this.socket = io();

        this.socket.on('connect', () => {
            console.log('🔌 Conectado al servidor');
        });

        this.socket.on('download-started', (data) => {
            console.log('📥 Descarga iniciada:', data);
            this.showDownloadProgress();
            this.updateProgressUI(0, data.total);
        });

        this.socket.on('song-progress', (data) => {
            this.updateSongProgress(data);
        });

        this.socket.on('download-complete', (data) => {
            console.log('✅ Descarga completada:', data);
            this.currentSessionDir = data.sessionDir;
            this.showCompleted(data.files, data.sessionDir);
            this.downloading = false;
        });

        this.socket.on('global-stats', (data) => {
            this.updateGlobalStats(data);
        });

        this.socket.on('disconnect', () => {
            console.log('🔌 Desconectado del servidor');
        });
    }

    bindEvents() {
        // Load Playlist Button
        this.elements.loadPlaylist.addEventListener('click', () => this.loadPlaylist());

        // Enter key on URL input
        this.elements.playlistUrl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.loadPlaylist();
            }
        });

        // Format Buttons
        document.querySelectorAll('.format-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setFormat(btn.dataset.format));
        });

        // Quality Buttons
        document.querySelectorAll('.quality-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setQuality(btn.dataset.quality));
        });

        // Select All Checkbox
        this.elements.selectAll.addEventListener('change', () => this.toggleSelectAll());

        // Download Button
        this.elements.downloadBtn.addEventListener('click', () => this.startDownload());

        // New Download Button
        this.elements.newDownload.addEventListener('click', () => this.resetUI());

        // Toggle Advanced Options
        if (this.elements.toggleOptions) {
            this.elements.toggleOptions.addEventListener('click', () => this.toggleAdvancedOptions());
        }
    }

    toggleAdvancedOptions() {
        const btn = this.elements.toggleOptions;
        const content = this.elements.optionsContent;

        btn.classList.toggle('active');
        content.classList.toggle('hidden');

        // Ajustar el borde del botón cuando está abierto
        if (btn.classList.contains('active')) {
            btn.style.borderRadius = 'var(--radius-md) var(--radius-md) 0 0';
        } else {
            btn.style.borderRadius = 'var(--radius-md)';
        }
    }

    async loadPlaylist() {
        const url = this.elements.playlistUrl.value.trim();

        if (!url) {
            this.showError('Por favor, ingresa un enlace de playlist de YouTube');
            return;
        }

        if (!this.isValidYouTubeUrl(url)) {
            this.showError('Por favor, ingresa un enlace válido de YouTube');
            return;
        }

        this.setLoading(true);
        this.hideError();

        try {
            const response = await fetch('/api/playlist-info', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Error al cargar la playlist');
            }

            if (!data.songs || data.songs.length === 0) {
                throw new Error('No se encontraron canciones en esta playlist');
            }

            this.displayPlaylist(data);

        } catch (error) {
            console.error('Error:', error);
            this.showError(error.message);
        } finally {
            this.setLoading(false);
        }
    }

    isValidYouTubeUrl(url) {
        const patterns = [
            /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/,
            /^(https?:\/\/)?(www\.)?youtube\.com\/playlist\?list=.+/,
            /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=.+&list=.+/
        ];
        return patterns.some(pattern => pattern.test(url));
    }

    displayPlaylist(data) {
        this.songs = data.songs;
        this.selectedSongs = new Set(this.songs.map(s => s.id));

        // Guardar tamaños estimados
        if (data.estimatedSizes) {
            this.estimatedSizes = data.estimatedSizes;
        }

        // Update playlist info
        this.elements.playlistTitle.textContent = data.title;
        this.elements.playlistChannel.textContent = data.channel;
        this.elements.songCount.textContent = data.songs.length;
        this.elements.totalDuration.textContent = this.formatTotalDuration(data.songs);

        // Render song list
        this.renderSongList();

        // Update selection count and estimated size
        this.updateSelectedCount();

        // Show playlist section
        this.elements.playlistInfo.classList.remove('hidden');

        // Scroll to playlist
        this.elements.playlistInfo.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    renderSongList() {
        this.elements.songList.innerHTML = this.songs.map((song, index) => `
            <div class="song-item ${this.selectedSongs.has(song.id) ? 'selected' : ''}" 
                 data-id="${song.id}" 
                 onclick="app.toggleSong('${song.id}')">
                <span class="song-number">${index + 1}</span>
                <img class="song-thumbnail" 
                     src="${song.thumbnail || this.getDefaultThumbnail(song.id)}" 
                     alt="${song.title}"
                     onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 120 90%22 fill=%22%231a1a24%22><rect width=%22120%22 height=%2290%22/><text x=%2260%22 y=%2245%22 fill=%22%23666%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22 font-size=%2220%22>🎵</text></svg>'">
                <div class="song-info">
                    <p class="song-title">${this.escapeHtml(song.title)}</p>
                    <p class="song-channel">${this.escapeHtml(song.channel)}</p>
                </div>
                <span class="song-duration">${this.formatDuration(song.duration)}</span>
                <label class="checkbox-wrapper song-checkbox" onclick="event.stopPropagation()">
                    <input type="checkbox" 
                           ${this.selectedSongs.has(song.id) ? 'checked' : ''} 
                           onchange="app.toggleSong('${song.id}')">
                    <span class="checkmark"></span>
                </label>
            </div>
        `).join('');
    }

    getDefaultThumbnail(videoId) {
        return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
    }

    toggleSong(songId) {
        if (this.selectedSongs.has(songId)) {
            this.selectedSongs.delete(songId);
        } else {
            this.selectedSongs.add(songId);
        }

        // Update UI
        const songItem = document.querySelector(`.song-item[data-id="${songId}"]`);
        const checkbox = songItem?.querySelector('input[type="checkbox"]');

        if (songItem) {
            songItem.classList.toggle('selected', this.selectedSongs.has(songId));
        }
        if (checkbox) {
            checkbox.checked = this.selectedSongs.has(songId);
        }

        this.updateSelectedCount();
        this.updateSelectAllState();
    }

    toggleSelectAll() {
        const isChecked = this.elements.selectAll.checked;

        if (isChecked) {
            this.selectedSongs = new Set(this.songs.map(s => s.id));
        } else {
            this.selectedSongs.clear();
        }

        // Update all song items
        document.querySelectorAll('.song-item').forEach(item => {
            const checkbox = item.querySelector('input[type="checkbox"]');
            item.classList.toggle('selected', isChecked);
            if (checkbox) checkbox.checked = isChecked;
        });

        this.updateSelectedCount();
    }

    updateSelectAllState() {
        this.elements.selectAll.checked = this.selectedSongs.size === this.songs.length;
        this.elements.selectAll.indeterminate =
            this.selectedSongs.size > 0 && this.selectedSongs.size < this.songs.length;
    }

    updateSelectedCount() {
        this.elements.selectedCount.textContent = `${this.selectedSongs.size} seleccionadas`;
        this.elements.downloadBtn.disabled = this.selectedSongs.size === 0;

        // Calcular y mostrar tamaño estimado
        this.updateEstimatedSizeWithQuality();
    }

    updateEstimatedSize() {
        // Redirigir a la función con calidad
        this.updateEstimatedSizeWithQuality();
    }

    formatFileSize(bytes) {
        if (!bytes || bytes <= 0) return '0 B';

        const units = ['B', 'KB', 'MB', 'GB'];
        let unitIndex = 0;
        let size = bytes;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }

    setFormat(format) {
        this.format = format;
        document.querySelectorAll('.format-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.format === format);
        });

        // Mostrar/ocultar opciones de calidad según el formato
        if (this.elements.mp3Quality && this.elements.mp4Quality) {
            this.elements.mp3Quality.classList.toggle('hidden', format !== 'mp3');
            this.elements.mp4Quality.classList.toggle('hidden', format !== 'mp4');
        }

        // Actualizar tamaño estimado al cambiar formato
        this.updateEstimatedSize();
    }

    setQuality(quality) {
        // Guardar la calidad para el formato actual
        this.quality[this.format] = quality;

        // Actualizar UI de los botones de calidad del formato actual
        const qualityContainer = this.format === 'mp3' ? this.elements.mp3Quality : this.elements.mp4Quality;
        if (qualityContainer) {
            qualityContainer.querySelectorAll('.quality-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.quality === quality);
            });
        }

        // Actualizar tamaño estimado (la calidad afecta el tamaño)
        this.updateEstimatedSizeWithQuality();
    }

    updateEstimatedSizeWithQuality() {
        if (!this.elements.estimatedSize) return;

        // Calcular tamaño de las canciones seleccionadas ajustado por calidad
        const selectedSongs = this.songs.filter(s => this.selectedSongs.has(s.id));
        const baseKey = this.format === 'mp3' ? 'estimatedSizeMp3' : 'estimatedSizeMp4';

        // Factor de ajuste basado en calidad
        let qualityFactor = 1;
        const currentQuality = parseInt(this.quality[this.format]);

        if (this.format === 'mp3') {
            // Base es 256k = 1.0
            qualityFactor = currentQuality / 256;
        } else {
            // Base es 720p = 1.0
            const factors = { 360: 0.25, 480: 0.5, 720: 1, 1080: 2.5, 2160: 8 };
            qualityFactor = factors[currentQuality] || 1;
        }

        const totalSize = selectedSongs.reduce((acc, song) => {
            const baseSize = song[baseKey] || 0;
            return acc + (baseSize * qualityFactor);
        }, 0);

        if (totalSize > 0) {
            this.elements.estimatedSize.textContent = `≈ ${this.formatFileSize(totalSize)}`;
            this.elements.estimatedSize.style.display = 'inline';
        } else {
            this.elements.estimatedSize.style.display = 'none';
        }
    }

    startDownload() {
        if (this.downloading || this.selectedSongs.size === 0) return;

        this.downloading = true;
        const songsToDownload = this.songs.filter(s => this.selectedSongs.has(s.id));

        // Obtener opciones avanzadas
        const filenameTemplate = this.elements.filenameTemplate?.value || '%(title)s';
        const embedMetadata = this.elements.embedMetadata?.checked ?? true;
        const quality = this.quality[this.format];

        this.socket.emit('start-download', {
            songs: songsToDownload,
            format: this.format,
            quality: quality,
            filenameTemplate: filenameTemplate,
            embedMetadata: embedMetadata
        });
    }

    showDownloadProgress() {
        this.elements.playlistInfo.classList.add('hidden');
        this.elements.downloadProgress.classList.remove('hidden');
        this.elements.downloadList.innerHTML = '';

        // Initialize download items
        const songsToDownload = this.songs.filter(s => this.selectedSongs.has(s.id));
        this.elements.downloadList.innerHTML = songsToDownload.map((song, index) => `
            <div class="download-item" data-id="${song.id}">
                <div class="download-item-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                    </svg>
                </div>
                <div class="download-item-info">
                    <p class="download-item-title">${this.escapeHtml(song.title)}</p>
                    <p class="download-item-status">En espera...</p>
                </div>
                <div class="download-item-progress">
                    <div class="download-item-progress-bar"></div>
                </div>
            </div>
        `).join('');
    }

    updateProgressUI(completed, total) {
        const percentage = total > 0 ? (completed / total * 100) : 0;
        this.elements.progressText.textContent = `${completed} / ${total}`;
        this.elements.overallProgressBar.style.width = `${percentage}%`;
    }

    updateSongProgress(data) {
        const { index, songId, status, progress } = data;
        const downloadItem = document.querySelector(`.download-item[data-id="${songId}"]`);

        if (!downloadItem) return;

        const iconContainer = downloadItem.querySelector('.download-item-icon');
        const statusText = downloadItem.querySelector('.download-item-status');
        const progressBar = downloadItem.querySelector('.download-item-progress-bar');

        // Remove all status classes
        downloadItem.classList.remove('downloading', 'completed', 'error');
        downloadItem.classList.add(status);

        switch (status) {
            case 'downloading':
                iconContainer.innerHTML = '<div class="spinner"></div>';
                let statusText_content = `Descargando... ${Math.round(progress)}%`;
                if (data.speed) {
                    statusText_content = `${Math.round(progress)}% • ${data.speed}`;
                    if (data.eta) {
                        statusText_content += ` • ETA: ${data.eta}`;
                    }
                }
                statusText.textContent = statusText_content;
                progressBar.style.width = `${progress}%`;
                break;

            case 'completed':
                iconContainer.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                `;
                statusText.textContent = '¡Completado!';
                progressBar.style.width = '100%';

                // Update overall progress
                const completedCount = document.querySelectorAll('.download-item.completed').length;
                const totalCount = document.querySelectorAll('.download-item').length;
                this.updateProgressUI(completedCount, totalCount);
                break;

            case 'error':
                iconContainer.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                `;
                statusText.textContent = 'Error';
                break;
        }

        // Scroll to current item
        if (status === 'downloading') {
            downloadItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    updateGlobalStats(data) {
        const { totalSpeed, elapsedTime, estimatedRemainingTime, completedSongs, totalSongs, activeSongs } = data;

        // Format and display total speed
        if (this.elements.globalSpeed) {
            const speedFormatted = this.formatSpeed(totalSpeed);
            this.elements.globalSpeed.textContent = speedFormatted;
        }

        // Format and display elapsed time
        if (this.elements.elapsedTime) {
            this.elements.elapsedTime.textContent = this.formatTime(elapsedTime);
        }

        // Format and display estimated remaining time
        if (this.elements.estimatedTime) {
            if (completedSongs > 0 && estimatedRemainingTime > 0) {
                this.elements.estimatedTime.textContent = this.formatTime(estimatedRemainingTime);
            } else if (completedSongs === totalSongs) {
                this.elements.estimatedTime.textContent = '¡Completado!';
            } else {
                this.elements.estimatedTime.textContent = 'Calculando...';
            }
        }

        // Display active downloads
        if (this.elements.activeDownloads) {
            this.elements.activeDownloads.textContent = `${activeSongs} / ${totalSongs - completedSongs}`;
        }
    }

    formatSpeed(bytesPerSecond) {
        if (!bytesPerSecond || bytesPerSecond <= 0) {
            return '-- MB/s';
        }

        const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
        let unitIndex = 0;
        let speed = bytesPerSecond;

        while (speed >= 1024 && unitIndex < units.length - 1) {
            speed /= 1024;
            unitIndex++;
        }

        return `${speed.toFixed(1)} ${units[unitIndex]}`;
    }

    formatTime(seconds) {
        if (!seconds || seconds <= 0) {
            return '00:00';
        }

        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    showCompleted(files, sessionDir) {
        this.elements.downloadProgress.classList.add('hidden');
        this.elements.completedSection.classList.remove('hidden');

        const completedCount = files.length;
        this.elements.completedMessage.textContent =
            completedCount === 1
                ? 'Se descargó 1 canción'
                : `Se descargaron ${completedCount} canciones`;

        // Agregar botón de descargar todo como ZIP si hay más de 1 archivo
        let zipButton = '';
        if (files.length > 1) {
            zipButton = `
                <a href="/api/download-zip/${sessionDir}" class="btn btn-download zip-btn" download>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    <span>Descargar Todo (ZIP)</span>
                </a>
            `;
        }

        this.elements.fileList.innerHTML = zipButton + files.map(file => `
            <a href="/api/download/${sessionDir}/${encodeURIComponent(file.name)}" class="file-item" download="${this.escapeHtml(file.name)}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 18V5l12-2v13"/>
                    <circle cx="6" cy="18" r="3"/>
                    <circle cx="18" cy="16" r="3"/>
                </svg>
                <span>${this.escapeHtml(file.name)}</span>
                <span class="file-item-download">Descargar</span>
            </a>
        `).join('');

        // Track download for monetization
        if (typeof window.trackDownloadComplete === 'function') {
            window.trackDownloadComplete(files.length);
        }

        // Scroll to completed section
        this.elements.completedSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    resetUI() {
        // Reset state
        this.songs = [];
        this.selectedSongs.clear();
        this.downloading = false;

        // Reset input
        this.elements.playlistUrl.value = '';
        this.elements.playlistUrl.focus();

        // Hide sections
        this.elements.playlistInfo.classList.add('hidden');
        this.elements.downloadProgress.classList.add('hidden');
        this.elements.completedSection.classList.add('hidden');
        this.hideError();

        // Reset select all
        this.elements.selectAll.checked = true;
        this.elements.selectAll.indeterminate = false;

        // Clear lists
        this.elements.songList.innerHTML = '';
        this.elements.downloadList.innerHTML = '';
        this.elements.fileList.innerHTML = '';

        // Reset progress
        this.elements.overallProgressBar.style.width = '0%';
        this.elements.progressText.textContent = '0 / 0';

        // Reset statistics
        if (this.elements.globalSpeed) this.elements.globalSpeed.textContent = '-- MB/s';
        if (this.elements.elapsedTime) this.elements.elapsedTime.textContent = '00:00';
        if (this.elements.estimatedTime) this.elements.estimatedTime.textContent = 'Calculando...';
        if (this.elements.activeDownloads) this.elements.activeDownloads.textContent = '0 / 0';

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Utility Methods
    setLoading(loading) {
        const btn = this.elements.loadPlaylist;
        btn.disabled = loading;
        btn.classList.toggle('loading', loading);
    }

    showError(message) {
        this.elements.errorText.textContent = message;
        this.elements.errorMessage.classList.remove('hidden');
    }

    hideError() {
        this.elements.errorMessage.classList.add('hidden');
    }

    formatDuration(seconds) {
        if (!seconds) return '--:--';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    formatTotalDuration(songs) {
        const totalSeconds = songs.reduce((acc, song) => acc + (song.duration || 0), 0);
        const hours = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);

        if (hours > 0) {
            return `${hours}h ${mins}m`;
        }
        return `${mins} min`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize app when DOM is ready
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new PlaylistDownloader();

    // Initialize Interstitial Ad Manager
    initInterstitialManager();
});

// ==========================================
// INTERSTITIAL AD MANAGER
// ==========================================
function initInterstitialManager() {
    const modal = document.getElementById('interstitialModal');
    const closeBtn = document.getElementById('closeInterstitial');
    const timerSpan = document.getElementById('closeTimer');

    if (!modal || !closeBtn || !timerSpan) return;

    let downloadCount = parseInt(localStorage.getItem('playlistdl_download_count') || '0');
    const SHOW_AD_EVERY = 3; // Mostrar anuncio cada 3 descargas
    const TIMER_SECONDS = 5;

    // Track downloads and show interstitial
    window.trackDownloadComplete = function (filesCount) {
        downloadCount += filesCount;
        localStorage.setItem('playlistdl_download_count', downloadCount.toString());

        // Show interstitial every X downloads
        if (downloadCount >= SHOW_AD_EVERY && downloadCount % SHOW_AD_EVERY === 0) {
            showInterstitial();
        }
    };

    function showInterstitial() {
        modal.classList.remove('hidden');
        closeBtn.disabled = true;

        let remaining = TIMER_SECONDS;
        timerSpan.textContent = remaining;

        const interval = setInterval(() => {
            remaining--;
            timerSpan.textContent = remaining;

            if (remaining <= 0) {
                clearInterval(interval);
                closeBtn.disabled = false;
                timerSpan.style.display = 'none';
            }
        }, 1000);
    }

    function hideInterstitial() {
        modal.classList.add('hidden');
        timerSpan.style.display = 'flex';
    }

    closeBtn.addEventListener('click', () => {
        if (!closeBtn.disabled) {
            hideInterstitial();
        }
    });

    // Close on background click (only if timer finished)
    modal.addEventListener('click', (e) => {
        if (e.target === modal && !closeBtn.disabled) {
            hideInterstitial();
        }
    });

    // Close on Escape key (only if timer finished)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden') && !closeBtn.disabled) {
            hideInterstitial();
        }
    });
}
