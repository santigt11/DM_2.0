//js/api.js
import { RATE_LIMIT_ERROR_MESSAGE, deriveTrackQuality, delay } from './utils.js';
import { APICache } from './cache.js';

export class LosslessAPI {
    constructor(settings) {
        this.settings = settings;
        this.cache = new APICache({
            maxSize: 200,
            ttl: 1000 * 60 * 30
        });
        
        setInterval(() => {
            this.cache.clearExpired();
        }, 1000 * 60 * 5);
    }

async fetchWithRetry(relativePath, options = {}) {
    const instances = this.settings.getInstances();
    if (instances.length === 0) {
        throw new Error("No API instances configured.");
    }

    const maxRetries = 1;
    let lastError = null;

    for (const baseUrl of instances) {
        const url = baseUrl.endsWith('/') 
            ? `${baseUrl}${relativePath.substring(1)}` 
            : `${baseUrl}${relativePath}`;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await fetch(url, { signal: options.signal });

                if (response.status === 429) {
                    throw new Error(RATE_LIMIT_ERROR_MESSAGE);
                }

                if (response.ok) {
                    return response;
                }

                if (response.status === 401) {
                    let errorData;
                    try {
                        errorData = await response.clone().json();
                    } catch {}

                    if (errorData?.subStatus === 11002) {
                        lastError = new Error(errorData?.userMessage || 'Authentication failed');
                        if (attempt < maxRetries) {
                            await delay(200);
                            continue;
                        }
                    }
                }

                if (response.status >= 500 && attempt < maxRetries) {
                    await delay(200);
                    continue;
                }

                lastError = new Error(`Request failed with status ${response.status}`);
                break;

            } catch (error) {
                if (error.name === 'AbortError') {
                    throw error;
                }
                
                lastError = error;
                console.log(`Failed for ${baseUrl}: ${error.message}`);
                
                if (attempt < maxRetries) {
                    await delay(200);
                }
            }
        }
    }

    throw lastError || new Error(`All API instances failed for: ${relativePath}`);
}

    findSearchSection(source, key, visited) {
        if (!source || typeof source !== 'object') return;
        
        if (Array.isArray(source)) {
            for (const e of source) {
                const f = this.findSearchSection(e, key, visited);
                if (f) return f;
            }
            return;
        }
        
        if (visited.has(source)) return;
        visited.add(source);
        
        if ('items' in source && Array.isArray(source.items)) return source;
        
        if (key in source) {
            const f = this.findSearchSection(source[key], key, visited);
            if (f) return f;
        }
        
        for (const v of Object.values(source)) {
            const f = this.findSearchSection(v, key, visited);
            if (f) return f;
        }
    }

    buildSearchResponse(section) {
        const items = section?.items ?? [];
        return {
            items,
            limit: section?.limit ?? items.length,
            offset: section?.offset ?? 0,
            totalNumberOfItems: section?.totalNumberOfItems ?? items.length
        };
    }

    normalizeSearchResponse(data, key) {
        const section = this.findSearchSection(data, key, new Set());
        return this.buildSearchResponse(section);
    }

