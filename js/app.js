import { LosslessAPI } from './api.js';
import { apiSettings } from './storage.js';
import { UIRenderer } from './ui.js';
import { Player } from './player.js';
import SpotifyAPI from './spotify.js';
import { 
    QUALITY, REPEAT_MODE, SVG_PLAY, SVG_PAUSE, 
    SVG_VOLUME, SVG_MUTE, formatTime, trackDataStore,
    buildTrackFilename, RATE_LIMIT_ERROR_MESSAGE, debounce
} from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
    const api = new LosslessAPI(apiSettings);
    const ui = new UIRenderer(api);
    
    const audioPlayer = document.getElementById('audio-player');
    const player = new Player(audioPlayer, api, QUALITY);
    
    const mainContent = document.querySelector('.main-content');
    const playPauseBtn = document.querySelector('.play-pause-btn');
    const nextBtn = document.getElementById('next-btn');
    const prevBtn = document.getElementById('prev-btn');
    const shuffleBtn = document.getElementById('shuffle-btn');
    const repeatBtn = document.getElementById('repeat-btn');
    const progressBar = document.getElementById('progress-bar');
    const progressFill = document.getElementById('progress-fill');
    const currentTimeEl = document.getElementById('current-time');
    const totalDurationEl = document.getElementById('total-duration');
    const volumeBar = document.getElementById('volume-bar');
    const volumeFill = document.getElementById('volume-fill');
    const volumeBtn = document.getElementById('volume-btn');
    const contextMenu = document.getElementById('context-menu');
    const queueBtn = document.getElementById('queue-btn');
    const queueModalOverlay = document.getElementById('queue-modal-overlay');
    const closeQueueBtn = document.getElementById('close-queue-btn');
    const queueList = document.getElementById('queue-list');
    const searchForm = document.getElementById('search-form');
    const searchInput = document.getElementById('search-input');
    const sidebar = document.querySelector('.sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const hamburgerBtn = document.getElementById('hamburger-btn');

    let contextTrack = null;
    let currentAlbumTracks = [];

    // Función para mostrar notificaciones
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.textContent = message;
        
        const backgroundColor = type === 'success' ? '#16a34a' : 
                               type === 'error' ? '#dc2626' : 
                               type === 'warning' ? '#ca8a04' : 
                               'var(--card)';
        
        notification.style.cssText = `
            position: fixed;
            bottom: 100px;
            right: 20px;
            background: ${backgroundColor};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: var(--radius);
            z-index: 9999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    document.querySelectorAll('.search-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.search-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.search-tab-content').forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(`search-tab-${tab.dataset.tab}`).classList.add('active');
        });
    });

    const router = () => {
        const path = window.location.hash.substring(1) || "home";
        const [page, param] = path.split('/');
        
        switch (page) {
            case 'search':
                ui.renderSearchPage(decodeURIComponent(param));
                break;
            case 'album':
                ui.renderAlbumPage(param).then(tracks => {
                    currentAlbumTracks = tracks || [];
                }).catch(err => console.error(err));
                break;
            case 'artist':
                ui.renderArtistPage(param);
                break;
            case 'home':
                ui.renderHomePage();
                break;
            default:
                ui.showPage(page);
                break;
        }
    };

    const renderQueue = () => {
        const currentQueue = player.getCurrentQueue();
        console.log('renderQueue called, queue length:', currentQueue.length);
        
        if (currentQueue.length === 0) {
            queueList.innerHTML = '<div class="placeholder-text">Queue is empty.</div>';
            return;
        }
        
        const html = currentQueue.map((track, index) => {
            const isPlaying = index === player.currentQueueIndex && 
                              track.id === (currentQueue[player.currentQueueIndex] || {}).id;
            
            return `
                <div class="track-item ${isPlaying ? 'playing' : ''}" data-queue-index="${index}" data-track-id="${track.id}">
                    <div class="track-number">${index + 1}</div>
                    <div class="track-item-info">
                        <img src="${api.getCoverUrl(track.album?.cover, '80')}" 
                             class="track-item-cover" loading="lazy">
                        <div class="track-item-details">
                            <div class="title">${track.title}</div>
                            <div class="artist">${track.artist?.name || 'Unknown'}</div>
                        </div>
                    </div>
                    <div class="track-item-actions">
                        <button class="queue-item-btn download-track-btn" data-queue-index="${index}" title="Download">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                        </button>
                        <button class="queue-item-btn remove-track-btn" data-queue-index="${index}" title="Remove">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                    <div class="track-item-duration">${formatTime(track.duration)}</div>
                </div>
            `;
        }).join('');
        
        queueList.innerHTML = html;
        player.updatePlayingTrackIndicator();
    };

    mainContent.addEventListener('click', e => {
        const trackItem = e.target.closest('.track-item');
        if (trackItem) {
            const parentList = trackItem.closest('.track-list');
            const allTrackElements = Array.from(parentList.querySelectorAll('.track-item'));
            const trackList = allTrackElements.map(el => trackDataStore.get(el)).filter(Boolean);
            
            if (trackList.length > 0) {
                const clickedTrackId = trackItem.dataset.trackId;
                const startIndex = trackList.findIndex(t => t.id == clickedTrackId);
                
                player.setQueue(trackList, startIndex);
                shuffleBtn.classList.remove('active');
                player.playTrackFromQueue();
            }
        }
    });

    mainContent.addEventListener('contextmenu', e => {
        const trackItem = e.target.closest('.track-item');
        if (trackItem) {
            e.preventDefault();
            contextTrack = trackDataStore.get(trackItem);
            
            if (contextTrack) {
                contextMenu.style.top = `${e.pageY}px`;
                contextMenu.style.left = `${e.pageX}px`;
                contextMenu.style.display = 'block';
            }
        }
    });

    document.addEventListener('click', () => {
        contextMenu.style.display = 'none';
    });

    contextMenu.addEventListener('click', async e => {
        e.stopPropagation();
        const action = e.target.dataset.action;
        
        if (action === 'add-to-queue' && contextTrack) {
            const added = player.addToQueue(contextTrack);
            renderQueue();
            
            const notification = document.createElement('div');
            notification.textContent = added 
                ? `✓ Added "${contextTrack.title}" to queue` 
                : `⚠ "${contextTrack.title}" already in queue`;
            notification.style.cssText = 'position:fixed;bottom:100px;right:20px;background:var(--card);padding:1rem 1.5rem;border-radius:var(--radius);border:1px solid var(--border);z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 3000);
        } else if (action === 'download' && contextTrack) {
            const filename = buildTrackFilename(contextTrack, QUALITY);
            
            try {
                const tempEl = document.createElement('div');
                tempEl.textContent = `Downloading: ${contextTrack.title}...`;
                tempEl.style.cssText = 'position:fixed;bottom:100px;right:20px;background:var(--card);padding:1rem 1.5rem;border-radius:var(--radius);border:1px solid var(--border);z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
                document.body.appendChild(tempEl);
                
                await api.downloadTrack(contextTrack.id, QUALITY, filename, contextTrack);
                
                tempEl.textContent = `✓ Downloaded: ${contextTrack.title}`;
                setTimeout(() => tempEl.remove(), 3000);
            } catch (error) {
                const errorMsg = error.message === RATE_LIMIT_ERROR_MESSAGE 
                    ? error.message 
                    : 'Download failed. Please try again.';
                alert(errorMsg);
            }
        }
        
        contextMenu.style.display = 'none';
    });

    // Album Actions
    const addAlbumToQueueBtn = document.getElementById('add-album-to-queue-btn');
    const playlistLinkBtn = document.getElementById('playlist-link-btn');

    addAlbumToQueueBtn?.addEventListener('click', () => {
        console.log('Add All to Queue clicked, currentAlbumTracks:', currentAlbumTracks.length);
        if (currentAlbumTracks.length > 0) {
            player.addMultipleToQueue(currentAlbumTracks);
            renderQueue();
            
            const notification = document.createElement('div');
            notification.textContent = `✓ Added ${currentAlbumTracks.length} tracks to queue`;
            notification.style.cssText = 'position:fixed;bottom:100px;right:20px;background:var(--card);padding:1rem 1.5rem;border-radius:var(--radius);border:1px solid var(--border);z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 3000);
        } else {
            console.warn('No tracks in currentAlbumTracks');
        }
    });

    playlistLinkBtn?.addEventListener('click', async () => {
        const playlistUrl = prompt('Enter Spotify Playlist URL:', 'https://open.spotify.com/playlist/...');
        if (!playlistUrl) return;

        let notification;
        try {
            // Intentar extraer ID de Spotify
            const spotifyId = api.extractSpotifyPlaylistId(playlistUrl);
            
            if (!spotifyId) {
                throw new Error('Invalid Spotify playlist URL. Please use a valid Spotify playlist link.');
            }

            notification = document.createElement('div');
            notification.textContent = '🔍 Loading Spotify playlist...';
            notification.style.cssText = 'position:fixed;bottom:100px;right:20px;background:var(--card);padding:1rem 1.5rem;border-radius:var(--radius);border:1px solid var(--border);z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
            document.body.appendChild(notification);

            const { playlist, tracks } = await api.getSpotifyPlaylist(spotifyId);
            
            if (tracks.length === 0) {
                notification.textContent = '⚠️ No tracks found in playlist';
                setTimeout(() => notification.remove(), 4000);
                return;
            }
            
            player.addMultipleToQueue(tracks);
            renderQueue();
            
            notification.textContent = `✓ Added ${tracks.length} tracks from "${playlist.name || 'Playlist'}" to queue`;
            setTimeout(() => notification.remove(), 4000);
        } catch (error) {
            if (notification) notification.remove();
            alert(`Error loading playlist: ${error.message}`);
        }
    });

    const performSearch = debounce((query) => {
        if (query) {
            window.location.hash = `#search/${encodeURIComponent(query)}`;
        }
    }, 300);

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (query.length > 2) {
            performSearch(query);
        }
    });

    searchForm.addEventListener('submit', e => {
        e.preventDefault();
        const query = searchInput.value.trim();
        if (query) {
            window.location.hash = `#search/${encodeURIComponent(query)}`;
        }
    });

    audioPlayer.addEventListener('play', () => {
        playPauseBtn.innerHTML = SVG_PAUSE;
        player.updateMediaSessionPlaybackState();
    });

    audioPlayer.addEventListener('pause', () => {
        playPauseBtn.innerHTML = SVG_PLAY;
        player.updateMediaSessionPlaybackState();
    });

    audioPlayer.addEventListener('ended', () => {
        player.playNext();
    });

    audioPlayer.addEventListener('timeupdate', () => {
        const { currentTime, duration } = audioPlayer;
        if (duration) {
            progressFill.style.width = `${(currentTime / duration) * 100}%`;
            currentTimeEl.textContent = formatTime(currentTime);
        }
    });

    audioPlayer.addEventListener('loadedmetadata', () => {
        totalDurationEl.textContent = formatTime(audioPlayer.duration);
        player.updateMediaSessionPositionState();
    });

    audioPlayer.addEventListener('error', (e) => {
        console.error('Audio playback error:', e);
        document.querySelector('.now-playing-bar .artist').textContent = 'Playback error. Try another track.';
        playPauseBtn.innerHTML = SVG_PLAY;
    });

    let isSeeking = false;
    let wasPlaying = false;

    const seek = (bar, fill, event, setter) => {
        const rect = bar.getBoundingClientRect();
        const position = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        setter(position);
    };

    progressBar.addEventListener('mousedown', () => {
        isSeeking = true;
        wasPlaying = !audioPlayer.paused;
        if (wasPlaying) audioPlayer.pause();
    });

    document.addEventListener('mouseup', (e) => {
        if (isSeeking) {
            seek(progressBar, progressFill, e, position => {
                if (!isNaN(audioPlayer.duration)) {
                    audioPlayer.currentTime = position * audioPlayer.duration;
                    if (wasPlaying) audioPlayer.play();
                }
            });
            isSeeking = false;
        }
    });

    progressBar.addEventListener('click', e => {
        if (!isSeeking) {
            seek(progressBar, progressFill, e, position => {
                if (!isNaN(audioPlayer.duration)) {
                    audioPlayer.currentTime = position * audioPlayer.duration;
                }
            });
        }
    });

    volumeBar.addEventListener('click', e => {
        seek(volumeBar, volumeFill, e, position => {
            audioPlayer.volume = position;
        });
    });

    const updateVolumeUI = () => {
        const { volume, muted } = audioPlayer;
        volumeBtn.innerHTML = (muted || volume === 0) ? SVG_MUTE : SVG_VOLUME;
        volumeFill.style.width = `${muted ? 0 : volume * 100}%`;
    };

    volumeBtn.addEventListener('click', () => {
        audioPlayer.muted = !audioPlayer.muted;
    });

    audioPlayer.addEventListener('volumechange', updateVolumeUI);

    playPauseBtn.addEventListener('click', () => player.handlePlayPause());
    nextBtn.addEventListener('click', () => player.playNext());
    prevBtn.addEventListener('click', () => player.playPrev());

    shuffleBtn.addEventListener('click', () => {
        player.toggleShuffle();
        shuffleBtn.classList.toggle('active', player.shuffleActive);
        renderQueue();
    });

    repeatBtn.addEventListener('click', () => {
        const mode = player.toggleRepeat();
        repeatBtn.classList.toggle('active', mode !== REPEAT_MODE.OFF);
        repeatBtn.classList.toggle('repeat-one', mode === REPEAT_MODE.ONE);
        repeatBtn.title = mode === REPEAT_MODE.OFF 
            ? 'Repeat' 
            : (mode === REPEAT_MODE.ALL ? 'Repeat Queue' : 'Repeat One');
    });

    queueBtn.addEventListener('click', () => {
        renderQueue();
        queueModalOverlay.style.display = 'flex';
        document.body.classList.add('modal-open');
    });

    closeQueueBtn.addEventListener('click', () => {
        queueModalOverlay.style.display = 'none';
        document.body.classList.remove('modal-open');
    });

    queueModalOverlay.addEventListener('click', e => {
        if (e.target === queueModalOverlay) {
            queueModalOverlay.style.display = 'none';
            document.body.classList.remove('modal-open');
        }
    });

    // Clear Queue Button
    const clearQueueBtn = document.getElementById('clear-queue-btn');
    clearQueueBtn?.addEventListener('click', () => {
        if (player.getCurrentQueue().length === 0) return;
        
        if (confirm('Are you sure you want to clear the entire queue?')) {
            player.clearQueue();
            renderQueue();
            
            const notification = document.createElement('div');
            notification.textContent = '✓ Queue cleared';
            notification.style.cssText = 'position:fixed;bottom:100px;right:20px;background:var(--card);padding:1rem 1.5rem;border-radius:var(--radius);border:1px solid var(--border);z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 2000);
        }
    });

    // Download All Queue Button
    const downloadQueueBtn = document.getElementById('download-queue-btn');
    downloadQueueBtn?.addEventListener('click', async () => {
        const currentQueue = player.getCurrentQueue();
        if (currentQueue.length === 0) {
            alert('Queue is empty');
            return;
        }
        
        if (!confirm(`Download all ${currentQueue.length} tracks from queue?`)) return;
        
        const notification = document.createElement('div');
        notification.style.cssText = 'position:fixed;bottom:100px;right:20px;background:var(--card);padding:1rem 1.5rem;border-radius:var(--radius);border:1px solid var(--border);z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
        document.body.appendChild(notification);
        
        let downloaded = 0;
        let failed = 0;
        
        for (let i = 0; i < currentQueue.length; i++) {
            const track = currentQueue[i];
            notification.textContent = `Downloading ${i + 1}/${currentQueue.length}: ${track.title}...`;
            
            try {
                const filename = buildTrackFilename(track, QUALITY);
                await api.downloadTrack(track.id, QUALITY, filename, track);
                downloaded++;
            } catch (error) {
                console.error('Download failed:', track.title, error);
                const errorMsg = error.message === RATE_LIMIT_ERROR_MESSAGE 
                    ? error.message 
                    : 'Download failed. Please try again.';
                console.error(errorMsg);
                failed++;
            }
            
            // Small delay to avoid overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        notification.textContent = `✓ Downloaded: ${downloaded}/${currentQueue.length}${failed > 0 ? ` (${failed} failed)` : ''}`;
        setTimeout(() => notification.remove(), 4000);
    });

    // Queue Item Actions (Download & Remove)
    queueList.addEventListener('click', async e => {
        const downloadBtn = e.target.closest('.download-track-btn');
        const removeBtn = e.target.closest('.remove-track-btn');
        
        if (downloadBtn) {
            e.stopPropagation();
            const index = parseInt(downloadBtn.dataset.queueIndex, 10);
            const currentQueue = player.getCurrentQueue();
            const track = currentQueue[index];
            
            if (!track) return;
            
            const notification = document.createElement('div');
            notification.textContent = `Downloading: ${track.title}...`;
            notification.style.cssText = 'position:fixed;bottom:100px;right:20px;background:var(--card);padding:1rem 1.5rem;border-radius:var(--radius);border:1px solid var(--border);z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
            document.body.appendChild(notification);
            
            try {
                const filename = buildTrackFilename(track, QUALITY);
                await api.downloadTrack(track.id, QUALITY, filename, track);
                notification.textContent = `✓ Downloaded: ${track.title}`;
                setTimeout(() => notification.remove(), 3000);
            } catch (error) {
                const errorMsg = error.message === RATE_LIMIT_ERROR_MESSAGE 
                    ? error.message 
                    : 'Download failed. Please try again.';
                notification.textContent = `✗ ${errorMsg}`;
                setTimeout(() => notification.remove(), 4000);
            }
        }
        
        if (removeBtn) {
            e.stopPropagation();
            const index = parseInt(removeBtn.dataset.queueIndex, 10);
            player.removeFromQueue(index);
            renderQueue();
            
            const notification = document.createElement('div');
            notification.textContent = '✓ Track removed from queue';
            notification.style.cssText = 'position:fixed;bottom:100px;right:20px;background:var(--card);padding:1rem 1.5rem;border-radius:var(--radius);border:1px solid var(--border);z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 2000);
        }
    });


    hamburgerBtn.addEventListener('click', () => {
        sidebar.classList.add('is-open');
        sidebarOverlay.classList.add('is-visible');
    });

    const closeSidebar = () => {
        sidebar.classList.remove('is-open');
        sidebarOverlay.classList.remove('is-visible');
    };

    sidebarOverlay.addEventListener('click', closeSidebar);
    
    sidebar.addEventListener('click', e => {
        if (e.target.closest('a')) {
            closeSidebar();
        }
    });

    document.getElementById('api-instance-list').addEventListener('click', e => {
        const button = e.target.closest('button');
        if (!button) return;
        
        const li = button.closest('li');
        const index = parseInt(li.dataset.index, 10);
        const instances = apiSettings.getInstances();
        
        if (button.classList.contains('move-up') && index > 0) {
            [instances[index], instances[index - 1]] = [instances[index - 1], instances[index]];
        } else if (button.classList.contains('move-down') && index < instances.length - 1) {
            [instances[index], instances[index + 1]] = [instances[index + 1], instances[index]];
        } else if (button.classList.contains('delete-instance')) {
            instances.splice(index, 1);
        }
        
        apiSettings.saveInstances(instances);
        ui.renderApiSettings();
    });

    document.getElementById('add-instance-form').addEventListener('submit', e => {
        e.preventDefault();
        const input = document.getElementById('custom-instance-input');
        const newUrl = input.value.trim();
        
        if (newUrl) {
            try {
                const url = new URL(newUrl);
                if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                    throw new Error('Invalid protocol');
                }
                
                const instances = apiSettings.getInstances();
                const formattedUrl = newUrl.endsWith('/') ? newUrl.slice(0, -1) : newUrl;
                
                if (!instances.includes(formattedUrl)) {
                    instances.push(formattedUrl);
                    apiSettings.saveInstances(instances);
                    ui.renderApiSettings();
                    input.value = '';
                } else {
                    alert('This instance is already in the list.');
                }
            } catch (error) {
                alert('Please enter a valid URL (e.g., https://example.com)');
            }
        }
    });

    document.getElementById('clear-cache-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('clear-cache-btn');
        const originalText = btn.textContent;
        btn.textContent = 'Clearing...';
        btn.disabled = true;
        
        try {
            await api.clearCache();
            btn.textContent = 'Cleared!';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
                if (window.location.hash.includes('settings')) {
                    ui.renderApiSettings();
                }
            }, 1500);
        } catch (error) {
            console.error('Failed to clear cache:', error);
            btn.textContent = 'Error';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 1500);
        }
    });

    playPauseBtn.innerHTML = SVG_PLAY;
    updateVolumeUI();
    router();
    window.addEventListener('hashchange', router);

    if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', () => {
            player.handlePlayPause();
        });
        
        navigator.mediaSession.setActionHandler('pause', () => {
            player.handlePlayPause();
        });
        
        navigator.mediaSession.setActionHandler('previoustrack', () => {
            player.playPrev();
        });
        
        navigator.mediaSession.setActionHandler('nexttrack', () => {
            player.playNext();
        });
        
        navigator.mediaSession.setActionHandler('seekbackward', (details) => {
            const skipTime = details.seekOffset || 10;
            player.seekBackward(skipTime);
        });
        
        navigator.mediaSession.setActionHandler('seekforward', (details) => {
            const skipTime = details.seekOffset || 10;
            player.seekForward(skipTime);
        });
        
        navigator.mediaSession.setActionHandler('seekto', (details) => {
            if (details.fastSeek && 'fastSeek' in audioPlayer) {
                audioPlayer.fastSeek(details.seekTime);
            } else {
                audioPlayer.currentTime = details.seekTime;
            }
            player.updateMediaSessionPositionState();
        });
        
        navigator.mediaSession.setActionHandler('stop', () => {
            audioPlayer.pause();
            audioPlayer.currentTime = 0;
        });
    }

    if ('serviceWorker' in navigator) {
        // No registrar Service Worker en desarrollo (localhost)
        const isLocalhost = location.hostname === 'localhost' || 
                           location.hostname === '127.0.0.1' ||
                           location.hostname === '[::1]';
        
        if (isLocalhost) {
            console.log('🔧 Development mode: Service Worker disabled');
            // Desregistrar cualquier Service Worker existente
            navigator.serviceWorker.getRegistrations().then(registrations => {
                registrations.forEach(reg => reg.unregister());
            });
        } else {
            // Solo registrar en producción
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js')
                    .then(reg => console.log('Service worker registered'))
                    .catch(err => console.log('Service worker not registered', err));
            });
        }
    }

    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
    });

    // ============= Spotify Integration =============
    const spotifyAPI = new SpotifyAPI();
    const spotifyModal = document.getElementById('spotify-modal-overlay');
    const spotifyNavBtn = document.getElementById('spotify-nav-btn');
    const closeSpotifyBtn = document.getElementById('close-spotify-btn');
    const spotifyConnectBtn = document.getElementById('spotify-connect-btn');
    const spotifyClientIdInput = document.getElementById('spotify-client-id');
    const spotifyAuthSection = document.getElementById('spotify-auth-section');
    const spotifyPlaylistsSection = document.getElementById('spotify-playlists-section');
    const spotifyLogoutBtn = document.getElementById('spotify-logout-btn');
    const spotifyLoadBtn = document.getElementById('spotify-load-btn');
    const spotifyPlaylistUrl = document.getElementById('spotify-playlist-url');
    const spotifyTracksList = document.getElementById('spotify-tracks-list');
    const spotifyPlaylistInfo = document.getElementById('spotify-playlist-info');

    // Cargar Client ID guardado
    const savedClientId = localStorage.getItem('spotify_client_id');
    if (savedClientId) {
        spotifyClientIdInput.value = savedClientId;
        spotifyAPI.clientId = savedClientId;
    }

    // Verificar si ya está autenticado
    function updateSpotifyUI() {
        if (spotifyAPI.isAuthenticated()) {
            spotifyNavBtn.classList.add('connected');
            document.getElementById('spotify-status-text').textContent = 'Spotify Connected';
            spotifyAuthSection.style.display = 'none';
            spotifyPlaylistsSection.style.display = 'block';
        } else {
            spotifyNavBtn.classList.remove('connected');
            document.getElementById('spotify-status-text').textContent = 'Connect Spotify';
            spotifyAuthSection.style.display = 'block';
            spotifyPlaylistsSection.style.display = 'none';
        }
    }

    // Manejar callback de Spotify si estamos en la página de callback
    if (window.location.search.includes('code=')) {
        spotifyAPI.handleCallback()
            .then(() => {
                showNotification('Spotify connected successfully!', 'success');
                updateSpotifyUI();
                // Limpiar URL
                window.history.replaceState({}, document.title, window.location.pathname);
            })
            .catch(err => {
                showNotification(`Spotify auth error: ${err.message}`, 'error');
                console.error(err);
            });
    }

    updateSpotifyUI();

    // Abrir modal de Spotify
    spotifyNavBtn.addEventListener('click', (e) => {
        e.preventDefault();
        spotifyModal.style.display = 'flex';
        document.body.classList.add('modal-open');
    });

    // Cerrar modal
    closeSpotifyBtn.addEventListener('click', () => {
        spotifyModal.style.display = 'none';
        document.body.classList.remove('modal-open');
    });

    spotifyModal.addEventListener('click', (e) => {
        if (e.target === spotifyModal) {
            spotifyModal.style.display = 'none';
            document.body.classList.remove('modal-open');
        }
    });

    // Conectar con Spotify
    spotifyConnectBtn.addEventListener('click', () => {
        const clientId = spotifyClientIdInput.value.trim();
        if (!clientId) {
            showNotification('Please enter a Spotify Client ID', 'error');
            return;
        }
        
        // Guardar Client ID
        localStorage.setItem('spotify_client_id', clientId);
        spotifyAPI.clientId = clientId;
        
        // Iniciar flujo de autorización
        spotifyAPI.authorize();
    });

    // Desconectar Spotify
    spotifyLogoutBtn.addEventListener('click', () => {
        spotifyAPI.logout();
        updateSpotifyUI();
        spotifyTracksList.innerHTML = '';
        spotifyPlaylistInfo.style.display = 'none';
        showNotification('Disconnected from Spotify', 'success');
    });

    // Cargar playlist de Spotify
    spotifyLoadBtn.addEventListener('click', async () => {
        const input = spotifyPlaylistUrl.value.trim();
        if (!input) {
            showNotification('Please enter a Spotify playlist URL', 'error');
            return;
        }

        const playlistId = spotifyAPI.extractPlaylistId(input);
        if (!playlistId) {
            showNotification('Invalid Spotify playlist URL', 'error');
            return;
        }

        try {
            spotifyLoadBtn.disabled = true;
            spotifyLoadBtn.textContent = 'Loading...';

            // Obtener información de la playlist
            const playlist = await spotifyAPI.getPlaylist(playlistId);
            
            // Mostrar información
            spotifyPlaylistInfo.style.display = 'block';
            document.getElementById('spotify-playlist-details').innerHTML = `
                <h4>${escapeHtml(playlist.name)}</h4>
                <p>${escapeHtml(playlist.owner.display_name)} • ${playlist.tracks.total} tracks</p>
            `;

            // Obtener todas las canciones (Spotify limita a 100 por request)
            let allTracks = [];
            let offset = 0;
            const limit = 100;
            
            while (offset < playlist.tracks.total) {
                const data = await spotifyAPI.getPlaylistTracks(playlistId, limit, offset);
                allTracks = allTracks.concat(data.items);
                offset += limit;
            }

            // Convertir tracks al formato de la app
            const convertedTracks = spotifyAPI.convertSpotifyTracksToTidal(allTracks);

            // Mostrar tracks
            renderSpotifyTracks(convertedTracks);

            showNotification(`Loaded ${convertedTracks.length} tracks from Spotify`, 'success');

        } catch (error) {
            console.error('Error loading Spotify playlist:', error);
            showNotification(`Error: ${error.message}`, 'error');
        } finally {
            spotifyLoadBtn.disabled = false;
            spotifyLoadBtn.textContent = 'Load Playlist';
        }
    });

    let currentSpotifyTracks = [];

    function renderSpotifyTracks(tracks) {
        currentSpotifyTracks = tracks;
        
        spotifyTracksList.innerHTML = tracks.map((track, index) => `
            <div class="spotify-track-item" data-index="${index}">
                <div class="spotify-track-number">${index + 1}</div>
                <div class="spotify-track-info">
                    <div class="spotify-track-title">${escapeHtml(track.title)}</div>
                    <div class="spotify-track-artist">${escapeHtml(track.artists)}</div>
                </div>
                <div class="spotify-track-actions">
                    <button class="btn-icon spotify-add-queue-btn" title="Add to Queue" data-index="${index}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    </button>
                    <button class="btn-icon spotify-search-btn" title="Search in TIDAL" data-index="${index}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <path d="m21 21-4.3-4.3"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');

        // Event listeners para agregar a la cola
        spotifyTracksList.querySelectorAll('.spotify-add-queue-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                await addSpotifyTrackToQueue(tracks[index]);
            });
        });

        // Event listeners para buscar en TIDAL
        spotifyTracksList.querySelectorAll('.spotify-search-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                const track = tracks[index];
                
                // Buscar en TIDAL usando ISRC o título + artista
                const query = track.isrc || `${track.title} ${track.artist}`;
                window.location.hash = `search/${encodeURIComponent(query)}`;
                spotifyModal.style.display = 'none';
            });
        });
    }

    // Agregar todas las canciones de Spotify a la cola
    document.getElementById('spotify-add-all-btn').addEventListener('click', async () => {
        const addAllBtn = document.getElementById('spotify-add-all-btn');
        if (currentSpotifyTracks.length === 0) {
            showNotification('No tracks to add', 'error');
            return;
        }

        addAllBtn.disabled = true;
        
        const total = currentSpotifyTracks.length;
        let processed = 0;
        let addedCount = 0;
        const failedTracks = []; // Almacenar canciones fallidas

        // Procesar en lotes de 10 canciones en paralelo
        const batchSize = 10;
        for (let i = 0; i < total; i += batchSize) {
            const batch = currentSpotifyTracks.slice(i, i + batchSize);
            
            // Actualizar progreso
            addAllBtn.textContent = `Adding ${Math.min(i + batchSize, total)}/${total}...`;
            
            try {
                // Procesar lote en paralelo con información detallada y timeout
                const batchPromises = batch.map(async (track, index) => {
                    try {
                        // Timeout de 30 segundos por track
                        const timeoutPromise = new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Timeout')), 30000)
                        );
                        
                        const searchPromise = addSpotifyTrackToQueue(track, false);
                        const result = await Promise.race([searchPromise, timeoutPromise]);
                        
                        if (!result) {
                            failedTracks.push({
                                title: track.title,
                                artist: track.artist,
                                index: i + index + 1,
                                reason: 'Not found'
                            });
                        }
                        return result;
                    } catch (error) {
                        console.warn(`Failed to process track ${track.title}:`, error.message);
                        failedTracks.push({
                            title: track.title,
                            artist: track.artist,
                            index: i + index + 1,
                            reason: error.message === 'Timeout' ? 'Timeout' : 'Error'
                        });
                        return false;
                    }
                });
                
                const results = await Promise.all(batchPromises);
                
                // Contar exitosos
                addedCount += results.filter(Boolean).length;
                processed += batch.length;
                
                // Pequeña pausa entre lotes para evitar sobrecarga
                if (i + batchSize < total) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                
            } catch (error) {
                console.error(`Error processing batch ${i}-${i + batchSize}:`, error);
                // Si falla todo el lote, marcar todas como fallidas
                batch.forEach((track, index) => {
                    failedTracks.push({
                        title: track.title,
                        artist: track.artist,
                        index: i + index + 1,
                        reason: 'Batch error'
                    });
                });
                processed += batch.length;
            }
        }

        addAllBtn.disabled = false;
        addAllBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Add All to Queue
        `;

        const successRate = Math.round((addedCount / total) * 100);
        
        // Mostrar resumen
        if (failedTracks.length === 0) {
            showNotification(`✓ All ${total} tracks added successfully!`, 'success');
        } else {
            showNotification(`✓ Added ${addedCount}/${total} tracks (${successRate}%)`, 'warning');
            
            // Mostrar modal con canciones fallidas
            showFailedTracksModal(failedTracks);
        }
    });

    // Función para buscar una canción de Spotify en TIDAL y agregarla a la cola
    async function addSpotifyTrackToQueue(spotifyTrack, showNotif = true) {
        try {
            // Limpiar título antes de buscar
            const cleanForSearch = (title) => {
                return title
                    .replace(/\([^)]*\)/g, '') // Remover paréntesis
                    .replace(/\[[^\]]*\]/g, '') // Remover corchetes
                    .replace(/\s*[-–—|]\s*.+$/, '') // Remover " - artista" o " | info"
                    .replace(/\s*(feat|ft|featuring|with|vs|x)\s*.+$/i, '') // Remover feat
                    .trim();
            };
            
            const searchTitle = cleanForSearch(spotifyTrack.title);
            
            let results = null;
            
            // Estrategia 1: Buscar por ISRC (más preciso)
            if (spotifyTrack.isrc) {
                results = await api.searchTracks(spotifyTrack.isrc);
            }
            
            // Estrategia 2: Si no hay resultados, buscar por título limpio + artista
            if (!results?.items || results.items.length === 0) {
                const query = `${searchTitle} ${spotifyTrack.artist}`;
                results = await api.searchTracks(query);
            }
            
            // Estrategia 2.5: Remover "The", números y símbolos del artista
            if (!results?.items || results.items.length === 0) {
                const cleanArtist = spotifyTrack.artist
                    .replace(/^The\s+/i, '') // Remover "The" al inicio
                    .replace(/\d+\.?\d*/g, '') // Remover números
                    .replace(/[^\w\s]/g, ' ') // Remover símbolos
                    .trim();
                
                if (cleanArtist !== spotifyTrack.artist) {
                    const query = `${searchTitle} ${cleanArtist}`;
                    results = await api.searchTracks(query);
                }
            }
            
            // Estrategia 3: Si aún no hay resultados, buscar solo por título limpio
            if (!results?.items || results.items.length === 0) {
                results = await api.searchTracks(searchTitle);
            }
            
            if (!results?.items || results.items.length === 0) {
                console.warn(`No match found for: ${spotifyTrack.title} - ${spotifyTrack.artist}`);
                if (showNotif) {
                    showNotification(`No match: "${spotifyTrack.title}"`, 'error');
                }
                return false;
            }

            // Función para normalizar texto (remover acentos, símbolos, etc.)
            const normalize = (str) => str.toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remover acentos
                .replace(/[^\w\s]/g, ' ') // Convertir símbolos a espacios
                .replace(/\s+/g, ' ') // Múltiples espacios a uno solo
                .trim();
            
            // Función para limpiar título de Spotify (remover partes entre paréntesis, feat, etc.)
            const cleanTitle = (title) => {
                return title
                    .replace(/\([^)]*\)/g, '') // Remover todo entre paréntesis
                    .replace(/\[[^\]]*\]/g, '') // Remover todo entre corchetes
                    .replace(/\s*[-–—]\s*.+$/, '') // Remover " - artista" o " - detalles" al final
                    .replace(/\s*(feat|ft|featuring|with|vs|x)\s*.+$/i, '') // Remover colaboradores
                    .trim();
            };
            
            // Buscar el mejor match validando título Y artista
            const spotifyTitleClean = cleanTitle(spotifyTrack.title);
            const spotifyTitleNorm = normalize(spotifyTitleClean);
            const spotifyArtistNorm = normalize(spotifyTrack.artist);
            
            // Extraer palabras clave del título (remover palabras comunes)
            const getTitleWords = (title) => {
                return title.split(' ')
                    .filter(word => word.length > 2) // Palabras de al menos 3 caracteres
                    .filter(word => !['the', 'and', 'for', 'with', 'remix', 'version', 'edit'].includes(word));
            };
            
            const spotifyTitleWords = getTitleWords(spotifyTitleNorm);
            
            let bestMatch = null;
            let highestScore = 0;
            
            for (const item of results.items) {
                const tidalTitleClean = cleanTitle(item.title);
                const tidalTitleNorm = normalize(tidalTitleClean);
                const tidalArtistNorm = normalize(item.artist?.name || '');
                
                const tidalTitleWords = getTitleWords(tidalTitleNorm);
                
            // Calcular score de similitud (más estricto)
            let score = 0;
            let titleScore = 0;
            let artistScore = 0;
            
            // Match de título
            if (tidalTitleNorm === spotifyTitleNorm) {
                titleScore = 100; // Match exacto
            } else if (tidalTitleNorm.includes(spotifyTitleNorm) || spotifyTitleNorm.includes(tidalTitleNorm)) {
                titleScore = 80; // Uno contiene al otro
            } else {
                // Comparar por palabras clave
                const commonWords = spotifyTitleWords.filter(word => tidalTitleWords.includes(word));
                const wordMatchRatio = commonWords.length / Math.max(spotifyTitleWords.length, tidalTitleWords.length);
                if (wordMatchRatio > 0.6) { // Al menos 60% de palabras coinciden
                    titleScore = Math.round(50 * wordMatchRatio);
                }
            }
            
            // Match de artista
            if (tidalArtistNorm === spotifyArtistNorm) {
                artistScore = 100; // Match exacto
            } else if (tidalArtistNorm.includes(spotifyArtistNorm) || spotifyArtistNorm.includes(tidalArtistNorm)) {
                artistScore = 70; // Uno contiene al otro
            } else {
                // Comparar nombres de artistas palabra por palabra
                const spotifyArtistWords = spotifyArtistNorm.split(' ');
                const tidalArtistWords = tidalArtistNorm.split(' ');
                const artistCommonWords = spotifyArtistWords.filter(word => 
                    tidalArtistWords.some(tw => tw.includes(word) || word.includes(tw))
                );
                if (artistCommonWords.length > 0) {
                    artistScore = 30; // Match parcial de artista (reducido)
                }
            }
            
            // REQUERIR un buen match en AMBOS (título y artista)
            // Si el artista no coincide bien, no agregar aunque el título sea similar
            score = titleScore + artistScore;
            
            // Log detallado para debugging
            console.log(`[MATCH] "${item.title}" by ${item.artist?.name}`);
            console.log(`  Title: ${titleScore} | Artist: ${artistScore} | Total: ${score}`);
            
            if (score > highestScore) {
                highestScore = score;
                bestMatch = item;
            }
        }
            
            // Solo agregar si hay match BUENO (mínimo 120 puntos = título + artista coinciden bien)
            console.log(`[BEST MATCH] Score: ${highestScore} | Threshold: 120`);
            if (bestMatch && highestScore >= 120) {
                console.log(`✓ Adding: "${bestMatch.title}" by ${bestMatch.artist?.name}`);
                const added = player.addToQueue(bestMatch);
                
                if (showNotif) {
                    if (added) {
                        showNotification(`Added "${bestMatch.title}" by ${bestMatch.artist?.name}`, 'success');
                    } else {
                        showNotification(`"${bestMatch.title}" already in queue`, 'warning');
                    }
                }
                
                return true;
            } else {
                console.warn(`[SPOTIFY] No good match found for "${spotifyTrack.title}" by ${spotifyTrack.artist} (score: ${highestScore})`);
                if (showNotif) {
                    showNotification(`Could not find match for "${spotifyTrack.title}"`, 'error');
                }
                return false;
            }
        } catch (error) {
            console.error('Error adding Spotify track to queue:', error);
            if (showNotif) {
                showNotification(`Error: "${spotifyTrack.title}"`, 'error');
            }
            return false;
        }
    }

    // Variables globales para el modal de canciones fallidas
    let currentFailedTracks = [];

    // Función para mostrar modal de canciones fallidas
    function showFailedTracksModal(failedTracks) {
        currentFailedTracks = failedTracks;
        const modal = document.getElementById('failed-tracks-modal');
        const summary = document.getElementById('failed-tracks-summary');
        const list = document.getElementById('failed-tracks-list');

        // Actualizar resumen
        summary.textContent = `${failedTracks.length} tracks could not be found in TIDAL:`;

        // Limpiar y llenar lista
        list.innerHTML = '';
        failedTracks.forEach(track => {
            const item = document.createElement('div');
            item.className = 'failed-track-item';
            
            const reasonText = track.reason ? ` (${track.reason})` : '';
            item.innerHTML = `
                <div class="failed-track-info">
                    <div class="failed-track-title">${escapeHtml(track.title)}</div>
                    <div class="failed-track-artist">${escapeHtml(track.artist)}${reasonText}</div>
                </div>
                <div class="failed-track-number">#${track.index}</div>
            `;
            list.appendChild(item);
        });

    // Mostrar modal
    modal.style.display = 'flex';
    document.body.classList.add('modal-open');

        // Configurar eventos de botones
        setupFailedTracksEvents();
    }

    // Función para cerrar modal de canciones fallidas
    function closeFailedTracksModal() {
        const modal = document.getElementById('failed-tracks-modal');
        modal.style.display = 'none';
        currentFailedTracks = [];
        document.body.classList.remove('modal-open');
    }

    // Exponer función globalmente para el onclick en HTML
    window.closeFailedTracksModal = closeFailedTracksModal;

    // Configurar eventos del modal de canciones fallidas
    function setupFailedTracksEvents() {
        const retryBtn = document.getElementById('retry-failed-btn');
        const copyBtn = document.getElementById('copy-failed-btn');

        // Reintentar canciones fallidas
        retryBtn.onclick = async () => {
            if (currentFailedTracks.length === 0) return;

            retryBtn.disabled = true;
            retryBtn.textContent = 'Retrying...';

            let retrySuccessCount = 0;
            const stillFailed = [];

            for (const track of currentFailedTracks) {
                const success = await addSpotifyTrackToQueue({
                    title: track.title,
                    artist: track.artist
                }, false);

                if (success) {
                    retrySuccessCount++;
                } else {
                    stillFailed.push(track);
                }
            }

            retryBtn.disabled = false;
            retryBtn.textContent = 'Retry Failed Tracks';

            if (retrySuccessCount > 0) {
                showNotification(`✓ Found ${retrySuccessCount} additional tracks!`, 'success');
            }

            if (stillFailed.length === 0) {
                closeFailedTracksModal();
                showNotification('All tracks found successfully!', 'success');
            } else {
                // Actualizar modal con canciones que siguen fallando
                showFailedTracksModal(stillFailed);
            }
        };

        // Copiar lista de canciones
        copyBtn.onclick = () => {
            const trackList = currentFailedTracks.map(track => 
                `${track.index}. ${track.title} - ${track.artist}`
            ).join('\n');

            navigator.clipboard.writeText(trackList).then(() => {
                showNotification('Track list copied to clipboard', 'info');
            }).catch(() => {
                // Fallback para navegadores que no soportan clipboard API
                const textarea = document.createElement('textarea');
                textarea.value = trackList;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                showNotification('Track list copied to clipboard', 'info');
            });
        };

        // Cerrar modal al hacer clic fuera
        const modal = document.getElementById('failed-tracks-modal');
        modal.onclick = (e) => {
            if (e.target === modal) {
                closeFailedTracksModal();
            }
        };
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});