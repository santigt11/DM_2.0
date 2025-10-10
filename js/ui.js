import { formatTime, createPlaceholder, trackDataStore } from './utils.js';
import { recentActivityManager } from './storage.js';

export class UIRenderer {
    constructor(api) {
        this.api = api;
    }

    createTrackItemHTML(track, index, showCover = false) {
        const playIconSmall = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
        const trackNumberHTML = `<div class="track-number" style="font-size: 1.1em; display: flex; align-items: center; justify-content: center;">${showCover ? playIconSmall : index + 1}</div>`;
        
        return `
            <div class="track-item" data-track-id="${track.id}">
                ${trackNumberHTML}
                <div class="track-item-info">
                    ${showCover ? `<img src="${this.api.getCoverUrl(track.album?.cover, '80')}" alt="Track Cover" class="track-item-cover" loading="lazy">` : ''}
                    <div class="track-item-details">
                        <div class="title">${track.title}</div>
                        <div class="artist">${track.artist?.name ?? 'Unknown Artist'}</div>
                    </div>
                </div>
                <div class="track-item-duration">${formatTime(track.duration)}</div>
            </div>
        `;
    }

    createAlbumCardHTML(album) {
        return `
            <a href="#album/${album.id}" class="card">
                <img src="${this.api.getCoverUrl(album.cover)}" alt="${album.title}" class="card-image" loading="lazy">
                <h3 class="card-title">${album.title}</h3>
                <p class="card-subtitle">Album • ${album.artist?.name ?? ''}</p>
            </a>
        `;
    }

    createArtistCardHTML(artist) {
        return `
            <a href="#artist/${artist.id}" class="card artist">
                <img src="${this.api.getArtistPictureUrl(artist.picture, '750')}" alt="${artist.name}" class="card-image" loading="lazy">
                <h3 class="card-title">${artist.name}</h3>
                <p class="card-subtitle">Artist</p>
            </a>
        `;
    }

    renderListWithTracks(container, tracks, showCover) {
        container.innerHTML = tracks.map((track, i) => 
            this.createTrackItemHTML(track, i, showCover)
        ).join('');
        
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
    
    tracksContainer.innerHTML = createPlaceholder('Searching...', true);
    artistsContainer.innerHTML = createPlaceholder('Searching...', true);
    albumsContainer.innerHTML = createPlaceholder('Searching...', true);
    
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
            console.log('Using fallback: extracting artists from tracks');
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
            console.log('Using fallback: extracting albums from tracks');
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
        const tracklistContainer = document.getElementById('album-detail-tracklist');
        tracklistContainer.innerHTML = createPlaceholder('Loading...', true);
        
        try {
            const { album, tracks } = await this.api.getAlbum(albumId);
            
            document.getElementById('album-detail-image').src = this.api.getCoverUrl(album.cover);
            document.getElementById('album-detail-title').textContent = album.title;
            document.getElementById('album-detail-meta').innerHTML = 
                `By <a href="#artist/${album.artist.id}">${album.artist.name}</a> • ${new Date(album.releaseDate).getFullYear()}`;
            
            tracklistContainer.innerHTML = `
                <div class="track-list-header">
                    <span style="width: 40px; text-align: center;">#</span>
                    <span>Title</span>
                    <span class="duration-header">Duration</span>
                </div>
            `;
            
            tracks.sort((a, b) => a.trackNumber - b.trackNumber);
            this.renderListWithTracks(tracklistContainer, tracks, false);
            
            recentActivityManager.addAlbum(album);
        } catch (error) {
            console.error("Failed to load album:", error);
            tracklistContainer.innerHTML = createPlaceholder(`Could not load album details. ${error.message}`);
        }
    }

    async renderArtistPage(artistId) {
        this.showPage('artist');
        const tracksContainer = document.getElementById('artist-detail-tracks');
        const albumsContainer = document.getElementById('artist-detail-albums');
        
        tracksContainer.innerHTML = albumsContainer.innerHTML = createPlaceholder('Loading...', true);
        
        try {
            const artist = await this.api.getArtist(artistId);
            
            document.getElementById('artist-detail-image').src = 
                this.api.getArtistPictureUrl(artist.picture, '750');
            document.getElementById('artist-detail-name').textContent = artist.name;
            document.getElementById('artist-detail-meta').textContent = 
                `${artist.popularity} popularity`;
            
            this.renderListWithTracks(tracksContainer, artist.tracks, true);
            albumsContainer.innerHTML = artist.albums.map(album => 
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
}
}