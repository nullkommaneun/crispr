// food.js — Gauss-Cluster-Spawner (Rate /s), globale Liste, dt-akkumuliert

let RATE = 6;              // Items pro Sekunde (per Slider steuerbar)
const MAX = 400;           // Obergrenze für Food-Items (sanft begrenzt)
let acc  = 0;              // Spawn-Akkumulator

// Cluster-Konfiguration: "leichte" Cluster, kurzlebig
const CFG = {
  CLUSTERED_FRACTION: 0.65,     // Anteil der spawns, die geclustert sind
  MAX_CLUSTERS: 3,              // maximale gleichzeitige Cluster
  SIGMA_MIN_PX: 24,             // minimale Streuung (Standardabweichung)
  SIGMA_MAX_PX: 64,             // maximale Streuung
  LIFE_MIN_S: 3.0,              // Cluster-Lebensdauer min
  LIFE_MAX_S: 7.0,              // Cluster-Lebensdauer max
  EDGE_MARGIN_PX: 8             // Sicherheitsrand zum Canvas
};

// Aktive Cluster
let clusters = [];
let clusterCooldown = 0;        // Zeit bis Versuch, ein neues Cluster anzulegen

// globale Liste (für Renderer-Fallback oder andere Module)
if (!window.__FOODS) window.__FOODS = [];

// ───────────────────────────────────────────────────────────────────────────────
// Hilfen
function canvasSize(){
  const c = document.getElementById('scene');
  if (c && c.width && c.height) return { w:c.width, h:c.height };
  // Fallback: Viewport (minus Topbar-Schätzung)
  return { w: document.documentElement.clientWidth|0, h: (document.documentElement.clientHeight|0) - 80 };
}
function clamp(v, lo, hi){ return v < lo ? lo : (v > hi ? hi : v); }

// Box-Muller (Standard-Normalverteilung ~ N(0,1))
function randn(){
  let u=0, v=0;
  // vermeide 0, damit log sauber ist
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// Canvas-gebundener Random-Punkt (gleichverteilt)
function spawnUniform(){
  const { w, h } = canvasSize();
  const m = CFG.EDGE_MARGIN_PX;
  const x = clamp(Math.random() * w, m, w - m);
  const y = clamp(Math.random() * h, m, h - m);
  window.__FOODS.push({ x, y });
}

// Cluster-Logik
function createCluster(){
  const { w, h } = canvasSize();
  const m = Math.max(CFG.EDGE_MARGIN_PX, 12);
  // Zentrum nicht am Rand wählen
  const cx = clamp(Math.random() * w, m, w - m);
  const cy = clamp(Math.random() * h, m, h - m);
  const sigma = CFG.SIGMA_MIN_PX + Math.random() * (CFG.SIGMA_MAX_PX - CFG.SIGMA_MIN_PX);
  const life = CFG.LIFE_MIN_S + Math.random() * (CFG.LIFE_MAX_S - CFG.LIFE_MIN_S);
  clusters.push({ cx, cy, sigma, life });
}

function maintainClusters(dt){
  // Lebenszeit reduzieren & abgelaufene entfernen
  if (dt > 0) {
    for (let i = 0; i < clusters.length; i++) clusters[i].life -= dt;
    clusters = clusters.filter(c => c.life > 0);
  }
  // Zeitgesteuert (nicht rate-gekoppelt) gelegentlich neues Cluster
  clusterCooldown -= dt;
  if (clusterCooldown <= 0 && clusters.length < CFG.MAX_CLUSTERS) {
    // 60% Chance, ein neues Cluster anzulegen, dann Cooldown 0.9..1.9s
    if (Math.random() < 0.6) createCluster();
    clusterCooldown = 0.9 + Math.random() * 1.0;
  }
}

function spawnClustered(){
  if (clusters.length === 0) { spawnUniform(); return; }
  const { w, h } = canvasSize();
  const m = CFG.EDGE_MARGIN_PX;

  // zufälliges aktives Cluster
  const c = clusters[(Math.random() * clusters.length) | 0];
  // 2D-Normal: (cx + N(0,1)*sigma, cy + N(0,1)*sigma)
  const x = clamp(c.cx + randn() * c.sigma, m, w - m);
  const y = clamp(c.cy + randn() * c.sigma, m, h - m);
  window.__FOODS.push({ x, y });
}

// Ein Spawn nach aktuellem Modus (Cluster vs Uniform)
function spawnOneAuto(){
  const useCluster = clusters.length > 0 && Math.random() < CFG.CLUSTERED_FRACTION;
  if (useCluster) spawnClustered();
  else spawnUniform();
}

// ───────────────────────────────────────────────────────────────────────────────
// API
export function setSpawnRate(r){
  const v = Math.max(0, +r || 0);
  RATE = v;
}
export function getSpawnRate(){ return RATE; }

// Optionaler „Burst“ (z.B. für Tests) – respektiert Cluster-Logik
export function spawnBurst(n=50){
  n = Math.max(0, n|0);
  for (let i=0;i<n;i++){
    if (window.__FOODS.length >= MAX) break;
    spawnOneAuto();
  }
}

// Main step(dt): akkumuliert und spawnt ganzzahlig
export function step(dt){
  if (RATE <= 0) {
    maintainClusters(Math.max(0, dt || 0));
    return;
  }

  // sanfte Obergrenze
  if (window.__FOODS.length >= MAX) {
    // Liste ist voll → nur Cluster-Lebenszeiten updaten, kein Spawn
    maintainClusters(Math.max(0, dt || 0));
    return;
  }

  const dtsafe = Math.max(0, dt || 0);
  maintainClusters(dtsafe);

  acc += RATE * dtsafe;
  let n = acc | 0;              // ganzzahlig
  if (n <= 0) return;
  acc -= n;

  // clamp, falls nahe MAX
  const room = Math.max(0, MAX - window.__FOODS.length);
  if (n > room) n = room;

  for (let i=0;i<n;i++) spawnOneAuto();
}