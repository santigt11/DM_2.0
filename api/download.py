"""Download endpoint with metadata support"""
import json
import requests
import tempfile
import os
from base64 import b64encode
import logging
import sys
import traceback

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def handler(request):
    """Handle download requests for audio files with metadata"""
    
    # CORS handling
    if request.method == "OPTIONS":
        return {"statusCode": 200, "headers": {"Access-Control-Allow-Origin": "*"}}
    
    tmp_path = None
    try:
        # Parse request - manejo defensivo
        logger.info("[DOWNLOAD] Handler started")
        logger.info(f"[DOWNLOAD] Request method: {request.method}")
        logger.info(f"[DOWNLOAD] Request body type: {type(request.body)}")
        
        body = None
        if request.body is None:
            logger.error("[ERROR] Request body is None")
            return error_response(400, "Request body is empty")
        
        if isinstance(request.body, bytes):
            body = request.body.decode("utf-8")
        else:
            body = str(request.body)
        
        logger.info(f"[DOWNLOAD] Body length: {len(body)} chars")
        
        try:
            data = json.loads(body)
        except json.JSONDecodeError as e:
            logger.error(f"[ERROR] JSON decode error: {e}")
            logger.error(f"[ERROR] Body sample: {body[:200]}")
            return error_response(400, f"Invalid JSON: {e}")
        
        stream_url = data.get("streamUrl")
        metadata = data.get("metadata", {})
        quality = data.get("quality", "LOSSLESS")
        
        if not stream_url:
            logger.error("[ERROR] Missing streamUrl in request")
            return error_response(400, "Missing streamUrl")
        
        logger.info(f"[DOWNLOAD] Track: {metadata.get('title', 'Unknown')}")
        
        # Download audio stream
        logger.info("[DOWNLOAD] Fetching stream...")
        try:
            response = requests.get(stream_url, stream=True, timeout=60)
            logger.info(f"[DOWNLOAD] Stream response: {response.status_code}")
            if response.status_code != 200:
                return error_response(response.status_code, f"Stream fetch failed: {response.status_code}")
        except requests.Timeout:
            logger.error("[ERROR] Stream request timeout")
            return error_response(504, "Stream request timeout")
        except Exception as e:
            logger.error(f"[DOWNLOAD] Stream request failed: {e}", exc_info=True)
            return error_response(504, f"Stream request failed: {str(e)}")
        
        # Detect format
        content_type = response.headers.get("Content-Type", "")
        is_flac = "flac" in content_type.lower() or quality in ["LOSSLESS", "HI_RES_LOSSLESS"]
        logger.info(f"[DOWNLOAD] Format: {'FLAC' if is_flac else 'M4A'} (Content-Type: {content_type})")
        
        # Save to temporary file
        logger.info("[DOWNLOAD] Writing to temp file...")
        tmp_fd, tmp_path = tempfile.mkstemp(suffix=".flac" if is_flac else ".m4a")
        logger.info(f"[DOWNLOAD] Temp path: {tmp_path}")
        
        try:
            with os.fdopen(tmp_fd, "wb") as tmp_file:
                downloaded = 0
                for chunk in response.iter_content(chunk_size=65536):
                    if chunk:
                        tmp_file.write(chunk)
                        downloaded += len(chunk)
            
            file_size = os.path.getsize(tmp_path)
            logger.info(f"[DOWNLOAD] Downloaded: {file_size / 1024 / 1024:.2f} MB")
            
            # Try to add metadata
            metadata_added = False
            metadata_error = None
            try:
                if metadata and any(metadata.values()):
                    logger.info("[METADATA] Adding tags...")
                    if is_flac:
                        add_flac_metadata(tmp_path, metadata)
                    else:
                        add_m4a_metadata(tmp_path, metadata)
                    metadata_added = True
                    logger.info("[METADATA] ✓ Success")
            except ImportError as e:
                logger.error(f"[METADATA] Import error (Mutagen missing?): {e}", exc_info=True)
                metadata_error = f"Mutagen not available"
            except Exception as e:
                logger.error(f"[METADATA] Failed: {e}", exc_info=True)
                metadata_error = str(e)[:100]
            
            # Read final file
            logger.info("[DOWNLOAD] Reading final file...")
            with open(tmp_path, "rb") as f:
                file_data = f.read()
            
            final_size = len(file_data)
            logger.info(f"[DOWNLOAD] Final size: {final_size / 1024 / 1024:.2f} MB")
            
            # Return response
            logger.info("[DOWNLOAD] Encoding to base64...")
            file_b64 = b64encode(file_data).decode("utf-8")
            b64_size = len(file_b64)
            logger.info(f"[DOWNLOAD] Base64 size: {b64_size / 1024 / 1024:.2f} MB")
            
            filename = metadata.get("filename", f"track.{'flac' if is_flac else 'm4a'}")
            
            response_headers = {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "audio/flac" if is_flac else "audio/mp4",
                "Content-Disposition": f'attachment; filename="{filename}"',
                "X-Metadata-Added": "true" if metadata_added else "false",
            }
            
            if metadata_error:
                response_headers["X-Metadata-Error"] = metadata_error
            
            logger.info(f"[DOWNLOAD] ✓ Success (metadata: {'✓' if metadata_added else '✗'})")
            
            return {
                "statusCode": 200,
                "body": file_b64,
                "headers": response_headers,
                "isBase64Encoded": True
            }
        
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                    logger.info("[DOWNLOAD] Temp file cleaned")
                except Exception as e:
                    logger.warning(f"[DOWNLOAD] Failed to clean temp: {e}")
    
    except Exception as e:
        logger.error(f"[ERROR] Unhandled exception: {str(e)}", exc_info=True)
        logger.error(f"[ERROR] Full traceback: {traceback.format_exc()}")
        # Asegurar limpieza incluso en error
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except:
                pass
        return error_response(500, f"Server error")


