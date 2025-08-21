// food.js — Cluster-Spawning (Gauß), flächen-/auflösungsstabil

import { CONFIG } from "./config.js";
import { emit } from "./event.js";
import { addFoodItem, getFoodItems, worldSize } from "./entities.js";

/* ==== State ==== */
let clusters = [];
let spawnRatePerSec = CONFIG.food?.baseSpawnRate ?? 6;

/* ==== Utils ==== */
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const rand=(a,b)=> a + Math.random()*(b-a);

// Baseline 1024×640
const BASE_W=1024, BASE_H=640;
function scales(){
  const { width:W, height:H } = worldSize();
  const areaScale = (W*H)/(BASE_W*BASE_H);
  const sMin = Math.max(0.6, Math.min(W,H)/BASE_H);
  return { W,H, areaScale, sMin };
}

// Box–Muller
function gaussian(){ let u=0,v=0; while(u===0) u=Math.random(); while(v===0) v=Math.random();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
function sampleGaussian2D(cx,cy,sigma){ return [ cx + gaussian()*sigma, cy + gaussian()*sigma ]; }

// Poisson
function samplePoisson(lambda){ const L=Math.exp(-lambda); let k=0,p=1; do{ k++; p*=Math.random(); }while(p>L); return k-1; }

/* ==== API ==== */
export function setSpawnRate(perSec){ spawnRatePerSec = Math.max(0, Number(perSec)||0); }

export function spawnClusters(n){
  clusters = [];
  const { W,H, sMin } = scales();
  const count = Math.max(3, Math.round((CONFIG.food.clusterCount ?? 5) * sMin));
  const drift = (CONFIG.food.clusterDrift ?? 20) * sMin;
  const sigma = (CONFIG.food.clusterSigma ?? 55) * sMin;

  for(let i=0;i<count;i++){
    clusters.push({
      x: rand(100, W-100),
      y: rand(80,  H-80),
      vx: rand(-0.6,0.6) * drift,
      vy: rand(-0.6,0.6) * drift,
      sigma,
      strength: rand(0.7,1.3)
    });
  }
}

export function step(dt){
  if(clusters.length===0) spawnClusters();

  const { W,H, areaScale, sMin } = scales();

  // drift
  const baseDrift = (CONFIG.food.clusterDrift ?? 20) * sMin;
  for(const c of clusters){
    c.vx += rand(-0.5,0.5) * baseDrift * 0.1;
    c.vy += rand(-0.5,0.5) * baseDrift * 0.1;
    const sp = Math.hypot(c.vx,c.vy), vmax = baseDrift;
    if(sp>vmax){ const s=vmax/sp; c.vx*=s; c.vy*=s; }
    c.x = clamp(c.x + c.vx*dt, 60, W-60);
    c.y = clamp(c.y + c.vy*dt, 60, H-60);
    c.vx*=0.92; c.vy*=0.92;
  }

  // Cap & Spawn
  const baseMax = CONFIG.food?.maxItems ?? 180;
  const MAX_FOOD_ITEMS = Math.max(60, Math.round(baseMax * areaScale));
  const current = getFoodItems().length;

  if(current < MAX_FOOD_ITEMS){
    const lambda = spawnRatePerSec * areaScale * dt; // flächen-skaliert
    const count = samplePoisson(lambda);
    for(let i=0;i<count;i++){
      const c = clusters[(Math.random()*clusters.length)|0];
      let [x,y] = sampleGaussian2D(c.x, c.y, c.sigma);
      x = clamp(x, 8, W-8); y = clamp(y, 8, H-8);
      addFoodItem({ x, y, amount: CONFIG.food.itemEnergy, radius: CONFIG.food.itemRadius });
      if(getFoodItems().length >= MAX_FOOD_ITEMS) break;
    }
  }

  // Engpass-Hinweis
  const avail = getFoodItems().length;
  if(avail < Math.max(10, Math.round(15*areaScale)) && Math.random()<0.02){
    emit("food:crisis", { available: avail });
  }
}