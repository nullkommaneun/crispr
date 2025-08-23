// sw.js — Kill-Switch: sofort deaktivieren und alle Caches löschen
self.addEventListener("install", e => self.skipWaiting());

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      const regs = await self.registration.unregister();
      // kontrollierte Clients neu laden, damit sie NICHT länger vom SW gesteuert werden
      const cs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      cs.forEach(c => c.navigate(c.url));
    } catch {}
  })());
});

// keine Requests mehr anfassen
self.addEventListener("fetch", () => {});