def add_flac_metadata(filepath, metadata):
    """Add metadata to FLAC file"""
    try:
        from mutagen.flac import FLAC, Picture
    except ImportError as e:
        logger.error(f"[METADATA] Cannot import mutagen.flac: {e}")
        raise
    
    try:
        audio = FLAC(filepath)
        
        # Add basic tags
        if metadata.get("title"):
            audio["title"] = metadata["title"]
        if metadata.get("artist"):
            audio["artist"] = metadata["artist"]
        if metadata.get("album"):
            audio["album"] = metadata["album"]
        if metadata.get("albumArtist"):
            audio["albumartist"] = metadata["albumArtist"]
        if metadata.get("date"):
            audio["date"] = str(metadata["date"])
        if metadata.get("trackNumber"):
            audio["tracknumber"] = str(metadata["trackNumber"])
        if metadata.get("genre"):
            audio["genre"] = metadata["genre"]
        
        logger.info("[METADATA] Basic tags added to FLAC")
        
        # Add cover
        if metadata.get("coverUrl"):
            try:
                logger.info(f"[METADATA] Downloading cover from {metadata['coverUrl'][:50]}...")
                cover_resp = requests.get(metadata["coverUrl"], timeout=10)
                if cover_resp.status_code == 200:
                    pic = Picture()
                    pic.type = 3
                    pic.mime = "image/jpeg"
                    pic.desc = "Cover"
                    pic.data = cover_resp.content
                    audio.add_picture(pic)
                    logger.info(f"[METADATA] Cover added ({len(cover_resp.content)} bytes)")
                else:
                    logger.warning(f"[METADATA] Cover download failed: {cover_resp.status_code}")
            except requests.Timeout:
                logger.warning("[METADATA] Cover download timeout")
            except Exception as e:
                logger.warning(f"[METADATA] Cover error: {e}")
        
        audio.save()
        logger.info("[METADATA] FLAC file saved with metadata")
    
    except Exception as e:
        logger.error(f"[METADATA] FLAC processing error: {e}", exc_info=True)
        raise


def add_m4a_metadata(filepath, metadata):
    """Add metadata to M4A file"""
    try:
        from mutagen.mp4 import MP4, MP4Cover
    except ImportError as e:
        logger.error(f"[METADATA] Cannot import mutagen.mp4: {e}")
        raise
    
    try:
        audio = MP4(filepath)
        
        # Add basic tags
        if metadata.get("title"):
            audio["\xa9nam"] = [metadata["title"]]
        if metadata.get("artist"):
            audio["\xa9ART"] = [metadata["artist"]]
        if metadata.get("album"):
            audio["\xa9alb"] = [metadata["album"]]
        if metadata.get("albumArtist"):
            audio["aART"] = [metadata["albumArtist"]]
        if metadata.get("date"):
            audio["\xa9day"] = [str(metadata["date"])]
        if metadata.get("trackNumber"):
            total_tracks = metadata.get("totalTracks", 0)
            audio["trkn"] = [(int(metadata["trackNumber"]), total_tracks)]
        if metadata.get("genre"):
            audio["\xa9gen"] = [metadata["genre"]]
        
        logger.info("[METADATA] Basic tags added to M4A")
        
        # Add cover
        if metadata.get("coverUrl"):
            try:
                logger.info(f"[METADATA] Downloading cover from {metadata['coverUrl'][:50]}...")
                cover_resp = requests.get(metadata["coverUrl"], timeout=10)
                if cover_resp.status_code == 200:
                    audio["covr"] = [MP4Cover(cover_resp.content, imageformat=MP4Cover.FORMAT_JPEG)]
                    logger.info(f"[METADATA] Cover added ({len(cover_resp.content)} bytes)")
                else:
                    logger.warning(f"[METADATA] Cover download failed: {cover_resp.status_code}")
            except requests.Timeout:
                logger.warning("[METADATA] Cover download timeout")
            except Exception as e:
                logger.warning(f"[METADATA] Cover error: {e}")
        
        audio.save()
        logger.info("[METADATA] M4A file saved with metadata")
    
    except Exception as e:
        logger.error(f"[METADATA] M4A processing error: {e}", exc_info=True)
        raise


def error_response(status_code, message):
    """Return error response"""
    return {
        "statusCode": status_code,
        "body": json.dumps({"error": message}),
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        }
    }
