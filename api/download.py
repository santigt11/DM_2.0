"""Download endpoint with metadata support"""
import json
import requests
import tempfile
import os
from base64 import b64encode
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def handler(request):
    """Handle download requests for audio files with metadata"""
    
    # CORS handling
    if request.method == "OPTIONS":
        return {"statusCode": 200, "headers": {"Access-Control-Allow-Origin": "*"}}
    
    try:
        # Parse request
        if isinstance(request.body, bytes):
            body = request.body.decode("utf-8")
        else:
            body = request.body
        data = json.loads(body)
        
        stream_url = data.get("streamUrl")
        metadata = data.get("metadata", {})
        quality = data.get("quality", "LOSSLESS")
        
        if not stream_url:
            return error_response(400, "Missing streamUrl")
        
        logger.info(f"[DOWNLOAD] Track: {metadata.get('title', 'Unknown')}")
        
        # Download audio stream
        logger.info("[DOWNLOAD] Fetching stream...")
        response = requests.get(stream_url, stream=True, timeout=60)
        if response.status_code != 200:
            return error_response(response.status_code, "Failed to fetch stream")
        
        # Detect format
        content_type = response.headers.get("Content-Type", "")
        is_flac = "flac" in content_type.lower() or quality in ["LOSSLESS", "HI_RES_LOSSLESS"]
        logger.info(f"[DOWNLOAD] Format: {'FLAC' if is_flac else 'M4A'}")
        
        # Save to temporary file
        logger.info("[DOWNLOAD] Writing to temp file...")
        tmp_fd, tmp_path = tempfile.mkstemp(suffix=".flac" if is_flac else ".m4a")
        
        try:
            with os.fdopen(tmp_fd, "wb") as tmp_file:
                for chunk in response.iter_content(chunk_size=65536):
                    if chunk:
                        tmp_file.write(chunk)
            
            file_size = os.path.getsize(tmp_path)
            logger.info(f"[DOWNLOAD] Downloaded: {file_size / 1024 / 1024:.2f} MB")
            
            # Try to add metadata
            metadata_added = False
            try:
                if metadata and any(metadata.values()):
                    logger.info("[METADATA] Adding tags...")
                    if is_flac:
                        add_flac_metadata(tmp_path, metadata)
                    else:
                        add_m4a_metadata(tmp_path, metadata)
                    metadata_added = True
                    logger.info("[METADATA] Success")
            except Exception as e:
                logger.warning(f"[METADATA] Failed: {e}")
            
            # Read final file
            with open(tmp_path, "rb") as f:
                file_data = f.read()
            
            # Return response
            file_b64 = b64encode(file_data).decode("utf-8")
            filename = metadata.get("filename", f"track.{'flac' if is_flac else 'm4a'}")
            
            return {
                "statusCode": 200,
                "body": file_b64,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Content-Type": "audio/flac" if is_flac else "audio/mp4",
                    "Content-Disposition": f'attachment; filename="{filename}"',
                    "X-Metadata-Added": "true" if metadata_added else "false",
                },
                "isBase64Encoded": True
            }
        
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
    
    except Exception as e:
        logger.exception(f"[ERROR] {str(e)}")
        return error_response(500, str(e))


def add_flac_metadata(filepath, metadata):
    """Add metadata to FLAC file"""
    from mutagen.flac import FLAC, Picture
    
    audio = FLAC(filepath)
    
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
    
    # Add cover
    if metadata.get("coverUrl"):
        try:
            cover_resp = requests.get(metadata["coverUrl"], timeout=10)
            if cover_resp.status_code == 200:
                pic = Picture()
                pic.type = 3
                pic.mime = "image/jpeg"
                pic.desc = "Cover"
                pic.data = cover_resp.content
                audio.add_picture(pic)
        except:
            pass
    
    audio.save()


def add_m4a_metadata(filepath, metadata):
    """Add metadata to M4A file"""
    from mutagen.mp4 import MP4, MP4Cover
    
    audio = MP4(filepath)
    
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
        audio["trkn"] = [(int(metadata["trackNumber"]), metadata.get("totalTracks", 0))]
    if metadata.get("genre"):
        audio["\xa9gen"] = [metadata["genre"]]
    
    # Add cover
    if metadata.get("coverUrl"):
        try:
            cover_resp = requests.get(metadata["coverUrl"], timeout=10)
            if cover_resp.status_code == 200:
                audio["covr"] = [MP4Cover(cover_resp.content, imageformat=MP4Cover.FORMAT_JPEG)]
        except:
            pass
    
    audio.save()


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
