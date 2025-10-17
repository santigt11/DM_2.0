/**
 * Spotify API Client con Authorization Code + PKCE
 * Docs: https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
 */

class SpotifyAPI {
    constructor() {
        this.clientId = ''; // Se configurará desde la UI o config
        this.redirectUri = window.location.origin + '/callback';
        this.authEndpoint = 'https://accounts.spotify.com/authorize';
        this.tokenEndpoint = 'https://accounts.spotify.com/api/token';
        this.apiBase = 'https://api.spotify.com/v1';
        
        // Scopes necesarios
        this.scopes = [
            'playlist-read-private',
            'playlist-read-collaborative'
        ];
    }

    // ============= PKCE Helpers =============
    
    generateCodeVerifier(length = 128) {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
        const values = crypto.getRandomValues(new Uint8Array(length));
        return Array.from(values)
            .map(x => possible[x % possible.length])
            .join('');
    }

    async generateCodeChallenge(codeVerifier) {
        const encoder = new TextEncoder();
        const data = encoder.encode(codeVerifier);
        const digest = await crypto.subtle.digest('SHA-256', data);
        return btoa(String.fromCharCode(...new Uint8Array(digest)))
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');
    }

    // ============= Authentication Flow =============

    async authorize() {
        // Generar code verifier y challenge
        const codeVerifier = this.generateCodeVerifier();
        const codeChallenge = await this.generateCodeChallenge(codeVerifier);
        
        // Guardar code verifier para usarlo después
        localStorage.setItem('spotify_code_verifier', codeVerifier);
        
        // Construir URL de autorización
        const params = new URLSearchParams({
            client_id: this.clientId,
            response_type: 'code',
            redirect_uri: this.redirectUri,
            scope: this.scopes.join(' '),
            code_challenge_method: 'S256',
            code_challenge: codeChallenge
        });
        
        // Redirigir a Spotify
        window.location.href = `${this.authEndpoint}?${params.toString()}`;
    }

    async handleCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        
        if (!code) {
            throw new Error('No authorization code found');
        }
        
        const codeVerifier = localStorage.getItem('spotify_code_verifier');
        if (!codeVerifier) {
            throw new Error('No code verifier found');
        }
        
        // Intercambiar código por tokens
        const payload = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: this.clientId,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: this.redirectUri,
                code_verifier: codeVerifier
            })
        };
        
        const response = await fetch(this.tokenEndpoint, payload);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error_description || 'Failed to get tokens');
        }
        
        // Guardar tokens
        this.saveTokens(data);
        
        // Limpiar code verifier
        localStorage.removeItem('spotify_code_verifier');
        
        return data;
    }

    saveTokens(data) {
        localStorage.setItem('spotify_access_token', data.access_token);
        if (data.refresh_token) {
            localStorage.setItem('spotify_refresh_token', data.refresh_token);
        }
        // Guardar timestamp de expiración (expires_in es en segundos)
        const expiresAt = Date.now() + (data.expires_in * 1000);
        localStorage.setItem('spotify_token_expires_at', expiresAt.toString());
    }

    async refreshAccessToken() {
        const refreshToken = localStorage.getItem('spotify_refresh_token');
        
        if (!refreshToken) {
            throw new Error('No refresh token available');
        }
        
        const payload = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: this.clientId
            })
        };
        
        const response = await fetch(this.tokenEndpoint, payload);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error_description || 'Failed to refresh token');
        }
        
        // Guardar nuevos tokens
        this.saveTokens(data);
        
        return data.access_token;
    }

    async getValidAccessToken() {
        const accessToken = localStorage.getItem('spotify_access_token');
        const expiresAt = parseInt(localStorage.getItem('spotify_token_expires_at') || '0');
        
        // Si no hay token o está por expirar (dentro de 5 minutos)
        if (!accessToken || Date.now() >= (expiresAt - 5 * 60 * 1000)) {
            console.log('[Spotify] Token expired or missing, refreshing...');
            return await this.refreshAccessToken();
        }
        
        return accessToken;
    }

    isAuthenticated() {
        return !!localStorage.getItem('spotify_access_token');
    }

    logout() {
        localStorage.removeItem('spotify_access_token');
        localStorage.removeItem('spotify_refresh_token');
        localStorage.removeItem('spotify_token_expires_at');
        localStorage.removeItem('spotify_code_verifier');
    }

    // ============= API Methods =============

    async fetchWithAuth(endpoint, options = {}) {
        const accessToken = await this.getValidAccessToken();
        
        const response = await fetch(`${this.apiBase}${endpoint}`, {
            ...options,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Spotify API error');
        }
        
        return response.json();
    }

    async getPlaylist(playlistId) {
        return this.fetchWithAuth(`/playlists/${playlistId}`);
    }

    async getPlaylistTracks(playlistId, limit = 100, offset = 0) {
        return this.fetchWithAuth(`/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`);
    }

    async searchPlaylists(query, limit = 20) {
        const params = new URLSearchParams({
            q: query,
            type: 'playlist',
            limit: limit.toString()
        });
        return this.fetchWithAuth(`/search?${params.toString()}`);
    }

    async getUserPlaylists(limit = 50, offset = 0) {
        return this.fetchWithAuth(`/me/playlists?limit=${limit}&offset=${offset}`);
    }

    /**
     * Extraer ID de playlist desde URL de Spotify
     * Formatos soportados:
     * - https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
     * - spotify:playlist:37i9dQZF1DXcBWIGoYBM5M
     * - 37i9dQZF1DXcBWIGoYBM5M
     */
    extractPlaylistId(input) {
        // Si ya es un ID (solo alfanuméricos)
        if (/^[a-zA-Z0-9]+$/.test(input)) {
            return input;
        }
        
        // URL de Spotify
        const urlMatch = input.match(/playlist\/([a-zA-Z0-9]+)/);
        if (urlMatch) {
            return urlMatch[1];
        }
        
        // URI de Spotify
        const uriMatch = input.match(/spotify:playlist:([a-zA-Z0-9]+)/);
        if (uriMatch) {
            return uriMatch[1];
        }
        
        return null;
    }

    /**
     * Convertir tracks de Spotify a formato compatible con la app
     */
    convertSpotifyTracksToTidal(spotifyTracks) {
        return spotifyTracks.map(item => {
            const track = item.track;
            if (!track) return null;
            
            return {
                title: track.name,
                artist: track.artists[0]?.name,
                artists: track.artists.map(a => a.name).join(', '),
                album: track.album?.name,
                duration: Math.floor(track.duration_ms / 1000),
                isrc: track.external_ids?.isrc, // Útil para buscar en TIDAL
                spotifyId: track.id,
                spotifyUri: track.uri
            };
        }).filter(t => t !== null);
    }
}

export default SpotifyAPI;
