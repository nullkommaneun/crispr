// food.js – Cluster-Spawning mit Gauß-Verteilung, Wand-Abneigung und einstellbarer Rate
import { CONFIG } from "./config.js";
import { emit } from "./event.js";
import { addFoodItem, getFoodItems, worldSize } from "./entities.js";

/** Zustände */
let clusters = [];
let spawnRatePerSec = CONFIG.food?.baseSpawnRate ?? 6;              // per Sekunde (global)
const MAX_FOOD_ITEMS   = CONFIG.food?.maxItems ?? 180;              // Cap
const GAUSS_SIGMA_DEF  = CONFIG.food?.clusterSigma ?? 55;           // Streuung um Clusterzentrum (px)
const CLUSTER_COUNT_DEF = CONFIG.food?.clusterCount ?? 5;
const DRIFT_SPEED      = CONFIG.food?.clusterDrift ?? 20;           // px/s

/* ===== Utils ===== */
const clamp = (x,a,b)=> Math.max(a, Math.min(b,x));
const rand  = (a,b)=> a + Math.random()*(b-a);

// Box–Muller Normalverteilung N(0,1)
function gaussian(){
  let u=0,v=0;
  while(u===0) u=Math.random();
  while(v===0) v=Math.random();
  return Math.sqrt(-2*Math.log(u)) * Math.cos(2*Math.PI*v);
}
function sampleGaussian2D(cx, cy, sigma){
  return [ cx + gaussian()*sigma, cy + gaussian()*sigma ];
}

