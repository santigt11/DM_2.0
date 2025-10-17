"""
Test endpoint para verificar que las dependencias funcionan
"""
from http.server import BaseHTTPRequestHandler
import json
import sys

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        """Test dependencies"""
        result = {
            "python_version": sys.version,
            "imports": {}
        }
        
        # Test mutagen
        try:
            import mutagen
            result["imports"]["mutagen"] = f"OK - version {mutagen.version_string}"
        except Exception as e:
            result["imports"]["mutagen"] = f"FAIL - {str(e)}"
        
        # Test requests
        try:
            import requests
            result["imports"]["requests"] = f"OK - version {requests.__version__}"
        except Exception as e:
            result["imports"]["requests"] = f"FAIL - {str(e)}"
        
        # Test tempfile
        try:
            import tempfile
            result["imports"]["tempfile"] = "OK"
        except Exception as e:
            result["imports"]["tempfile"] = f"FAIL - {str(e)}"
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(result, indent=2).encode())
