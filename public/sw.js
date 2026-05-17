// NeuralOps Service Worker — PWA Support
const CACHE = 'neuralops-v1';
const STATIC = ['/', '/dashboard', '/login', '/manifest.json'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC).catch(() => {})));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Apenas cache para GET de páginas HTML e estáticos
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/api/')) return; // Nunca cacheia API
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request).then(r => r || caches.match('/dashboard')))
  );
});
