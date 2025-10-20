"""Simple download endpoint - just pass-through the audio stream"""
import json
import requests
from base64 import b64encode


def handler(request):
    """Handle download - simple pass-through without metadata processing"""
    try:
        # Parse JSON
        if isinstance(request.body, bytes):
            body_str = request.body.decode('utf-8')
        else:
            body_str = request.body
        
        data = json.loads(body_str)
        stream_url = data.get('streamUrl')
        
        if not stream_url:
            return {'statusCode': 400, 'body': json.dumps({'error': 'Missing streamUrl'}), 'headers': {'Access-Control-Allow-Origin': '*'}}
        
        # Download stream
        response = requests.get(stream_url, stream=True, timeout=60)
        if response.status_code != 200:
            return {'statusCode': response.status_code, 'body': json.dumps({'error': 'Stream fetch failed'}), 'headers': {'Access-Control-Allow-Origin': '*'}}
        
        # Read audio
        audio_data = b''
        for chunk in response.iter_content(chunk_size=65536):
            if chunk:
                audio_data += chunk
        
        # Encode to base64
        file_b64 = b64encode(audio_data).decode('utf-8')
        
        # Detect format
        content_type = response.headers.get('Content-Type', 'audio/flac')
        is_flac = 'flac' in content_type.lower()
        
        return {
            'statusCode': 200,
            'body': file_b64,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'audio/flac' if is_flac else 'audio/mp4',
                'X-Audio-Format': 'flac' if is_flac else 'm4a'
            },
            'isBase64Encoded': True
        }
    
    except Exception as e:
        return {'statusCode': 500, 'body': json.dumps({'error': str(e)}), 'headers': {'Access-Control-Allow-Origin': '*'}}