// Poisson-Sampling (Anzahl Spawns für dieses dt)
function samplePoisson(lambda){
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

// Distanz zur nächsten Wand
function nearestEdge(x,y,W,H){ return Math.min(x, W-x, y, H-y); }
// Sanfte Wand-Abneigung [0..1] (0 = direkt an Wand, 1 = weit genug weg)
function wallWeight(x,y,W,H,rad){
  const d = nearestEdge(x,y,W,H);
  const t = clamp(d / rad, 0, 1);          // 0..1
  return t*t*(3 - 2*t);                    // smoothstep
}

/* ===== Cluster-Management ===== */
export function spawnClusters(n = CLUSTER_COUNT_DEF){
  clusters.length = 0;
  const { width:W, height:H } = worldSize();
  const biasR = CONFIG.food?.wallBiasRadius ?? Math.min(W,H)*0.22; // ~22% des kleineren Maßes

  for(let i=0;i<n;i++){
    // Zentren bevorzugt fern der Wand (Rejection mit Wandgewicht)
    let x, y, ok=false, guard=0;
    while(!ok && guard++<40){
      x = rand(80, W-80);
      y = rand(60, H-60);
      if (wallWeight(x,y,W,H,biasR) > 0.55) ok = true;
    }
    if(!ok){ x = W*0.5 + rand(-W*0.15, W*0.15); y = H*0.5 + rand(-H*0.15, H*0.15); }

    const strength = rand(0.7, 1.3);
    clusters.push({
      x, y,
      vx: rand(-1,1) * DRIFT_SPEED, // px/s
      vy: rand(-1,1) * DRIFT_SPEED, // px/s
      sigma: GAUSS_SIGMA_DEF,
      strength
    });
  }
}

export function setSpawnRate(perSec){
  spawnRatePerSec = Math.max(0, Number(perSec)||0);
  emit("food:rate", { perSec: spawnRatePerSec });
}

/* Intern: gewichtete Clusterwahl (Stärke * Wandgewicht) */
function pickClusterWeighted(){
  const { width:W, height:H } = worldSize();
  const biasR = CONFIG.food?.wallBiasRadius ?? Math.min(W,H)*0.22;

  let sum = 0;
  for(const c of clusters){
    const w = wallWeight(c.x, c.y, W, H, biasR); // 0..1
    sum += c.strength * (0.35 + 0.65*w);         // Zentren nahe Wand stark abwerten
  }
  let r = Math.random()*sum;
  for(const c of clusters){
    const w = wallWeight(c.x, c.y, W, H, biasR);
    r -= c.strength * (0.35 + 0.65*w);
    if(r<=0) return c;
  }
  return clusters[0];
}

/* Intern: ein Food-Item an Clusterposition mit Wand-Bias spawnen */
function spawnOneFoodAtCluster(c){
  const { width:W, height:H } = worldSize();
  const biasR = CONFIG.food?.wallBiasRadius ?? Math.min(W,H)*0.22;

  for(let tries=0; tries<6; tries++){
    let [x,y] = sampleGaussian2D(c.x, c.y, c.sigma);
    x = clamp(x, 8, W-8); y = clamp(y, 8, H-8);
    const w = wallWeight(x,y,W,H,biasR);              // 0..1
    if(Math.random() < w){                            // Ablehnung nahe Wand
      addFoodItem({ x, y, amount: CONFIG.food.itemEnergy, radius: CONFIG.food.itemRadius });
      return true;
    }
  }
  // Fallback: Richtung Zentrum schieben
  const cx = W*0.5, cy = H*0.5;
  const nx = c.x + (cx - c.x) * 0.35;
  const ny = c.y + (cy - c.y) * 0.35;
  let [x,y] = sampleGaussian2D(nx, ny, c.sigma*0.8);
  x = clamp(x, 8, W-8); y = clamp(y, 8, H-8);
  addFoodItem({ x, y, amount: CONFIG.food.itemEnergy, radius: CONFIG.food.itemRadius });
  return true;
}

/* ===== Haupt-Step ===== */
export function step(dt){
  if(clusters.length===0) spawnClusters();

  const { width:W, height:H } = worldSize();
  const biasR = CONFIG.food?.wallBiasRadius ?? Math.min(W,H)*0.22;

  // Cluster-Drift: sanft, mit Push weg von der Wand
  for(const c of clusters){
    // leichtes Rauschen als Beschleunigung
    c.vx += rand(-0.5, 0.5) * DRIFT_SPEED * 0.1;
    c.vy += rand(-0.5, 0.5) * DRIFT_SPEED * 0.1;

    // Weg-von-Wand-Drift proportional zur Wandnähe
    const d = nearestEdge(c.x, c.y, W, H);
    if (d < biasR){
      const ux = (W*0.5 - c.x), uy = (H*0.5 - c.y);
      const L = Math.hypot(ux,uy) || 1;
      const k = (1 - d/biasR);                  // 0..1, nahe Wand groß
      c.vx += (ux/L) * DRIFT_SPEED * 0.6 * k;
      c.vy += (uy/L) * DRIFT_SPEED * 0.6 * k;
    }

    // Speedlimit & Integration
    const speed = Math.hypot(c.vx, c.vy);
    const vmax = DRIFT_SPEED;
    if(speed > vmax){ const s = vmax/speed; c.vx*=s; c.vy*=s; }

    c.x = clamp(c.x + c.vx*dt, biasR*0.5, W - biasR*0.5);
    c.y = clamp(c.y + c.vy*dt, biasR*0.5, H - biasR*0.5);

    // Dämpfung
    c.vx *= 0.92; c.vy *= 0.92;
  }

  // Cap gegen Überflutung
  const current = getFoodItems().length;
  if(current >= MAX_FOOD_ITEMS){
    if(Math.random()<0.01) emit("food:crisis", { available: current });
    return;
  }

  // Stochastischer Spawn (Poisson) – globale Rate per Sekunde
  const lambda = spawnRatePerSec * dt;
  const count = samplePoisson(lambda);
  if(count<=0) return;

  for(let k=0;k<count;k++){
    if(getFoodItems().length >= MAX_FOOD_ITEMS) break;
    const c = pickClusterWeighted();
    spawnOneFoodAtCluster(c);
  }

  // Knapper Bestand → seltene Warnung
  const avail = getFoodItems().length;
  if(avail < 8 && Math.random()<0.02){
    emit("food:crisis", { available: avail });
  }
}