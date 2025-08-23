// sw.js — robust: Module immer Netzwerk-first, übrige Assets SWR
// Ziel: nie wieder veraltete .js aus dem Cache (PF_MODULES & Co.)

const CACHE_NAME = "crispr-v2025-08-23";
const CORE = [
  "./",
  "./index.html",
  "./style.css"
  // Absichtlich KEINE .js hier vorcachen, damit Module nie „stale“ starten
];

// Install: Basis-Assets cachen (best effort)
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(CORE).catch(() => {}))
  );
  self.skipWaiting();
});

// Activate: alte Caches räumen & sofort übernehmen
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
       const names = await caches.keys();
       await Promise.all(names.map((n) => n === CACHE_NAME ? null : caches.delete(n)));
       await self.clients.claim();
  })());
});

// Fetch: 
//  - .js ODER Requests mit ?v=/ ?ts= → immer Netzwerk-first (bei Offline Fallback Cache)
//  - sonst: Stale-While-Revalidate
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // nur eigene Origin managen
  if (url.origin !== self.location.origin) return;

  const isModule = url.pathname.endsWith(".js");
  const bypass   = url.searchParams.has("v") || url.searchParams.has("ts");

  if (isModule || bypass) {
    event.respondWith((async () => {
      try {
        const netRes = await fetch(req, { cache: "no-store" });
        // optional: erfolgreichen Netz-Body in Cache spiegeln für echten Offline-Fallback
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, netRes.clone()).catch(() => {});
        return netRes;
      } catch {
        // offline → letzter Stand aus Cache (wenn vorhanden)
        return (await caches.match(req)) || new Response("Offline", { status: 503 });
      }
    })());
    return;
  }

  // andere Assets: SWR
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    const netPromise = fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    }).catch(() => null);
    return cached || await netPromise || new Response("Offline", { status: 503 });
  })());
});

// Optional: sofortige Aktivierung per Nachricht (falls du das aus der App triggern willst)
// navigator.serviceWorker.controller?.postMessage({ type: "SKIP_WAITING" });
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});