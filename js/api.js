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

        const TIMEOUT_MS = options.timeout || 10000; // 10 segundos por defecto
        const maxAttemptsPerInstance = 2;
        let lastError = null;
        let attemptCount = 0;
        const maxTotalAttempts = instances.length * maxAttemptsPerInstance;

        // Intentar con cada instancia
        for (let instanceIndex = 0; instanceIndex < instances.length; instanceIndex++) {
            const baseUrl = instances[instanceIndex];
            const url = baseUrl.endsWith('/')
                ? `${baseUrl}${relativePath.substring(1)}`
                : `${baseUrl}${relativePath}`;

            // Intentar varias veces con la misma instancia
            for (let attempt = 1; attempt <= maxAttemptsPerInstance; attempt++) {
                attemptCount++;

                // Crear un AbortController para el timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

                try {
                    console.log(`[API] Attempt ${attemptCount}/${maxTotalAttempts}: ${baseUrl} (${relativePath})`);

                    const response = await fetch(url, {
                        ...options,
                        signal: controller.signal,
                        cache: 'no-store', // Evitar caché del navegador
                        mode: 'cors' // Explícitamente usar CORS
                    });

                    clearTimeout(timeoutId);

                    // Rate limiting
                    if (response.status === 429) {
                        console.warn(`[API] Rate limited on ${baseUrl}`);
                        lastError = new Error(RATE_LIMIT_ERROR_MESSAGE);
                        break; // Saltar a la siguiente instancia
                    }

                    // Respuesta exitosa
                    if (response.ok) {
                        console.log(`[API] ✓ Success with ${baseUrl}`);
                        return response;
                    }

                    // Error de autenticación
                    if (response.status === 401) {
                        let errorData;
                        try {
                            errorData = await response.clone().json();
                        } catch { }

                        if (errorData?.subStatus === 11002) {
                            lastError = new Error(errorData?.userMessage || 'Authentication failed');
                            if (attempt < maxAttemptsPerInstance) {
                                await delay(300);
                                continue;
                            }
                        }
                    }

                    // Error del servidor - reintentar
                    if (response.status >= 500) {
                        console.warn(`[API] Server error ${response.status} on ${baseUrl}`);
                        lastError = new Error(`Server error: ${response.status}`);
                        if (attempt < maxAttemptsPerInstance) {
                            await delay(500);
                            continue;
                        }
                        break; // Saltar a la siguiente instancia
                    }

                    // Otros errores
                    lastError = new Error(`Request failed with status ${response.status}`);
                    break; // Saltar a la siguiente instancia

                } catch (error) {
                    clearTimeout(timeoutId);

                    // Error de timeout
                    if (error.name === 'AbortError') {
                        console.warn(`[API] Timeout on ${baseUrl}`);
                        lastError = new Error(`Request timeout (${TIMEOUT_MS}ms)`);
                        break; // Saltar a la siguiente instancia
                    }

                    // Error de red (CORS, NetworkError, etc.)
                    if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
                        console.warn(`[API] Network error on ${baseUrl}: ${error.message}`);
                        lastError = new Error(`Network error: ${error.message}`);
                        break; // Saltar a la siguiente instancia inmediatamente
                    }

                    lastError = error;
                    console.warn(`[API] Error on ${baseUrl}: ${error.message}`);

                    // Pequeño delay antes de reintentar
                    if (attempt < maxAttemptsPerInstance) {
                        await delay(300);
                    }
                }
            }
        }

        // Si llegamos aquí, todas las instancias fallaron
        console.error(`[API] All instances failed for: ${relativePath}`);
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
        // Si la respuesta viene en formato v2.0, extraer el objeto artist interno
        if (artist.version === "2.0" && artist.artist) {
            artist = artist.artist;
        }

        if (!artist.type && Array.isArray(artist.artistTypes) && artist.artistTypes.length > 0) {
            return { ...artist, type: artist.artistTypes[0] };
        }
        return artist;
    }

    parseTrackLookup(data) {
        // Normalizar a array
        let entries = [];
        if (data.data) {
            entries = [data.data];
        } else if (Array.isArray(data)) {
            entries = data;
        } else {
            entries = [data];
        }

        let track, info, originalTrackUrl;

        // Buscar en los entries
        for (const entry of entries) {
            if (!entry || typeof entry !== 'object') continue;

            // Caso 1: Todo en un solo objeto (formato nuevo)
            if (entry.id && (entry.duration || entry.manifest || entry.OriginalTrackUrl || entry.originalTrackUrl || entry.url)) {
                // Este objeto tiene tanto info de track como de stream
                track = entry;
                info = entry;
                originalTrackUrl = entry.OriginalTrackUrl || entry.originalTrackUrl || entry.url;
                break; // Ya tenemos todo
            }

            // Caso 2: Objetos separados (formato antiguo)
            if (!track && 'duration' in entry && 'title' in entry) {
                track = entry;
            }

            if (!info && 'manifest' in entry) {
                info = entry;
            }

            if (!originalTrackUrl && 'OriginalTrackUrl' in entry) {
                const candidate = entry.OriginalTrackUrl;
                if (typeof candidate === 'string') {
                    originalTrackUrl = candidate;
                }
            }
        }

        // Validar que al menos tengamos algo útil
        if (!track && !info && !originalTrackUrl) {
            console.error('[parseTrackLookup] Response:', JSON.stringify(data, null, 2));
            throw new Error('Malformed track response');
        }

        // Si tenemos track pero no info, usar track como info también
        if (track && !info) {
            info = track;
        }

        // Si tenemos info pero no track, usar info como track también
        if (info && !track) {
            track = info;
        }

        return { track, info, originalTrackUrl };
    }

    extractStreamUrlFromManifest(manifest) {
        if (!manifest) return null;

        try {
            // Si el manifest ya es un string decodificado (no base64)
            let decoded = manifest;

            // Intentar decodificar base64 solo si parece ser base64
            // Base64 típicamente solo contiene A-Z, a-z, 0-9, +, /, =
            const looksLikeBase64 = /^[A-Za-z0-9+/=_-]+$/.test(manifest);

            if (looksLikeBase64 && manifest.length > 100) {
                try {
                    // Normalizar base64 URL-safe
                    const normalized = manifest.replace(/-/g, '+').replace(/_/g, '/');
                    decoded = atob(normalized);
                } catch (e) {
                    // No es base64, usar el manifest tal cual
                    console.log('[Manifest] Not base64, using as-is');
                }
            }

            // 1. Intentar parsear como JSON
            try {
                const parsed = JSON.parse(decoded);

                // Formato: { urls: [...] }
                if (parsed?.urls && Array.isArray(parsed.urls) && parsed.urls.length > 0) {
                    return this.enforceHttps(parsed.urls[0]);
                }

                // Formato: { url: "..." }
                if (parsed?.url && typeof parsed.url === 'string') {
                    return this.enforceHttps(parsed.url);
                }
            } catch {
                // No es JSON, continuar
            }

            // 2. Buscar URL con regex (para XML o texto plano)
            const urlMatch = decoded.match(/https?:\/\/[^\s"<>]+(?:\.flac|\.mp4|\.m4a|\?[^\s"<>]*)/);
            if (urlMatch && urlMatch[0]) {
                const cleanUrl = urlMatch[0].replace(/&amp;/g, '&');
                return this.enforceHttps(cleanUrl);
            }

            return null;
        } catch (error) {
            console.error('Failed to extract URL from manifest:', error);
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

        // Normalizar respuesta
        let entries = [];
        let tracksSection = null;

        // Caso 1: { version: "2.0", data: { items: [...] } }
        if (data.data && data.data.items && Array.isArray(data.data.items)) {
            tracksSection = data.data;
            entries = []; // No hay entrada de álbum separada
        }
        // Caso 2: { data: {...} } donde data es el álbum
        else if (data.data) {
            entries = [data.data];
        }
        // Caso 3: Array de objetos
        else if (Array.isArray(data)) {
            entries = data;
        }
        // Caso 4: Objeto simple
        else {
            entries = [data];
        }

        let album = null;

        // Buscar álbum en entries
        for (const entry of entries) {
            if (!entry || typeof entry !== 'object') continue;

            // Buscar álbum - más flexible
            if (!album && entry.id && entry.title) {
                // Verificar que parece un álbum (tiene cover, releaseDate, etc.)
                if (entry.cover || entry.numberOfTracks || entry.releaseDate) {
                    album = this.prepareAlbum(entry);
                }
            }

            // Buscar sección de tracks si no la tenemos
            if (!tracksSection && 'items' in entry && Array.isArray(entry.items)) {
                tracksSection = entry;
            }
        }

        // Extraer tracks
        const tracks = (tracksSection?.items || []).map(i => this.prepareTrack(i.item || i));

        // Si no encontramos el álbum pero tenemos tracks, construir álbum desde el primer track
        if (!album && tracks.length > 0) {
            const firstTrack = tracks[0];
            if (firstTrack.album) {
                console.log('[getAlbum] Building album info from first track');
                album = {
                    id: id,
                    title: firstTrack.album.title || 'Unknown Album',
                    cover: firstTrack.album.cover,
                    artist: firstTrack.artist,
                    releaseDate: firstTrack.album.releaseDate,
                    numberOfTracks: tracks.length,
                    duration: tracks.reduce((sum, t) => sum + (t.duration || 0), 0)
                };
            }
        }

        if (!album) {
            console.error('[getAlbum] Response:', JSON.stringify(data, null, 2));
            throw new Error('Album not found');
        }

        const result = { album, tracks };

        await this.cache.set('album', id, result);
        return result;
    }

    async getArtist(id) {
        const cached = await this.cache.get('artist', id);
        if (cached) return cached;

        console.log('[getArtist] Fetching artist ID:', id);
        const [primaryResponse, contentResponse] = await Promise.all([
            this.fetchWithRetry(`/artist/?id=${id}`),
            this.fetchWithRetry(`/artist/?f=${id}`)
        ]);

        const primaryData = await primaryResponse.json();
        console.log('[getArtist] Primary data received:', primaryData);

        const artist = this.prepareArtist(Array.isArray(primaryData) ? primaryData[0] : primaryData);
        console.log('[getArtist] Prepared artist:', artist);

        if (!artist) throw new Error('Primary artist details not found.');

        const contentData = await contentResponse.json();
        console.log('[getArtist] Content data structure:', {
            isArray: Array.isArray(contentData),
            keys: Object.keys(contentData),
            hasAlbums: 'albums' in contentData,
            hasTracks: 'tracks' in contentData
        });

        const entries = Array.isArray(contentData) ? contentData : [contentData];

        const albumMap = new Map();
        const trackMap = new Map();

        // Hacer isTrack más flexible para capturar sencillos también
        const isTrack = v => v?.id && v.duration;
        const isAlbum = v => v?.id && v.cover && 'numberOfTracks' in v;

        const scan = (value, visited = new Set()) => {
            if (!value || typeof value !== 'object' || visited.has(value)) return;
            visited.add(value);

            if (Array.isArray(value)) {
                value.forEach(item => scan(item, visited));
                return;
            }

            const item = value.item || value;
            if (isAlbum(item)) {
                albumMap.set(item.id, this.prepareAlbum(item));
            }
            if (isTrack(item)) {
                trackMap.set(item.id, this.prepareTrack(item));
            }

            Object.values(value).forEach(nested => scan(nested, visited));
        };

        entries.forEach(entry => scan(entry));

        // Si contentData tiene una estructura específica con tracks, procesarlos directamente
        if (contentData.tracks && Array.isArray(contentData.tracks)) {
            console.log('[getArtist] Found direct tracks array:', contentData.tracks.length);
            contentData.tracks.forEach(track => {
                if (isTrack(track)) {
                    trackMap.set(track.id, this.prepareTrack(track));
                }
            });
        }

        const albums = Array.from(albumMap.values()).sort((a, b) =>
            new Date(b.releaseDate || 0) - new Date(a.releaseDate || 0)
        );

        const tracks = Array.from(trackMap.values())
            .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
            .slice(0, 10);

        console.log('[getArtist] Found albums:', albums.length);
        console.log('[getArtist] Found tracks:', tracks.length);
        console.log('[getArtist] Sample tracks:', tracks.slice(0, 3).map(t => ({ id: t.id, title: t.title, album: t.album?.title })));

        const result = { ...artist, albums, tracks };
        console.log('[getArtist] Final result:', result);

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
        // Lista de calidades en orden de prioridad
        const qualities = [quality];
        ['LOSSLESS', 'HIGH', 'LOW', 'HI_RES_LOSSLESS'].forEach(q => {
            if (q !== quality) qualities.push(q);
        });

        const TIMEOUT = 15000;

        for (const currentQuality of qualities) {
            try {
                console.log(`[Stream] Trying quality: ${currentQuality}`);
                const response = await this.fetchWithRetry(`/track/?id=${id}&quality=${currentQuality}`, { timeout: TIMEOUT });

                if (!response.ok) {
                    console.warn(`[Stream] Response not OK for ${currentQuality}: ${response.status}`);
                    continue;
                }

                const json = await response.json();

                // Normalizar la respuesta a un array de items
                let items = [];
                if (json.data) {
                    items = [json.data];
                } else if (Array.isArray(json)) {
                    items = json;
                } else {
                    items = [json];
                }

                console.log(`[Stream] Processing ${items.length} items from response`);

                // 1. Buscar URL directa primero
                for (const item of items) {
                    const directUrl = item.OriginalTrackUrl || item.originalTrackUrl || item.url;
                    if (directUrl && typeof directUrl === 'string' && directUrl.startsWith('http')) {
                        console.log(`[Stream] ✓ Found direct URL (${currentQuality})`);
                        return this.enforceHttps(directUrl);
                    }
                }

                // 2. Intentar decodificar manifest
                for (const item of items) {
                    if (item.manifest) {
                        try {
                            // Normalizar base64 (algunos servidores usan URL-safe base64)
                            const base64 = item.manifest.replace(/-/g, '+').replace(/_/g, '/');
                            const decoded = atob(base64);

                            // Saltar manifests DASH que no tienen BaseURL
                            if (decoded.includes('SegmentTemplate') && !decoded.includes('BaseURL')) {
                                console.log(`[Stream] Skipping DASH manifest without BaseURL`);
                                continue;
                            }

                            const url = this.extractStreamUrlFromManifest(decoded);
                            if (url) {
                                console.log(`[Stream] ✓ Decoded manifest (${currentQuality})`);
                                return url;
                            }
                        } catch (e) {
                            console.warn(`[Stream] Failed to decode manifest:`, e.message);
                            // Intentar extraer sin decodificar
                            const url = this.extractStreamUrlFromManifest(item.manifest);
                            if (url) {
                                console.log(`[Stream] ✓ Extracted from raw manifest (${currentQuality})`);
                                return url;
                            }
                        }
                    }
                }

                console.warn(`[Stream] No playable URL found for quality ${currentQuality}`);
            } catch (error) {
                console.warn(`[Stream] Error with quality ${currentQuality}:`, error.message);
            }
        }

        throw new Error('Failed to resolve a playable stream URL for any quality');
    }

    enforceHttps(url) {
        if (!url) return '';
        return url.replace(/^http:/, 'https:');
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

                // Intentar usar servidor de metadatos (solo en producción)
                const isLocalhost = window.location.hostname === 'localhost' ||
                    window.location.hostname === '127.0.0.1' ||
                    window.location.hostname === '';

                if (trackMetadata && !isLocalhost) {
                    console.log(`[DOWNLOAD] Using download server with metadata`);
                    try {
                        await this._downloadWithMetadata(streamUrl, filename, trackMetadata, currentQuality);
                        console.log(`[DOWNLOAD] Successfully downloaded with metadata: ${filename}`);
                        return;
                    } catch (error) {
                        console.warn(`[DOWNLOAD] Metadata server failed, falling back to direct download:`, error.message);
                        // Continuar con descarga directa
                    }
                } else if (isLocalhost && trackMetadata) {
                    console.log(`[DOWNLOAD] Localhost detected - skipping metadata server, using direct download`);
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

                // Delay before cleanup to ensure Android browsers process the download
                await new Promise(resolve => setTimeout(resolve, 100));
                document.body.removeChild(a);

                // Additional delay before revoking URL to prevent Android download failures
                await new Promise(resolve => setTimeout(resolve, 200));
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
        console.log('[METADATA] Preparing metadata...');
        console.log('[METADATA] Preparing metadata...');
        console.log('[METADATA] trackMetadata.album:', trackMetadata.album);
        console.log('[METADATA] trackMetadata.album?.artist:', trackMetadata.album?.artist);
        console.log('[METADATA] trackMetadata.artists:', trackMetadata.artists);

        const metadata = {
            title: trackMetadata.title,
            artist: trackMetadata.artist?.name,
            album: trackMetadata.album?.title,
            albumArtist: trackMetadata.album?.artist?.name || trackMetadata.artist?.name,
            date: trackMetadata.album?.releaseDate?.substring(0, 4),
            trackNumber: trackMetadata.trackNumber,
            totalTracks: trackMetadata.album?.numberOfTracks,
            discNumber: trackMetadata.volumeNumber || 1,
            genre: trackMetadata.genre,
            coverUrl: this.getCoverUrl(trackMetadata.album?.cover, '1280'),
            filename: filename
        };

        console.log('[METADATA] Prepared:', metadata);

        // Descargar con metadatos usando Vercel
        try {
            console.log('[DOWNLOAD] Downloading with metadata via Vercel...');

            const response = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ streamUrl, filename, metadata, quality }),
                signal: AbortSignal.timeout(90000)  // 90 segundos timeout
            });

            if (!response.ok) {
                let errorMsg = `Vercel error: ${response.status}`;
                try {
                    const data = await response.json();
                    errorMsg = data.error || errorMsg;
                    console.error('[DOWNLOAD] Vercel response:', data);
                } catch (e) { }
                throw new Error(errorMsg);
            }

            // Éxito - descargar archivo
            console.log('[DOWNLOAD] ✓ Metadata added successfully');
            if (window.showNotification) {
                window.showNotification(`Downloaded "${filename}" with metadata`, 'success');
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();

            // Delay before cleanup to ensure Android browsers process the download
            await new Promise(resolve => setTimeout(resolve, 100));
            document.body.removeChild(a);

            // Additional delay before revoking URL to prevent Android download failures
            await new Promise(resolve => setTimeout(resolve, 200));
            URL.revokeObjectURL(url);

            console.log('[DOWNLOAD] ✓ Download complete');

        } catch (error) {
            console.error('[DOWNLOAD] Metadata server failed:', error.message);
            throw error;  // Propagar error para fallback a descarga directa
        }
    }

    getCoverUrl(id, size = '1280') {
        if (!id) {
            return `https://picsum.photos/seed/${Math.random()}/${size}`;
        }

        // Convertir a string si es un número
        const idStr = String(id);
        const formattedId = idStr.replace(/-/g, '/');
        return `https://resources.tidal.com/images/${formattedId}/${size}x${size}.jpg`;
    }

    getArtistPictureUrl(id, size = '750') {
        if (!id) {
            return `https://picsum.photos/seed/${Math.random()}/${size}`;
        }

        // Convertir a string si es un número
        const idStr = String(id);
        const formattedId = idStr.replace(/-/g, '/');
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