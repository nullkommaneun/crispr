// sw.js — Self-Uninstaller + Cache wipe (einmalig sauber machen)
self.addEventListener("install", (e) => {
  // sofort aktiv werden
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  // alle Caches löschen
  e.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {}
      try {
        // sich selbst deregistrieren
        const regs = await self.registration.unregister();
      } catch {}
      try {
        const cs = await self.clients.matchAll({ includeUncontrolled: true });
        cs.forEach((c) => c.navigate(c.url));
      } catch {}
    })()
  );
});

// alle Fetches einfach durchreichen (kein Caching mehr)
self.addEventListener("fetch", (e) => {
  // reines Passthrough
});