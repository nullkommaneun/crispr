// sw.js — einfacher PWA-Cache: Kernassets & Modelle (stale-while-revalidate)
const CACHE_NAME = "crispr-cache-v1";
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
  "./genealogy.js",
  "./genea.js",
  "./metrics.js",
  "./appops.js",
  "./appops_panel.js",
  "./grid.js"
];

// beim Install: Kern cachen (best effort)
self.addEventListener("install", (e)=>{
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(CORE).catch(()=>{}))
  );
  self.skipWaiting();
});

// Aktivieren: alte Caches löschen
self.addEventListener("activate", (e)=>{
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))))
  ;
  self.clients.claim();
});

// Fetch: Stale-While-Revalidate für alles aus gleichem Origin
self.addEventListener("fetch", (e)=>{
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Cross-Origin nicht anfassen
  e.respondWith((async ()=>{
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    const net = fetch(req).then(res=>{ cache.put(req, res.clone()).catch(()=>{}); return res; }).catch(()=>null);
    return cached || await net || new Response("Offline", {status:503, statusText:"Offline"});
  })());
});