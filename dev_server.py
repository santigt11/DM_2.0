#!/usr/bin/env python3
"""
Servidor de desarrollo con auto-reload
Uso: python dev_server.py
"""

from livereload import Server
from livereload.handlers import LiveReloadHandler
import os

class NoCacheHandler(LiveReloadHandler):
    """Handler que desactiva el cache del navegador"""
    
    def set_default_headers(self):
        super().set_default_headers()
        # Headers anti-cache para desarrollo
        self.set_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.set_header('Pragma', 'no-cache')
        self.set_header('Expires', '0')

def main():
    # Crear servidor con handler sin cache
    server = Server()
    
    # Configurar handler personalizado
    server.watcher.handler_cls = NoCacheHandler
    
    # Observar cambios en archivos HTML, CSS y JS
    server.watch('*.html')
    server.watch('*.css')
    server.watch('js/*.js')
    server.watch('assets/**/*')
    
    # Iniciar servidor en puerto 8000
    print("🚀 Servidor de desarrollo iniciado en http://localhost:8000")
    print("📁 Observando cambios en archivos HTML, CSS y JS...")
    print("🔄 La página se recargará automáticamente cuando hagas cambios")
    print("🚫 Cache deshabilitado para Firefox y Chrome")
    print("\n⚠️  Nota: Si modificas Service Worker (sw.js), ya está deshabilitado en localhost")
    print("\nPresiona Ctrl+C para detener el servidor\n")
    
    server.serve(
        port=8000,
        host='localhost',
        root='.',
        open_url_delay=1  # Abre el navegador automáticamente después de 1 segundo
    )

if __name__ == '__main__':
    main()
