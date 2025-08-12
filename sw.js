// Service Worker básico para Patofelting Blog
const CACHE_NAME = 'patofelting-blog-v1';
const CACHE_URLS = [
  '/',
  '/blog.html',
  '/blog.css',
  '/blog.js',
  '/firebase-config.js',
  '/favicon.svg',
  'https://fonts.googleapis.com/css2?family=Fraunces:wght@600;700&family=Nunito:wght@400;600&family=Kalam:wght@300;400;700&display=swap',
  'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js'
];

// Instalación del Service Worker
self.addEventListener('install', event => {
  console.log('Service Worker: Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Cache abierto');
        return cache.addAll(CACHE_URLS);
      })
      .catch(err => console.log('Service Worker: Error cacheando:', err))
  );
});

// Activación del Service Worker
self.addEventListener('activate', event => {
  console.log('Service Worker: Activando...');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              console.log('Service Worker: Eliminando cache viejo:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
  );
});

// Intercepción de peticiones
self.addEventListener('fetch', event => {
  // Solo cachear GET requests
  if (event.request.method !== 'GET') return;
  
  // No cachear requests de Firebase
  if (event.request.url.includes('firebase') || 
      event.request.url.includes('google.com/spreadsheets')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Si está en cache, devolverlo
        if (response) {
          return response;
        }
        
        // Si no, hacer fetch y cachear si es exitoso
        return fetch(event.request)
          .then(response => {
            // Verificar que sea una respuesta válida
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clonar la respuesta para poder guardarla
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          });
      })
      .catch(err => {
        console.log('Service Worker: Error en fetch:', err);
        // En caso de error de red, mostrar página offline básica
        if (event.request.destination === 'document') {
          return caches.match('/blog.html');
        }
      })
  );
});