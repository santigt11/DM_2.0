//sw.js
const CACHE_NAME = 'monochrome-v4';
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
    '/js/spotify.js',
    '/js/playlists.js',
    '/js/playlistsUI.js',
    '/manifest.json'
];

// Lista de dominios de API que NO deben ser interceptados
const EXTERNAL_API_DOMAINS = [
    'tidal.401658.xyz',
    'squid.wtf',
    'qqdl.site',
    'resources.tidal.com'
];

// Función para verificar si una URL es de una API externa
const isExternalAPI = (url) => {
    return EXTERNAL_API_DOMAINS.some(domain => url.hostname.includes(domain));
};

// Skip waiting para activar el nuevo SW inmediatamente
self.addEventListener('install', event => {
    console.log('[SW] Installing...');
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Caching app shell');
                return cache.addAll(urlsToCache);
            })
            .catch(err => console.error('[SW] Cache failed:', err))
    );
});

// Fetch handler mejorado
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // IMPORTANTE: NO interceptar peticiones a APIs externas
    // Dejar que el navegador las maneje directamente
    if (isExternalAPI(url)) {
        console.log('[SW] Bypassing external API:', url.hostname);
        return; // No hacer nada, dejar que la petición pase normalmente
    }

    // Solo cachear recursos de nuestro propio dominio
    if (url.origin !== location.origin) {
        return; // Ignorar recursos de otros dominios
    }

    // Network First para HTML, CSS y JS
    if (url.pathname.endsWith('.html') ||
        url.pathname.endsWith('.css') ||
        url.pathname.endsWith('.js') ||
        url.pathname === '/') {

        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Guardar en caché la nueva versión
                    if (response && response.status === 200) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // Si falla la red, usar caché
                    console.log('[SW] Network failed, using cache for:', url.pathname);
                    return caches.match(event.request);
                })
        );
    } else {
        // Cache First para imágenes y otros recursos locales
        event.respondWith(
            caches.match(event.request)
                .then(response => {
                    if (response) {
                        return response;
                    }
                    return fetch(event.request).then(response => {
                        // Cachear si es exitoso
                        if (response && response.status === 200) {
                            const responseClone = response.clone();
                            caches.open(CACHE_NAME).then(cache => {
                                cache.put(event.request, responseClone);
                            });
                        }
                        return response;
                    });
                })
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