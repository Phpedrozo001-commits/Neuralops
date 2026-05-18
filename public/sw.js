// NeuralOps Service Worker — PWA Support
const CACHE = 'neuralops-v4';
const STATIC = ['/manifest.json'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC).catch(() => {})));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // NUNCA interceptar: Google Fonts, CDNs externos, API
  if (
    url.includes('fonts.googleapis.com') ||
    url.includes('fonts.gstatic.com') ||
    url.includes('cdn.jsdelivr.net') ||
    url.includes('cdnjs.cloudflare.com') ||
    url.includes('/api/') ||
    e.request.method !== 'GET'
  ) return;

  // HTML sempre da rede — nunca do cache
  if (e.request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // Resto: tenta rede, cai no cache se offline
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
