import { formatTime, createPlaceholder, trackDataStore, hasExplicitContent, DOWNLOAD_QUALITY_OPTIONS } from './utils.js';
import { recentActivityManager, userSettings } from './storage.js';

export class UIRenderer {
    constructor(api) {
        this.api = api;
    }

    createExplicitBadge() {
        return '<span class="explicit-badge" title="Explicit">E</span>';
    }

    createTrackItemHTML(track, index) {
        const playIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
        const explicitBadge = hasExplicitContent(track) ? this.createExplicitBadge() : '';
        const coverUrl = this.api.getCoverUrl(track.album?.cover, '80');

        return `
            <div class="track-item" data-track-id="${track.id}">
                <div class="track-img-box">
                    <img src="${coverUrl}" alt="Cover" loading="lazy">
                    <div class="overlay playing-overlay">
                        <div class="playing-indicator">
                            <span class="bar bar-1"></span>
                            <span class="bar bar-2"></span>
                            <span class="bar bar-3"></span>
                        </div>
                    </div>
                    <div class="overlay hover-overlay">
                        ${playIcon}
                    </div>
                </div>
                <div class="track-item-info">
                    <div class="track-item-details">
                        <div class="title">
                            ${track.title}
                            ${explicitBadge}
                        </div>
                        <div class="artist">${track.artist?.name ?? 'Unknown Artist'}</div>
                    </div>
                </div>
                <div class="track-item-duration">${formatTime(track.duration)}</div>
            </div>
        `;
    }

    createAlbumCardHTML(album) {
        const explicitBadge = hasExplicitContent(album) ? this.createExplicitBadge() : '';
        return `
            <a href="#album/${album.id}" class="card">
                <div class="card-image-wrapper">
                    <img src="${this.api.getCoverUrl(album.cover, '320')}" alt="${album.title}" class="card-image" loading="lazy">
                </div>
                <h3 class="card-title">${album.title} ${explicitBadge}</h3>
                <p class="card-subtitle">Album • ${album.artist?.name ?? ''}</p>
            </a>
        `;
    }

    createArtistCardHTML(artist) {
        return `
            <a href="#artist/${artist.id}" class="card artist">
                <div class="card-image-wrapper">
                    <img src="${this.api.getArtistPictureUrl(artist.picture, '320')}" alt="${artist.name}" class="card-image" loading="lazy">
                </div>
                <h3 class="card-title">${artist.name}</h3>
                <p class="card-subtitle">Artist</p>
            </a>
        `;
    }

    createSkeletonTrack() {
        return `
            <div class="skeleton-track">
                <div class="skeleton skeleton-track-cover-small"></div>
                <div class="skeleton-track-info">
                    <div class="skeleton-track-details">
                        <div class="skeleton skeleton-track-title"></div>
                        <div class="skeleton skeleton-track-artist"></div>
                    </div>
                </div>
                <div class="skeleton skeleton-track-duration"></div>
            </div>
        `;
    }

    createSkeletonCard(isArtist = false) {
        return `
            <div class="skeleton-card ${isArtist ? 'artist' : ''}">
                <div class="skeleton skeleton-card-image"></div>
                <div class="skeleton skeleton-card-title"></div>
                <div class="skeleton skeleton-card-subtitle"></div>
            </div>
        `;
    }

    createSkeletonTracks(count = 5, showCover = false) {
        return `<div class="skeleton-container">${Array(count).fill(0).map(() => this.createSkeletonTrack(showCover)).join('')}</div>`;
    }

    createSkeletonCards(count = 6, isArtist = false) {
        return `<div class="card-grid">${Array(count).fill(0).map(() => this.createSkeletonCard(isArtist)).join('')}</div>`;
    }

    renderListWithTracks(container, tracks, showCover) {
        const fragment = document.createDocumentFragment();
        const tempDiv = document.createElement('div');

        tempDiv.innerHTML = tracks.map((track, i) =>
            this.createTrackItemHTML(track, i, showCover)
        ).join('');

        while (tempDiv.firstChild) {
            fragment.appendChild(tempDiv.firstChild);
        }

        container.innerHTML = '';
        container.appendChild(fragment);

        tracks.forEach(track => {
            const element = container.querySelector(`[data-track-id="${track.id}"]`);
            if (element) trackDataStore.set(element, track);
        });
    }

    showPage(pageId) {
        document.querySelectorAll('.page').forEach(page => {
            page.classList.toggle('active', page.id === `page-${pageId}`);
        });

        document.querySelectorAll('.sidebar-nav a').forEach(link => {
            link.classList.toggle('active', link.hash === `#${pageId}`);
        });

        document.querySelector('.main-content').scrollTop = 0;

        if (pageId === 'settings') {
            this.renderApiSettings();
        }
    }

    renderHomePage() {
        this.showPage('home');
        const recents = recentActivityManager.getRecents();

        document.getElementById('home-recent-albums').innerHTML = recents.albums.length
            ? recents.albums.map(album => this.createAlbumCardHTML(album)).join('')
            : createPlaceholder("You haven't viewed any albums yet.");

        document.getElementById('home-recent-artists').innerHTML = recents.artists.length
            ? recents.artists.map(artist => this.createArtistCardHTML(artist)).join('')
            : createPlaceholder("You haven't viewed any artists yet.");
    }

