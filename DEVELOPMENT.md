# 🎵 Monochrome Music - Guía de Desarrollo

## 🚀 Servidor de Desarrollo

### Opción 1: Servidor con Auto-Reload (Recomendado)

```bash
# Instalar dependencias (solo la primera vez)
pip install livereload

# Iniciar servidor de desarrollo
python dev_server.py
```

El servidor se iniciará en `http://localhost:8000` y se recargará automáticamente cuando hagas cambios en:
- Archivos HTML (`*.html`)
- Archivos CSS (`*.css`)
- Archivos JavaScript (`js/*.js`)
- Assets (`assets/**/*`)

### Opción 2: Servidor Simple de Python

```bash
python -m http.server 8000
```

**Nota:** Esta opción NO tiene auto-reload, debes recargar manualmente el navegador.

## ⚠️ Importante: Cache del Navegador

### Chrome
Los cambios deberían aparecer automáticamente gracias al auto-reload y los headers anti-cache.

### Firefox
Si los cambios no aparecen en Firefox:

**Método 1: Hard Reload (Recomendado)**
```
Ctrl + Shift + R
```
o
```
Ctrl + F5
```

**Método 2: Deshabilitar Cache en DevTools**
1. Abre Firefox en `http://localhost:8000`
2. Presiona `F12` para abrir DevTools
3. Ve a Settings (⚙️)
4. Marca: ✅ **Disable HTTP Cache (when toolbox is open)**
5. Deja DevTools abierto mientras desarrollas

### Service Worker

El Service Worker está **automáticamente deshabilitado en localhost**. Verás este mensaje en la consola:
```
🔧 Development mode: Service Worker disabled
```

Si modificas archivos JS y los cambios no se reflejan, usa **Ctrl+Shift+R** para forzar la recarga.

## 📦 Estructura del Proyecto

```
DM_2,0/
├── index.html              # Página principal
├── styles.css              # Estilos globales
├── sw.js                   # Service Worker (PWA)
├── manifest.json           # Manifest de la aplicación
├── dev_server.py          # Servidor de desarrollo con auto-reload
├── js/
│   ├── api.js             # Lógica de API (TIDAL, Spotify)
│   ├── app.js             # Aplicación principal
│   ├── cache.js           # Sistema de caché
│   ├── player.js          # Reproductor de audio
│   ├── storage.js         # LocalStorage
│   ├── ui.js              # Renderizado de UI
│   └── utils.js           # Utilidades
└── assets/                # Imágenes y recursos
```

## 🎯 Funcionalidades Implementadas

### ✅ Cola de Descarga
- **Add All to Queue**: Agrega todas las canciones de un álbum a la cola
- **Add to Queue (contextual)**: Click derecho en una canción para agregarla individualmente
- **Notificaciones**: Feedback visual al agregar canciones

### ✅ Carga de Playlists de Spotify
- Botón en la página principal
- Parsea formato "Artista - Canción"
- Busca cada canción en el servidor de TIDAL
- Agrega las encontradas a la cola automáticamente

### ✅ Reproductor de Audio
- Shuffle y Repeat
- Cola de reproducción
- Descarga en alta calidad (Hi-Res cuando está disponible)

## 🔧 Desarrollo

### Hacer Cambios

1. Edita los archivos necesarios
2. Si usas `dev_server.py`, los cambios se reflejarán automáticamente
3. Si usas Python simple, recarga manualmente el navegador
4. Si los cambios no se ven, desregistra el Service Worker (ver arriba)

### Debugging

```javascript
// Ver estado de la cola
player.getCurrentQueue()

// Ver cache
await cache.getAllKeys()

// Limpiar cache
await cache.clear()
```

## 📝 Notas

- Los servidores de TIDAL pueden estar intermitentemente caídos (Error 503)
- El scraping de Spotify requiere que el usuario pegue la lista de canciones manualmente (limitación de CORS)
- El Service Worker cachea agresivamente para offline-first, pero puede dificultar el desarrollo

## 🐛 Solución de Problemas

### Los cambios no se ven
1. Desregistra el Service Worker (comando arriba)
2. Hard reload: **Ctrl+Shift+R**
3. Limpia caché del navegador

### Error 503 en búsquedas
- Los servidores externos están temporalmente caídos
- Espera unos minutos y vuelve a intentar

### Cola vacía después de agregar canciones
- Ya corregido en la última versión
- Si persiste, verifica que `renderQueue()` no tenga early returns

## 📚 Referencias

- [TIDAL API Documentation](https://monochrome.tf/)
- [Spotify Web API](https://developer.spotify.com/documentation/web-api/)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

---

**Desarrollado con ❤️ para amantes de la música en alta calidad**
