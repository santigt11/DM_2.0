# 🎵 Sistema de Descargas con Metadatos

## 📊 Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                      NAVEGADOR                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  app.js: Usuario hace clic en "Download"              │ │
│  │  ↓                                                     │ │
│  │  api.js: downloadTrack(id, quality, filename, track)  │ │
│  └────────────────────────────────────────────────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ├──────── ¿Localhost? ───────┐
                         │                             │
                    ✅ SÍ                          ❌ NO
                         │                             │
                         ↓                             ↓
         ┌───────────────────────────┐   ┌──────────────────────────┐
         │  DESARROLLO LOCAL         │   │  PRODUCCIÓN (Vercel)     │
         │  http://localhost:8001    │   │  /api/download           │
         │  download_server.py       │   │  (Serverless Function)   │
         └────────────┬──────────────┘   └────────────┬─────────────┘
                      │                                │
                      └────────┬───────────────────────┘
                               │
                               ↓
              ┌────────────────────────────────────────┐
              │  PROCESO DE DESCARGA                   │
              │                                        │
              │  1. Fetch stream desde monochrome.tf  │
              │  2. Guardar en archivo temporal       │
              │  3. Agregar metadatos con mutagen:    │
              │     - Título, artista, álbum          │
              │     - Número de pista, disco          │
              │     - Año, género                     │
              │     - Carátula del álbum (1280x1280)  │
              │  4. Enviar archivo al navegador       │
              │  5. Navegador descarga con metadatos  │
              └────────────────────────────────────────┘
```

## 🔄 Flujo de Datos

### Desarrollo Local:
```
Browser → localhost:8000 (dev_server.py)
       → localhost:8001 (download_server.py)
       → monochrome.tf (stream)
       → mutagen (add metadata)
       → Download to user
```

### Producción Vercel:
```
Browser → yourdomain.vercel.app
       → /api/download (Python Serverless Function)
       → monochrome.tf (stream)
       → mutagen (add metadata)
       → Download to user
```

## 📦 Metadatos Agregados

### FLAC Files:
- `title` - Título de la canción
- `artist` - Artista principal
- `album` - Nombre del álbum
- `albumartist` - Artista del álbum
- `date` - Año de lanzamiento
- `tracknumber` - Número de pista
- `discnumber` - Número de disco
- `genre` - Género musical
- `PICTURE` - Carátula del álbum (embedded)

### M4A/MP4 Files:
- `©nam` - Título de la canción
- `©ART` - Artista principal
- `©alb` - Nombre del álbum
- `aART` - Artista del álbum
- `©day` - Año de lanzamiento
- `trkn` - Número de pista / Total
- `disk` - Número de disco / Total
- `©gen` - Género musical
- `covr` - Carátula del álbum (embedded)

## 🚀 Ventajas del Sistema

✅ **Dual Mode**: Funciona tanto local como en producción
✅ **Automatic Fallback**: Si falla con metadatos, descarga directamente
✅ **Quality Fallback**: Intenta LOSSLESS → HIGH → LOW automáticamente
✅ **Zero Configuration**: Detecta automáticamente el entorno
✅ **Complete Metadata**: Incluye carátula, año, género, etc.
✅ **Scalable**: En Vercel escala automáticamente

## ⚙️ Variables de Configuración

No requiere variables de entorno. Todo se detecta automáticamente:
- Hostname detection (localhost vs producción)
- Quality priority (LOSSLESS, HIGH, LOW)
- Timeout: 30s en Vercel
- Memory: 1024 MB en Vercel

## 🔍 Debug

### Verificar logs en navegador:
```javascript
// Abre DevTools (F12) → Console
[DOWNLOAD] Attempting download for track...
[DOWNLOAD] Using local download server with metadata
[DOWNLOAD] Successfully downloaded with metadata
```

### En Vercel:
1. Ve a tu proyecto en vercel.com
2. Click en "Functions" tab
3. Busca `/api/download`
4. Ve los logs en tiempo real
