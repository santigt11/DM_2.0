"""
Script para probar la función serverless localmente
Simula el comportamiento de Vercel
"""
import sys
sys.path.insert(0, './api')

from download import handler
from http.server import HTTPServer

def run_test_server(port=8001):
    server_address = ('', port)
    httpd = HTTPServer(server_address, handler)
    print(f"🧪 Testing Serverless Function on http://localhost:{port}")
    print(f"📦 This simulates Vercel's serverless environment")
    print(f"🎵 Endpoint: POST http://localhost:{port}/api/download")
    print(f"\nPress Ctrl+C to stop\n")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Test server stopped")
        httpd.shutdown()

if __name__ == '__main__':
    run_test_server()
