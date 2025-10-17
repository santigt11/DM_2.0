export const QUALITY = 'HI_RES_LOSSLESS';

export const REPEAT_MODE = {
    OFF: 0,
    ALL: 1,
    ONE: 2
};

export const AUDIO_QUALITIES = {
    HI_RES_LOSSLESS: 'HI_RES_LOSSLESS',
    LOSSLESS: 'LOSSLESS',
    HIGH: 'HIGH',
    LOW: 'LOW'
};

export const QUALITY_PRIORITY = ['HI_RES_LOSSLESS', 'LOSSLESS', 'HIGH', 'LOW'];

export const QUALITY_TOKENS = {
    HI_RES_LOSSLESS: ['HI_RES_LOSSLESS', 'HIRES_LOSSLESS', 'HIRESLOSSLESS', 'HIFI_PLUS', 'HI_RES_FLAC', 'HI_RES', 'HIRES', 'MASTER', 'MASTER_QUALITY', 'MQA'],
    LOSSLESS: ['LOSSLESS', 'HIFI'],
    HIGH: ['HIGH', 'HIGH_QUALITY'],
    LOW: ['LOW', 'LOW_QUALITY']
};

export const RATE_LIMIT_ERROR_MESSAGE = 'Too Many Requests. Please wait a moment and try again.';

export const SVG_PLAY = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
export const SVG_PAUSE = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
export const SVG_VOLUME = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
export const SVG_MUTE = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>';

export const formatTime = (seconds) => {
    if (isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
};

export const createPlaceholder = (text, isLoading = false) => {
    return `<div class="placeholder-text ${isLoading ? 'loading' : ''}">${text}</div>`;
};

export const trackDataStore = new WeakMap();

export const sanitizeForFilename = (value) => {
    if (!value) return 'Unknown';
    return value
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, ' ')
        .trim();
};

export const getExtensionForQuality = (quality) => {
    switch (quality) {
        case 'LOW':
        case 'HIGH':
            return 'm4a';
        default:
            return 'flac';
    }
};

export const buildTrackFilename = (track, quality) => {
    const extension = getExtensionForQuality(quality);
    const trackNumber = Number(track.trackNumber);
    const padded = Number.isFinite(trackNumber) && trackNumber > 0 
        ? `${trackNumber}`.padStart(2, '0') 
        : '00';
    
    const artistName = sanitizeForFilename(track.artist?.name);
    const albumTitle = sanitizeForFilename(track.album?.title);
    const trackTitle = sanitizeForFilename(track.title);
    
    return `${artistName} - ${albumTitle} - ${padded} ${trackTitle}.${extension}`;
};

const sanitizeToken = (value) => {
    if (!value) return '';
    return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
};

export const normalizeQualityToken = (value) => {
    if (!value) return null;
    
    const token = sanitizeToken(value);
    
    for (const [quality, aliases] of Object.entries(QUALITY_TOKENS)) {
        if (aliases.includes(token)) {
            return quality;
        }
    }
    
    return null;
};

export const deriveQualityFromTags = (rawTags) => {
    if (!Array.isArray(rawTags)) return null;
    
    const candidates = [];
    for (const tag of rawTags) {
        if (typeof tag !== 'string') continue;
        const normalized = normalizeQualityToken(tag);
        if (normalized && !candidates.includes(normalized)) {
            candidates.push(normalized);
        }
    }
    
    return pickBestQuality(candidates);
};

export const pickBestQuality = (candidates) => {
    let best = null;
    let bestRank = Infinity;
    
    for (const candidate of candidates) {
        if (!candidate) continue;
        const rank = QUALITY_PRIORITY.indexOf(candidate);
        const currentRank = rank === -1 ? Infinity : rank;
        
        if (currentRank < bestRank) {
            best = candidate;
            bestRank = currentRank;
        }
    }
    
    return best;
};

export const deriveTrackQuality = (track) => {
    if (!track) return null;
    
    const candidates = [
        deriveQualityFromTags(track.mediaMetadata?.tags),
        deriveQualityFromTags(track.album?.mediaMetadata?.tags),
        normalizeQualityToken(track.audioQuality)
    ];
    
    return pickBestQuality(candidates);
};

export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const hasExplicitContent = (item) => {
    return item?.explicit === true || item?.explicitLyrics === true;
};

export const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};