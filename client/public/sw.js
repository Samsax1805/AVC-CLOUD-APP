// Service worker for avcsb.com: shows notifications pushed by the server and opens the site when one is tapped.
// It does not cache pages, so members always get the latest version of the site.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'St. Barnabas AVC';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || 'There is something new on the choir site.',
    icon: d.icon || '/icons/icon-192.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const here = open.find((c) => c.url.startsWith(self.location.origin));
    if (here) { await here.focus(); return; }
    await self.clients.openWindow(url);
  })());
});
