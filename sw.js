//sw.js
const CACHE_NAME = 'monochrome-v2';
const urlsToCache = [
    '/',
    '/index.html',
    '/styles.css',
    '/js/app.js',
    '/js/api.js',
    '/js/player.js',
    '/js/storage.js',
    '/js/ui.js',
    '/js/utils.js',
    '/js/cache.js',
    '/manifest.json'
];

// Skip waiting para activar el nuevo SW inmediatamente
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

// Network First: Intenta red primero, luego caché
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // Network First para HTML, CSS y JS
    if (url.pathname.endsWith('.html') || 
        url.pathname.endsWith('.css') || 
        url.pathname.endsWith('.js') || 
        url.pathname === '/') {
        
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Guardar en caché la nueva versión
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                    return response;
                })
                .catch(() => {
                    // Si falla la red, usar caché
                    return caches.match(event.request);
                })
        );
    } else {
        // Cache First para imágenes y otros recursos
        event.respondWith(
            caches.match(event.request)
                .then(response => response || fetch(event.request))
        );
    }
});

// Tomar control inmediatamente
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});