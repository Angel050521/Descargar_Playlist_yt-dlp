#!/bin/bash
# Descargar yt-dlp
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp

# Instalar ffmpeg para conversión a MP3
apt-get update && apt-get install -y ffmpeg

# Iniciar la aplicación
npm start
