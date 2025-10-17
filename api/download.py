"""
Vercel Serverless Function para descargar música con metadatos
"""
from http.server import BaseHTTPRequestHandler
import json
import requests
import tempfile
import os
from mutagen.flac import FLAC, Picture
from mutagen.mp4 import MP4, MP4Cover

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        """Handle CORS preflight"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        """Handle download request with metadata"""
        try:
            # Leer body JSON
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))
            
            stream_url = data.get('streamUrl')
            metadata = data.get('metadata', {})
            quality = data.get('quality', 'LOSSLESS')
            
            if not stream_url:
                self.send_error(400, 'Missing streamUrl')
                return
            
            print(f"[DOWNLOAD] Starting: {metadata.get('title', 'Unknown')}")
            print(f"[DOWNLOAD] Quality: {quality}")
            print(f"[DOWNLOAD] Stream URL: {stream_url[:50]}...")
            
            # Descargar archivo
            print(f"[DOWNLOAD] Fetching stream...")
            response = requests.get(stream_url, stream=True, timeout=30)
            if response.status_code != 200:
                print(f"[ERROR] Stream fetch failed: {response.status_code}")
                self.send_error(response.status_code, f'Failed to download: {response.status_code}')
                return
            
            # Detectar formato
            content_type = response.headers.get('Content-Type', '')
            is_flac = 'flac' in content_type.lower() or quality in ['LOSSLESS', 'HI_RES_LOSSLESS']
            print(f"[DOWNLOAD] Format detected: {'FLAC' if is_flac else 'M4A'}")
            
            # Guardar en archivo temporal
            print(f"[DOWNLOAD] Writing to temp file...")
            with tempfile.NamedTemporaryFile(delete=False, suffix='.flac' if is_flac else '.m4a') as tmp:
                chunk_count = 0
                for chunk in response.iter_content(chunk_size=8192):
                    tmp.write(chunk)
                    chunk_count += 1
                tmp_path = tmp.name
            
            print(f"[DOWNLOAD] File downloaded: {tmp_path} ({chunk_count} chunks)")
            
            # Verificar tamaño del archivo
            file_size = os.path.getsize(tmp_path)
            print(f"[DOWNLOAD] File size: {file_size} bytes ({file_size / 1024 / 1024:.2f} MB)")
            
            # Agregar metadatos
            metadata_success = False
            try:
                print(f"[DOWNLOAD] Adding metadata...")
                if is_flac:
                    self._add_flac_metadata(tmp_path, metadata)
                else:
                    self._add_m4a_metadata(tmp_path, metadata)
                print(f"[DOWNLOAD] ✓ Metadata added successfully")
                metadata_success = True
            except Exception as e:
                print(f"[WARNING] ✗ Failed to add metadata: {e}")
                import traceback
                traceback.print_exc()
                # Continuar sin metadatos
            
            # Leer archivo procesado
            print(f"[DOWNLOAD] Reading processed file...")
            with open(tmp_path, 'rb') as f:
                file_data = f.read()
            
            final_size = len(file_data)
            print(f"[DOWNLOAD] Final size: {final_size} bytes ({final_size / 1024 / 1024:.2f} MB)")
            
            # Eliminar temporal
            os.unlink(tmp_path)
            print(f"[DOWNLOAD] Temp file cleaned")
            
            # Enviar archivo al navegador
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'audio/flac' if is_flac else 'audio/mp4')
            self.send_header('Content-Length', str(final_size))
            self.send_header('Content-Disposition', f'attachment; filename="{metadata.get("filename", "track.flac")}"')
            self.send_header('X-Metadata-Added', 'true' if metadata_success else 'false')
            self.end_headers()
            self.wfile.write(file_data)
            
            print(f"[DOWNLOAD] ✓ Successfully sent: {metadata.get('title', 'Unknown')}")
            print(f"[DOWNLOAD] Metadata: {'✓ Included' if metadata_success else '✗ Failed'}")
            
        except Exception as e:
            print(f"[ERROR] Download failed: {e}")
            import traceback
            traceback.print_exc()
            self.send_error(500, f'Internal server error: {str(e)}')

    def _add_flac_metadata(self, filepath, metadata):
        """Agregar metadatos a archivo FLAC"""
        audio = FLAC(filepath)
        
        # Tags básicos
        if metadata.get('title'):
            audio['title'] = metadata['title']
        if metadata.get('artist'):
            audio['artist'] = metadata['artist']
        if metadata.get('album'):
            audio['album'] = metadata['album']
        if metadata.get('albumArtist'):
            audio['albumartist'] = metadata['albumArtist']
        if metadata.get('date'):
            audio['date'] = str(metadata['date'])
        if metadata.get('trackNumber'):
            audio['tracknumber'] = str(metadata['trackNumber'])
        if metadata.get('discNumber'):
            audio['discnumber'] = str(metadata['discNumber'])
        if metadata.get('genre'):
            audio['genre'] = metadata['genre']
        
        # Carátula
        if metadata.get('coverUrl'):
            try:
                cover_response = requests.get(metadata['coverUrl'], timeout=10)
                if cover_response.status_code == 200:
                    picture = Picture()
                    picture.type = 3  # Cover (front)
                    picture.mime = 'image/jpeg'
                    picture.desc = 'Cover'
                    picture.data = cover_response.content
                    audio.add_picture(picture)
                    print(f"[METADATA] Cover art added")
            except Exception as e:
                print(f"[WARNING] Failed to add cover: {e}")
        
        audio.save()

    def _add_m4a_metadata(self, filepath, metadata):
        """Agregar metadatos a archivo M4A/MP4"""
        audio = MP4(filepath)
        
        # Tags básicos
        if metadata.get('title'):
            audio['\xa9nam'] = [metadata['title']]
        if metadata.get('artist'):
            audio['\xa9ART'] = [metadata['artist']]
        if metadata.get('album'):
            audio['\xa9alb'] = [metadata['album']]
        if metadata.get('albumArtist'):
            audio['aART'] = [metadata['albumArtist']]
        if metadata.get('date'):
            audio['\xa9day'] = [str(metadata['date'])]
        if metadata.get('trackNumber'):
            total_tracks = metadata.get('totalTracks', 0)
            audio['trkn'] = [(int(metadata['trackNumber']), total_tracks)]
        if metadata.get('discNumber'):
            total_discs = metadata.get('totalDiscs', 0)
            audio['disk'] = [(int(metadata['discNumber']), total_discs)]
        if metadata.get('genre'):
            audio['\xa9gen'] = [metadata['genre']]
        
        # Carátula
        if metadata.get('coverUrl'):
            try:
                cover_response = requests.get(metadata['coverUrl'], timeout=10)
                if cover_response.status_code == 200:
                    audio['covr'] = [MP4Cover(cover_response.content, imageformat=MP4Cover.FORMAT_JPEG)]
                    print(f"[METADATA] Cover art added")
            except Exception as e:
                print(f"[WARNING] Failed to add cover: {e}")
        
        audio.save()
