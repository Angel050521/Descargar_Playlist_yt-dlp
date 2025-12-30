# Playlist Downloader

Una aplicación web para descargar música y videos de playlists de YouTube de forma rápida y sencilla.

**Demo en vivo:** https://descargarplaylist-production.up.railway.app/

---

## Qué hace esta aplicación

- Descarga canciones de cualquier playlist pública de YouTube
- Soporta formato MP3 (audio) y MP4 (video)
- Permite elegir la calidad de descarga
- Descarga hasta 6 canciones a la vez para mayor velocidad
- Incluye metadatos y carátulas automáticamente
- Genera un archivo ZIP con todas las canciones

---

## Requisitos

Para correr esta aplicación en tu computadora, necesitas instalar:

1. **Node.js** (versión 18 o superior)
2. **yt-dlp** (herramienta de descarga de YouTube)
3. **FFmpeg** (para convertir audio y video)

---

## Instalación paso a paso

### 1. Instalar Node.js

Node.js es el motor que ejecuta la aplicación.

1. Ve a https://nodejs.org/
2. Descarga la versión LTS (la que dice "Recommended")
3. Ejecuta el instalador y sigue los pasos (puedes dejar todo por defecto)
4. Para verificar que se instaló bien, abre una terminal y escribe:

```bash
node --version
```

Debería mostrar algo como `v18.x.x` o superior.

---

### 2. Instalar yt-dlp

yt-dlp es la herramienta que descarga los videos de YouTube.

**En Windows:**

La forma más fácil es con winget (viene incluido en Windows 10/11):

```bash
winget install yt-dlp
```

Si no tienes winget, puedes descargarlo manualmente:
1. Ve a https://github.com/yt-dlp/yt-dlp/releases/latest
2. Descarga el archivo `yt-dlp.exe`
3. Crea una carpeta, por ejemplo `C:\herramientas\`
4. Pon el archivo `yt-dlp.exe` en esa carpeta
5. Agrega esa carpeta a las variables de entorno del sistema (busca "Editar variables de entorno" en el menú inicio, selecciona Path y agrega la ruta)

**En Linux:**

```bash
sudo apt update
sudo apt install yt-dlp
```

**En macOS:**

```bash
brew install yt-dlp
```

Para verificar que funciona:

```bash
yt-dlp --version
```

---

### 3. Instalar FFmpeg

FFmpeg convierte los videos a MP3 y agrega los metadatos.

**En Windows:**

```bash
winget install FFmpeg
```

Si no tienes winget:
1. Ve a https://www.gyan.dev/ffmpeg/builds/
2. Descarga "ffmpeg-release-essentials.zip"
3. Extrae el ZIP
4. La carpeta `bin` contiene los ejecutables
5. Agrega esa carpeta `bin` a las variables de entorno Path

**En Linux:**

```bash
sudo apt update
sudo apt install ffmpeg
```

**En macOS:**

```bash
brew install ffmpeg
```

Para verificar:

```bash
ffmpeg -version
```

---

### 4. Descargar y ejecutar el proyecto

Ahora sí, descarga y ejecuta la aplicación:

```bash
# Clona el repositorio
git clone https://github.com/Angel050521/DescargarPlaylist.git

# Entra a la carpeta
cd DescargarPlaylist

# Instala las dependencias (esto puede tardar un poco)
npm install

# Inicia la aplicación
npm run dev
```

Abre tu navegador y ve a: **http://localhost:3000**

¡Listo! Ya puedes pegar el link de una playlist y empezar a descargar.

---

## Cómo usar la aplicación

1. Copia el link de una playlist de YouTube
2. Pégalo en el campo de texto y haz clic en "Cargar"
3. Espera a que cargue la lista de canciones
4. Selecciona las que quieras descargar (o deja todas seleccionadas)
5. Elige el formato: MP3 para solo audio, MP4 para video
6. Elige la calidad que prefieras
7. Haz clic en "Descargar Seleccionadas"
8. Cuando termine, descarga el ZIP o los archivos individuales

---

## Solución de problemas

**"yt-dlp no se encuentra" o "command not found"**

Esto significa que yt-dlp no está en el PATH del sistema. Verifica que:
- El archivo yt-dlp.exe existe en tu computadora
- La carpeta donde está yt-dlp está agregada a las variables de entorno Path
- Reiniciaste la terminal después de agregarlo al Path

**"FFmpeg not found"**

Lo mismo que arriba, pero con FFmpeg. Este programa es necesario para convertir a MP3.

**La descarga falla**

- Verifica que el link de la playlist sea correcto
- Revisa que la playlist sea pública (no privada)
- Algunos videos con restricciones pueden fallar

---

## Deploy en la nube

Si quieres tener tu propia versión en internet:

1. Haz un fork de este repositorio en GitHub
2. Crea una cuenta en https://railway.app/
3. Crea un nuevo proyecto y conecta tu repositorio
4. Railway detectará automáticamente la configuración y desplegará la app

---

## Estructura del proyecto

```
DescargarPlaylist/
├── public/          # Archivos del frontend (lo que ves en el navegador)
│   ├── index.html   # Página principal
│   ├── styles.css   # Estilos visuales
│   └── app.js       # Lógica del cliente
├── server.js        # Servidor que procesa las descargas
├── package.json     # Dependencias del proyecto
└── Dockerfile       # Para usar con Docker
```

---

## Aviso legal

Esta herramienta es para uso personal solamente. Respeta los derechos de autor y los términos de servicio de YouTube. No me hago responsable del mal uso de esta aplicación.

---

## Licencia

MIT License - Puedes usar, modificar y distribuir este código libremente.

---

## Autor

Angel_050521 gracias a la ayuda de yt-dlp

GitHub: https://github.com/Angel050521

---

Si te fue útil, puedes darle una estrella al repositorio.
