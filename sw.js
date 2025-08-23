// sw.js — vorsichtiger Cache (ohne ES-Module)
// Ziel: HTML/CSS/Icon offline-freundlich, aber KEIN Stale für .js

const CACHE_NAME = "crispr-static-v2";
const CORE = [
  "./",
  "./index.html",
  "./style.css",
  "./favicon.ico"
];

self.addEventListener("install", (e)=>{
  e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(CORE)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener("activate", (e)=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE_NAME?caches.delete(k):Promise.resolve())))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e)=>{
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;                 // nur same-origin
  // JS-Module nie aus Cache liefern:
  if (url.pathname.endsWith(".js")) return;                   // Browser default

  // Stale-while-revalidate nur für CORE-geeignete Typen:
  e.respondWith((async ()=>{
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(e.request);
    const net = fetch(e.request).then(res=>{ try{cache.put(e.request,res.clone());}catch{} return res; })
                               .catch(()=>null);
    return cached || await net || new Response("Offline", {status:503});
  })());
});