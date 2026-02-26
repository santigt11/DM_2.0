// js/playlistsUI.js
// UI integration for playlists system

import { PlaylistManager } from './playlists.js';
import { formatTime, trackDataStore } from './utils.js';

/**
 * Playlists UI Controller
 */
export class PlaylistsUI {
    constructor(api, player, showNotification) {
        this.api = api;
        this.player = player;
        this.showNotification = showNotification;
        this.currentPlaylistId = null;

        this.initElements();
        this.initEventListeners();
        this.renderSidebarPlaylists();
    }

    initElements() {
        // Sidebar elements
        this.sidebarPlaylistsList = document.getElementById('sidebar-playlists-list');
        this.createPlaylistBtn = document.getElementById('create-playlist-btn');

        // Modal elements
        this.playlistsModalOverlay = document.getElementById('playlists-modal-overlay');
        this.closePlaylistsBtn = document.getElementById('close-playlists-btn');
        this.playlistsGrid = document.getElementById('playlists-grid');
        this.createPlaylistForm = document.getElementById('create-playlist-form');
        this.newPlaylistName = document.getElementById('new-playlist-name');
        this.newPlaylistDescription = document.getElementById('new-playlist-description');
        this.cancelCreatePlaylist = document.getElementById('cancel-create-playlist');
        this.saveNewPlaylist = document.getElementById('save-new-playlist');

        // Add to playlist menu
        this.addToPlaylistMenu = document.getElementById('add-to-playlist-menu');
        this.addToPlaylistList = document.getElementById('add-to-playlist-list');

        // Playlist detail page elements
        this.playlistDetailCover = document.getElementById('playlist-detail-cover');
        this.playlistDetailName = document.getElementById('playlist-detail-name');
        this.playlistDetailDescription = document.getElementById('playlist-detail-description');
        this.playlistDetailMeta = document.getElementById('playlist-detail-meta');
        this.playlistDetailTracklist = document.getElementById('playlist-detail-tracklist');
        this.playlistEmptyState = document.getElementById('playlist-empty-state');

        // Playlist action buttons
        this.playPlaylistBtn = document.getElementById('play-playlist-btn');
        this.shufflePlaylistBtn = document.getElementById('shuffle-playlist-btn');
        this.editPlaylistBtn = document.getElementById('edit-playlist-btn');
        this.deletePlaylistBtn = document.getElementById('delete-playlist-btn');
    }

