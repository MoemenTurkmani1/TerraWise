/* Static app-shell cache only. NASA, maps, authentication, uploads, and other
 * cross-origin/personal-data requests always go directly to their providers. */
// Bump on the real-data transition so previously cached demo bundles do not
// survive after the updated worker installs.
const CACHE = 'terrawise-static-v2'
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/images/hero.jpg']

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch('/offline-assets.json', { cache: 'no-store' })
    if (!response.ok) throw new Error('Offline asset manifest unavailable')
    const assets = await response.json()
    if (!Array.isArray(assets) || !assets.every(path => typeof path === 'string' && path.startsWith('/assets/'))) throw new Error('Invalid offline asset manifest')
    const cache = await caches.open(CACHE)
    await cache.addAll([...SHELL, ...assets])
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names.filter(name => name.startsWith('terrawise-static-') && name !== CACHE).map(name => caches.delete(name)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE)
      try {
        const response = await fetch(request)
        if (response.ok) await cache.put('/', response.clone())
        return response
      } catch {
        return await cache.match('/') ?? new Response('AgriLumina is offline and the application shell has not been cached yet.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      }
    })())
    return
  }
  if (!url.pathname.startsWith('/assets/') && !url.pathname.startsWith('/images/') && !['/favicon.svg', '/manifest.webmanifest'].includes(url.pathname)) return
  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    const cached = await cache.match(request)
    if (cached) return cached
    const response = await fetch(request)
    if (response.ok) await cache.put(request, response.clone())
    return response
  })())
})
