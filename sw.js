// sw.js — einfacher PWA-Cache: Kernassets (stale-while-revalidate)
const CACHE_NAME = "crispr-cache-v2";

const CORE = [
  "./",
  "./index.html",
  "./style.css",

  // Bootstrap & Diagnose
  "./bootstrap.js",
  "./preflight.js",
  "./diag.js",

  // App-Engine & Simulation
  "./engine.js",
  "./entities.js",
  "./reproduction.js",
  "./food.js",
  "./drives.js",
  "./renderer.js",
  "./metrics.js",
  "./grid.js",

  // UI / Tools
  "./editor.js",
  "./environment.js",
  "./dummy.js",
  "./appops.js",
  "./appops_panel.js",

  // Infra
  "./event.js",
  "./errorManager.js",
  "./config.js",
  "./ticker.js",
  "./sw.js"
];

// Install: Kern cachen (best effort)
self.addEventListener("install", (e)=>{
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(CORE).catch(()=>{})));
  self.skipWaiting();
});

// Activate: alte Caches weg
self.addEventListener("activate", (e)=>{
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: Stale-While-Revalidate für Same-Origin
self.addEventListener("fetch", (e)=>{
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Cross-Origin ignorieren

  e.respondWith((async ()=>{
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    const net = fetch(req).then(res => { cache.put(req, res.clone()).catch(()=>{}); return res; }).catch(()=>null);
    return cached || await net || new Response("Offline", { status:503, statusText:"Offline" });
  })());
});