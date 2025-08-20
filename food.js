import { CONFIG } from "./config.js";
import { emit } from "./event.js";
import { addFoodItem, getFoodItems, getCells, worldSize } from "./entities.js";

let clusters = [];
let spawnRatePerSec = 12; // wird via engine gesetzt

function rand(a,b){ return a + Math.random()*(b-a); }

export function spawnClusters(n = CONFIG.food.clusterCount){
  clusters = [];
  const {width, height} = worldSize();
  for(let i=0;i<n;i++){
    clusters.push({
      x: rand(80, width-80),
      y: rand(80, height-80),
      vx: rand(-1,1), vy: rand(-1,1),
      radius: CONFIG.food.clusterRadius
    });
  }
}

export function setSpawnRate(perSec){ spawnRatePerSec = perSec; }

export function step(dt){
  if(clusters.length===0) spawnClusters();

  // drift clusters
  const {width, height} = worldSize();
  for(const c of clusters){
    // random walk
    c.vx += rand(-0.5,0.5);
    c.vy += rand(-0.5,0.5);
    const sp = CONFIG.food.clusterDrift;
    c.x += Math.max(-sp, Math.min(sp, c.vx)) * dt;
    c.y += Math.max(-sp, Math.min(sp, c.vy)) * dt;
    // clamp
    c.x = Math.max(40, Math.min(width-40, c.x));
    c.y = Math.max(40, Math.min(height-40, c.y));
  }

  // spawn food near clusters
  const totalSpawn = spawnRatePerSec * dt;
  let toSpawn = totalSpawn;
  while(toSpawn > 0){
    const c = clusters[(Math.random()*clusters.length)|0];
    const a = Math.random()*Math.PI*2;
    const r = Math.random()*c.radius;
    const x = c.x + Math.cos(a)*r;
    const y = c.y + Math.sin(a)*r;
    addFoodItem({ x, y, amount: CONFIG.food.itemEnergy, radius: CONFIG.food.itemRadius });
    toSpawn -= 1;
  }

  // crisis signal (rare)
  const available = getFoodItems().length;
  if(available < 10 && Math.random()<0.02){
    emit("food:crisis", { available });
  }

  // optional: slow decay of old food (keeps map fresh)
  // Here we let entities remove on eat; decay not needed for simplicity.
}