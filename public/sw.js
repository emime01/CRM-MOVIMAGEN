// Service worker del CRM Movimagen (app instalable).
//
// Sin caché de datos: el CRM siempre trae todo del servidor, así nadie ve
// ventas, cuotas o tareas viejas. Sólo guarda los íconos y una página "sin
// conexión" para cuando el celular no tiene señal.
const CACHE = 'movimagen-v1'
const OFFLINE = '/offline.html'
const PRECACHE = [OFFLINE, '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon.svg']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  // Páginas: siempre del servidor; sin señal, la página "sin conexión".
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE)))
    return
  }
  // Íconos: del caché si están.
  const url = new URL(req.url)
  if (url.origin === self.location.origin && url.pathname.startsWith('/icons/')) {
    event.respondWith(caches.match(req).then(r => r || fetch(req)))
  }
})
