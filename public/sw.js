// Service worker del CRM Movimagen (app instalable).
//
// Sin caché de datos: el CRM siempre trae todo del servidor, así nadie ve
// ventas, cuotas o tareas viejas. Sólo guarda los íconos y una página "sin
// conexión" para cuando el celular no tiene señal.
const CACHE = 'movimagen-v2'
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

// ── Avisos push ──────────────────────────────────────────────────────────────
// El CRM manda { title, body, url, tag }: se muestra como notificación del
// celular y al tocarla abre esa pantalla del CRM.
self.addEventListener('push', event => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { d = { title: 'CRM Movimagen', body: event.data && event.data.text() } }
  event.waitUntil(self.registration.showNotification(d.title || 'CRM Movimagen', {
    body: d.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || '/dashboard' },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/dashboard', self.location.origin).href
  event.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of abiertas) {
      if (new URL(c.url).origin === self.location.origin) { await c.focus(); return c.navigate(url) }
    }
    return self.clients.openWindow(url)
  })())
})