prepareTrack(track) {
    let normalized = track;
    
    if (!track.artist && Array.isArray(track.artists) && track.artists.length > 0) {
        normalized = { ...track, artist: track.artists[0] };
    }

    if (normalized.album && !normalized.album.cover && normalized.album.id) {
        console.warn('Track missing album cover, attempting to use album ID');
    }

    const derivedQuality = deriveTrackQuality(normalized);
    if (derivedQuality && normalized.audioQuality !== derivedQuality) {
        normalized = { ...normalized, audioQuality: derivedQuality };
    }

    return normalized;
}

    prepareAlbum(album) {
        if (!album.artist && Array.isArray(album.artists) && album.artists.length > 0) {
            return { ...album, artist: album.artists[0] };
        }
        return album;
    }

    prepareArtist(artist) {
        if (!artist.type && Array.isArray(artist.artistTypes) && artist.artistTypes.length > 0) {
            return { ...artist, type: artist.artistTypes[0] };
        }
        return artist;
    }

    parseTrackLookup(data) {
        const entries = Array.isArray(data) ? data : [data];
        let track, info, originalTrackUrl;

        for (const entry of entries) {
            if (!entry || typeof entry !== 'object') continue;
            
            if (!track && 'duration' in entry) {
                track = entry;
                continue;
            }
            
            if (!info && 'manifest' in entry) {
                info = entry;
                continue;
            }
            
            if (!originalTrackUrl && 'OriginalTrackUrl' in entry) {
                const candidate = entry.OriginalTrackUrl;
                if (typeof candidate === 'string') {
                    originalTrackUrl = candidate;
                }
            }
        }

        if (!track || !info) {
            throw new Error('Malformed track response');
        }

        return { track, info, originalTrackUrl };
    }

    extractStreamUrlFromManifest(manifest) {
        try {
            const decoded = atob(manifest);
            
            try {
                const parsed = JSON.parse(decoded);
                if (parsed?.urls?.[0]) {
                    return parsed.urls[0];
                }
            } catch {
                const match = decoded.match(/https?:\/\/[\w\-.~:?#[```@!$&'()*+,;=%/]+/);
                return match ? match[0] : null;
            }
        } catch (error) {
            console.error('Failed to decode manifest:', error);
            return null;
        }
    }
async searchTracks(query) {
    const cached = await this.cache.get('search_tracks', query);
    if (cached) return cached;

    try {
        const response = await this.fetchWithRetry(`/search/?s=${encodeURIComponent(query)}`);
        const data = await response.json();
        const normalized = this.normalizeSearchResponse(data, 'tracks');
        const result = {
            ...normalized,
            items: normalized.items.map(t => this.prepareTrack(t))
        };

        await this.cache.set('search_tracks', query, result);
        return result;
    } catch (error) {
        console.error('Track search failed:', error);
        return { items: [], limit: 0, offset: 0, totalNumberOfItems: 0 };
    }
}

async searchArtists(query) {
    const cached = await this.cache.get('search_artists', query);
    if (cached) return cached;

    try {
        const response = await this.fetchWithRetry(`/search/?a=${encodeURIComponent(query)}`);
        const data = await response.json();
        const normalized = this.normalizeSearchResponse(data, 'artists');
        const result = {
            ...normalized,
            items: normalized.items.map(a => this.prepareArtist(a))
        };

        await this.cache.set('search_artists', query, result);
        return result;
    } catch (error) {
        console.error('Artist search failed:', error);
        return { items: [], limit: 0, offset: 0, totalNumberOfItems: 0 };
    }
}

async searchAlbums(query) {
    const cached = await this.cache.get('search_albums', query);
    if (cached) return cached;

    try {
        const response = await this.fetchWithRetry(`/search/?al=${encodeURIComponent(query)}`);
        const data = await response.json();
        const normalized = this.normalizeSearchResponse(data, 'albums');
        const result = {
            ...normalized,
            items: normalized.items.map(a => this.prepareAlbum(a))
        };

        await this.cache.set('search_albums', query, result);
        return result;
    } catch (error) {
        console.error('Album search failed:', error);
        return { items: [], limit: 0, offset: 0, totalNumberOfItems: 0 };
    }
}

    async getAlbum(id) {
        const cached = await this.cache.get('album', id);
        if (cached) return cached;

        const response = await this.fetchWithRetry(`/album/?id=${id}`);
        const data = await response.json();
        const entries = Array.isArray(data) ? data : [data];

        let album, tracksSection;
        
        for (const entry of entries) {
            if (!entry || typeof entry !== 'object') continue;
            
            if (!album && 'numberOfTracks' in entry) {
                album = this.prepareAlbum(entry);
            }
            
            if (!tracksSection && 'items' in entry) {
                tracksSection = entry;
            }
        }

        if (!album) throw new Error('Album not found');

        const tracks = (tracksSection?.items || []).map(i => this.prepareTrack(i.item || i));
        const result = { album, tracks };

        await this.cache.set('album', id, result);
        return result;
    }

    async getArtist(id) {
        const cached = await this.cache.get('artist', id);
        if (cached) return cached;

        const [primaryResponse, contentResponse] = await Promise.all([
            this.fetchWithRetry(`/artist/?id=${id}`),
            this.fetchWithRetry(`/artist/?f=${id}`)
        ]);
        
        const primaryData = await primaryResponse.json();
        const artist = this.prepareArtist(Array.isArray(primaryData) ? primaryData[0] : primaryData);
        
        if (!artist) throw new Error('Primary artist details not found.');
        
        const contentData = await contentResponse.json();
        const entries = Array.isArray(contentData) ? contentData : [contentData];
        
        const albumMap = new Map();
        const trackMap = new Map();
        
        const isTrack = v => v?.id && v.duration && v.album;
        const isAlbum = v => v?.id && v.cover && 'numberOfTracks' in v;
        
        const scan = (value, visited = new Set()) => {
            if (!value || typeof value !== 'object' || visited.has(value)) return;
            visited.add(value);
            
            if (Array.isArray(value)) {
                value.forEach(item => scan(item, visited));
                return;
            }
            
            const item = value.item || value;
            if (isAlbum(item)) albumMap.set(item.id, this.prepareAlbum(item));
            if (isTrack(item)) trackMap.set(item.id, this.prepareTrack(item));
            
            Object.values(value).forEach(nested => scan(nested, visited));
        };
        
        entries.forEach(entry => scan(entry));
        
        const albums = Array.from(albumMap.values()).sort((a, b) => 
            new Date(b.releaseDate || 0) - new Date(a.releaseDate || 0)
        );
        
        const tracks = Array.from(trackMap.values())
            .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
            .slice(0, 10);
        
        const result = { ...artist, albums, tracks };

        await this.cache.set('artist', id, result);
        return result;
    }

    async getTrack(id, quality = 'LOSSLESS') {
        const cacheKey = `${id}_${quality}`;
        const cached = await this.cache.get('track', cacheKey);
        if (cached) return cached;

        const response = await this.fetchWithRetry(`/track/?id=${id}&quality=${quality}`);
        const result = this.parseTrackLookup(await response.json());

        await this.cache.set('track', cacheKey, result);
        return result;
    }

    async getStreamUrl(id, quality = 'LOSSLESS') {
        const lookup = await this.getTrack(id, quality);
        
        if (lookup.originalTrackUrl) {
            return lookup.originalTrackUrl;
        }

        const url = this.extractStreamUrlFromManifest(lookup.info.manifest);
        if (url) return url;

        throw new Error('Could not resolve stream URL');
    }

    async downloadTrack(id, quality = 'LOSSLESS', filename, trackMetadata = null) {
        const qualityPriority = ['LOSSLESS', 'HIGH', 'LOW'];
        let lastError = null;
        
        // Si la calidad solicitada no está en la lista de fallback, empezar con ella
        const qualitiesToTry = quality !== 'LOSSLESS' && quality !== 'HIGH' && quality !== 'LOW'
            ? [quality, ...qualityPriority]
            : qualityPriority;
        
        for (const currentQuality of qualitiesToTry) {
            try {
                console.log(`[DOWNLOAD] Attempting download for track ${id} at quality ${currentQuality}`);
                const lookup = await this.getTrack(id, currentQuality);
                console.log(`[DOWNLOAD] Track lookup result:`, lookup);
                
                let streamUrl;

                if (lookup.originalTrackUrl) {
                    streamUrl = lookup.originalTrackUrl;
                    console.log(`[DOWNLOAD] Using original track URL: ${streamUrl}`);
                } else {
                    streamUrl = this.extractStreamUrlFromManifest(lookup.info.manifest);
                    console.log(`[DOWNLOAD] Extracted stream URL from manifest: ${streamUrl}`);
                    if (!streamUrl) {
                        throw new Error('Could not resolve stream URL');
                    }
                }

                // Intentar usar servidor de metadatos (localhost o producción)
                if (trackMetadata) {
                    console.log(`[DOWNLOAD] Using download server with metadata`);
                    try {
                        await this._downloadWithMetadata(streamUrl, filename, trackMetadata, currentQuality);
                        console.log(`[DOWNLOAD] Successfully downloaded with metadata: ${filename}`);
                        return;
                    } catch (error) {
                        console.warn(`[DOWNLOAD] Metadata server failed, falling back to direct download:`, error.message);
                        // Continuar con descarga directa
                    }
                }

                // Descarga directa sin metadatos (fallback)
                console.log(`[DOWNLOAD] Using direct download (no metadata)`);
                const response = await fetch(streamUrl, { cache: 'no-store' });
                
                if (!response.ok) {
                    console.error(`[DOWNLOAD] Fetch failed with status: ${response.status} ${response.statusText}`);
                    throw new Error(`Fetch failed: ${response.status}`);
                }

                console.log(`[DOWNLOAD] Converting to blob...`);
                const blob = await response.blob();
                console.log(`[DOWNLOAD] Blob size: ${blob.size} bytes, type: ${blob.type}`);
                
                const url = URL.createObjectURL(blob);
                
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                console.log(`[DOWNLOAD] Successfully downloaded: ${filename} at quality ${currentQuality}`);
                return; // Éxito, salir de la función
            } catch (error) {
                console.warn(`[DOWNLOAD] Failed with quality ${currentQuality}:`, error.message);
                lastError = error;
                // Continuar con la siguiente calidad
            }
        }
        
        // Si llegamos aquí, todas las calidades fallaron
        console.error("[DOWNLOAD] All quality attempts failed. Last error:", lastError);
        console.error("[DOWNLOAD] Error stack:", lastError?.stack);
        
        if (lastError?.message === RATE_LIMIT_ERROR_MESSAGE) {
            throw lastError;
        }
        throw new Error('Download failed. Try with a different track or check your connection.');
    }

    async _downloadWithMetadata(streamUrl, filename, trackMetadata, quality) {
        // Preparar metadatos con logging detallado
        console.log('[METADATA] Preparing metadata for track:', trackMetadata.title);
        console.log('[METADATA] Full track data:', trackMetadata);
        
        const metadata = {
            title: trackMetadata.title,
            artist: trackMetadata.artist?.name,
            album: trackMetadata.album?.title,
            albumArtist: trackMetadata.album?.artist?.name || trackMetadata.artist?.name,
            date: trackMetadata.album?.releaseDate?.substring(0, 4), // Solo año
            trackNumber: trackMetadata.trackNumber,
            totalTracks: trackMetadata.album?.numberOfTracks,
            discNumber: trackMetadata.volumeNumber || 1,
            genre: trackMetadata.genre,
            coverUrl: this.getCoverUrl(trackMetadata.album?.cover, '1280'),
            filename: filename
        };

        // Log de metadatos preparados
        console.log('[METADATA] Prepared metadata:', metadata);
        
        // Verificar campos críticos
        const missingFields = [];
        if (!metadata.title) missingFields.push('title');
        if (!metadata.artist) missingFields.push('artist');
        if (!metadata.album) missingFields.push('album');
        if (!metadata.coverUrl || metadata.coverUrl.includes('picsum.photos')) missingFields.push('cover');
        
        if (missingFields.length > 0) {
            console.warn('[METADATA] Missing fields:', missingFields.join(', '));
        }

        // Detectar si estamos en localhost o en producción
        const isLocalhost = location.hostname === 'localhost' || 
                           location.hostname === '127.0.0.1' ||
                           location.hostname === '[::1]';
        
        const downloadUrl = isLocalhost 
            ? 'http://localhost:8001/api/download'  // Desarrollo local
            : '/api/download';  // Producción (Vercel serverless function)

        const response = await fetch(downloadUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                streamUrl: streamUrl,
                metadata: metadata,
                quality: quality
            })
        });

        if (!response.ok) {
            // Intentar leer el mensaje de error detallado
            let errorDetails = `Server error: ${response.status}`;
            try {
                const contentType = response.headers.get('Content-Type');
                if (contentType && contentType.includes('application/json')) {
                    const errorData = await response.json();
                    errorDetails = errorData.error || errorDetails;
                    console.error('[DOWNLOAD] Server error details:', errorData);
                }
            } catch (e) {
                // Si no se puede parsear, usar mensaje genérico
            }
            throw new Error(errorDetails);
        }

        // Verificar si se agregaron metadatos
        const metadataAdded = response.headers.get('X-Metadata-Added') === 'true';
        const metadataError = response.headers.get('X-Metadata-Error');
        
        if (!metadataAdded) {
            const errorMsg = metadataError ? `Metadata failed: ${metadataError}` : 'Metadata could not be added (check Vercel logs)';
            console.warn('⚠️ File downloaded but metadata could NOT be added:', errorMsg);
            
            // Mostrar notificación con más detalles
            if (window.showNotification) {
                window.showNotification(`Downloaded "${filename}" without metadata`, 'warning');
                console.log(`[DOWNLOAD] Metadata error details: ${errorMsg}`);
            }
        } else {
            console.log('✓ File downloaded with metadata successfully');
            if (window.showNotification) {
                window.showNotification(`Downloaded "${filename}" with metadata`, 'success');
            }
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    getCoverUrl(id, size = '1280') {
        if (!id) {
            return `https://picsum.photos/seed/${Math.random()}/${size}`;
        }
        
        const formattedId = id.replace(/-/g, '/');
        return `https://resources.tidal.com/images/${formattedId}/${size}x${size}.jpg`;
    }

    getArtistPictureUrl(id, size = '750') {
        if (!id) {
            return `https://picsum.photos/seed/${Math.random()}/${size}`;
        }
        
        const formattedId = id.replace(/-/g, '/');
        return `https://resources.tidal.com/images/${formattedId}/${size}x${size}.jpg`;
    }

    async clearCache() {
        await this.cache.clear();
    }

    getCacheStats() {
        return this.cache.getCacheStats();
    }

    extractTidalPlaylistId(url) {
        try {
            const urlObj = new URL(url);
            // Acepta tanto IDs numéricos como UUIDs
            const match = urlObj.pathname.match(/\/playlist\/([a-zA-Z0-9\-]+)/);
            return match ? match[1] : null;
        } catch {
            const match = url.match(/(?:tidal\.com\/)?(?:browse\/)?playlist\/([a-zA-Z0-9\-]+)/i);
            return match ? match[1] : null;
        }
    }

    extractSpotifyPlaylistId(url) {
        try {
            const urlObj = new URL(url);
            const match = urlObj.pathname.match(/\/playlist\/([a-zA-Z0-9]+)/);
            return match ? match[1] : null;
        } catch {
            const match = url.match(/(?:spotify\.com\/)?playlist\/([a-zA-Z0-9]+)/i);
            return match ? match[1] : null;
        }
    }

    async getSpotifyPlaylist(playlistId) {
        const cached = await this.cache.get('spotify_playlist', playlistId);
        if (cached) return cached;

        try {
            console.log('Fetching Spotify playlist:', playlistId);
            
            // Usar un proxy CORS o la API embebida de Spotify
            // Primero intentamos con la API directa (algunas playlists públicas funcionan)
            let tracks = [];
            let playlistName = 'Spotify Playlist';
            
            try {
                // Intentar obtener datos básicos de la playlist usando oembed
                const oembedUrl = `https://open.spotify.com/oembed?url=https://open.spotify.com/playlist/${playlistId}`;
                const oembedResponse = await fetch(oembedUrl);
                
                if (oembedResponse.ok) {
                    const oembedData = await oembedResponse.json();
                    playlistName = oembedData.title || playlistName;
                    console.log('Playlist name:', playlistName);
                }
            } catch (err) {
                console.warn('Could not fetch playlist metadata:', err);
            }
            
            // Como no podemos acceder directamente por CORS, pedirle al usuario que nos dé los nombres
            const userInput = prompt(
                `Please paste the track list from Spotify playlist "${playlistName}".\n\n` +
                `Format: One track per line as "Artist - Track Name"\n\n` +
                `Tip: You can copy the track list from Spotify web player.`,
                ''
            );
            
            if (!userInput || userInput.trim() === '') {
                throw new Error('No tracks provided');
            }
            
            // Parsear el input del usuario
            const lines = userInput.split('\n').filter(line => line.trim());
            console.log(`Parsing ${lines.length} tracks from user input`);
            
            const searchPromises = [];
            
            for (const line of lines) {
                const cleanLine = line.trim();
                if (!cleanLine) continue;
                
                // Intentar parsear diferentes formatos
                let artistName, trackTitle;
                
                if (cleanLine.includes(' - ')) {
                    [artistName, trackTitle] = cleanLine.split(' - ').map(s => s.trim());
                } else if (cleanLine.includes(' – ')) {
                    [artistName, trackTitle] = cleanLine.split(' – ').map(s => s.trim());
                } else {
                    // Solo el nombre de la canción
                    trackTitle = cleanLine;
                    artistName = '';
                }
                
                if (!trackTitle) continue;
                
                const query = artistName ? `${artistName} ${trackTitle}` : trackTitle;
                console.log(`Searching for: ${query}`);
                
                // Buscar la canción en nuestro servidor
                searchPromises.push(
                    this.searchTracks(query)
                        .then(result => {
                            const results = result.items || [];
                            if (results.length > 0) {
                                // Buscar la mejor coincidencia
                                if (artistName) {
                                    for (const found of results.slice(0, 3)) {
                                        if (!found || !found.title || !found.artist) continue;
                                        
                                        const titleMatch = found.title.toLowerCase().includes(trackTitle.toLowerCase()) ||
                                                         trackTitle.toLowerCase().includes(found.title.toLowerCase());
                                        const artistMatch = found.artist.toLowerCase().includes(artistName.toLowerCase()) ||
                                                           artistName.toLowerCase().includes(found.artist.toLowerCase());
                                        
                                        if (titleMatch && artistMatch) {
                                            return found;
                                        }
                                    }
                                }
                                // Si no hay coincidencia exacta o no hay artista, devolver la primera válida
                                for (const found of results) {
                                    if (found && found.title && found.artist) {
                                        return found;
                                    }
                                }
                            }
                            return null;
                        })
                        .catch(err => {
                            console.warn(`Could not find: ${query}`, err);
                            return null;
                        })
                );
            }
            
            // Esperar todas las búsquedas
            console.log(`Searching for ${searchPromises.length} tracks...`);
            const searchResults = await Promise.all(searchPromises);
            
            // Filtrar tracks válidos
            for (const track of searchResults) {
                if (track) {
                    tracks.push(track);
                }
            }
            
            console.log(`Successfully found ${tracks.length} tracks from Spotify playlist`);
            
            if (tracks.length === 0) {
                throw new Error('No tracks found. Please check the format and try again.');
            }
            
            const result = {
                playlist: {
                    name: playlistName,
                    numberOfTracks: tracks.length,
                    source: 'spotify'
                },
                tracks
            };

            await this.cache.set('spotify_playlist', playlistId, result);
            return result;
        } catch (error) {
            console.error('Failed to fetch Spotify playlist:', error);
            throw error;
        }
    }
}