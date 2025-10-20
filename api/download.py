""""""

Vercel Serverless Function para descargar música con metadatosVercel Serverless Function para descargar música con metadatos

""""""

import jsonimport json

import requestsimport requests

import tempfileimport tempfile

import osimport os

import ioimport io

from base64 import b64encodefrom base64 import b64encode



def handler(request):def handler(request):

    """Handle download request with metadata - Vercel format"""    def do_OPTIONS(self):

    try:        """Handle CORS preflight"""

        # Verificar importaciones        self.send_response(200)

        print("[DOWNLOAD] Checking imports...")        self.send_header('Access-Control-Allow-Origin', '*')

        try:        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')

            from mutagen.flac import FLAC, Picture        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

            from mutagen.mp4 import MP4, MP4Cover        self.end_headers()

            print("[DOWNLOAD] ✓ Mutagen imports OK")

        except Exception as e:    def do_POST(self):

            print(f"[ERROR] Mutagen import failed: {e}")        """Handle download request with metadata"""

            return {        try:

                'statusCode': 500,            # TEST: Verificar importaciones primero

                'body': json.dumps({'error': f'Mutagen not available: {e}'}),            print("[DOWNLOAD] Testing imports...")

                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'}            try:

            }                from mutagen.flac import FLAC, Picture

                        from mutagen.mp4 import MP4, MP4Cover

        # Leer body JSON                print("[DOWNLOAD] ✓ Mutagen imports OK")

        print("[DOWNLOAD] Parsing request body...")            except Exception as e:

        try:                print(f"[ERROR] Mutagen import failed: {e}")

            if isinstance(request.body, bytes):                raise Exception(f"Mutagen not available: {e}")

                body = request.body.decode('utf-8')            

            else:            # Leer body JSON

                body = request.body            content_length = int(self.headers.get('Content-Length', 0))

            data = json.loads(body)            body = self.rfile.read(content_length)

        except Exception as e:            data = json.loads(body.decode('utf-8'))

            print(f"[ERROR] Failed to parse JSON: {e}")            

            return {            stream_url = data.get('streamUrl')

                'statusCode': 400,            metadata = data.get('metadata', {})

                'body': json.dumps({'error': 'Invalid JSON in request body'}),            quality = data.get('quality', 'LOSSLESS')

                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'}            

            }            if not stream_url:

                        self.send_error(400, 'Missing streamUrl')

        stream_url = data.get('streamUrl')                return

        metadata = data.get('metadata', {})            

        quality = data.get('quality', 'LOSSLESS')            print(f"[DOWNLOAD] Starting: {metadata.get('title', 'Unknown')}")

                    print(f"[DOWNLOAD] Quality: {quality}")

        if not stream_url:            print(f"[DOWNLOAD] Stream URL: {stream_url[:50]}...")

            print("[ERROR] Missing streamUrl in request")            

            return {            # Descargar archivo

                'statusCode': 400,            print(f"[DOWNLOAD] Fetching stream...")

                'body': json.dumps({'error': 'Missing streamUrl'}),            response = requests.get(stream_url, stream=True, timeout=30)

                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'}            if response.status_code != 200:

            }                print(f"[ERROR] Stream fetch failed: {response.status_code}")

                        self.send_error(response.status_code, f'Failed to download: {response.status_code}')

        print(f"[DOWNLOAD] Starting: {metadata.get('title', 'Unknown')}")                return

        print(f"[DOWNLOAD] Quality: {quality}")            

        print(f"[DOWNLOAD] Stream URL: {stream_url[:50]}...")            # Detectar formato

                    content_type = response.headers.get('Content-Type', '')

        # Descargar archivo            is_flac = 'flac' in content_type.lower() or quality in ['LOSSLESS', 'HI_RES_LOSSLESS']

        print("[DOWNLOAD] Fetching stream...")            print(f"[DOWNLOAD] Format detected: {'FLAC' if is_flac else 'M4A'}")

        try:            

            response = requests.get(stream_url, stream=True, timeout=60)            # Guardar en archivo temporal

        except Exception as e:            print(f"[DOWNLOAD] Writing to temp file...")

            print(f"[ERROR] Stream fetch timeout/error: {e}")            with tempfile.NamedTemporaryFile(delete=False, suffix='.flac' if is_flac else '.m4a') as tmp:

            return {                chunk_count = 0

                'statusCode': 504,                for chunk in response.iter_content(chunk_size=8192):

                'body': json.dumps({'error': f'Stream fetch failed: {e}'}),                    tmp.write(chunk)

                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'}                    chunk_count += 1

            }                tmp_path = tmp.name

                    

        if response.status_code != 200:            print(f"[DOWNLOAD] File downloaded: {tmp_path} ({chunk_count} chunks)")

            print(f"[ERROR] Stream fetch failed: {response.status_code}")            

            return {            # Verificar tamaño del archivo

                'statusCode': response.status_code,            file_size = os.path.getsize(tmp_path)

                'body': json.dumps({'error': f'Failed to download stream: {response.status_code}'}),            print(f"[DOWNLOAD] File size: {file_size} bytes ({file_size / 1024 / 1024:.2f} MB)")

                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'}            

            }            # Agregar metadatos

                    metadata_success = False

        # Detectar formato            metadata_error = None

        content_type = response.headers.get('Content-Type', '')            try:

        is_flac = 'flac' in content_type.lower() or quality in ['LOSSLESS', 'HI_RES_LOSSLESS']                print(f"[DOWNLOAD] Adding metadata...")

        print(f"[DOWNLOAD] Format detected: {'FLAC' if is_flac else 'M4A'} (content-type: {content_type})")                print(f"[METADATA] Available fields: {list(metadata.keys())}")

                        

        # Guardar en buffer (no temporal en Vercel)                # Verificar metadatos esenciales

        print("[DOWNLOAD] Reading stream to buffer...")                if not metadata.get('title'):

        try:                    print(f"[WARNING] Missing title in metadata")

            file_buffer = io.BytesIO()                if not metadata.get('artist'):

            chunk_count = 0                    print(f"[WARNING] Missing artist in metadata")

            for chunk in response.iter_content(chunk_size=8192):                if not metadata.get('album'):

                if chunk:                    print(f"[WARNING] Missing album in metadata")

                    file_buffer.write(chunk)                

                    chunk_count += 1                if is_flac:

            file_size = file_buffer.tell()                    self._add_flac_metadata(tmp_path, metadata)

            print(f"[DOWNLOAD] Stream loaded: {file_size} bytes ({file_size / 1024 / 1024:.2f} MB) - {chunk_count} chunks")                else:

        except Exception as e:                    self._add_m4a_metadata(tmp_path, metadata)

            print(f"[ERROR] Failed to read stream: {e}")                print(f"[DOWNLOAD] ✓ Metadata added successfully")

            return {                metadata_success = True

                'statusCode': 500,            except Exception as e:

                'body': json.dumps({'error': f'Stream read failed: {e}'}),                metadata_error = str(e)

                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'}                print(f"[WARNING] ✗ Failed to add metadata: {e}")

            }                import traceback

                        traceback.print_exc()

        # Guardar temporalmente para añadir metadatos                # Continuar sin metadatos

        file_buffer.seek(0)            

        tmp_fd, tmp_path = tempfile.mkstemp(suffix='.flac' if is_flac else '.m4a')            # Leer archivo procesado

        try:            print(f"[DOWNLOAD] Reading processed file...")

            tmp_file = os.fdopen(tmp_fd, 'wb')            with open(tmp_path, 'rb') as f:

            tmp_file.write(file_buffer.getvalue())                file_data = f.read()

            tmp_file.close()            

            print(f"[DOWNLOAD] Temp file created: {tmp_path}")            final_size = len(file_data)

                        print(f"[DOWNLOAD] Final size: {final_size} bytes ({final_size / 1024 / 1024:.2f} MB)")

            # Agregar metadatos            

            metadata_success = False            # Eliminar temporal

            metadata_error = None            os.unlink(tmp_path)

            try:            print(f"[DOWNLOAD] Temp file cleaned")

                print("[DOWNLOAD] Adding metadata...")            

                print(f"[METADATA] Available fields: {list(metadata.keys())}")            # Enviar archivo al navegador

                            self.send_response(200)

                if is_flac:            self.send_header('Access-Control-Allow-Origin', '*')

                    _add_flac_metadata(tmp_path, metadata)            self.send_header('Content-Type', 'audio/flac' if is_flac else 'audio/mp4')

                else:            self.send_header('Content-Length', str(final_size))

                    _add_m4a_metadata(tmp_path, metadata)            self.send_header('Content-Disposition', f'attachment; filename="{metadata.get("filename", "track.flac")}"')

                            self.send_header('X-Metadata-Added', 'true' if metadata_success else 'false')

                print("[DOWNLOAD] ✓ Metadata added successfully")            if metadata_error:

                metadata_success = True                self.send_header('X-Metadata-Error', metadata_error[:200])  # Limitar tamaño del header

            except Exception as e:            self.end_headers()

                metadata_error = str(e)            self.wfile.write(file_data)

                print(f"[WARNING] Failed to add metadata: {e}")            

                import traceback            print(f"[DOWNLOAD] ✓ Successfully sent: {metadata.get('title', 'Unknown')}")

                traceback.print_exc()            print(f"[DOWNLOAD] Metadata: {'✓ Included' if metadata_success else '✗ Failed'}")

                        if metadata_error:

            # Leer archivo final                print(f"[DOWNLOAD] Metadata error: {metadata_error}")

            print("[DOWNLOAD] Reading final file...")            

            with open(tmp_path, 'rb') as f:        except Exception as e:

                final_data = f.read()            error_msg = str(e)

                        print(f"[ERROR] Download failed: {error_msg}")

            final_size = len(final_data)            import traceback

            print(f"[DOWNLOAD] Final size: {final_size} bytes ({final_size / 1024 / 1024:.2f} MB)")            traceback.print_exc()

                        

            # Codificar como base64 para respuesta            # Enviar respuesta de error con detalles

            file_b64 = b64encode(final_data).decode('utf-8')            self.send_response(500)

                        self.send_header('Content-Type', 'application/json')

            # Enviar respuesta            self.send_header('Access-Control-Allow-Origin', '*')

            headers = {            self.end_headers()

                'Access-Control-Allow-Origin': '*',            error_response = {

                'Content-Type': 'audio/flac' if is_flac else 'audio/mp4',                'error': error_msg,

                'Content-Length': str(final_size),                'traceback': traceback.format_exc()

                'Content-Disposition': f'attachment; filename="{metadata.get("filename", "track.flac")}"',            }

                'X-Metadata-Added': 'true' if metadata_success else 'false'            self.wfile.write(json.dumps(error_response).encode())

            }

            if metadata_error:

                headers['X-Metadata-Error'] = metadata_error[:200]    def _add_flac_metadata(self, filepath, metadata):

                    """Agregar metadatos a archivo FLAC"""

            print(f"[DOWNLOAD] ✓ Successfully prepared: {metadata.get('title', 'Unknown')}")        from mutagen.flac import FLAC, Picture

            print(f"[DOWNLOAD] Metadata: {'✓ Included' if metadata_success else '✗ Failed'}")        

                    print(f"[METADATA] Opening FLAC file: {filepath}")

            return {        audio = FLAC(filepath)

                'statusCode': 200,        

                'body': file_b64,        # Tags básicos - solo agregar si están disponibles

                'headers': headers,        tags_added = []

                'isBase64Encoded': True        if metadata.get('title'):

            }            audio['title'] = metadata['title']

                        tags_added.append('title')

        finally:        if metadata.get('artist'):

            # Limpiar archivo temporal            audio['artist'] = metadata['artist']

            try:            tags_added.append('artist')

                if os.path.exists(tmp_path):        if metadata.get('album'):

                    os.unlink(tmp_path)            audio['album'] = metadata['album']

                    print("[DOWNLOAD] Temp file cleaned")            tags_added.append('album')

            except:        if metadata.get('albumArtist'):

                pass            audio['albumartist'] = metadata['albumArtist']

                tags_added.append('albumartist')

    except Exception as e:        if metadata.get('date'):

        error_msg = str(e)            audio['date'] = str(metadata['date'])

        print(f"[ERROR] Download failed: {error_msg}")            tags_added.append('date')

        import traceback        if metadata.get('trackNumber'):

        traceback.print_exc()            audio['tracknumber'] = str(metadata['trackNumber'])

                    tags_added.append('tracknumber')

        return {        if metadata.get('discNumber'):

            'statusCode': 500,            audio['discnumber'] = str(metadata['discNumber'])

            'body': json.dumps({            tags_added.append('discnumber')

                'error': error_msg,        if metadata.get('genre'):

                'traceback': traceback.format_exc()            audio['genre'] = metadata['genre']

            }),            tags_added.append('genre')

            'headers': {        

                'Content-Type': 'application/json',        print(f"[METADATA] Tags added: {', '.join(tags_added)}")

                'Access-Control-Allow-Origin': '*'        

            }        # Carátula - intentar pero no fallar si no funciona

        }        cover_added = False

        if metadata.get('coverUrl'):

            try:

