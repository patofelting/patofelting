/* =========================================================
   Blog Patofelting - Service Worker
   Cache offline con StaleWhileRevalidate strategy
========================================================= */

const CACHE_VERSION = 'patofelting-blog-v1';
const STATIC_CACHE = 'patofelting-static-v1';
const DYNAMIC_CACHE = 'patofelting-dynamic-v1';

// Recursos críticos para cache
const CRITICAL_RESOURCES = [
  '/',
  '/blog.html',
  '/admin.html',
  '/blog.css',
  '/blog.js',
  '/blog.skins.css',
  '/blog.microinteractions.css',
  '/blog.theme.js',
  '/blog.comments.firestore.js',
  '/blog.admin.js',
  '/firebase-config.js',
  '/index.html'
];

// Recursos opcionales
const OPTIONAL_RESOURCES = [
  '/img/patofelting.jpg',
  '/favicon.ico'
];

/* ===== INSTALACIÓN ===== */
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Instalando...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[ServiceWorker] Pre-caching recursos críticos');
        return cache.addAll(CRITICAL_RESOURCES.concat(OPTIONAL_RESOURCES))
          .catch((error) => {
            console.warn('[ServiceWorker] Error al pre-cachear algunos recursos:', error);
            // Pre-cachear solo los críticos si fallan algunos opcionales
            return cache.addAll(CRITICAL_RESOURCES);
          });
      })
      .then(() => {
        console.log('[ServiceWorker] Instalación completada');
        return self.skipWaiting();
      })
  );
});

/* ===== ACTIVACIÓN ===== */
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activando...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
            console.log('[ServiceWorker] Eliminando cache antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[ServiceWorker] Activación completada');
      return self.clients.claim();
    })
  );
});

/* ===== FETCH - STALE WHILE REVALIDATE ===== */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Solo interceptar requests del mismo origen
  if (url.origin !== location.origin) {
    return;
  }
  
  // Estrategia según tipo de recurso
  if (isStaticResource(request)) {
    event.respondWith(cacheFirstStrategy(request));
  } else if (isAPIRequest(request)) {
    event.respondWith(networkFirstStrategy(request));
  } else {
    event.respondWith(staleWhileRevalidateStrategy(request));
  }
});

/* ===== ESTRATEGIAS DE CACHE ===== */

// Cache First - Para recursos estáticos
async function cacheFirstStrategy(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, networkResponse.clone());
    
    return networkResponse;
  } catch (error) {
    console.warn('[ServiceWorker] Cache First falló:', error);
    return new Response('Recurso no disponible offline', { status: 503 });
  }
}

// Network First - Para requests de API/datos
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    const cache = await caches.open(DYNAMIC_CACHE);
    cache.put(request, networkResponse.clone());
    
    return networkResponse;
  } catch (error) {
    console.log('[ServiceWorker] Network First fallback a cache:', request.url);
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    return new Response(JSON.stringify({ 
      error: 'No hay conexión', 
      offline: true 
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Stale While Revalidate - Para contenido dinámico
async function staleWhileRevalidateStrategy(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const cachedResponse = await caches.match(request);
  
  // Fetch en background para actualizar cache
  const fetchPromise = fetch(request).then((networkResponse) => {
    cache.put(request, networkResponse.clone());
    return networkResponse;
  }).catch((error) => {
    console.warn('[ServiceWorker] Network fetch falló:', error);
    return null;
  });
  
  // Devolver cache inmediatamente si existe, sino esperar network
  if (cachedResponse) {
    console.log('[ServiceWorker] Sirviendo desde cache:', request.url);
    return cachedResponse;
  }
  
  console.log('[ServiceWorker] Esperando network:', request.url);
  return fetchPromise || new Response('Contenido no disponible', { status: 503 });
}

/* ===== UTILIDADES ===== */

function isStaticResource(request) {
  const url = new URL(request.url);
  const staticExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.woff', '.woff2'];
  
  return staticExtensions.some(ext => url.pathname.endsWith(ext)) ||
         CRITICAL_RESOURCES.includes(url.pathname);
}

function isAPIRequest(request) {
  const url = new URL(request.url);
  
  return url.pathname.includes('/api/') ||
         url.hostname.includes('firebaseio.com') ||
         url.hostname.includes('googleapis.com') ||
         url.pathname.endsWith('.csv');
}

/* ===== MENSAJES DESDE LA APP ===== */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_CACHE_STATUS') {
    getCacheStatus().then((status) => {
      event.ports[0].postMessage(status);
    });
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    clearAllCaches().then(() => {
      event.ports[0].postMessage({ success: true });
    });
  }
});

async function getCacheStatus() {
  const cacheNames = await caches.keys();
  const status = {};
  
  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    status[cacheName] = keys.length;
  }
  
  return status;
}

async function clearAllCaches() {
  const cacheNames = await caches.keys();
  return Promise.all(
    cacheNames.map(cacheName => caches.delete(cacheName))
  );
}

/* ===== BACKGROUND SYNC (si está disponible) ===== */
if ('sync' in self.registration) {
  self.addEventListener('sync', (event) => {
    if (event.tag === 'patofelting-background-sync') {
      event.waitUntil(doBackgroundSync());
    }
  });
}

async function doBackgroundSync() {
  console.log('[ServiceWorker] Ejecutando background sync...');
  
  // Sincronizar comentarios pendientes en localStorage
  try {
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'BACKGROUND_SYNC',
        action: 'SYNC_PENDING_COMMENTS'
      });
    });
  } catch (error) {
    console.warn('[ServiceWorker] Error en background sync:', error);
  }
}

/* ===== NOTIFICACIONES PUSH (básico) ===== */
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  try {
    const data = event.data.json();
    const options = {
      body: data.body || 'Nuevo contenido en el blog de Patofelting',
      icon: '/img/patofelting.jpg',
      badge: '/img/patofelting.jpg',
      data: data.url || '/blog.html',
      actions: [
        {
          action: 'open',
          title: 'Abrir blog'
        },
        {
          action: 'close',
          title: 'Cerrar'
        }
      ]
    };
    
    event.waitUntil(
      self.registration.showNotification(
        data.title || 'Patofelting Blog',
        options
      )
    );
  } catch (error) {
    console.warn('[ServiceWorker] Error procesando push:', error);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'open' || !event.action) {
    const urlToOpen = event.notification.data || '/blog.html';
    
    event.waitUntil(
      clients.matchAll().then((clientList) => {
        for (const client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
    );
  }
});

console.log('[ServiceWorker] Service Worker inicializado correctamente');