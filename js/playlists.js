// js/playlists.js
// Sistema de gestión de playlists personales

export const PlaylistManager = {
    STORAGE_KEY: 'monochrome-playlists',

    /**
     * Obtener todas las playlists
     * @returns {Array} Lista de playlists
     */
    getAll() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('Error loading playlists:', e);
            return [];
        }
    },

    /**
     * Guardar todas las playlists
     * @param {Array} playlists 
     */
    _saveAll(playlists) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(playlists));
        } catch (e) {
            console.error('Error saving playlists:', e);
        }
    },

    /**
     * Generar ID único para playlist
     * @returns {string}
     */
    _generateId() {
        return `pl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },

    /**
     * Crear nueva playlist
     * @param {string} name - Nombre de la playlist
     * @param {string} description - Descripción opcional
     * @returns {Object} Playlist creada
     */
    create(name, description = '') {
        const playlists = this.getAll();

        const newPlaylist = {
            id: this._generateId(),
            name: name.trim() || 'New Playlist',
            description: description.trim(),
            tracks: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            coverUrl: null // Se puede extraer del primer track
        };

        playlists.unshift(newPlaylist);
        this._saveAll(playlists);

        return newPlaylist;
    },

    /**
     * Obtener playlist por ID
     * @param {string} id 
     * @returns {Object|null}
     */
    getById(id) {
        const playlists = this.getAll();
        return playlists.find(p => p.id === id) || null;
    },

    /**
     * Actualizar nombre/descripción de playlist
     * @param {string} id 
     * @param {Object} updates - { name?, description? }
     * @returns {Object|null}
     */
    update(id, updates) {
        const playlists = this.getAll();
        const index = playlists.findIndex(p => p.id === id);

        if (index === -1) return null;

        if (updates.name !== undefined) {
            playlists[index].name = updates.name.trim() || 'Untitled Playlist';
        }
        if (updates.description !== undefined) {
            playlists[index].description = updates.description.trim();
        }

        playlists[index].updatedAt = Date.now();
        this._saveAll(playlists);

        return playlists[index];
    },

    /**
     * Eliminar playlist
     * @param {string} id 
     * @returns {boolean}
     */
    delete(id) {
        const playlists = this.getAll();
        const index = playlists.findIndex(p => p.id === id);

        if (index === -1) return false;

        playlists.splice(index, 1);
        this._saveAll(playlists);

        return true;
    },

    /**
     * Agregar track a playlist
     * @param {string} playlistId 
     * @param {Object} track - Track object
     * @returns {boolean}
     */
    addTrack(playlistId, track) {
        const playlists = this.getAll();
        const playlist = playlists.find(p => p.id === playlistId);

        if (!playlist) return false;

        // Verificar si ya existe
        const exists = playlist.tracks.some(t => t.id === track.id);
        if (exists) return false;

        // Crear copia limpia del track para almacenar
        const trackData = {
            id: track.id,
            title: track.title,
            duration: track.duration,
            trackNumber: track.trackNumber,
            artist: {
                id: track.artist?.id,
                name: track.artist?.name
            },
            album: {
                id: track.album?.id,
                title: track.album?.title,
                cover: track.album?.cover
            },
            explicit: track.explicit
        };

        playlist.tracks.push(trackData);
        playlist.updatedAt = Date.now();

        // Actualizar cover con el primer track si no tiene
        if (!playlist.coverUrl && trackData.album?.cover) {
            playlist.coverUrl = trackData.album.cover;
        }

        this._saveAll(playlists);
        return true;
    },

    /**
     * Agregar múltiples tracks a playlist
     * @param {string} playlistId 
     * @param {Array} tracks 
     * @returns {number} Cantidad agregada
     */
    addTracks(playlistId, tracks) {
        let added = 0;
        for (const track of tracks) {
            if (this.addTrack(playlistId, track)) {
                added++;
            }
        }
        return added;
    },

    /**
     * Remover track de playlist
     * @param {string} playlistId 
     * @param {number} trackIndex - Índice del track
     * @returns {boolean}
     */
    removeTrack(playlistId, trackIndex) {
        const playlists = this.getAll();
        const playlist = playlists.find(p => p.id === playlistId);

        if (!playlist || trackIndex < 0 || trackIndex >= playlist.tracks.length) {
            return false;
        }

        playlist.tracks.splice(trackIndex, 1);
        playlist.updatedAt = Date.now();

        // Actualizar cover si se removió el track que lo tenía
        if (playlist.tracks.length > 0) {
            playlist.coverUrl = playlist.tracks[0].album?.cover || null;
        } else {
            playlist.coverUrl = null;
        }

        this._saveAll(playlists);
        return true;
    },

    /**
     * Mover track dentro de playlist
     * @param {string} playlistId 
     * @param {number} fromIndex 
     * @param {number} toIndex 
     * @returns {boolean}
     */
    moveTrack(playlistId, fromIndex, toIndex) {
        const playlists = this.getAll();
        const playlist = playlists.find(p => p.id === playlistId);

        if (!playlist) return false;
        if (fromIndex < 0 || fromIndex >= playlist.tracks.length) return false;
        if (toIndex < 0 || toIndex >= playlist.tracks.length) return false;

        const [track] = playlist.tracks.splice(fromIndex, 1);
        playlist.tracks.splice(toIndex, 0, track);
        playlist.updatedAt = Date.now();

        this._saveAll(playlists);
        return true;
    },

    /**
     * Duplicar playlist
     * @param {string} id 
     * @returns {Object|null}
     */
    duplicate(id) {
        const original = this.getById(id);
        if (!original) return null;

        const playlists = this.getAll();

        const newPlaylist = {
            ...original,
            id: this._generateId(),
            name: `${original.name} (Copy)`,
            tracks: [...original.tracks],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        playlists.unshift(newPlaylist);
        this._saveAll(playlists);

        return newPlaylist;
    },

    /**
     * Exportar playlist a JSON
     * @param {string} id 
     * @returns {string|null}
     */
    export(id) {
        const playlist = this.getById(id);
        if (!playlist) return null;

        return JSON.stringify(playlist, null, 2);
    },

    /**
     * Importar playlist desde JSON
     * @param {string} jsonString 
     * @returns {Object|null}
     */
    import(jsonString) {
        try {
            const data = JSON.parse(jsonString);

            if (!data.name || !Array.isArray(data.tracks)) {
                throw new Error('Invalid playlist format');
            }

            const playlists = this.getAll();

            const newPlaylist = {
                id: this._generateId(),
                name: data.name,
                description: data.description || '',
                tracks: data.tracks,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                coverUrl: data.coverUrl || (data.tracks[0]?.album?.cover || null)
            };

            playlists.unshift(newPlaylist);
            this._saveAll(playlists);

            return newPlaylist;
        } catch (e) {
            console.error('Error importing playlist:', e);
            return null;
        }
    },

    /**
     * Obtener estadísticas de todas las playlists
     * @returns {Object}
     */
    getStats() {
        const playlists = this.getAll();
        const totalTracks = playlists.reduce((sum, p) => sum + p.tracks.length, 0);

        return {
            playlistCount: playlists.length,
            totalTracks,
            averageTracksPerPlaylist: playlists.length ? Math.round(totalTracks / playlists.length) : 0
        };
    }
};

export default PlaylistManager;
