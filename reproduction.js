// reproduction.js — Paarungslogik (zeitbasiert, ressourcengekoppelt, drosselbar)

import { createCell, getCells, getFoodItems } from "./entities.js";
import { CONFIG } from "./config.js";
import { emit } from "./event.js";

let mutationRate = 8;
export function setMutationRate(x){ mutationRate = Math.max(0, +x || 0); }
export function getMutationRate(){ return mutationRate; }

// ==== Drosselung: Budget in "Paarungen pro Sekunde"
let pairBudget = 0;                   // kumuliertes Budget (in Paarungen)
const HARD_MAX_PER_SEC = 12;          // Obergrenze (safety)

// Basiskosten/Cooldown (werden unten dynamisch angepasst)
const BASE = {
  COST_ENERGY: 12,    // je Elternteil (fixe, konservative Kosten)
  COOLDOWN_S:  7,     // Basis-Cooldown (wird bei hoher Pop verlängert)
  E_MIN:       10     // minimale Energie (absolut) je Elternteil
};

// Hilfen
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

// Mutationshelfer (diskret, ±1, mit rate %)
function mutateInt(val){
  if (Math.random() < mutationRate/100){
    const dir = Math.random() < 0.5 ? -1 : +1;
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

// Wie viele Paarungen pro Sekunde sind ok? -> abhängig von Pop & Food-Verfügbarkeit
function perSecLimit(pop, foodN){
  if (pop <= 0) return 0;
  const ratio = foodN / Math.max(1, pop);      // Food pro Zelle
  // Basis: ~1% der Pop pro Sekunde (aber gedeckelt)
  let base = Math.max(1, Math.round(pop * 0.01));      // 1%/s
  // Ressourcen-Kopplung: wenig Food → stark runter, viel Food → leicht rauf
  if (ratio < 0.4)      base *= 0.25;
  else if (ratio < 0.7) base *= 0.60;
  else if (ratio > 1.2) base *= 1.20;

  // Hartdeckel
  return Math.max(1, Math.min(HARD_MAX_PER_SEC, Math.floor(base)));
}

// Partner-Suche (stochastisch, O(1) im Mittel): einige Zufallsproben
function findPartner(cells, A, pairR, eMin, sampledIdx, maxSamples=40){
  let best=null, bestD=Infinity;
  const N = cells.length;
  for(let k=0; k<maxSamples; k++){
    const j = Math.floor(Math.random()*N);
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

export function step(dt){
  const cells = getCells();
  const foodN = getFoodItems().length;
  const pop = cells.length;
  if (pop < 2) return;

  // 1) Budget erhöhen (zeitbasiert)
  const perSec = perSecLimit(pop, foodN);
  pairBudget += perSec * dt;

  // Zusatz: Wenn Pop sehr groß, Cooldown erhöhen & Energie-Minimum anheben
  const crowd = pop > 200 ? (pop > 400 ? 2.0 : 1.4) : 1.0;
  const COOLDOWN = BASE.COOLDOWN_S * crowd;            // 7s → bis 14s
  const E_MIN    = BASE.E_MIN * (crowd > 1 ? 1.2 : 1); // 10 → 12 bei hoher Pop
  const COST     = BASE.COST_ENERGY * (crowd > 1.4 ? 1.2 : 1); // 12 → 14 bei sehr hoher Pop

  // 2) Pro Tick nur ganzzahlige Budgets umsetzen, außerdem Limit pro Tick
  let toMake = Math.min(Math.floor(pairBudget), 8); // ≤8 Paarungen pro Tick (Safety)
  if (toMake <= 0) return;

  // 3) Pärchen bilden (stochastisch), Pair-Radius leicht großzügiger wenn A/B im Mate-Modus
  let made = 0;
  const triesPerPair = 2; // zwei Anläufe je Paar, um unnötige Vollscans zu vermeiden

  // optional: Pair-Distanz-Grundwert
  const basePairR = (CONFIG.cell?.pairDistance || 28);

  // zufällige Startreihenfolge (leichter Shuffle)
  const startIdx = Math.floor(Math.random()*pop);

  for (let quota=0; quota<toMake; quota++){
    // Wähle A per Scan mit Wrap-around
    let A=null, ai=-1;
    for (let off=0; off<pop; off++){
      const i=(startIdx+off)%pop;
      const cand=cells[i];
      if (!cand || cand.cooldown>0 || cand.energy<E_MIN) continue;
      A=cand; ai=i; break;
    }
    if (!A) break; // niemand geeignet

    let success=false;
    for (let attempt=0; attempt<triesPerPair && !success; attempt++){
      const sampled = new Set();
      const aMate = A.__drive?.mode === "mate";
      // Paar-Radius: wenn einer im Mate-Modus ist → 1.4×, sonst 1.2×
      const pairR = basePairR * (aMate ? 1.4 : 1.2);

      const B = findPartner(cells, A, pairR, E_MIN, sampled, 60);
      if (!B) continue;

      // Erzeuge Kind (einfaches Recombine + Mutation)
      const g = recombine(A.genome, B.genome);
      const mx = (A.pos.x+B.pos.x)/2 + (Math.random()*6-3);
      const my = (A.pos.y+B.pos.y)/2 + (Math.random()*6-3);
      const stammId = Math.random()<0.5 ? A.stammId : B.stammId;

      createCell({ genome: g, pos:{x:mx,y:my}, stammId });

      // Kosten & Cooldown
      A.energy = Math.max(0, A.energy - COST);
      B.energy = Math.max(0, B.energy - COST);
      A.cooldown = COOLDOWN;
      B.cooldown = COOLDOWN;

      emit("cells:born", { parents:[A.id,B.id] });
      success = true; made++;
    }
    // Budget nur bei Erfolg abbuchen (verhindert „Verschwinden“)
    if (success) pairBudget -= 1;
    // Schutz vor endlosen Schleifen
    if (made >= 24) break;
  }
}