// food.js — einfacher Spawner (Rate /s), globale Liste, dt-akkumuliert

let RATE = 6;              // Items pro Sekunde
const MAX = 400;           // Obergrenze für Food-Items (sanft begrenzt)
let acc  = 0;              // Spawn-Akkumulator

// globale Liste (für Renderer-Fallback oder andere Module)
if (!window.__FOODS) window.__FOODS = [];

// Hilfen
function canvasSize(){
  const c = document.getElementById('scene');
  if (c && c.width && c.height) return { w:c.width, h:c.height };
  // Fallback: Viewport
  return { w: document.documentElement.clientWidth|0, h: (document.documentElement.clientHeight|0) - 80 };
}
function spawnOne(){
  const { w, h } = canvasSize();
  const x = Math.max(2, Math.min(w-2, Math.random()*w));
  const y = Math.max(2, Math.min(h-2, Math.random()*h));
  window.__FOODS.push({ x, y });
}

// API
export function setSpawnRate(r){
  const v = Math.max(0, +r || 0);
  RATE = v;
}
export function getSpawnRate(){ return RATE; }

// Optional „Burst“ (z.B. für Tests)
export function spawnBurst(n=50){
  n = Math.max(0, n|0);
  for (let i=0;i<n;i++){
    if (window.__FOODS.length >= MAX) break;
    spawnOne();
  }
}

// Main step(dt): akkumuliert und spawnt ganzzahlig
export function step(dt){
  if (RATE <= 0) return;

  // sanfte Obergrenze
  if (window.__FOODS.length >= MAX) {
    // langsam ausdünnen (optional): entferne 1 Item all 0.1s bei voller Liste
    // (kein Muss – schützt nur gegen Überlauf)
    return;
  }

  acc += RATE * Math.max(0, dt || 0);
  let n = acc | 0;              // ganzzahlig
  if (n <= 0) return;
  acc -= n;

  // clamp, falls nahe MAX
  const room = Math.max(0, MAX - window.__FOODS.length);
  if (n > room) n = room;

  for (let i=0;i<n;i++) spawnOne();
}