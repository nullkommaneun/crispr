// food.js — einfaches, stabiles Food-Spawn + Aufnahme-Yield

let _spawnRate = 6;          // Items pro Sekunde (vom Slider)
const _items = [];           // deine bestehende Liste ggf. weiterverwenden
const YIELD = 35;            // Energie pro Item

// Accumulator für sauberen Spawn in festen Ticks
let _acc = 0;
const SPAWN_TICK = 0.25;     // alle 250ms spawnen wir anteilig

export function setSpawnRate(v){
  _spawnRate = Math.max(0, +v || 0);
}

export function step(dt){
  // Anteilig Items anlegen: pro TICK -> rate*TICK Items
  _acc += dt;
  while (_acc >= SPAWN_TICK){
    _acc -= SPAWN_TICK;
    const toSpawn = _spawnRate * SPAWN_TICK;
    spawnFractional(toSpawn);
  }
}

// Hilfsfunktion: fractional spawn (z. B. 1.5 -> 1 + 50%-Chance auf weiteres)
function spawnFractional(x){
  const base = Math.floor(x);
  const frac = x - base;
  for (let i=0;i<base;i++) spawnOne();
  if (Math.random() < frac) spawnOne();
}

function spawnOne(){
  // Platziere Item zufällig im Sichtbereich. Nutze deine Weltgröße, falls vorhanden.
  const canvas = document.getElementById("scene");
  if (!canvas) return;
  const x = Math.random() * canvas.width;
  const y = Math.random() * canvas.height;
  _items.push({ x, y, e:YIELD });
}

// Von Renderer/Engine abgefragt:
export function getFoodItems(){ return _items; }

// Aufnahme durch Zelle (Engine/Entities sollten diese Funktion rufen,
// wenn Kollisions-Test sagt: Zelle frisst Food)
export function consumeClosest(x,y, radius=10){
  let best=-1, bestD2=radius*radius, got=0;
  for (let i=0;i<_items.length;i++){
    const f=_items[i], dx=f.x-x, dy=f.y-y, d2=dx*dx+dy*dy;
    if (d2 <= bestD2){ bestD2=d2; best=i; }
  }
  if (best>=0){ got=_items[best].e; _items.splice(best,1); }
  return got; // Energiemenge
}