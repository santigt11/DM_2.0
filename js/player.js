import { REPEAT_MODE, SVG_PLAY, SVG_PAUSE, formatTime } from './utils.js';

export class Player {
    constructor(audioElement, api, quality = 'HIGH') {
        this.audio = audioElement;
        this.api = api;
        this.quality = quality; // Calidad para streaming (HIGH = AAC 320kbps)
        this.queue = [];
        this.shuffledQueue = [];
        this.originalQueueBeforeShuffle = [];
        this.currentQueueIndex = -1;
        this.shuffleActive = false;
        this.repeatMode = REPEAT_MODE.OFF;
        this.preloadCache = new Map();
        this.preloadAbortController = null;
    }

    setQuality(quality) {
        this.quality = quality;
    }

    getCurrentTrack() {
        const currentQueue = this.shuffleActive ? this.shuffledQueue : this.queue;
        if (this.currentQueueIndex >= 0 && this.currentQueueIndex < currentQueue.length) {
            return currentQueue[this.currentQueueIndex];
        }
        return null;
    }

    getCurrentQueue() {
        return this.shuffleActive ? this.shuffledQueue : this.queue;
    }

    async preloadNextTracks() {
        if (this.preloadAbortController) {
            this.preloadAbortController.abort();
        }

        this.preloadAbortController = new AbortController();
        const currentQueue = this.shuffleActive ? this.shuffledQueue : this.queue;
        const tracksToPreload = [];

        for (let i = 1; i <= 2; i++) {
            const nextIndex = this.currentQueueIndex + i;
            if (nextIndex < currentQueue.length) {
                tracksToPreload.push({ track: currentQueue[nextIndex], index: nextIndex });
            }
        }

        for (const { track, index } of tracksToPreload) {
            if (this.preloadCache.has(track.id)) continue;

            try {
                const streamUrl = await this.api.getStreamUrl(track.id, this.quality);

                if (this.preloadAbortController.signal.aborted) break;

                fetch(streamUrl, {
                    signal: this.preloadAbortController.signal,
                    method: 'GET',
                    mode: 'cors',
                    cache: 'default'
                }).then(response => {
                    if (response.ok) {
                        this.preloadCache.set(track.id, streamUrl);
                    }
                }).catch(err => {
                    if (err.name !== 'AbortError') {
                        console.debug('Preload failed for:', track.title);
                    }
                });

            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.debug('Failed to get stream URL for preload:', track.title);
                }
            }
        }
    }

    async playTrackFromQueue() {
        const currentQueue = this.shuffleActive ? this.shuffledQueue : this.queue;
        if (this.currentQueueIndex < 0 || this.currentQueueIndex >= currentQueue.length) {
            return;
        }

        const track = currentQueue[this.currentQueueIndex];

        // Get UI elements
        const coverEl = document.querySelector('.now-playing-bar .cover');
        const detailsEl = document.querySelector('.now-playing-bar .details');
        const titleEl = document.querySelector('.now-playing-bar .title');
        const artistEl = document.querySelector('.now-playing-bar .artist');

        // Add transition classes for smooth fade
        coverEl.classList.add('transitioning');
        detailsEl.classList.add('transitioning');

        // Wait for fade out, then update
        setTimeout(() => {
            coverEl.src = this.api.getCoverUrl(track.album?.cover, '160');
            titleEl.textContent = track.title;
            artistEl.textContent = track.artist?.name || 'Unknown Artist';
            document.title = `${track.title} • ${track.artist?.name || 'Unknown'}`;

            // Remove transition classes after image loads or timeout
            coverEl.onload = () => {
                coverEl.classList.remove('transitioning');
                detailsEl.classList.remove('transitioning');
                titleEl.classList.add('animate-in');
                artistEl.classList.add('animate-in');
                setTimeout(() => {
                    titleEl.classList.remove('animate-in');
                    artistEl.classList.remove('animate-in');
                }, 300);
            };
            // Fallback timeout
            setTimeout(() => {
                coverEl.classList.remove('transitioning');
                detailsEl.classList.remove('transitioning');
            }, 500);
        }, 150);

        this.updatePlayingTrackIndicator();
        this.updateMediaSession(track);

        try {
            let streamUrl;

            if (this.preloadCache.has(track.id)) {
                streamUrl = this.preloadCache.get(track.id);
            } else {
                streamUrl = await this.api.getStreamUrl(track.id, this.quality);
            }

            this.audio.src = streamUrl;
            await this.audio.play();

            this.preloadNextTracks();

        } catch (error) {
            console.error(`Could not get track URL for: ${track.title}`, error);
            document.querySelector('.now-playing-bar .title').textContent = `Error: ${track.title}`;
            document.querySelector('.now-playing-bar .artist').textContent = error.message || 'Could not load track';
            document.querySelector('.play-pause-btn').innerHTML = SVG_PLAY;
        }
    }

    playNext() {
        const currentQueue = this.shuffleActive ? this.shuffledQueue : this.queue;
        const isLastTrack = this.currentQueueIndex >= currentQueue.length - 1;

        if (this.repeatMode === REPEAT_MODE.ONE) {
            this.audio.currentTime = 0;
            this.audio.play();
            return;
        }

        if (!isLastTrack) {
            this.currentQueueIndex++;
        } else if (this.repeatMode === REPEAT_MODE.ALL) {
            this.currentQueueIndex = 0;
        } else {
            return;
        }

        this.playTrackFromQueue();
    }

    playPrev() {
        if (this.audio.currentTime > 3) {
            this.audio.currentTime = 0;
        } else if (this.currentQueueIndex > 0) {
            this.currentQueueIndex--;
            this.playTrackFromQueue();
        }
    }

    handlePlayPause() {
        if (!this.audio.src) return;
        this.audio.paused ? this.audio.play() : this.audio.pause();
    }

    seekBackward(seconds = 10) {
        const newTime = Math.max(0, this.audio.currentTime - seconds);
        this.audio.currentTime = newTime;
    }

    seekForward(seconds = 10) {
        const duration = this.audio.duration || 0;
        const newTime = Math.min(duration, this.audio.currentTime + seconds);
        this.audio.currentTime = newTime;
    }

    toggleShuffle() {
        this.shuffleActive = !this.shuffleActive;

        if (this.shuffleActive) {
            this.originalQueueBeforeShuffle = [...this.queue];
            const currentTrack = this.queue[this.currentQueueIndex];
            this.shuffledQueue = [...this.queue].sort(() => Math.random() - 0.5);
            this.currentQueueIndex = this.shuffledQueue.findIndex(t => t.id === currentTrack?.id);

            if (this.currentQueueIndex === -1 && currentTrack) {
                this.shuffledQueue.unshift(currentTrack);
                this.currentQueueIndex = 0;
            }
        } else {
            const currentTrack = this.shuffledQueue[this.currentQueueIndex];
            this.queue = [...this.originalQueueBeforeShuffle];
            this.currentQueueIndex = this.queue.findIndex(t => t.id === currentTrack?.id);
        }

        this.preloadCache.clear();
        this.preloadNextTracks();
    }

    toggleRepeat() {
        this.repeatMode = (this.repeatMode + 1) % 3;
        return this.repeatMode;
    }

    setQueue(tracks, startIndex = 0) {
        this.queue = tracks;
        this.currentQueueIndex = startIndex;
        this.shuffleActive = false;
        this.preloadCache.clear();
    }

    addToQueue(track) {
        // Evitar duplicados: verificar si ya existe en la cola
        const isDuplicate = this.queue.some(queueTrack =>
            queueTrack.id === track.id
        );

        if (!isDuplicate) {
            this.queue.push(track);
            if (this.shuffleActive) {
                this.shuffledQueue.push(track);
            }
            return true; // Se agregó
        }
        return false; // Ya existe
    }

    addMultipleToQueue(tracks) {
        if (Array.isArray(tracks)) {
            const newTracks = tracks.filter(track =>
                !this.queue.some(queueTrack => queueTrack.id === track.id)
            );

            if (newTracks.length > 0) {
                this.queue.push(...newTracks);
                if (this.shuffleActive) {
                    this.shuffledQueue.push(...newTracks);
                }
            }

            return {
                added: newTracks.length,
                duplicates: tracks.length - newTracks.length
            };
        }
        return { added: 0, duplicates: 0 };
    }

    clearQueue() {
        this.queue = [];
        this.shuffledQueue = [];
        this.currentQueueIndex = 0;

        // Si hay reproducción activa, pausar
        if (this.audio && !this.audio.paused) {
            this.pause();
        }
    }

    removeFromQueue(index) {
        const currentQueue = this.getCurrentQueue();

        // Validar índice
        if (index < 0 || index >= currentQueue.length) {
            console.warn('Invalid queue index:', index);
            return;
        }

        // Determinar qué colas actualizar
        if (this.shuffleActive) {
            // Remover de shuffledQueue
            const track = this.shuffledQueue[index];
            this.shuffledQueue.splice(index, 1);

            // También remover de queue normal
            const normalIndex = this.queue.findIndex(t => t.id === track.id);
            if (normalIndex !== -1) {
                this.queue.splice(normalIndex, 1);
            }
        } else {
            // Remover de queue normal
            const track = this.queue[index];
            this.queue.splice(index, 1);

            // También remover de shuffledQueue si existe
            if (this.shuffledQueue.length > 0) {
                const shuffledIndex = this.shuffledQueue.findIndex(t => t.id === track.id);
                if (shuffledIndex !== -1) {
                    this.shuffledQueue.splice(shuffledIndex, 1);
                }
            }
        }

        // Ajustar currentQueueIndex si es necesario
        if (index < this.currentQueueIndex) {
            // Si removemos una canción anterior a la actual, decrementar índice
            this.currentQueueIndex--;
        } else if (index === this.currentQueueIndex) {
            // Si removemos la canción actual, pausar y reproducir la siguiente
            if (this.audio && !this.audio.paused) {
                this.pause();
                // Si quedan canciones, reproducir la que ahora está en ese índice
                if (currentQueue.length > 0) {
                    // Ajustar índice si estamos al final
                    if (this.currentQueueIndex >= currentQueue.length) {
                        this.currentQueueIndex = currentQueue.length - 1;
                    }
                    this.playTrackFromQueue();
                } else {
                    // Queue vacía, resetear
                    this.currentQueueIndex = 0;
                }
            }
        }
    }

    moveQueueItem(fromIndex, toIndex) {
        const currentQueue = this.getCurrentQueue();

        if (fromIndex < 0 || fromIndex >= currentQueue.length ||
            toIndex < 0 || toIndex >= currentQueue.length ||
            fromIndex === toIndex) {
            return;
        }

        const trackToMove = currentQueue[fromIndex];

        // Remove from old position
        currentQueue.splice(fromIndex, 1);
        // Insert at new position
        currentQueue.splice(toIndex, 0, trackToMove);

        // Update currentQueueIndex
        if (this.currentQueueIndex === fromIndex) {
            this.currentQueueIndex = toIndex;
        } else if (fromIndex < this.currentQueueIndex && toIndex >= this.currentQueueIndex) {
            this.currentQueueIndex--;
        } else if (fromIndex > this.currentQueueIndex && toIndex <= this.currentQueueIndex) {
            this.currentQueueIndex++;
        }
    }

    getCurrentQueue() {
        return this.shuffleActive ? this.shuffledQueue : this.queue;
    }

    updatePlayingTrackIndicator() {
        const currentTrack = this.getCurrentQueue()[this.currentQueueIndex];

        document.querySelectorAll('.track-item').forEach(item => {
            let isPlaying = false;

            if (item.hasAttribute('data-queue-index')) {
                // Para elementos de la cola, usar el índice exacto
                const itemIndex = parseInt(item.dataset.queueIndex, 10);
                isPlaying = (itemIndex === this.currentQueueIndex);
            } else {
                // Para otras listas (búsqueda, álbum, playlist), usar ID
                isPlaying = (currentTrack && item.dataset.trackId == currentTrack.id);
            }

            item.classList.toggle('playing', isPlaying);
        });
    }

    updateMediaSession(track) {
        if (!('mediaSession' in navigator)) return;

        const artwork = [];
        const sizes = ['96', '128', '192', '256', '384', '512'];

        const coverId = track.album?.cover;

        if (coverId) {
            sizes.forEach(size => {
                const url = this.api.getCoverUrl(coverId, size);
                artwork.push({
                    src: url,
                    sizes: `${size}x${size}`,
                    type: 'image/jpeg'
                });
            });
        }

        navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title || 'Unknown Title',
            artist: track.artist?.name || 'Unknown Artist',
            album: track.album?.title || 'Unknown Album',
            artwork: artwork.length > 0 ? artwork : undefined
        });

        navigator.mediaSession.playbackState = this.audio.paused ? 'paused' : 'playing';
    }

    updateMediaSessionPlaybackState() {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = this.audio.paused ? 'paused' : 'playing';
        }
    }

    updateMediaSessionPositionState() {
        if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
            if (this.audio.duration && !isNaN(this.audio.duration)) {
                try {
                    navigator.mediaSession.setPositionState({
                        duration: this.audio.duration,
                        playbackRate: this.audio.playbackRate,
                        position: this.audio.currentTime
                    });
                } catch (error) {
                    console.debug('Failed to update position state:', error);
                }
            }
        }
    }
}