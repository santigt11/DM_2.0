from http.server import BaseHTTPRequestHandler
import json
import requests
import tempfile
import os
import unicodedata
from mutagen.flac import FLAC, Picture
from mutagen.mp4 import MP4, MP4Cover


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _sanitize_filename(self, filename):
        """Sanitiza el filename para remover caracteres no-ASCII"""
        # Normalizar unicode (convierte caracteres especiales a su forma base)
        normalized = unicodedata.normalize('NFKD', filename)
        # Remover caracteres no-ASCII
        ascii_only = normalized.encode('ascii', 'ignore').decode('ascii')
        # Reemplazar múltiples espacios con uno solo
        cleaned = ' '.join(ascii_only.split())
        return cleaned if cleaned else 'download.flac'

    def do_POST(self):
        try:
            content_length = int(self.headers["Content-Length"])
            body = self.rfile.read(content_length)
            data = json.loads(body.decode("utf-8"))
            
            stream_url = data.get("streamUrl")
            filename = data.get("filename")
            metadata = data.get("metadata", {})
            
            if not stream_url or not filename:
                self._send_error(400, "Missing streamUrl or filename")
                return
            
            file_ext = filename.lower().split(".")[-1]
            
            response = requests.get(stream_url, timeout=60)
            response.raise_for_status()
            
            with tempfile.NamedTemporaryFile(delete=False, suffix=f".{file_ext}") as tmp_file:
                tmp_file.write(response.content)
                tmp_path = tmp_file.name
            
            try:
                if file_ext == "flac":
                    self._add_flac_metadata(tmp_path, metadata)
                elif file_ext in ["m4a", "mp4"]:
                    self._add_m4a_metadata(tmp_path, metadata)
                
                with open(tmp_path, "rb") as f:
                    file_data = f.read()
                
                # Sanitizar filename para evitar caracteres no-ASCII en headers
                safe_filename = self._sanitize_filename(filename)
                
                self.send_response(200)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Type", f"audio/{file_ext}")
                self.send_header("Content-Disposition", f'attachment; filename="{safe_filename}"')
                self.send_header("Content-Length", str(len(file_data)))
                self.end_headers()
                self.wfile.write(file_data)
                
            finally:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)
                    
        except requests.exceptions.RequestException as e:
            self._send_error(500, f"Download failed: {str(e)}")
        except Exception as e:
            self._send_error(500, f"Server error: {str(e)}")
    
    def _send_error(self, code, message):
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"error": message}).encode())
    
    def _add_flac_metadata(self, file_path, metadata):
        try:
            audio = FLAC(file_path)
            
            if metadata.get("title"):
                audio["TITLE"] = metadata["title"]
            if metadata.get("artist"):
                audio["ARTIST"] = metadata["artist"]
            if metadata.get("album"):
                audio["ALBUM"] = metadata["album"]
            if metadata.get("albumArtist"):
                audio["ALBUMARTIST"] = metadata["albumArtist"]
            if metadata.get("date"):
                audio["DATE"] = str(metadata["date"])
            if metadata.get("genre"):
                audio["GENRE"] = metadata["genre"]
            if metadata.get("trackNumber"):
                audio["TRACKNUMBER"] = str(metadata["trackNumber"])
            if metadata.get("totalTracks"):
                audio["TOTALTRACKS"] = str(metadata["totalTracks"])
            if metadata.get("discNumber"):
                audio["DISCNUMBER"] = str(metadata["discNumber"])
            
            cover_url = metadata.get("coverUrl")
            if cover_url:
                try:
                    cover_response = requests.get(cover_url, timeout=10)
                    cover_response.raise_for_status()
                    
                    picture = Picture()
                    picture.type = 3
                    picture.mime = "image/jpeg"
                    picture.desc = "Cover"
                    picture.data = cover_response.content
                    
                    audio.add_picture(picture)
                except Exception:
                    pass
            
            audio.save()
        except Exception:
            pass
    
    def _add_m4a_metadata(self, file_path, metadata):
        try:
            audio = MP4(file_path)
            
            if metadata.get("title"):
                audio["\xa9nam"] = metadata["title"]
            if metadata.get("artist"):
                audio["\xa9ART"] = metadata["artist"]
            if metadata.get("album"):
                audio["\xa9alb"] = metadata["album"]
            if metadata.get("albumArtist"):
                audio["aART"] = metadata["albumArtist"]
            if metadata.get("date"):
                audio["\xa9day"] = metadata["date"]
            if metadata.get("genre"):
                audio["\xa9gen"] = metadata["genre"]
            if metadata.get("trackNumber"):
                # M4A usa una tupla (track_number, total_tracks)
                track_num = metadata["trackNumber"]
                total_tracks = metadata.get("totalTracks", 0)
                audio["trkn"] = [(track_num, total_tracks)]
            if metadata.get("discNumber"):
                audio["disk"] = [(metadata["discNumber"], 0)]
            
            cover_url = metadata.get("coverUrl")
            if cover_url:
                try:
                    cover_response = requests.get(cover_url, timeout=10)
                    cover_response.raise_for_status()
                    
                    audio["covr"] = [MP4Cover(cover_response.content, imageformat=MP4Cover.FORMAT_JPEG)]
                except Exception:
                    pass
            
            audio.save()
        except Exception:
            pass