    async renderSearchPage(query) {
        this.showPage('search');
        document.getElementById('search-results-title').textContent = `Search Results for "${query}"`;

        const tracksContainer = document.getElementById('search-tracks-container');
        const artistsContainer = document.getElementById('search-artists-container');
        const albumsContainer = document.getElementById('search-albums-container');

        tracksContainer.innerHTML = this.createSkeletonTracks(8, false);
        artistsContainer.innerHTML = this.createSkeletonCards(6, true);
        albumsContainer.innerHTML = this.createSkeletonCards(6, false);

        try {
            const [tracksResult, artistsResult, albumsResult] = await Promise.all([
                this.api.searchTracks(query),
                this.api.searchArtists(query),
                this.api.searchAlbums(query)
            ]);

            let finalTracks = tracksResult.items;
            let finalArtists = artistsResult.items;
            let finalAlbums = albumsResult.items;

            if (finalArtists.length === 0 && finalTracks.length > 0) {
                const artistMap = new Map();
                finalTracks.forEach(track => {
                    if (track.artist && !artistMap.has(track.artist.id)) {
                        artistMap.set(track.artist.id, track.artist);
                    }
                    if (track.artists) {
                        track.artists.forEach(artist => {
                            if (!artistMap.has(artist.id)) {
                                artistMap.set(artist.id, artist);
                            }
                        });
                    }
                });
                finalArtists = Array.from(artistMap.values());
            }

            if (finalAlbums.length === 0 && finalTracks.length > 0) {
                const albumMap = new Map();
                finalTracks.forEach(track => {
                    if (track.album && !albumMap.has(track.album.id)) {
                        albumMap.set(track.album.id, track.album);
                    }
                });
                finalAlbums = Array.from(albumMap.values());
            }

            if (finalTracks.length) {
                this.renderListWithTracks(tracksContainer, finalTracks, false);
            } else {
                tracksContainer.innerHTML = createPlaceholder('No tracks found.');
            }

            artistsContainer.innerHTML = finalArtists.length
                ? finalArtists.map(artist => this.createArtistCardHTML(artist)).join('')
                : createPlaceholder('No artists found.');

            albumsContainer.innerHTML = finalAlbums.length
                ? finalAlbums.map(album => this.createAlbumCardHTML(album)).join('')
                : createPlaceholder('No albums found.');

        } catch (error) {
            console.error("Search failed:", error);
            const errorMsg = createPlaceholder(`Error during search. ${error.message}`);
            tracksContainer.innerHTML = errorMsg;
            artistsContainer.innerHTML = errorMsg;
            albumsContainer.innerHTML = errorMsg;
        }
    }

    async renderAlbumPage(albumId) {
        this.showPage('album');

        const imageEl = document.getElementById('album-detail-image');
        const titleEl = document.getElementById('album-detail-title');
        const metaEl = document.getElementById('album-detail-meta');
        const tracklistContainer = document.getElementById('album-detail-tracklist');

        imageEl.src = '';
        imageEl.style.backgroundColor = 'var(--muted)';
        titleEl.innerHTML = '<div class="skeleton" style="height: 48px; width: 300px; max-width: 90%;"></div>';
        metaEl.innerHTML = '<div class="skeleton" style="height: 16px; width: 200px; max-width: 80%;"></div>';
        tracklistContainer.innerHTML = `
            <div class="track-list-header">
                <span style="width: 40px; text-align: center;"></span>
                <span>Title</span>
                <span class="duration-header">Duration</span>
            </div>
            ${this.createSkeletonTracks(10, false)}
        `;

        try {
            const { album, tracks } = await this.api.getAlbum(albumId);

            imageEl.src = this.api.getCoverUrl(album.cover, '1280');
            imageEl.style.backgroundColor = '';

            const explicitBadge = hasExplicitContent(album) ? this.createExplicitBadge() : '';
            titleEl.innerHTML = `${album.title} ${explicitBadge}`;

            metaEl.innerHTML =
                `By <a href="#artist/${album.artist.id}">${album.artist.name}</a> • ${new Date(album.releaseDate).getFullYear()}`;

            tracklistContainer.innerHTML = `
                <div class="track-list-header">
                    <span style="width: 40px; text-align: center;"></span>
                    <span>Title</span>
                    <span class="duration-header">Duration</span>
                </div>
            `;

            tracks.sort((a, b) => a.trackNumber - b.trackNumber);
            this.renderListWithTracks(tracklistContainer, tracks, false);

            recentActivityManager.addAlbum(album);

            return tracks;
        } catch (error) {
            console.error("Failed to load album:", error);
            tracklistContainer.innerHTML = createPlaceholder(`Could not load album details. ${error.message}`);
            return [];
        }
    }