    initEventListeners() {
        // Create playlist button in sidebar
        this.createPlaylistBtn?.addEventListener('click', () => {
            this.openModal();
            this.showCreateForm();
        });

        // Close modal
        this.closePlaylistsBtn?.addEventListener('click', () => this.closeModal());
        this.playlistsModalOverlay?.addEventListener('click', (e) => {
            if (e.target === this.playlistsModalOverlay) {
                this.closeModal();
            }
        });

        // Create playlist form
        this.cancelCreatePlaylist?.addEventListener('click', () => this.hideCreateForm());
        this.saveNewPlaylist?.addEventListener('click', () => this.createNewPlaylist());

        this.newPlaylistName?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.createNewPlaylist();
            }
        });

        // Playlist detail actions
        this.playPlaylistBtn?.addEventListener('click', () => this.playCurrentPlaylist(false));
        this.shufflePlaylistBtn?.addEventListener('click', () => this.playCurrentPlaylist(true));
        this.editPlaylistBtn?.addEventListener('click', () => this.toggleEditMode());
        this.deletePlaylistBtn?.addEventListener('click', () => this.deleteCurrentPlaylist());

        // Editable playlist name
        this.playlistDetailName?.addEventListener('blur', () => {
            if (this.playlistDetailName.contentEditable === 'true') {
                this.savePlaylistName();
            }
        });

        this.playlistDetailName?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.playlistDetailName.blur();
            }
        });

        // Close add to playlist menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.addToPlaylistMenu?.contains(e.target)) {
                this.hideAddToPlaylistMenu();
            }
        });

        // Add to playlist menu - create new playlist
        this.addToPlaylistMenu?.querySelector('[data-action="new-playlist"]')?.addEventListener('click', () => {
            this.hideAddToPlaylistMenu();
            const name = prompt('Enter playlist name:');
            if (name && name.trim()) {
                const playlist = PlaylistManager.create(name.trim());
                if (this.pendingTrackToAdd) {
                    const added = PlaylistManager.addTrack(playlist.id, this.pendingTrackToAdd);
                    if (added) {
                        this.showNotification(`Created "${playlist.name}" and added track`, 'success');
                    }
                    this.pendingTrackToAdd = null;
                }
                this.renderSidebarPlaylists();
            }
        });

        // Playlists grid click handler
        this.playlistsGrid?.addEventListener('click', (e) => {
            const card = e.target.closest('.playlist-card');
            const deleteBtn = e.target.closest('[data-action="delete"]');
            const playBtn = e.target.closest('[data-action="play"]');

            if (deleteBtn) {
                e.stopPropagation();
                const playlistId = deleteBtn.dataset.playlistId;
                this.deletePlaylist(playlistId);
            } else if (playBtn) {
                e.stopPropagation();
                const playlistId = playBtn.dataset.playlistId;
                this.playPlaylist(playlistId);
            } else if (card) {
                const playlistId = card.dataset.playlistId;
                this.closeModal();
                window.location.hash = `#playlist/${playlistId}`;
            }
        });

        // Playlist detail tracklist click handler
        this.playlistDetailTracklist?.addEventListener('click', async (e) => {
            const removeBtn = e.target.closest('.remove-from-playlist-btn');
            const addToQueueBtn = e.target.closest('.add-to-queue-btn');
            const downloadBtn = e.target.closest('.download-track-btn');
            const trackItem = e.target.closest('.track-item');

            const playlist = PlaylistManager.getById(this.currentPlaylistId);
            if (!playlist) return;

            if (removeBtn) {
                e.stopPropagation();
                const index = parseInt(removeBtn.dataset.index);
                this.removeTrackFromCurrentPlaylist(index);
            } else if (addToQueueBtn) {
                e.stopPropagation();
                const index = parseInt(addToQueueBtn.dataset.index);
                const track = playlist.tracks[index];
                if (track) {
                    const added = this.player.addToQueue(track);
                    if (added) {
                        this.showNotification(`Added "${track.title}" to queue`, 'success');
                    } else {
                        this.showNotification(`"${track.title}" already in queue`, 'warning');
                    }
                }
            } else if (downloadBtn) {
                e.stopPropagation();
                const index = parseInt(downloadBtn.dataset.index);
                const track = playlist.tracks[index];
                if (track) {
                    try {
                        this.showNotification(`Downloading: ${track.title}...`, 'info');
                        // Import userSettings and buildTrackFilename from utils for download
                        const { userSettings } = await import('./storage.js');
                        const { buildTrackFilename, RATE_LIMIT_ERROR_MESSAGE } = await import('./utils.js');
                        const downloadQuality = userSettings.getDownloadQuality();
                        const filename = buildTrackFilename(track, downloadQuality);
                        await this.api.downloadTrack(track.id, downloadQuality, filename, track);
                        this.showNotification(`Downloaded: ${track.title}`, 'success');
                    } catch (error) {
                        this.showNotification(`Download failed: ${error.message}`, 'error');
                    }
                }
            } else if (trackItem && !e.target.closest('button')) {
                // Play track
                const index = parseInt(trackItem.dataset.index);
                this.player.setQueue(playlist.tracks, index);
                this.player.playTrackFromQueue();
            }
        });
    }

    // ============= MODAL METHODS =============

    openModal() {
        this.playlistsModalOverlay.style.display = 'flex';
        document.body.classList.add('modal-open');
        this.renderPlaylistsGrid();
    }

    closeModal() {
        this.playlistsModalOverlay.style.display = 'none';
        document.body.classList.remove('modal-open');
        this.hideCreateForm();
    }

    showCreateForm() {
        this.createPlaylistForm.style.display = 'flex';
        this.newPlaylistName.value = '';
        this.newPlaylistDescription.value = '';
        this.newPlaylistName.focus();
    }

    hideCreateForm() {
        this.createPlaylistForm.style.display = 'none';
    }

    // ============= CRUD METHODS =============

    createNewPlaylist() {
        const name = this.newPlaylistName.value.trim();
        const description = this.newPlaylistDescription.value.trim();

        if (!name) {
            this.showNotification('Please enter a playlist name', 'error');
            return;
        }

        const playlist = PlaylistManager.create(name, description);
        this.showNotification(`Created playlist "${playlist.name}"`, 'success');
        this.hideCreateForm();
        this.renderPlaylistsGrid();
        this.renderSidebarPlaylists();
    }

    deletePlaylist(playlistId) {
        const playlist = PlaylistManager.getById(playlistId);
        if (!playlist) return;

        if (confirm(`Delete playlist "${playlist.name}"? This cannot be undone.`)) {
            PlaylistManager.delete(playlistId);
            this.showNotification(`Deleted playlist "${playlist.name}"`, 'success');
            this.renderPlaylistsGrid();
            this.renderSidebarPlaylists();

            // If we're on this playlist's page, go home
            if (this.currentPlaylistId === playlistId) {
                window.location.hash = '#home';
            }
        }
    }

    deleteCurrentPlaylist() {
        if (this.currentPlaylistId) {
            this.deletePlaylist(this.currentPlaylistId);
        }
    }

    // ============= ADD TO PLAYLIST =============

    showAddToPlaylistMenu(track, x, y) {
        this.pendingTrackToAdd = track;

        // Render playlists in menu
        const playlists = PlaylistManager.getAll();

        this.addToPlaylistList.innerHTML =
            playlists.length === 0
                ? '<div class="add-to-playlist-menu-item" style="color: var(--muted-foreground); cursor: default;">No playlists yet</div>'
                : playlists
                      .map(
                          (p) => `
                <div class="add-to-playlist-menu-item" data-playlist-id="${p.id}">
                    ${
                        p.coverUrl
                            ? `<img src="${this.api.getCoverUrl(p.coverUrl, '80')}" alt="">`
                            : `<div class="placeholder-cover">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M9 18V5l12-2v13"></path>
                                <circle cx="6" cy="18" r="3"></circle>
                                <circle cx="18" cy="16" r="3"></circle>
                            </svg>
                        </div>`
                    }
                    <span>${this.escapeHtml(p.name)}</span>
                </div>
            `
                      )
                      .join('');

        // Add click handlers
        this.addToPlaylistList.querySelectorAll('[data-playlist-id]').forEach((item) => {
            item.addEventListener('click', () => {
                const playlistId = item.dataset.playlistId;
                this.addTrackToPlaylist(playlistId, this.pendingTrackToAdd);
                this.hideAddToPlaylistMenu();
            });
        });

        // Position menu
        const menuWidth = 220;
        const menuHeight = Math.min(300, 60 + (playlists.length + 1) * 44);

        let posX = x;
        let posY = y;

        if (x + menuWidth > window.innerWidth) {
            posX = x - menuWidth;
        }
        if (y + menuHeight > window.innerHeight) {
            posY = window.innerHeight - menuHeight - 10;
        }

        this.addToPlaylistMenu.style.top = `${posY}px`;
        this.addToPlaylistMenu.style.left = `${posX}px`;
        this.addToPlaylistMenu.style.display = 'block';
    }

    hideAddToPlaylistMenu() {
        this.addToPlaylistMenu.style.display = 'none';
        this.pendingTrackToAdd = null;
    }

    addTrackToPlaylist(playlistId, track) {
        const playlist = PlaylistManager.getById(playlistId);
        if (!playlist) return;

        const added = PlaylistManager.addTrack(playlistId, track);

        if (added) {
            this.showNotification(`Added "${track.title}" to "${playlist.name}"`, 'success');
            this.renderSidebarPlaylists();

            // If we're on this playlist's page, re-render
            if (this.currentPlaylistId === playlistId) {
                this.renderPlaylistPage(playlistId);
            }
        } else {
            this.showNotification(`"${track.title}" is already in "${playlist.name}"`, 'warning');
        }
    }

    removeTrackFromCurrentPlaylist(index) {
        if (!this.currentPlaylistId) return;

        const playlist = PlaylistManager.getById(this.currentPlaylistId);
        if (!playlist || !playlist.tracks[index]) return;

        const trackName = playlist.tracks[index].title;
        PlaylistManager.removeTrack(this.currentPlaylistId, index);
        this.showNotification(`Removed "${trackName}" from playlist`, 'success');
        this.renderPlaylistPage(this.currentPlaylistId);
        this.renderSidebarPlaylists();
    }

    // ============= RENDER METHODS =============

    renderSidebarPlaylists() {
        const playlists = PlaylistManager.getAll();

        if (playlists.length === 0) {
            this.sidebarPlaylistsList.innerHTML = `
                <div style="padding: 0.75rem; color: var(--muted-foreground); font-size: 0.85rem;">
                    No playlists yet
                </div>
            `;
            return;
        }

        this.sidebarPlaylistsList.innerHTML = playlists
            .slice(0, 10)
            .map(
                (p) => `
            <div class="sidebar-playlist-item" data-playlist-id="${p.id}">
                ${
                    p.coverUrl
                        ? `<img src="${this.api.getCoverUrl(p.coverUrl, '80')}" class="sidebar-playlist-cover" alt="">`
                        : `<div class="sidebar-playlist-cover placeholder">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 18V5l12-2v13"></path>
                            <circle cx="6" cy="18" r="3"></circle>
                            <circle cx="18" cy="16" r="3"></circle>
                        </svg>
                    </div>`
                }
                <div class="sidebar-playlist-info">
                    <div class="sidebar-playlist-name">${this.escapeHtml(p.name)}</div>
                    <div class="sidebar-playlist-count">${p.tracks.length} tracks</div>
                </div>
            </div>
        `
            )
            .join('');

        // Add click handlers
        this.sidebarPlaylistsList.querySelectorAll('.sidebar-playlist-item').forEach((item) => {
            item.addEventListener('click', () => {
                const playlistId = item.dataset.playlistId;
                window.location.hash = `#playlist/${playlistId}`;
            });
        });
    }

    renderPlaylistsGrid() {
        const playlists = PlaylistManager.getAll();

        if (playlists.length === 0) {
            this.playlistsGrid.innerHTML = `
                <div class="playlist-empty-state" style="grid-column: 1 / -1;">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M9 18V5l12-2v13"></path>
                        <circle cx="6" cy="18" r="3"></circle>
                        <circle cx="18" cy="16" r="3"></circle>
                    </svg>
                    <h4>No playlists yet</h4>
                    <p>Create your first playlist to start organizing your music.</p>
                </div>
            `;
            return;
        }

        this.playlistsGrid.innerHTML = playlists
            .map(
                (p) => `
            <div class="playlist-card" data-playlist-id="${p.id}">
                <div class="playlist-card-actions">
                    <button class="playlist-card-action-btn" data-action="play" data-playlist-id="${p.id}" title="Play">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                        </svg>
                    </button>
                    <button class="playlist-card-action-btn" data-action="delete" data-playlist-id="${p.id}" title="Delete">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
                <div class="playlist-card-cover">
                    ${
                        p.coverUrl
                            ? `<img src="${this.api.getCoverUrl(p.coverUrl, '320')}" alt="">`
                            : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M9 18V5l12-2v13"></path>
                            <circle cx="6" cy="18" r="3"></circle>
                            <circle cx="18" cy="16" r="3"></circle>
                        </svg>`
                    }
                </div>
                <div class="playlist-card-name">${this.escapeHtml(p.name)}</div>
                <div class="playlist-card-count">${p.tracks.length} tracks</div>
            </div>
        `
            )
            .join('');
    }

    renderPlaylistPage(playlistId) {
        this.currentPlaylistId = playlistId;
        const playlist = PlaylistManager.getById(playlistId);

        if (!playlist) {
            window.location.hash = '#home';
            return;
        }

        // Show page
        document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
        document.getElementById('page-playlist').classList.add('active');

        // Update cover
        if (playlist.coverUrl) {
            this.playlistDetailCover.innerHTML = `
                <img src="${this.api.getCoverUrl(playlist.coverUrl, '640')}" alt="">
            `;
        } else {
            this.playlistDetailCover.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M9 18V5l12-2v13"></path>
                    <circle cx="6" cy="18" r="3"></circle>
                    <circle cx="18" cy="16" r="3"></circle>
                </svg>
            `;
        }

        // Update info
        this.playlistDetailName.textContent = playlist.name;
        this.playlistDetailDescription.textContent = playlist.description || '';

        const totalDuration = playlist.tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
        this.playlistDetailMeta.textContent = `${playlist.tracks.length} tracks • ${formatTime(totalDuration)}`;

        // Render tracks
        if (playlist.tracks.length === 0) {
            this.playlistDetailTracklist.innerHTML = '';
            this.playlistEmptyState.style.display = 'flex';
        } else {
            this.playlistEmptyState.style.display = 'none';
            this.playlistDetailTracklist.innerHTML = playlist.tracks
                .map(
                    (track, index) => `
                <div class="track-item" data-index="${index}" data-track-id="${track.id}">
                    <div class="track-number">
                        <span class="number">${index + 1}</span>
                        <div class="playing-indicator">
                            <span class="bar bar-1"></span>
                            <span class="bar bar-2"></span>
                            <span class="bar bar-3"></span>
                        </div>
                    </div>
                    <div class="track-item-info">
                        <img src="${this.api.getCoverUrl(track.album?.cover, '80')}" 
                             class="track-item-cover" loading="lazy">
                        <div class="track-item-details">
                            <div class="title">${this.escapeHtml(track.title)}</div>
                            <div class="artist">${this.escapeHtml(track.artist?.name || 'Unknown')}</div>
                        </div>
                    </div>
                    <div class="track-item-actions">
                        <button class="queue-action-btn add-to-queue-btn" data-index="${index}" title="Add to Queue">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="8" y1="6" x2="21" y2="6"></line>
                                <line x1="8" y1="12" x2="21" y2="12"></line>
                                <line x1="8" y1="18" x2="21" y2="18"></line>
                                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                                <line x1="3" y1="18" x2="3.01" y2="18"></line>
                            </svg>
                        </button>
                        <button class="queue-action-btn download-track-btn" data-index="${index}" title="Download">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                        </button>
                        <button class="queue-action-btn remove-from-playlist-btn" data-index="${index}" title="Remove from playlist">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                    <div class="track-item-duration">${formatTime(track.duration || 0)}</div>
                </div>
            `
                )
                .join('');

            // Re-attach trackDataStore
            this.playlistDetailTracklist.querySelectorAll('.track-item').forEach((el, index) => {
                trackDataStore.set(el, playlist.tracks[index]);
            });
        }
    }

    // ============= PLAY METHODS =============

    playPlaylist(playlistId, shuffle = false) {
        const playlist = PlaylistManager.getById(playlistId);
        if (!playlist || playlist.tracks.length === 0) {
            this.showNotification('Playlist is empty', 'warning');
            return;
        }

        let tracks = [...playlist.tracks];

        if (shuffle) {
            // Fisher-Yates shuffle
            for (let i = tracks.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
            }
        }

        this.player.setQueue(tracks, 0);
        this.player.playTrackFromQueue();
        this.showNotification(`Playing "${playlist.name}"`, 'success');
    }

    playCurrentPlaylist(shuffle = false) {
        if (this.currentPlaylistId) {
            this.playPlaylist(this.currentPlaylistId, shuffle);
        }
    }

    // ============= EDIT MODE =============

    toggleEditMode() {
        const isEditing = this.playlistDetailName.contentEditable === 'true';

        if (isEditing) {
            this.savePlaylistName();
            this.playlistDetailName.contentEditable = 'false';
            this.editPlaylistBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                </svg>
                Edit
            `;
        } else {
            this.playlistDetailName.contentEditable = 'true';
            this.playlistDetailName.focus();
            // Select all text
            const range = document.createRange();
            range.selectNodeContents(this.playlistDetailName);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);

            this.editPlaylistBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Save
            `;
        }
    }

    savePlaylistName() {
        if (!this.currentPlaylistId) return;

        const newName = this.playlistDetailName.textContent.trim();
        if (newName) {
            PlaylistManager.update(this.currentPlaylistId, { name: newName });
            this.renderSidebarPlaylists();
            this.showNotification('Playlist renamed', 'success');
        }
    }

    // ============= UTILITIES =============

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

export default PlaylistsUI;
