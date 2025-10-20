import json
import requests
import tempfile
import os
from mutagen.flac import FLAC, Picture
from mutagen.mp4 import MP4, MP4Cover


def handler(event, context):
    cors_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json"
    }
    
    try:
        http_method = event.get("httpMethod", event.get("requestContext", {}).get("http", {}).get("method", "POST"))
        
        if http_method == "OPTIONS":
            return {
                "statusCode": 200,
                "headers": cors_headers,
                "body": "",
                "isBase64Encoded": False
            }
        
        body_str = event.get("body", "{}")
        if isinstance(body_str, str):
            data = json.loads(body_str)
        else:
            data = body_str
            
        stream_url = data.get("streamUrl")
        filename = data.get("filename")
        metadata = data.get("metadata", {})
        
        if not stream_url or not filename:
            return {
                "statusCode": 400,
                "headers": cors_headers,
                "body": json.dumps({"error": "Missing streamUrl or filename"}),
                "isBase64Encoded": False
            }
        
        file_ext = filename.lower().split(".")[-1]
        
        response = requests.get(stream_url, timeout=60)
        response.raise_for_status()
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{file_ext}") as tmp_file:
            tmp_file.write(response.content)
            tmp_path = tmp_file.name
        
        try:
            if file_ext == "flac":
                add_flac_metadata(tmp_path, metadata)
            elif file_ext in ["m4a", "mp4"]:
                add_m4a_metadata(tmp_path, metadata)
            
            with open(tmp_path, "rb") as f:
                file_data = f.read()
            
            download_headers = cors_headers.copy()
            download_headers.update({
                "Content-Type": f"audio/{file_ext}",
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(file_data))
            })
            
            file_data_str = file_data.decode("latin-1")
            
            return {
                "statusCode": 200,
                "headers": download_headers,
                "body": file_data_str,
                "isBase64Encoded": False
            }
            
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
                
    except requests.exceptions.RequestException as e:
        return {
            "statusCode": 500,
            "headers": cors_headers,
            "body": json.dumps({"error": f"Download failed: {str(e)}"}),
            "isBase64Encoded": False
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": cors_headers,
            "body": json.dumps({"error": f"Server error: {str(e)}"}),
            "isBase64Encoded": False
        }


def add_flac_metadata(file_path, metadata):
    try:
        audio = FLAC(file_path)
        
        if metadata.get("title"):
            audio["title"] = metadata["title"]
        if metadata.get("artist"):
            audio["artist"] = metadata["artist"]
        if metadata.get("album"):
            audio["album"] = metadata["album"]
        if metadata.get("date"):
            audio["date"] = metadata["date"]
        if metadata.get("genre"):
            audio["genre"] = metadata["genre"]
        
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
                
                audio.clear_pictures()
                audio.add_picture(picture)
            except Exception:
                pass
        
        audio.save()
    except Exception:
        pass


def add_m4a_metadata(file_path, metadata):
    try:
        audio = MP4(file_path)
        
        if metadata.get("title"):
            audio["\xa9nam"] = metadata["title"]
        if metadata.get("artist"):
            audio["\xa9ART"] = metadata["artist"]
        if metadata.get("album"):
            audio["\xa9alb"] = metadata["album"]
        if metadata.get("date"):
            audio["\xa9day"] = metadata["date"]
        if metadata.get("genre"):
            audio["\xa9gen"] = metadata["genre"]
        
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
