const API_CACHE_VERSION = 'v3';
const IMAGE_CACHE_VERSION = 'v1';
const AUDIO_CACHE_VERSION = 'v1';
const STATIC_CACHE_VERSION = 'v1';

const API_CACHE = `monochrome-api-${API_CACHE_VERSION}`;
const IMAGE_CACHE = `monochrome-images-${IMAGE_CACHE_VERSION}`;
const AUDIO_CACHE = `monochrome-audio-${AUDIO_CACHE_VERSION}`;
const STATIC_CACHE = `monochrome-static-${STATIC_CACHE_VERSION}`;

const ALL_CACHES = [API_CACHE, IMAGE_CACHE, AUDIO_CACHE, STATIC_CACHE];

let cacheDuration = 'infinite';
let apiInstances = [];

const isApiRequest = (url) => apiInstances.some(instance => url.startsWith(instance));
const isImageRequest = (url) => url.startsWith('https://resources.tidal.com/') || url.startsWith('https://picsum.photos/');

const addTimestampToResponse = async (response) => {
    const body = await response.blob();
    const headers = new Headers(response.headers);
    headers.set('sw-cache-timestamp', Date.now());
    return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: headers
    });
};

const isCacheExpired = (response) => {
    if (cacheDuration === 'infinite') return false;
    const timestampHeader = response.headers.get('sw-cache-timestamp');
    if (!timestampHeader) return true;
    const timestamp = parseInt(timestampHeader, 10);
    const maxAge = parseInt(cacheDuration, 10) * 24 * 60 * 60 * 1000;
    return (Date.now() - timestamp) > maxAge;
};

const fetchAndCache = async (request, cacheName) => {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            let responseToCache = response.clone();
            if (cacheName === API_CACHE) {
                responseToCache = await addTimestampToResponse(response.clone());
            }
            await cache.put(request, responseToCache);
        }
        return response;
    } catch (error) {
        console.error(`[SW] Fetch failed for ${request.url}:`, error);
        throw error;
    }
};

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE).then((cache) => {
            return cache.addAll(['./', './index.html']);
        }).then(() => {
            self.skipWaiting();
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (!ALL_CACHES.includes(cacheName)) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            return self.clients.claim();
        })
    );
});

self.addEventListener('message', (event) => {
    if (event.data.action === 'update_setting') {
        if (event.data.key === 'cacheDuration') {
            cacheDuration = event.data.value;
        }
        if (event.data.key === 'apiInstances') {
            apiInstances = event.data.value;
        }
    } else if (event.data.action === 'clear_caches') {
        event.waitUntil(
            Promise.all(ALL_CACHES.map(cacheName => caches.delete(cacheName)))
            .then(() => event.source.postMessage({ status: 'caches_cleared' }))
            .catch(err => {
                console.error('Cache clearing failed:', err);
                event.source.postMessage({ status: 'cache_clear_failed', error: err.message });
            })
        );
    }
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET') {
        return;
    }

    if (isApiRequest(url.href)) {
        event.respondWith(
            caches.open(API_CACHE).then(async (cache) => {
                const cachedResponse = await cache.match(request);
                if (cachedResponse && !isCacheExpired(cachedResponse)) {
                    return cachedResponse;
                }
                return fetchAndCache(request, API_CACHE);
            })
        );
        return;
    }

    if (isImageRequest(url.href)) {
        event.respondWith(
            caches.open(IMAGE_CACHE).then(async (cache) => {
                const cachedResponse = await cache.match(request);
                if (cachedResponse) {
                    return cachedResponse;
                }
                return fetchAndCache(request, IMAGE_CACHE);
            })
        );
        return;
    }

    if (request.headers.get('range')) {
        event.respondWith(
            caches.open(AUDIO_CACHE).then(async (cache) => {
                const cachedResponse = await cache.match(request);
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                const networkResponse = await fetch(request);
                if (networkResponse && networkResponse.status === 200) {
                     await cache.put(request, networkResponse.clone());
                }
                return networkResponse;
            })
        );
        return;
    }
    
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            return cachedResponse || fetch(request).then(response => {
                if (response.ok && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html') || url.pathname === '/')) {
                    const cache = caches.open(STATIC_CACHE);
                    cache.put(request, response.clone());
                }
                return response;
            });
        })
    );
});