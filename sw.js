// sw.js — PWA-Cache (stale-while-revalidate) mit Rücksicht auf PF/Bootstrap
const CACHE_NAME = "crispr-cache-v4";

const CORE = [
  "./",
  "./index.html",
  "./style.css",
  "./bootstrap.js",
  "./preflight.js",
  "./engine.js",
  "./renderer.js",
  "./entities.js",
  "./reproduction.js",
  "./food.js",
  "./drives.js",
  "./editor.js",
  "./ticker.js",
  "./event.js",
  "./errorManager.js",
  "./environment.js",
  "./config.js",
  "./metrics.js",
  "./appops.js",
  "./appops_panel.js",
  "./grid.js"
];

// Install: Kernassets cachen (best effort)
self.addEventListener("install", (e)=>{
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(CORE).catch(()=>{})));
  self.skipWaiting();
});

// Activate: alte Caches löschen
self.addEventListener("activate", (e)=>{
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))))
  ;
  self.clients.claim();
});

// Fetch: PF/Bootstrap/ts immer network-first; sonst SWR
self.addEventListener("fetch", (e)=>{
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  const forceNetwork =
    url.searchParams.has("pf") ||
    url.searchParams.has("ts") ||
    /preflight\.js$/.test(url.pathname) ||
    /bootstrap\.js$/.test(url.pathname);

  e.respondWith((async ()=>{
    const cache = await caches.open(CACHE_NAME);

    if (forceNetwork) {
      try {
        const net = await fetch(req, { cache:"no-store" });
        // Bootstrap/Preflight legen wir nicht zurück in den Cache
        return net;
      } catch {
        const cached = await cache.match(req);
        return cached || new Response("Offline", {status:503, statusText:"Offline"});
      }
    }

    // Stale-While-Revalidate Standardpfad
    const cached = await cache.match(req);
    const net = fetch(req).then(res=>{ cache.put(req, res.clone()).catch(()=>{}); return res; }).catch(()=>null);
    return cached || await net || new Response("Offline", {status:503, statusText:"Offline"});
  })());
});