// reproduction.js — Paarungskontakt, Gating, Nachwuchs mit Mutation

import { getCells, spawnCell } from "./entities.js";

/* ------------------------------ Konstanten ----------------------------- */
const PAIR_RADIUS = 32;       // Kontaktbereich
const REPRO_COOLDOWN = 12;    // s
const AGE_MATURE     = 8;     // s
let   MUT_SIGMA      = 0.07;  // std-Abweichung der Genmutation

// Mapping Slider(% 0..100) -> Sigma (0..0.15)
export function setMutationRate(pct){
  const p = Math.max(0, Math.min(100, +pct||0));
  MUT_SIGMA = 0.15 * (p/100);
}

// Box-Muller Normal
function randn(){ let u=0,v=0; while(!u)u=Math.random(); while(!v)v=Math.random(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

function mutateGene(x){ return clamp((+x||0) + randn()*MUT_SIGMA, -1, 1); }

function canMate(a){
  if (!a) return false;
  if (a.age < AGE_MATURE) return false;
  if (a.cooldown > 0) return false;
  if (a.energy <= 15) return false; // harte Untergrenze gegen „leere“ Geburten
  return true;
}

/* ------------------------------- STEP --------------------------------- */
export function step(dt){
  // Wir prüfen Kontakte innerhalb PAIR_RADIUS und paaren genau einmal pro Frame je Paar.
  const cells = getCells();
  const used  = new Set(); // IDs der bereits gepaarten Zellen in diesem Step

  for(let i=0;i<cells.length;i++){
    const A = cells[i];
    if (used.has(A.id)) continue;
    if (!canMate(A)) continue;

    // Finde nahen Partner B
    let best=null, bestD2=(PAIR_RADIUS*PAIR_RADIUS)+1;
    for(let j=0;j<cells.length;j++){
      if (i===j) continue;
      const B = cells[j];
      if (used.has(B.id)) continue;
      if (A.sex === B.sex) continue;
      if (!canMate(B)) continue;
      const dx=A.pos.x-B.pos.x, dy=A.pos.y-B.pos.y;
      const d2=dx*dx+dy*dy;
      if (d2 < bestD2 && d2 <= PAIR_RADIUS*PAIR_RADIUS) { best=B; bestD2=d2; }
    }
    if (!best) continue;

    const B = best;

    // Kosten für Eltern
    const COST = 18;
    if (A.energy < COST || B.energy < COST) { continue; }

    // Kind-Genom: Mittel + Gauß-Störung pro Gen
    const keys = ["EFF","MET","GRÖ","TEM","SCH"];
    const childG = {};
    for (const k of keys){
      const av = (+A.genome?.[k] || 0);
      const bv = (+B.genome?.[k] || 0);
      childG[k] = mutateGene( (av + bv) * 0.5 );
    }

    // Kind-Position (Mitte), Energieanteil 0.4 eMax (wird in entities abgeleitet)
    const cx = (A.pos.x + B.pos.x)/2;
    const cy = (A.pos.y + B.pos.y)/2;
    const sex = (Math.random()<0.5?'M':'F');
    spawnCell(childG, sex, cx, cy, 0.4);

    // Eltern abkühlen & Energie zahlen
    A.cooldown = REPRO_COOLDOWN;
    B.cooldown = REPRO_COOLDOWN;
    A.energy = Math.max(0, A.energy - COST);
    B.energy = Math.max(0, B.energy - COST);

    used.add(A.id); used.add(B.id);
  }
}