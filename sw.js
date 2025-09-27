// PASSO 5: FUNCIONALIDADE OFFLINE AVANÇADA (Service Worker)
// Service Worker para Biblioteca de Prompts IA

const CACHE_NAME = 'prompt-library-v1';
const RECENT_PROMPTS_CACHE = 'recent-prompts-v1';
const MAX_RECENT_PROMPTS = 10;

// Assets estáticos para cache (App Shell)
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/manifest.json',
    // Ícones são geralmente cacheados por requisição
];

// Estratégia Cache-First para App Shell
self.addEventListener('install', event => {
    console.log('Service Worker: Installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Caching App Shell');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('Service Worker: App Shell cached successfully');
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('Service Worker: Error caching App Shell:', error);
            })
    );
});

// Ativar Service Worker e limpar caches antigos
self.addEventListener('activate', event => {
    console.log('Service Worker: Activating...');
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME && cacheName !== RECENT_PROMPTS_CACHE) {
                            console.log('Service Worker: Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('Service Worker: Activated successfully');
                return self.clients.claim();
            })
    );
});


// Único fetch listener consolidado
self.addEventListener('fetch', event => {
  const start = performance.now();
  event.respondWith((async () => {
    try {
      const request = event.request;
      // Prioriza a rede para requisições que não sejam GET (ex: POST, PUT, DELETE)
      if (request.method !== 'GET') {
          return await fetch(request);
      }
      
      // Para assets estáticos, usa a estratégia Cache-First
      if (isStaticAsset(request)) {
        return await cacheFirstStrategy(request);
      }
      
      // Para outros (conteúdo dinâmico), usa Network-First
      return await networkFirstStrategy(request);

    } catch (err) {
      console.error(`Service Worker: fetch handler failed for ${event.request.url}`, err);
      // Retornar página offline se disponível para navegação
      if (event.request.mode === 'navigate') {
          const offlinePage = await caches.match('/index.html');
          if (offlinePage) return offlinePage;
      }
      // Para outros tipos de requisição, o erro será propagado
      throw err;
    }
  })());
});


// --- ESTRATÉGIAS DE CACHE ---

/**
 * Estratégia Cache-First: Tenta buscar no cache primeiro. Se falhar, busca na rede.
 * @param {Request} request - A requisição a ser tratada.
 * @returns {Promise<Response>} A resposta do cache ou da rede.
 */
async function cacheFirstStrategy(request) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }

    const networkResponse = await fetch(request);
    // Clona a resposta para poder ser usada pelo cache e pelo navegador
    if (networkResponse.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, networkResponse.clone());
    }
    return networkResponse;
}

/**
 * Estratégia Network-First: Tenta buscar na rede primeiro. Se falhar, usa o cache como fallback.
 * @param {Request} request - A requisição a ser tratada.
 * @returns {Promise<Response>} A resposta da rede ou do cache.
 */
async function networkFirstStrategy(request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        console.log('Service Worker: Network failed, trying cache for:', request.url);
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        throw error; // Propaga o erro se não houver cache
    }
}


// --- LÓGICA DE CACHE DE DADOS ---

self.addEventListener('message', event => {
    if (event.data && event.data.type === 'CACHE_RECENT_PROMPTS') {
        cacheRecentPrompts(event.data.prompts);
    }
});

/**
 * Cacheia os prompts mais recentes para acesso offline.
 * @param {Array<object>} prompts - A lista de todos os prompts.
 */
async function cacheRecentPrompts(prompts) {
    try {
        const cache = await caches.open(RECENT_PROMPTS_CACHE);
        
        // Limpa o cache anterior para garantir dados frescos
        const keys = await cache.keys();
        await Promise.all(keys.map(key => cache.delete(key)));
        
        const recentPrompts = prompts
            .sort((a, b) => new Date(b.dataModificacao) - new Date(a.dataModificacao))
            .slice(0, MAX_RECENT_PROMPTS);
        
        for (const prompt of recentPrompts) {
            const response = new Response(JSON.stringify(prompt), {
                headers: { 'Content-Type': 'application/json' }
            });
            // Usa uma URL única para cada prompt para facilitar a recuperação
            await cache.put(`/prompt/${prompt.id}`, response);
        }
        
        console.log(`Service Worker: Cached ${recentPrompts.length} recent prompts`);
        
    } catch (error) {
        console.error('Service Worker: Error caching recent prompts:', error);
    }
}


// --- BACKGROUND SYNC E PUSH NOTIFICATIONS (Exemplos para futuras implementações) ---

self.addEventListener('sync', event => {
    if (event.tag === 'background-sync') {
        console.log('Service Worker: Background sync triggered');
        // event.waitUntil(doBackgroundSync());
    }
});

self.addEventListener('push', event => {
    if (event.data) {
        const data = event.data.json();
        const options = {
            body: data.body || 'Nova atualização disponível',
            icon: '/icon-192.png',
        };
        event.waitUntil(
            self.registration.showNotification(data.title || 'Biblioteca de Prompts IA', options)
        );
    }
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(clients.openWindow('/'));
});


// --- HELPERS ---

/**
 * Verifica se uma requisição é para um asset estático (parte do App Shell).
 * @param {Request} request - A requisição a ser verificada.
 * @returns {boolean}
 */
function isStaticAsset(request) {
    const url = new URL(request.url);
    // Considera assets estáticos se eles estiverem na lista ou tiverem extensões comuns
    return STATIC_ASSETS.includes(url.pathname) || 
           url.pathname.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|webp)$/);
}

