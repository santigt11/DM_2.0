import { LosslessAPI } from './api.js';
import { apiSettings, userSettings } from './storage.js';
import { UIRenderer } from './ui.js';
import { Player } from './player.js';
import SpotifyAPI from './spotify.js';
import { PlaylistsUI } from './playlistsUI.js';
import {
    STREAMING_QUALITY, DOWNLOAD_QUALITY_OPTIONS, REPEAT_MODE, SVG_PLAY, SVG_PAUSE,
    SVG_VOLUME, SVG_MUTE, formatTime, trackDataStore,
    buildTrackFilename, RATE_LIMIT_ERROR_MESSAGE, debounce
} from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
    const api = new LosslessAPI(apiSettings);
    const ui = new UIRenderer(api);

    const audioPlayer = document.getElementById('audio-player');
    const player = new Player(audioPlayer, api, STREAMING_QUALITY); // Usar HIGH para streaming rápido

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

    // Audio Visualizer Setup - Uses CSS animation fallback if Web Audio fails
    const visualizerCanvas = document.getElementById('audio-visualizer');
    const visualizerCtx = visualizerCanvas ? visualizerCanvas.getContext('2d') : null;
    let audioContext = null;
    let analyser = null;
    let dataArray = null;
    let animationId = null;
    let isVisualizerConnected = false;
    let visualizerFailed = false;

    const initVisualizer = () => {
        // Web Audio API causes CORS issues with external audio streams
        // Always use CSS fallback instead
        visualizerFailed = true;
    };

    const drawVisualizer = () => {
        if (!analyser || !visualizerCtx || visualizerFailed) return;

        animationId = requestAnimationFrame(drawVisualizer);

        try {
            analyser.getByteFrequencyData(dataArray);

            const width = visualizerCanvas.width;
            const height = visualizerCanvas.height;
            const barCount = 8;
            const barWidth = width / barCount - 2;
            const gap = 2;

            visualizerCtx.clearRect(0, 0, width, height);

            for (let i = 0; i < barCount; i++) {
                const dataIndex = Math.floor(i * dataArray.length / barCount);
                const value = dataArray[dataIndex] / 255;
                const barHeight = Math.max(2, value * height);

                const x = i * (barWidth + gap);
                const y = height - barHeight;

                // Gradient from white to accent color
                const gradient = visualizerCtx.createLinearGradient(x, height, x, y);
                gradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
                gradient.addColorStop(1, 'rgba(255, 255, 255, 0.9)');

                visualizerCtx.fillStyle = gradient;
                visualizerCtx.beginPath();
                visualizerCtx.roundRect(x, y, barWidth, barHeight, 2);
                visualizerCtx.fill();
            }
        } catch (e) {
            // If we get an error during drawing, stop the visualizer
            console.warn('Visualizer error:', e.message);
            stopVisualizer();
            visualizerFailed = true;
        }
    };

    const drawCssFallback = (isPlaying) => {
        if (!visualizerCtx) return;

        const width = visualizerCanvas.width;
        const height = visualizerCanvas.height;
        const barCount = 8;
        const barWidth = width / barCount - 2;

        visualizerCtx.clearRect(0, 0, width, height);

        for (let i = 0; i < barCount; i++) {
            const x = i * (barWidth + 2);
            // Random heights for visual effect when playing
            const barHeight = isPlaying
                ? Math.max(4, Math.random() * height * 0.8)
                : 4;
            const y = height - barHeight;

            visualizerCtx.fillStyle = isPlaying
                ? 'rgba(255, 255, 255, 0.7)'
                : 'rgba(255, 255, 255, 0.2)';
            visualizerCtx.beginPath();
            visualizerCtx.roundRect(x, y, barWidth, barHeight, 2);
            visualizerCtx.fill();
        }
    };

    let cssFallbackInterval = null;

    const startVisualizer = () => {
        if (visualizerFailed) {
            // Use CSS animation fallback
            if (cssFallbackInterval) clearInterval(cssFallbackInterval);
            cssFallbackInterval = setInterval(() => drawCssFallback(true), 100);
            if (visualizerCanvas) visualizerCanvas.style.opacity = '1';
            return;
        }

        if (!isVisualizerConnected) {
            initVisualizer();
        }
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }
        if (!animationId && isVisualizerConnected) {
            drawVisualizer();
        }
        if (visualizerCanvas) visualizerCanvas.style.opacity = '1';
    };

    const stopVisualizer = () => {
        if (cssFallbackInterval) {
            clearInterval(cssFallbackInterval);
            cssFallbackInterval = null;
            drawCssFallback(false);
        }
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
        if (visualizerCanvas) visualizerCanvas.style.opacity = '0.3';
        // Draw idle state
        drawCssFallback(false);
    };

    audioPlayer.addEventListener('play', () => startVisualizer());
    audioPlayer.addEventListener('pause', () => stopVisualizer());
    audioPlayer.addEventListener('ended', () => stopVisualizer());

    // Dynamic Color Extraction from Album Art
    const nowPlayingBar = document.querySelector('.now-playing-bar');
    const coverElement = document.querySelector('.now-playing-bar .cover');

    const extractDominantColor = (img) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 50;
        canvas.height = 50;

        try {
            ctx.drawImage(img, 0, 0, 50, 50);
            const imageData = ctx.getImageData(0, 0, 50, 50).data;

            let r = 0, g = 0, b = 0, count = 0;

            // Sample pixels to find average color
            for (let i = 0; i < imageData.length; i += 16) { // Sample every 4th pixel
                const pr = imageData[i];
                const pg = imageData[i + 1];
                const pb = imageData[i + 2];

                // Skip very dark or very light pixels
                const brightness = (pr + pg + pb) / 3;
                if (brightness > 30 && brightness < 220) {
                    r += pr;
                    g += pg;
                    b += pb;
                    count++;
                }
            }

            if (count > 0) {
                r = Math.round(r / count);
                g = Math.round(g / count);
                b = Math.round(b / count);
                return { r, g, b };
            }
        } catch (e) {
            // CORS error, use fallback
        }
        return null;
    };

    const applyDynamicColor = (color) => {
        if (color) {
            const { r, g, b } = color;
            nowPlayingBar.style.background = `linear-gradient(180deg, 
                rgba(${r}, ${g}, ${b}, 0.15) 0%, 
                rgba(0, 0, 0, 1) 100%)`;
            nowPlayingBar.style.borderTopColor = `rgba(${r}, ${g}, ${b}, 0.3)`;
        } else {
            nowPlayingBar.style.background = '';
            nowPlayingBar.style.borderTopColor = '';
        }
    };

    // Listen for cover image changes
    const coverObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    const color = extractDominantColor(img);
                    applyDynamicColor(color);
                };
                img.onerror = () => {
                    applyDynamicColor(null);
                };
                img.src = coverElement.src;
            }
        });
    });

    if (coverElement) {
        coverObserver.observe(coverElement, { attributes: true, attributeFilter: ['src'] });
    }

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
            case 'playlist':
                if (playlistsUI) {
                    playlistsUI.renderPlaylistPage(param);
                }
                break;
            case 'home':
                ui.renderHomePage();
                break;
            default:
                ui.showPage(page);
                break;
        }
    };

    // Initialize Playlists UI
    const playlistsUI = new PlaylistsUI(api, player, showNotification);

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
                <div class="track-item ${isPlaying ? 'playing' : ''}" data-queue-index="${index}" data-track-id="${track.id}" draggable="true">
                    <div class="track-number">
                        <span class="number">${index + 1}</span>
                        <div class="playing-indicator">
                            <span class="bar bar-1"></span>
                            <span class="bar bar-2"></span>
                            <span class="bar bar-3"></span>
                        </div>
                    </div>
                    <div class="track-item-info">
                        <img src="${api.getCoverUrl(track.album?.cover, '80')}" 
                             class="track-item-cover" loading="lazy">
                        <div class="track-item-details">
                            <div class="title">${track.title}</div>
                            <div class="artist">${track.artist?.name || 'Unknown'}</div>
                        </div>
                    </div>
                    <div class="track-item-actions">
                        <button class="queue-action-btn download-track-btn" data-queue-index="${index}" title="Download">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                        </button>
                        <button class="queue-action-btn remove-track-btn" data-queue-index="${index}" title="Remove">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                    <div class="drag-handle" title="Drag to reorder">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="3" y1="9" x2="21" y2="9"></line>
                            <line x1="3" y1="15" x2="21" y2="15"></line>
                        </svg>
                    </div>
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

            if (added) {
                showNotification(`Added "${contextTrack.title}" to queue`, 'success');
            } else {
                showNotification(`"${contextTrack.title}" already in queue`, 'warning');
            }
        } else if (action === 'add-to-playlist' && contextTrack) {
            // Show add to playlist submenu
            const rect = e.target.getBoundingClientRect();
            playlistsUI.showAddToPlaylistMenu(contextTrack, rect.right + 5, rect.top);
            return; // Don't hide context menu yet
        } else if (action === 'download' && contextTrack) {
            const downloadQuality = userSettings.getDownloadQuality();
            const filename = buildTrackFilename(contextTrack, downloadQuality);

            try {
                showNotification(`Downloading: ${contextTrack.title}...`, 'info');
                await api.downloadTrack(contextTrack.id, downloadQuality, filename, contextTrack);
                showNotification(`Downloaded: ${contextTrack.title}`, 'success');
            } catch (error) {
                const errorMsg = error.message === RATE_LIMIT_ERROR_MESSAGE
                    ? error.message
                    : 'Download failed. Please try again.';
                showNotification(errorMsg, 'error');
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

    // Helper function to animate play/pause button
    const animatePlayPauseBtn = () => {
        playPauseBtn.classList.add('animate');
        setTimeout(() => playPauseBtn.classList.remove('animate'), 300);
    };

    audioPlayer.addEventListener('play', () => {
        playPauseBtn.innerHTML = SVG_PAUSE;
        animatePlayPauseBtn();
        player.updateMediaSessionPlaybackState();
    });

    audioPlayer.addEventListener('pause', () => {
        playPauseBtn.innerHTML = SVG_PLAY;
        animatePlayPauseBtn();
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

    // Progress bar drag functionality
    let isProgressDragging = false;
    let wasPlaying = false;

    const updateProgress = (e) => {
        const rect = progressBar.getBoundingClientRect();
        const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

        // Update visual immediately
        progressFill.style.width = `${position * 100}%`;

        // Update time display
        if (!isNaN(audioPlayer.duration)) {
            currentTimeEl.textContent = formatTime(position * audioPlayer.duration);
        }

        return position;
    };

    progressBar.addEventListener('mousedown', (e) => {
        isProgressDragging = true;
        wasPlaying = !audioPlayer.paused;
        if (wasPlaying) audioPlayer.pause();
        progressBar.classList.add('dragging');
        updateProgress(e);
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (isProgressDragging) {
            updateProgress(e);
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (isProgressDragging) {
            const position = updateProgress(e);
            if (!isNaN(audioPlayer.duration)) {
                audioPlayer.currentTime = position * audioPlayer.duration;
                if (wasPlaying) audioPlayer.play();
            }
            isProgressDragging = false;
            progressBar.classList.remove('dragging');
        }
    });

    // Touch support for progress bar
    progressBar.addEventListener('touchstart', (e) => {
        isProgressDragging = true;
        wasPlaying = !audioPlayer.paused;
        if (wasPlaying) audioPlayer.pause();
        progressBar.classList.add('dragging');
        const touch = e.touches[0];
        const rect = progressBar.getBoundingClientRect();
        const position = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
        progressFill.style.width = `${position * 100}%`;
        if (!isNaN(audioPlayer.duration)) {
            currentTimeEl.textContent = formatTime(position * audioPlayer.duration);
        }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (isProgressDragging) {
            const touch = e.touches[0];
            const rect = progressBar.getBoundingClientRect();
            const position = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
            progressFill.style.width = `${position * 100}%`;
            if (!isNaN(audioPlayer.duration)) {
                currentTimeEl.textContent = formatTime(position * audioPlayer.duration);
            }
        }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (isProgressDragging) {
            const rect = progressBar.getBoundingClientRect();
            // Use the last touch position
            const lastPosition = parseFloat(progressFill.style.width) / 100;
            if (!isNaN(audioPlayer.duration)) {
                audioPlayer.currentTime = lastPosition * audioPlayer.duration;
                if (wasPlaying) audioPlayer.play();
            }
            isProgressDragging = false;
            progressBar.classList.remove('dragging');
        }
    });

    // Volume bar drag functionality
    let isVolumeDragging = false;

    const updateVolume = (e) => {
        const rect = volumeBar.getBoundingClientRect();
        const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        audioPlayer.volume = position;
        // Unmute if user is adjusting volume
        if (audioPlayer.muted && position > 0) {
            audioPlayer.muted = false;
        }
    };

    volumeBar.addEventListener('mousedown', (e) => {
        isVolumeDragging = true;
        volumeBar.classList.add('dragging');
        updateVolume(e);
        e.preventDefault(); // Prevent text selection
    });

    document.addEventListener('mousemove', (e) => {
        if (isVolumeDragging) {
            updateVolume(e);
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (isVolumeDragging) {
            isVolumeDragging = false;
            volumeBar.classList.remove('dragging');
        }
    });

    // Touch support for mobile
    volumeBar.addEventListener('touchstart', (e) => {
        isVolumeDragging = true;
        volumeBar.classList.add('dragging');
        const touch = e.touches[0];
        const rect = volumeBar.getBoundingClientRect();
        const position = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
        audioPlayer.volume = position;
        if (audioPlayer.muted && position > 0) {
            audioPlayer.muted = false;
        }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (isVolumeDragging) {
            const touch = e.touches[0];
            const rect = volumeBar.getBoundingClientRect();
            const position = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
            audioPlayer.volume = position;
        }
    }, { passive: true });

    document.addEventListener('touchend', () => {
        if (isVolumeDragging) {
            isVolumeDragging = false;
            volumeBar.classList.remove('dragging');
        }
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

    // Track preview tooltips for next/prev buttons
    const createPreviewTooltip = () => {
        const tooltip = document.createElement('div');
        tooltip.className = 'track-preview-tooltip';
        tooltip.style.cssText = `
            position: fixed;
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 0.75rem;
            display: none;
            z-index: 9999;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            backdrop-filter: blur(20px);
            min-width: 200px;
            max-width: 280px;
            pointer-events: none;
        `;
        document.body.appendChild(tooltip);
        return tooltip;
    };

    const previewTooltip = createPreviewTooltip();

    const showTrackPreview = (button, track, label) => {
        if (!track) {
            previewTooltip.style.display = 'none';
            return;
        }

        const coverUrl = api.getCoverUrl(track.album?.cover, '80');
        previewTooltip.innerHTML = `
            <div style="font-size: 0.7rem; color: var(--muted-foreground); margin-bottom: 0.5rem;">${label}</div>
            <div style="display: flex; gap: 0.75rem; align-items: center;">
                <img src="${coverUrl}" alt="" style="width: 40px; height: 40px; border-radius: 4px; object-fit: cover;">
                <div style="overflow: hidden;">
                    <div style="font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${track.title}</div>
                    <div style="font-size: 0.8rem; color: var(--muted-foreground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${track.artist?.name || 'Unknown'}</div>
                </div>
            </div>
        `;

        const rect = button.getBoundingClientRect();
        previewTooltip.style.display = 'block';
        previewTooltip.style.left = `${rect.left + rect.width / 2 - previewTooltip.offsetWidth / 2}px`;
        previewTooltip.style.top = `${rect.top - previewTooltip.offsetHeight - 8}px`;
    };

    const hideTrackPreview = () => {
        previewTooltip.style.display = 'none';
    };

    nextBtn.addEventListener('mouseenter', () => {
        const queue = player.getCurrentQueue();
        const nextIndex = player.currentQueueIndex + 1;
        if (nextIndex < queue.length) {
            showTrackPreview(nextBtn, queue[nextIndex], 'Next up');
        }
    });

    nextBtn.addEventListener('mouseleave', hideTrackPreview);

    prevBtn.addEventListener('mouseenter', () => {
        const queue = player.getCurrentQueue();
        const prevIndex = player.currentQueueIndex - 1;
        if (prevIndex >= 0) {
            showTrackPreview(prevBtn, queue[prevIndex], 'Previous');
        }
    });

    prevBtn.addEventListener('mouseleave', hideTrackPreview);

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

        // Sincronizar el estado del botón de shuffle en el modal
        const shuffleQueueBtn = document.getElementById('shuffle-queue-btn');
        if (shuffleQueueBtn) {
            shuffleQueueBtn.classList.toggle('active', player.shuffleActive);
        }
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

    // Shuffle Queue Button (inside modal)
    const shuffleQueueBtn = document.getElementById('shuffle-queue-btn');
    shuffleQueueBtn?.addEventListener('click', () => {
        if (player.getCurrentQueue().length === 0) return;

        player.toggleShuffle();
        shuffleBtn.classList.toggle('active', player.shuffleActive);
        shuffleQueueBtn.classList.toggle('active', player.shuffleActive);
        renderQueue();

        const notification = document.createElement('div');
        notification.textContent = player.shuffleActive ? '✓ Queue shuffled' : '✓ Shuffle disabled';
        notification.style.cssText = 'position:fixed;bottom:100px;right:20px;background:var(--card);padding:1rem 1.5rem;border-radius:var(--radius);border:1px solid var(--border);z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 2000);
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
        const downloadQuality = userSettings.getDownloadQuality();

        for (let i = 0; i < currentQueue.length; i++) {
            const track = currentQueue[i];
            notification.textContent = `Downloading ${i + 1}/${currentQueue.length}: ${track.title}...`;

            try {
                const filename = buildTrackFilename(track, downloadQuality);
                await api.downloadTrack(track.id, downloadQuality, filename, track);
                downloaded++;
            } catch (error) {
                console.error('Download failed:', track.title, error);
                const errorMsg = error.message === RATE_LIMIT_ERROR_MESSAGE
                    ? error.message
                    : 'Download failed. Please try again.';
                console.error(errorMsg);
                failed++;
            }

            // Delay between downloads to ensure Android browsers process each download
            await new Promise(resolve => setTimeout(resolve, 800));
        }

        notification.textContent = `✓ Downloaded: ${downloaded}/${currentQueue.length}${failed > 0 ? ` (${failed} failed)` : ''}`;
        setTimeout(() => notification.remove(), 4000);
    });

    // Queue Item Actions (Download, Remove & Drag/Drop)
    let draggedIndex = null;

    queueList.addEventListener('dragstart', e => {
        const trackItem = e.target.closest('.track-item');
        if (trackItem) {
            draggedIndex = parseInt(trackItem.dataset.queueIndex, 10);
            trackItem.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', trackItem.innerHTML);
        }
    });

    queueList.addEventListener('dragend', e => {
        const trackItem = e.target.closest('.track-item');
        if (trackItem) {
            trackItem.classList.remove('dragging');
            document.querySelectorAll('.track-item').forEach(item => {
                item.classList.remove('drag-over');
            });
        }
        draggedIndex = null;
    });

    queueList.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const trackItem = e.target.closest('.track-item');
        if (trackItem && draggedIndex !== null) {
            const targetIndex = parseInt(trackItem.dataset.queueIndex, 10);
            if (targetIndex !== draggedIndex) {
                document.querySelectorAll('.track-item').forEach(item => {
                    item.classList.remove('drag-over');
                });
                trackItem.classList.add('drag-over');
            }
        }
    });

    queueList.addEventListener('drop', e => {
        e.preventDefault();
        e.stopPropagation();

        const trackItem = e.target.closest('.track-item');
        if (trackItem && draggedIndex !== null) {
            const targetIndex = parseInt(trackItem.dataset.queueIndex, 10);

            if (targetIndex !== draggedIndex) {
                player.moveQueueItem(draggedIndex, targetIndex);
                renderQueue();
            }
        }

        document.querySelectorAll('.track-item').forEach(item => {
            item.classList.remove('drag-over');
        });
    });

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
                const downloadQuality = userSettings.getDownloadQuality();
                const filename = buildTrackFilename(track, downloadQuality);
                await api.downloadTrack(track.id, downloadQuality, filename, track);
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

    // Download Quality Selector
    document.addEventListener('change', (e) => {
        if (e.target.id === 'download-quality-select') {
            const newQuality = e.target.value;
            userSettings.setDownloadQuality(newQuality);
            showNotification(`Download quality set to ${e.target.options[e.target.selectedIndex].text}`, 'success');
        }
    });

    playPauseBtn.innerHTML = SVG_PLAY;
    updateVolumeUI();



    // Actualizar UI según estado de autenticación

    // Guardar Client ID

    // Conectar

    // Handle Callback (Check code in URL)

    // Importar Playlist



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
                results = await api.searchTracks(`${searchTitle} ${spotifyTrack.artist}`);
            }

            // Estrategia 3: Remover "The", números y símbolos del artista
            if (!results?.items || results.items.length === 0) {
                const cleanArtist = spotifyTrack.artist
                    .replace(/^The\s+/i, '')
                    .replace(/\d+\.?\d*/g, '')
                    .replace(/[^\w\s]/g, ' ')
                    .trim();

                if (cleanArtist !== spotifyTrack.artist) {
                    results = await api.searchTracks(`${searchTitle} ${cleanArtist}`);
                }
            }

            // Estrategia 4: Si aún no hay resultados, buscar solo por título limpio
            if (!results?.items || results.items.length === 0) {
                results = await api.searchTracks(searchTitle);
            }

            if (!results?.items || results.items.length === 0) {
                if (showNotif) {
                    showNotification(`No match: "${spotifyTrack.title}"`, 'error');
                }
                return false;
            }

            // SISTEMA SIMPLE: Limpiar, normalizar y comparar
            const cleanAndNormalize = (str) => {
                return str
                    .toLowerCase()
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remover acentos
                    .replace(/\([^)]*\)/g, '') // Remover paréntesis
                    .replace(/\[[^\]]*\]/g, '') // Remover corchetes
                    .replace(/\s*[-–—|]\s*.+$/, '') // Remover " - algo" al final
                    .replace(/\s*(feat|ft|featuring|with|vs|x)\s*.+$/i, '') // Remover colaboradores
                    .replace(/[^\w\s]/g, '') // Remover símbolos
                    .replace(/\s+/g, ' ') // Múltiples espacios → uno
                    .trim();
            };

            const spotifyTitle = cleanAndNormalize(spotifyTrack.title);
            const spotifyArtist = cleanAndNormalize(spotifyTrack.artist);

            let bestMatch = null;
            let bestScore = 0;

            for (const item of results.items) {
                const tidalTitle = cleanAndNormalize(item.title);
                const tidalArtist = cleanAndNormalize(item.artist?.name || '');

                let score = 0;

                // Score de título (0-100)
                if (tidalTitle === spotifyTitle) {
                    score += 100;
                } else if (tidalTitle.includes(spotifyTitle) || spotifyTitle.includes(tidalTitle)) {
                    score += 50;
                } else {
                    continue;
                }

                // Score de artista (0-100)
                if (tidalArtist === spotifyArtist) {
                    score += 100;
                } else if (tidalArtist.includes(spotifyArtist) || spotifyArtist.includes(tidalArtist)) {
                    score += 70;
                } else if (spotifyArtist.split(' ')[0] === tidalArtist.split(' ')[0]) {
                    score += 40;
                } else {
                    continue;
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = item;
                }
            }

            if (bestMatch) {
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
                if (showNotif) {
                    showNotification(`No match: "${spotifyTrack.title}"`, 'error');
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

    // ============= UX IMPROVEMENTS =============

    // --- Ripple Effect System ---
    function createRipple(event) {
        const element = event.currentTarget;

        // Don't create ripple if element is disabled
        if (element.disabled) return;

        // Remove any existing ripple
        const existingRipple = element.querySelector('.ripple');
        if (existingRipple) {
            existingRipple.remove();
        }

        const ripple = document.createElement('span');
        ripple.classList.add('ripple');

        const rect = element.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = event.clientX - rect.left - size / 2;
        const y = event.clientY - rect.top - size / 2;

        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;

        element.appendChild(ripple);

        // Remove ripple after animation
        ripple.addEventListener('animationend', () => {
            ripple.remove();
        });
    }

    // Apply ripple to interactive elements
    const rippleSelectors = [
        '.btn',
        '.btn-primary',
        '.btn-secondary',
        '.btn-icon',
        '.player-controls .buttons button',
        '.volume-controls button',
        '#context-menu li',
        '.search-tab',
        '.nav-item a'
    ];

    document.addEventListener('click', (e) => {
        const target = e.target.closest(rippleSelectors.join(', '));
        if (target) {
            createRipple(e);
        }
    });

    // --- Enhanced Image Loading ---
    function setupImageLoading() {
        // Add loading class to detail images
        const detailImages = document.querySelectorAll('.detail-header-image');
        detailImages.forEach(img => {
            if (!img.complete) {
                img.classList.add('loading');
                img.addEventListener('load', () => {
                    img.classList.remove('loading');
                }, { once: true });
                img.addEventListener('error', () => {
                    img.classList.remove('loading');
                }, { once: true });
            }
        });
    }

    // Run on initial load and after route changes
    setupImageLoading();
    window.addEventListener('hashchange', () => {
        requestAnimationFrame(() => {
            setupImageLoading();
        });
    });

    // --- Smooth notification animations ---
    window.showNotification = (message, type = 'info') => {
        const notification = document.createElement('div');
        notification.className = 'notification-toast';
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
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            animation: slideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.1);
            font-weight: 500;
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    };

    // --- Cover image hover effect (click to expand) ---
    const nowPlayingCover = document.querySelector('.track-info .cover');
    if (nowPlayingCover) {
        nowPlayingCover.addEventListener('click', () => {
            const currentTrack = player.getCurrentQueue()[player.currentQueueIndex];
            if (currentTrack?.album?.id) {
                window.location.hash = `#album/${currentTrack.album.id}`;
            }
        });
    }

    // --- Keyboard shortcuts ---
    document.addEventListener('keydown', (e) => {
        // Don't trigger if typing in an input
        if (e.target.matches('input, textarea, [contenteditable]')) return;

        switch (e.code) {
            case 'Space':
                e.preventDefault();
                player.handlePlayPause();
                break;
            case 'ArrowRight':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    player.playNext();
                }
                break;
            case 'ArrowLeft':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    player.playPrev();
                }
                break;
            case 'KeyM':
                e.preventDefault();
                audioPlayer.muted = !audioPlayer.muted;
                break;
        }
    });

    console.log('✨ UX improvements loaded');

    // === EXPANDED PLAYER ===
    const expandedPlayerModal = document.getElementById('expanded-player-modal');
    const closeExpandedPlayerBtn = document.getElementById('close-expanded-player');
    const expandedCover = document.getElementById('expanded-cover');
    const expandedTitle = document.getElementById('expanded-title');
    const expandedArtist = document.getElementById('expanded-artist');
    const expandedAlbum = document.getElementById('expanded-album');
    const expandedProgressBar = document.getElementById('expanded-progress-bar');
    const expandedProgressFill = document.getElementById('expanded-progress-fill');
    const expandedCurrentTime = document.getElementById('expanded-current-time');
    const expandedDuration = document.getElementById('expanded-duration');
    const expandedPlayPauseBtn = document.getElementById('expanded-play-pause-btn');
    const expandedPlayIcon = document.getElementById('expanded-play-icon');
    const expandedShuffleBtn = document.getElementById('expanded-shuffle-btn');
    const expandedRepeatBtn = document.getElementById('expanded-repeat-btn');
    const expandedNextBtn = document.getElementById('expanded-next-btn');
    const expandedPrevBtn = document.getElementById('expanded-prev-btn');
    const npCover = document.querySelector('.now-playing-bar .cover');

    const SVG_EXPANDED_PLAY = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
    const SVG_EXPANDED_PAUSE = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';

    const openExpandedPlayer = () => {
        const currentTrack = player.getCurrentTrack();
        if (!currentTrack) return;

        // Update expanded player info - use the same cover from now-playing bar but with higher resolution
        const nowPlayingCoverSrc = document.querySelector('.now-playing-bar .cover')?.src;
        // Replace the size in the URL (e.g., 160x160 -> 640x640)
        if (nowPlayingCoverSrc) {
            expandedCover.src = nowPlayingCoverSrc.replace(/\/\d+x\d+\.jpg/, '/640x640.jpg');
        } else {
            expandedCover.src = api.getCoverUrl(currentTrack.album?.cover, '640');
        }
        expandedTitle.textContent = currentTrack.title;
        expandedArtist.textContent = currentTrack.artist?.name || 'Unknown Artist';
        expandedAlbum.textContent = currentTrack.album?.title || '';

        // Update progress
        const { currentTime, duration } = audioPlayer;
        if (duration) {
            expandedProgressFill.style.width = `${(currentTime / duration) * 100}%`;
            expandedCurrentTime.textContent = formatTime(currentTime);
            expandedDuration.textContent = formatTime(duration);
        }

        // Update play/pause icon
        expandedPlayPauseBtn.innerHTML = audioPlayer.paused ? SVG_EXPANDED_PLAY : SVG_EXPANDED_PAUSE;

        // Update shuffle/repeat states
        expandedShuffleBtn.classList.toggle('active', player.shuffleActive);
        expandedRepeatBtn.classList.toggle('active', player.repeatMode !== REPEAT_MODE.OFF);

        // Show modal
        expandedPlayerModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    const closeExpandedPlayer = () => {
        expandedPlayerModal.classList.remove('active');
        document.body.style.overflow = '';
    };

    // Open expanded player when clicking on cover art
    if (npCover) {
        npCover.style.cursor = 'pointer';
        npCover.addEventListener('click', openExpandedPlayer);
    }

    // Close button
    closeExpandedPlayerBtn?.addEventListener('click', closeExpandedPlayer);

    // Close on overlay click
    expandedPlayerModal?.addEventListener('click', (e) => {
        if (e.target === expandedPlayerModal) {
            closeExpandedPlayer();
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && expandedPlayerModal?.classList.contains('active')) {
            closeExpandedPlayer();
        }
    });

    // Expanded player controls
    expandedPlayPauseBtn?.addEventListener('click', () => {
        player.handlePlayPause();
    });

    expandedNextBtn?.addEventListener('click', () => {
        player.playNext();
    });

    expandedPrevBtn?.addEventListener('click', () => {
        player.playPrev();
    });

    expandedShuffleBtn?.addEventListener('click', () => {
        player.toggleShuffle();
        expandedShuffleBtn.classList.toggle('active', player.shuffleActive);
        shuffleBtn.classList.toggle('active', player.shuffleActive);
    });

    expandedRepeatBtn?.addEventListener('click', () => {
        const mode = player.toggleRepeat();
        expandedRepeatBtn.classList.toggle('active', mode !== REPEAT_MODE.OFF);
        repeatBtn.classList.toggle('active', mode !== REPEAT_MODE.OFF);
    });

    // Update expanded player during playback
    audioPlayer.addEventListener('timeupdate', () => {
        if (!expandedPlayerModal?.classList.contains('active')) return;



        const { currentTime, duration } = audioPlayer;
        if (duration) {
            expandedProgressFill.style.width = `${(currentTime / duration) * 100}%`;
            expandedCurrentTime.textContent = formatTime(currentTime);
            expandedDuration.textContent = formatTime(duration);
        }
    });

    // Sync play/pause state
    audioPlayer.addEventListener('play', () => {
        if (expandedPlayPauseBtn) {
            expandedPlayPauseBtn.innerHTML = SVG_EXPANDED_PAUSE;
        }
    });

    audioPlayer.addEventListener('pause', () => {
        if (expandedPlayPauseBtn) {
            expandedPlayPauseBtn.innerHTML = SVG_EXPANDED_PLAY;
        }
    });

    // Update expanded player when track changes
    const originalPlayTrackFromQueue = player.playTrackFromQueue.bind(player);
    player.playTrackFromQueue = async function () {
        await originalPlayTrackFromQueue();

        // Update expanded player if open
        if (expandedPlayerModal?.classList.contains('active')) {
            const currentTrack = player.getCurrentTrack();
            if (currentTrack) {
                // Get cover from now-playing bar with higher resolution
                setTimeout(() => {
                    const coverSrc = document.querySelector('.now-playing-bar .cover')?.src;
                    if (coverSrc) {
                        expandedCover.src = coverSrc.replace(/\/\d+x\d+\.jpg/, '/640x640.jpg');
                    } else {
                        expandedCover.src = api.getCoverUrl(currentTrack.album?.cover, '640');
                    }
                }, 200); // Wait for now-playing bar to update
                expandedTitle.textContent = currentTrack.title;
                expandedArtist.textContent = currentTrack.artist?.name || 'Unknown Artist';
                expandedAlbum.textContent = currentTrack.album?.title || '';
            }
        }
    };

    // Seek in expanded progress bar
    expandedProgressBar?.addEventListener('click', (e) => {
        const rect = expandedProgressBar.getBoundingClientRect();
        const position = (e.clientX - rect.left) / rect.width;
        if (!isNaN(audioPlayer.duration)) {
            audioPlayer.currentTime = position * audioPlayer.duration;
        }
    });

    console.log('🎵 Expanded player loaded');
});