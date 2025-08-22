// food.js — Cluster-basierter Food-Spawner (Gauß), jetzt mit global +15% Spawnrate
// API: step(dt), setSpawnRate(perSec), spawnClusters(n?)

import { worldSize, addFoodItem } from "./entities.js";
import { emit } from "./event.js";

const CLUSTERS = [];
let ratePerSec = 6;         // UI-Basis (wird per setSpawnRate gesetzt)
const SPAWN_BOOST = 1.15;   // +15% global

let acc = 0;

// Cluster-Params
const CFG = {
  nClusters: 3,
  drift: 18,             // px/s
  spread: 42,            // Gauß σ
  itemRadius: 2,
  decay: 0.000,          // optionaler Zerfall
};

export function setSpawnRate(perSec){
  // Anwenderwert * globaler Boost
  ratePerSec = Math.max(0, +perSec || 0) * SPAWN_BOOST;
}

export function spawnClusters(n){
  CLUSTERS.length = 0;
  const { width:W, height:H } = worldSize();
  const k = n ?? CFG.nClusters;
  for(let i=0;i<k;i++){
    CLUSTERS.push({
      x: 40 + Math.random()*(W-80),
      y: 40 + Math.random()*(H-80),
      vx: (Math.random()*2-1) * CFG.drift,
      vy: (Math.random()*2-1) * CFG.drift,
    });
  }
  emit("food:clusters", { n: CLUSTERS.length });
}

// Gauß-Zufall
function gauss(mu=0, sigma=1){
  let u=0,v=0;
  while(u===0) u=Math.random();
  while(v===0) v=Math.random();
  const z=Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
  return mu + z*sigma;
}

function clamp(x,a,b){ return Math.max(a,Math.min(b,x)); }

export function step(dt){
  const { width:W, height:H } = worldSize();

  // Cluster drift
  for(const c of CLUSTERS){
    c.x = clamp(c.x + c.vx*dt, 20, W-20);
    c.y = clamp(c.y + c.vy*dt, 20, H-20);
    // leichte Rücklenkung zur Mitte
    c.vx += (-Math.sign(c.x-W/2))*0.3*dt;
    c.vy += (-Math.sign(c.y-H/2))*0.3*dt;
  }

  // Spawn-Akkumulator
  acc += ratePerSec * dt;

  while(acc >= 1){
    acc -= 1;

    // wähle Cluster proportional zufällig
    const c = CLUSTERS.length ? CLUSTERS[(Math.random()*CLUSTERS.length)|0] : null;
    if (!c) continue;

    // Gauß-Offset
    const ox = gauss(0, CFG.spread);
    const oy = gauss(0, CFG.spread);

    const x = clamp(c.x + ox, 4, W-4);
    const y = clamp(c.y + oy, 4, H-4);

    addFoodItem({ x, y, amount: 1.0, r: CFG.itemRadius });
    emit("food:spawn", { x, y });
  }

  // optionaler Zerfall (derzeit 0)
  if (CFG.decay > 0){
    // könnte FoodItems reduzieren; wird hier nicht benötigt
  }
}

// Initiale Cluster
spawnClusters(CFG.nClusters);