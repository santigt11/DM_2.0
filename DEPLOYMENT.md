# Despliegue en Vercel

## 📦 Configuración

Este proyecto incluye una función serverless Python para procesar descargas con metadatos usando `mutagen`.

### Archivos importantes:
- `api/download.py` - Función serverless para descargas con metadatos
- `vercel.json` - Configuración de Vercel
- `requirements.txt` - Dependencias Python

## 🚀 Desplegar en Vercel

### Opción 1: Despliegue desde GitHub

1. **Push a GitHub**:
   ```bash
   git add .
   git commit -m "Add metadata download feature"
   git push origin main
   ```

2. **Conectar a Vercel**:
   - Ve a [vercel.com](https://vercel.com)
   - Click en "New Project"
   - Importa tu repositorio de GitHub
   - Vercel detectará automáticamente la configuración
   - Click en "Deploy"

### Opción 2: Despliegue desde CLI

1. **Instalar Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Iniciar sesión**:
   ```bash
   vercel login
   ```

3. **Desplegar**:
   ```bash
   vercel
   ```

4. **Para producción**:
   ```bash
   vercel --prod
   ```

## 🔧 Configuración Local (Desarrollo)

Para desarrollo local con metadatos:

1. **Instalar dependencias Python**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Iniciar servidores**:
   ```powershell
   # Terminal 1 - Servidor de desarrollo
   python dev_server.py

   # Terminal 2 - Servidor de descargas
   python download_server.py
   ```

3. **Abrir navegador**:
   ```
   http://localhost:8000
   ```

## 🌐 Cómo funciona

### En localhost:
- Usa `http://localhost:8001/api/download` (servidor Python local)
- Los metadatos se agregan con `mutagen` antes de descargar

### En producción (Vercel):
- Usa `/api/download` (Vercel Serverless Function)
- Python se ejecuta en el edge de Vercel
- Los metadatos se agregan automáticamente

## 📝 Limitaciones de Vercel

- **Tiempo máximo de ejecución**: 30 segundos (suficiente para la mayoría de canciones)
- **Memoria**: 1024 MB
- **Tamaño de archivo**: Recomendado < 50 MB

Si necesitas descargar archivos más grandes o álbumes completos, considera usar el servidor local.

## 🐛 Troubleshooting

### Error: "Download server error: 500"
- Verifica que `requirements.txt` tenga las versiones correctas
- Revisa los logs en Vercel Dashboard

### Error: "Function timeout"
- La canción es demasiado grande (>50MB)
- Usa descarga directa sin metadatos (fallback automático)

### Sin metadatos en archivos descargados
- El servidor serverless puede haber fallado
- La app automáticamente cae a descarga directa
- Verifica los logs de la consola del navegador
