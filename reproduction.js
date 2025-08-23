// reproduction.js — Paarungslogik (zeitbasiert, ressourcengekoppelt, drosselbar)
//
// Features
// - Zeitbasiertes Paarungs-Budget (pro Sekunde), nicht pro Frame
// - Budget an Ressourcenlage gekoppelt (Food/Zelle)
// - Kosten & Cooldown steigen bei großer Population (Crowding)
// - Partnerwahl stochastisch (schnell), großzügiger Radius im Mate-Modus
// - Mutation gemäß mutationRate (%)
// - Emit('cells:born', { parents:[idA,idB], child:{ id, stammId } }) für Diagnose/POOLS

import { createCell, getCells, getFoodItems } from "./entities.js";
import { CONFIG } from "./config.js";
import { emit } from "./event.js";

/* =================== API: Mutation-Rate =================== */
let mutationRate = 8; // %
export function setMutationRate(x){ mutationRate = Math.max(0, +x || 0); }
export function getMutationRate(){ return mutationRate; }

/* =================== Zeitbudget (Paarungen/s) =================== */
let pairBudget = 0;                   // kumuliert in "Paarungen"
const HARD_MAX_PER_SEC = 12;          // absolute Sicherheitsobergrenze

/* =================== Baseline für Kosten / Cooldown =================== */
const BASE = {
  COST_ENERGY: 12,    // je Elternteil (Energie)
  COOLDOWN_S:  7,     // Sekunden
  E_MIN:       10     // minimale Energie je Elternteil
};

/* =================== Helpers =================== */
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

function mutateInt(val){
  if (Math.random() < mutationRate/100){
    const dir = Math.random()<0.5 ? -1 : +1;
    return clamp(val + dir, 1, 10);
  }
  return val;
}

function recombine(a,b){
  return {
    TEM: mutateInt(Math.round((a.TEM + b.TEM)/2)),
    "GRÖ": mutateInt(Math.round((a["GRÖ"] + b["GRÖ"])/2)),
    EFF: mutateInt(Math.round((a.EFF + b.EFF)/2)),
    SCH: mutateInt(Math.round((a.SCH + b.SCH)/2)),
    MET: mutateInt(Math.round((a.MET + b.MET)/2)),
  };
}

// Wie viele Paarungen/s sind ok? -> abhängig von Pop & Food-Verfügbarkeit
function perSecLimit(pop, foodN){
  if (pop <= 0) return 0;

  const ratio = foodN / Math.max(1, pop);  // Food pro Zelle
  let base = Math.max(1, Math.round(pop * 0.01)); // ~1% der Pop pro Sekunde

  if (ratio < 0.40)      base *= 0.25;
  else if (ratio < 0.70) base *= 0.60;
  else if (ratio > 1.20) base *= 1.20;

  return Math.max(1, Math.min(HARD_MAX_PER_SEC, Math.floor(base)));
}

// Partner-Suche per Random-Sampling (O(1) im Mittel)
function findPartner(cells, A, pairR, eMin, sampledIdx, maxSamples=48){
  let best=null, bestD=Infinity;
  const N = cells.length;
  for(let k=0; k<maxSamples; k++){
    const j = (Math.random()*N)|0;
    if (sampledIdx.has(j)) continue;
    sampledIdx.add(j);

    const B = cells[j];
    if (!B || B===A) continue;
    if (A.sex===B.sex) continue;
    if (A.cooldown>0 || B.cooldown>0) continue;
    if (A.energy<eMin || B.energy<eMin) continue;

    const dx=A.pos.x-B.pos.x, dy=A.pos.y-B.pos.y;
    const d = Math.hypot(dx,dy);
    if (d<=pairR && d<bestD){ best=B; bestD=d; }
  }
  return best;
}

/* =================== Hauptschritt =================== */
export function step(dt){
  const cells = getCells();
  const foodN = getFoodItems().length;
  const pop   = cells.length;
  if (pop < 2) return;

  // 1) Zeitbasiertes Budget erhöhen
  const perSec = perSecLimit(pop, foodN);
  pairBudget += perSec * dt;

  // 2) Crowding-Anpassungen (große Pop -> höhere Kosten/Cooldown)
  const crowd = pop > 200 ? (pop > 400 ? 2.0 : 1.4) : 1.0;
  const COOLDOWN = BASE.COOLDOWN_S * crowd;                 // 7 → 14 s
  const E_MIN    = BASE.E_MIN * (crowd > 1 ? 1.2 : 1);      // 10 → 12
  const COST     = BASE.COST_ENERGY * (crowd > 1.4 ? 1.2 : 1); // 12 → 14

  // 3) Ganzzahliges Budget umsetzen; harte Tick-Grenze
  let toMake = Math.min(Math.floor(pairBudget), 8); // ≤8 Paarungen/Tick
  if (toMake <= 0) return;

  const basePairR = (CONFIG.cell?.pairDistance || 28);
  const popIdxStart = (Math.random()*pop)|0; // zufälliger Start im Array

  let made = 0;
  for (let quota=0; quota<toMake; quota++){
    // A wählen (Wrap-around-Scan ab Zufallsindex)
    let A=null;
    for (let off=0; off<pop; off++){
      const i = (popIdxStart + off) % pop;
      const cand = cells[i];
      if (!cand) continue;
      if (cand.cooldown>0) continue;
      if (cand.energy < E_MIN) continue;
      A = cand; break;
    }
    if (!A) break;

    let success=false;
    const sampled = new Set();

    // Mate-Modus → größerer Radius
    const aMate = A.__drive?.mode === "mate";
    const pairR = basePairR * (aMate ? 1.4 : 1.2);

    // Partner suchen
    const B = findPartner(cells, A, pairR, E_MIN, sampled, 64);
    if (B){
      // Kind erzeugen
      const g  = recombine(A.genome, B.genome);
      const mx = (A.pos.x+B.pos.x)/2 + (Math.random()*6-3);
      const my = (A.pos.y+B.pos.y)/2 + (Math.random()*6-3);
      const stammId = Math.random()<0.5 ? A.stammId : B.stammId;

      const child = createCell({ genome: g, pos:{x:mx,y:my}, stammId });

      // Kosten & Cooldowns
      A.energy = Math.max(0, A.energy - COST);
      B.energy = Math.max(0, B.energy - COST);
      A.cooldown = COOLDOWN;
      B.cooldown = COOLDOWN;

      // Diagnose/POOLS
      emit("cells:born", { parents:[A.id,B.id], child:{ id: child.id, stammId } });

      success = true; made++;
    }

    if (success) pairBudget -= 1;
    if (made >= 24) break; // extra Safety
  }
}