    async renderArtistPage(artistId) {
        this.showPage('artist');

        const imageEl = document.getElementById('artist-detail-image');
        const nameEl = document.getElementById('artist-detail-name');
        const metaEl = document.getElementById('artist-detail-meta');
        const typeEl = document.querySelector('#page-artist .type');
        const tracksContainer = document.getElementById('artist-detail-tracks');
        const albumsContainer = document.getElementById('artist-detail-albums');

        imageEl.src = '';
        imageEl.style.backgroundColor = 'var(--muted)';
        nameEl.innerHTML = '<div class="skeleton" style="height: 48px; width: 300px; max-width: 90%;"></div>';
        metaEl.innerHTML = '<div class="skeleton" style="height: 16px; width: 150px;"></div>';
        tracksContainer.innerHTML = this.createSkeletonTracks(5, true);
        albumsContainer.innerHTML = this.createSkeletonCards(6, false);

        try {
            console.log('[renderArtistPage] Fetching artist with ID:', artistId);
            const artist = await this.api.getArtist(artistId);
            console.log('[renderArtistPage] Artist data received:', artist);
            console.log('[renderArtistPage] Artist ID:', artist.id);
            console.log('[renderArtistPage] Artist name:', artist.name);
            console.log('[renderArtistPage] Artist picture:', artist.picture);
            console.log('[renderArtistPage] Artist popularity:', artist.popularity);
            console.log('[renderArtistPage] Artist type:', artist.type);
            console.log('[renderArtistPage] Artist tracks count:', artist.tracks?.length);
            console.log('[renderArtistPage] Artist albums count:', artist.albums?.length);

            // Usar artist.picture si existe, sino usar selectedAlbumCoverFallback, y como último recurso artist.id
            let pictureId = artist.picture || artist.selectedAlbumCoverFallback || artist.id;
            console.log('[renderArtistPage] Using picture ID:', pictureId);

            // Si usamos selectedAlbumCoverFallback, usar getCoverUrl en lugar de getArtistPictureUrl
            const artistImageUrl = (artist.picture || !artist.selectedAlbumCoverFallback)
                ? this.api.getArtistPictureUrl(pictureId, '750')
                : this.api.getCoverUrl(pictureId, '750');

            console.log('[renderArtistPage] Generated image URL:', artistImageUrl);

            imageEl.src = artistImageUrl;
            imageEl.style.backgroundColor = '';

            // Manejar error de carga de imagen
            imageEl.onerror = () => {
                console.warn('[renderArtistPage] Failed to load artist image, using placeholder');
                imageEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(artist.name || 'Artist')}&size=750&background=random&color=fff&bold=true`;
            };
            nameEl.textContent = artist.name || 'Unknown Artist';

            // Actualizar el tipo de artista
            if (typeEl) {
                typeEl.textContent = artist.type || 'Artist';
            }

            // Mostrar popularidad solo si existe
            if (artist.popularity !== undefined && artist.popularity !== null) {
                metaEl.textContent = `${artist.popularity} popularity`;
            } else {
                metaEl.textContent = '';
            }

            this.renderListWithTracks(tracksContainer, artist.tracks || [], true);
            albumsContainer.innerHTML = (artist.albums || []).map(album =>
                this.createAlbumCardHTML(album)
            ).join('');

            recentActivityManager.addArtist(artist);
        } catch (error) {
            console.error("Failed to load artist:", error);
            tracksContainer.innerHTML = albumsContainer.innerHTML =
                createPlaceholder(`Could not load artist details. ${error.message}`);
        }
    }

    renderApiSettings() {
        const container = document.getElementById('api-instance-list');
        const instances = this.api.settings.getInstances();
        const defaultInstancesSet = new Set(this.api.settings.defaultInstances);

        container.innerHTML = instances.map((url, index) => `
            <li data-index="${index}">
                <span class="instance-url">${url}</span>
                <div class="controls">
                    <button class="move-up" title="Move Up" ${index === 0 ? 'disabled' : ''}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 19V5M5 12l7-7 7 7"/>
                        </svg>
                    </button>
                    <button class="move-down" title="Move Down" ${index === instances.length - 1 ? 'disabled' : ''}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 5v14M19 12l-7 7-7-7"/>
                        </svg>
                    </button>
                    ${!defaultInstancesSet.has(url) ? `
                        <button class="delete-instance" title="Delete">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    ` : ''}
                </div>
            </li>
        `).join('');

        const stats = this.api.getCacheStats();
        const cacheInfo = document.getElementById('cache-info');
        if (cacheInfo) {
            cacheInfo.textContent = `Cache: ${stats.memoryEntries}/${stats.maxSize} entries`;
        }

        // Populate download quality selector
        this.populateDownloadQualitySelector();
    }

    async populateDownloadQualitySelector() {
        const select = document.getElementById('download-quality-select');
        if (!select) return;

        const currentQuality = userSettings.getDownloadQuality();

        select.innerHTML = DOWNLOAD_QUALITY_OPTIONS.map(option => `
            <option value="${option.value}" ${option.value === currentQuality ? 'selected' : ''}>
                ${option.label}
            </option>
        `).join('');
    }
}