def _add_flac_metadata(filepath, metadata):                print(f"[METADATA] Downloading cover: {metadata['coverUrl']}")

    """Agregar metadatos a archivo FLAC"""                cover_response = requests.get(metadata['coverUrl'], timeout=15)

    from mutagen.flac import FLAC, Picture                if cover_response.status_code == 200:

                        picture = Picture()

    print(f"[METADATA] Opening FLAC file: {filepath}")                    picture.type = 3  # Cover (front)

    audio = FLAC(filepath)                    picture.mime = 'image/jpeg'

                        picture.desc = 'Cover'

    # Tags básicos                    picture.data = cover_response.content

    tags_added = []                    audio.add_picture(picture)

    if metadata.get('title'):                    cover_added = True

        audio['title'] = metadata['title']                    print(f"[METADATA] ✓ Cover art added ({len(cover_response.content)} bytes)")

        tags_added.append('title')                else:

    if metadata.get('artist'):                    print(f"[METADATA] ✗ Cover download failed: {cover_response.status_code}")

        audio['artist'] = metadata['artist']            except Exception as e:

        tags_added.append('artist')                print(f"[METADATA] ✗ Cover failed: {e}")

    if metadata.get('album'):        else:

        audio['album'] = metadata['album']            print(f"[METADATA] No cover URL provided")

        tags_added.append('album')        

    if metadata.get('albumArtist'):        print(f"[METADATA] Saving FLAC file...")

        audio['albumartist'] = metadata['albumArtist']        audio.save()

        tags_added.append('albumartist')        print(f"[METADATA] ✓ FLAC metadata saved (cover: {'✓' if cover_added else '✗'})")

    if metadata.get('date'):

        audio['date'] = str(metadata['date'])    def _add_m4a_metadata(self, filepath, metadata):

        tags_added.append('date')        """Agregar metadatos a archivo M4A/MP4"""

    if metadata.get('trackNumber'):        from mutagen.mp4 import MP4, MP4Cover

        audio['tracknumber'] = str(metadata['trackNumber'])        

        tags_added.append('tracknumber')        print(f"[METADATA] Opening M4A file: {filepath}")

    if metadata.get('discNumber'):        audio = MP4(filepath)

        audio['discnumber'] = str(metadata['discNumber'])        

        tags_added.append('discnumber')        # Tags básicos - solo agregar si están disponibles

    if metadata.get('genre'):        tags_added = []

        audio['genre'] = metadata['genre']        if metadata.get('title'):

        tags_added.append('genre')            audio['\xa9nam'] = [metadata['title']]

                tags_added.append('title')

    print(f"[METADATA] Tags added: {', '.join(tags_added)}")        if metadata.get('artist'):

                audio['\xa9ART'] = [metadata['artist']]

    # Carátula            tags_added.append('artist')

    cover_added = False        if metadata.get('album'):

    if metadata.get('coverUrl'):            audio['\xa9alb'] = [metadata['album']]

        try:            tags_added.append('album')

            print(f"[METADATA] Downloading cover: {metadata['coverUrl'][:50]}...")        if metadata.get('albumArtist'):

            cover_response = requests.get(metadata['coverUrl'], timeout=15)            audio['aART'] = [metadata['albumArtist']]

            if cover_response.status_code == 200:            tags_added.append('albumartist')

                picture = Picture()        if metadata.get('date'):

                picture.type = 3  # Cover (front)            audio['\xa9day'] = [str(metadata['date'])]

                picture.mime = 'image/jpeg'            tags_added.append('date')

                picture.desc = 'Cover'        if metadata.get('trackNumber'):

                picture.data = cover_response.content            total_tracks = metadata.get('totalTracks', 0)

                audio.add_picture(picture)            audio['trkn'] = [(int(metadata['trackNumber']), total_tracks)]

                cover_added = True            tags_added.append('tracknumber')

                print(f"[METADATA] ✓ Cover art added ({len(cover_response.content)} bytes)")        if metadata.get('discNumber'):

            else:            total_discs = metadata.get('totalDiscs', 0)

                print(f"[METADATA] ✗ Cover download failed: {cover_response.status_code}")            audio['disk'] = [(int(metadata['discNumber']), total_discs)]

        except Exception as e:            tags_added.append('discnumber')

            print(f"[METADATA] ✗ Cover failed: {e}")        if metadata.get('genre'):

    else:            audio['\xa9gen'] = [metadata['genre']]

        print("[METADATA] No cover URL provided")            tags_added.append('genre')

            

    print("[METADATA] Saving FLAC file...")        print(f"[METADATA] Tags added: {', '.join(tags_added)}")

    audio.save()        

    print(f"[METADATA] ✓ FLAC metadata saved (cover: {'✓' if cover_added else '✗'})")        # Carátula - intentar pero no fallar si no funciona

        cover_added = False

        if metadata.get('coverUrl'):

