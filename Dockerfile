FROM node:18-slim

# Instalar dependencias del sistema
RUN apt-get update && apt-get install -y \
    curl \
    ffmpeg \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Descargar yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Crear directorio de la app
WORKDIR /app

# Copiar package.json
COPY package*.json ./

# Instalar dependencias de Node
RUN npm install --production

# Copiar el resto del código
COPY . .

# Crear directorio de descargas
RUN mkdir -p downloads

# Exponer puerto
EXPOSE 3000

# Variable de entorno para el puerto
ENV PORT=3000

# Iniciar servidor
CMD ["node", "server.js"]
