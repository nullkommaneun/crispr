// reproduction.js — Paarungslogik (großzügiger, Mate-first-tauglich)

import { createCell, getCells } from "./entities.js";
import { CONFIG } from "./config.js";
import { emit } from "./event.js";

let mutationRate = 8;
export function setMutationRate(x){ mutationRate = Math.max(0, +x||0); }
export function getMutationRate(){ return mutationRate; }

const T = {
  COOLDOWN_SEC: 6.0,      // vorher oft >8–10s
  ENERGY_COST:  6.0,      // je Elternteil
  E_MIN:        8.0       // minimale Energie für Paarung
};

function mutateInt(val){
  // mittlere Mutation: Chance proportional zur Rate
  if (Math.random() < mutationRate/100){
    const dir = Math.random()<0.5 ? -1 : +1;
    return Math.max(1, Math.min(10, val + dir));
  }
  return val;
}

function recombine(a,b){
  return {
    TEM: mutateInt(Math.round((a.TEM + b.TEM)/2)),
    "GRÖ": mutateInt(Math.round((a["GRÖ"] + b["GRÖ"])/2)),
    EFF: mutateInt(Math.round((a.EFF + b.EFF)/2)),
    SCH: mutateInt(Math.round((a.SCH + b.SCH)/2)),
    MET: mutateInt(Math.round((a.MET + b.MET)/2))
  };
}

export function step(dt){
  const cells = getCells();
  if (cells.length < 2) return;

  const paired = new Set();
  // Maximal N/4 Paare pro Tick (konservativ)
  let quota = Math.max(1, Math.floor(cells.length / 4));

  // einfache Shuffle-Reihenfolge
  const idx = cells.map((_,i)=>i);
  for(let i=idx.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [idx[i],idx[j]]=[idx[j],idx[i]]; }

  for (const ii of idx){
    if (quota<=0) break;
    const A = cells[ii];
    if (!A || paired.has(A.id) || A.cooldown>0 || A.energy<T.E_MIN) continue;

    // Suche besten Partner in Reichweite
    let best=null, bestD=Infinity;
    for (const jj of idx){
      if (ii===jj) continue;
      const B = cells[jj];
      if (!B || paired.has(B.id) || B.cooldown>0 || B.energy<T.E_MIN) continue;
      if (A.sex===B.sex) continue;

      // Paar-Distanz mit Toleranz:
      let pairR = CONFIG.cell.pairDistance || 28;
      // Großzügiger, wenn 1+ im Mate-Modus:
      const aMate = A.__drive?.mode === "mate";
      const bMate = B.__drive?.mode === "mate";
      if (aMate || bMate) pairR *= 1.6; else pairR *= 1.25;

      const dx=A.pos.x-B.pos.x, dy=A.pos.y-B.pos.y;
      const d = Math.hypot(dx,dy);
      if (d<=pairR && d<bestD){ best=B; bestD=d; }
    }

    if (!best) continue;

    // Paarung ausführen
    const B = best;
    const childGenome = recombine(A.genome, B.genome);
    const mx = (A.pos.x+B.pos.x)/2 + (Math.random()*6-3);
    const my = (A.pos.y+B.pos.y)/2 + (Math.random()*6-3);
    const stammId = Math.random()<0.5 ? A.stammId : B.stammId;

    createCell({ genome: childGenome, pos:{x:mx,y:my}, stammId });

    // Kosten & Cooldowns
    A.energy = Math.max(0, A.energy - T.ENERGY_COST);
    B.energy = Math.max(0, B.energy - T.ENERGY_COST);
    A.cooldown = T.COOLDOWN_SEC;
    B.cooldown = T.COOLDOWN_SEC;

    paired.add(A.id); paired.add(B.id);
    quota--;
    emit("cells:born", { parents:[A.id,B.id] });
  }
}