def _add_m4a_metadata(filepath, metadata):            try:

    """Agregar metadatos a archivo M4A/MP4"""                print(f"[METADATA] Downloading cover: {metadata['coverUrl']}")

    from mutagen.mp4 import MP4, MP4Cover                cover_response = requests.get(metadata['coverUrl'], timeout=15)

                    if cover_response.status_code == 200:

    print(f"[METADATA] Opening M4A file: {filepath}")                    audio['covr'] = [MP4Cover(cover_response.content, imageformat=MP4Cover.FORMAT_JPEG)]

    audio = MP4(filepath)                    cover_added = True

                        print(f"[METADATA] ✓ Cover art added ({len(cover_response.content)} bytes)")

    # Tags básicos                else:

    tags_added = []                    print(f"[METADATA] ✗ Cover download failed: {cover_response.status_code}")

    if metadata.get('title'):            except Exception as e:

        audio['\xa9nam'] = [metadata['title']]                print(f"[METADATA] ✗ Cover failed: {e}")

        tags_added.append('title')        else:

    if metadata.get('artist'):            print(f"[METADATA] No cover URL provided")

        audio['\xa9ART'] = [metadata['artist']]        

        tags_added.append('artist')        print(f"[METADATA] Saving M4A file...")

    if metadata.get('album'):        audio.save()

        audio['\xa9alb'] = [metadata['album']]        print(f"[METADATA] ✓ M4A metadata saved (cover: {'✓' if cover_added else '✗'})")

        tags_added.append('album')
    if metadata.get('albumArtist'):
        audio['aART'] = [metadata['albumArtist']]
        tags_added.append('albumartist')
    if metadata.get('date'):
        audio['\xa9day'] = [str(metadata['date'])]
        tags_added.append('date')
    if metadata.get('trackNumber'):
        total_tracks = metadata.get('totalTracks', 0)
        audio['trkn'] = [(int(metadata['trackNumber']), total_tracks)]
        tags_added.append('tracknumber')
    if metadata.get('discNumber'):
        total_discs = metadata.get('totalDiscs', 0)
        audio['disk'] = [(int(metadata['discNumber']), total_discs)]
        tags_added.append('discnumber')
    if metadata.get('genre'):
        audio['\xa9gen'] = [metadata['genre']]
        tags_added.append('genre')
    
    print(f"[METADATA] Tags added: {', '.join(tags_added)}")
    
    # Carátula
    cover_added = False
    if metadata.get('coverUrl'):
        try:
            print(f"[METADATA] Downloading cover: {metadata['coverUrl'][:50]}...")
            cover_response = requests.get(metadata['coverUrl'], timeout=15)
            if cover_response.status_code == 200:
                audio['covr'] = [MP4Cover(cover_response.content, imageformat=MP4Cover.FORMAT_JPEG)]
                cover_added = True
                print(f"[METADATA] ✓ Cover art added ({len(cover_response.content)} bytes)")
            else:
                print(f"[METADATA] ✗ Cover download failed: {cover_response.status_code}")
        except Exception as e:
            print(f"[METADATA] ✗ Cover failed: {e}")
    else:
        print("[METADATA] No cover URL provided")
    
    print("[METADATA] Saving M4A file...")
    audio.save()
    print(f"[METADATA] ✓ M4A metadata saved (cover: {'✓' if cover_added else '✗'})")
