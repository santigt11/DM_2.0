from http.server import BaseHTTPRequestHandler
import requests
from urllib.parse import urlparse, parse_qs


# Allowlist of domains we are willing to proxy
ALLOWED_DOMAINS = [
    "sheets.artistgrid.cx",
    "trends.artistgrid.cx",
    "assets.artistgrid.cx",
    "tracker.israeli.ovh",
]


class handler(BaseHTTPRequestHandler):
    def _is_allowed(self, url):
        """Check if the target URL is in the allowed domains list."""
        try:
            parsed = urlparse(url)
            return parsed.hostname in ALLOWED_DOMAINS
        except Exception:
            return False

    def _set_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self._set_cors_headers()
        self.end_headers()

    def do_GET(self):
        try:
            # Parse query string to get the target URL
            parsed = urlparse(self.path)
            query = parse_qs(parsed.query)
            target_url = query.get("url", [None])[0]

            if not target_url:
                self._send_error(400, "Missing 'url' query parameter")
                return

            if not self._is_allowed(target_url):
                self._send_error(403, "Domain not allowed")
                return

            # Forward the request
            response = requests.get(
                target_url,
                timeout=30,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                },
            )

            # Send response back with CORS headers
            self.send_response(response.status_code)
            self._set_cors_headers()

            # Forward content-type
            content_type = response.headers.get(
                "Content-Type", "application/octet-stream"
            )
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(response.content)))
            self.end_headers()
            self.wfile.write(response.content)

        except requests.exceptions.Timeout:
            self._send_error(504, "Upstream request timed out")
        except requests.exceptions.RequestException as e:
            self._send_error(502, f"Upstream request failed: {str(e)}")
        except Exception as e:
            self._send_error(500, f"Server error: {str(e)}")

    def _send_error(self, code, message):
        import json

        self.send_response(code)
        self._set_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"error": message}).encode())
