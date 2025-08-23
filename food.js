// food.js — Spawner (Uniform + Cluster) + globale Rate & Cap

import { getFoodItems, getCells } from "./entities.js";

let spawnRate = 6;           // Partikel / Sekunde (UI-Slider)
let acc = 0;                 // Akkumulator für Uniform-Spawns
let clusterT = 0;            // Zeit seit letztem Cluster
const CLUSTER_INTERVAL = 8;  // s
const CLUSTER_COUNT    = 12; // Partikel pro Cluster
const CLUSTER_R        = 80; // px

export function setSpawnRate(r){ spawnRate = Math.max(0, +r||0); }

function foodCap(){
  // adaptiv: 300 + 10·N
  const n = getCells().length|0;
  return 300 + 10*n;
}

// Poisson-artige Anzahl aus Rate·dt
function poisson(rateDt){
  const k = Math.floor(rateDt);
  if (Math.random() < (rateDt - k)) return k+1;
  return k;
}

export function step(dt){
  const foods = getFoodItems();
  const cap = foodCap();

  // Uniform-Tröpfeln
  acc += spawnRate * dt;
  let n = poisson(acc); // Anzahl, die wir gern hätten
  if (n>0){
    acc = 0; // zurücksetzen
    const toAdd = Math.max(0, Math.min(n, cap - foods.length));
    for (let i=0;i<toAdd;i++){
      foods.push({ x: Math.random()*innerW(), y: Math.random()*innerH() });
    }
  }

  // Cluster-Ereignis
  clusterT += dt;
  if (clusterT >= CLUSTER_INTERVAL){
    clusterT = 0;
    const want = CLUSTER_COUNT;
    const free = Math.max(0, cap - foods.length);
    const take = Math.min(want, free);
    if (take > 0){
      const cx = Math.random()*innerW();
      const cy = Math.random()*innerH();
      for(let i=0;i<take;i++){
        const a = Math.random()*Math.PI*2;
        const r = Math.random()*CLUSTER_R;
        foods.push({ x: cx + Math.cos(a)*r, y: cy + Math.sin(a)*r });
      }
    }
  }
}

// „sichtbare“ Fläche (ohne harte Bindung an canvas)
function innerW(){ return (document.getElementById('scene')?.width || 1024); }
function innerH(){ return (document.getElementById('scene')?.height || 640); }