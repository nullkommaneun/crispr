import { CONFIG } from "./config.js";
import { emit } from "./event.js";
import { addFoodItem, getFoodItems, worldSize } from "./entities.js";

/**
 * Ziele:
 * - Weniger Gesamt-Food (hartes Cap + geringere Standardrate)
 * - Räumliche Verteilung per 2D-Gauß (Hotspots = Clusterzentren)
 * - Poisson-Spawn (realistischere, “stotterfreie” Raten)
 * - Leichte Cluster-Wanderung wie bisher
 */

let clusters = [];
let spawnRatePerSec = 6;              // Standard: deutlich niedriger als zuvor
const MAX_FOOD_ITEMS = 180;           // Hartes Cap gegen Überflutung
const GAUSS_SIGMA_DEFAULT = 55;       // Streuung um Clusterzentrum (px)
const DRIFT_MAX = Math.max(10, CONFIG.food.clusterDrift ?? 20);

// Helper
function rand(a,b){ return a + Math.random()*(b-a); }
function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }

// 2D-Gauß (Box–Muller)
function gaussian(){ // ~N(0,1)
  let u=0, v=0;
  while(u===0) u=Math.random();
  while(v===0) v=Math.random();
  return Math.sqrt(-2*Math.log(u)) * Math.cos(2*Math.PI*v);
}
function sampleGaussian2D(cx, cy, sigma){
  return [ cx + gaussian()*sigma, cy + gaussian()*sigma ];
}

// Poisson-Sampling für Spawn-Anzahl dieses Frames
function samplePoisson(lambda){
  // Knuth-Algorithmus (ok für kleine lambda)
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

export function spawnClusters(n = CONFIG.food.clusterCount ?? 5){
  clusters = [];
  const {width, height} = worldSize();
  for(let i=0;i<n;i++){
    clusters.push({
      x: rand(100, width-100),
      y: rand(80,  height-80),
      vx: rand(-0.6, 0.6),
      vy: rand(-0.6, 0.6),
      sigma: (CONFIG.food.clusterSigma ?? GAUSS_SIGMA_DEFAULT),
      strength: rand(0.7, 1.3) // Gewichtung: manche Cluster “reicher”
    });
  }
}

export function setSpawnRate(perSec){
  // Interpretieren als Gesamt-λ über alle Cluster
  spawnRatePerSec = Math.max(0, perSec);
}

function pickClusterWeighted(){
  let sum = 0;
  for(const c of clusters) sum += c.strength;
  let r = Math.random()*sum;
  for(const c of clusters){ r -= c.strength; if(r<=0) return c; }
  return clusters[0];
}

export function step(dt){
  if(clusters.length===0) spawnClusters();

  // Cluster-Drift (sanfter als vorher)
  const {width, height} = worldSize();
  for(const c of clusters){
    c.vx = clamp(c.vx + rand(-0.2,0.2), -1, 1);
    c.vy = clamp(c.vy + rand(-0.2,0.2), -1, 1);
    c.x = clamp(c.x + c.vx * DRIFT_MAX * dt, 60, width-60);
    c.y = clamp(c.y + c.vy * DRIFT_MAX * dt, 60, height-60);
  }

  // Cap: zu viele Items → kein Spawn
  const current = getFoodItems().length;
  if(current >= MAX_FOOD_ITEMS){
    // seltene “Engpass/Überfluss”-Meldungen
    if(Math.random()<0.01) emit("food:crisis", { available: current });
    return;
  }

  // Poisson-Anzahl für dieses dt
  const lambda = spawnRatePerSec * dt;
  const count = samplePoisson(lambda);
  if(count<=0) return;

  // Spawn per Gauß um zufällig (gewichteten) Cluster
  for(let k=0;k<count;k++){
    const c = pickClusterWeighted();
    let [x,y] = sampleGaussian2D(c.x, c.y, c.sigma);
    x = clamp(x, 8, width-8);
    y = clamp(y, 8, height-8);
    addFoodItem({
      x, y,
      amount: CONFIG.food.itemEnergy,
      radius: CONFIG.food.itemRadius
    });
  }

  // Niedriger Bestand → seltene Warnung
  const avail = getFoodItems().length;
  if(avail < 8 && Math.random()<0.02){
    emit("food:crisis", { available: avail });
  }
}