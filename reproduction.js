// reproduction.js — Paarungskontakt, Gating, Nachwuchs mit Mutation

import { getCells, spawnCell } from "./entities.js";

const PAIR_RADIUS = 32;
const REPRO_COOLDOWN = 12;
const AGE_MATURE     = 8;
let   MUT_SIGMA      = 0.07;

export function setMutationRate(pct){
  const p = Math.max(0, Math.min(100, +pct||0));
  MUT_SIGMA = 0.15 * (p/100);
}

function randn(){ let u=0,v=0; while(!u)u=Math.random(); while(!v)v=Math.random(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
function mutateGene(x){ return clamp((+x||0) + randn()*MUT_SIGMA, -1, 1); }

function canMate(a){
  if (!a) return false;
  if (a.age < AGE_MATURE) return false;
  if (a.cooldown > 0) return false;
  if (a.energy <= 15) return false;
  return true;
}

export function step(_dt){
  const cells = getCells();
  const used = new Set();

  for(let i=0;i<cells.length;i++){
    const A = cells[i];
    if (used.has(A.id)) continue;
    if (!canMate(A)) continue;

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

    const COST = 18;
    if (A.energy < COST || B.energy < COST) continue;

    const keys = ["EFF","MET","GRÖ","TEM","SCH"];
    const childG = {};
    for (const k of keys){
      const av = (+A.genome?.[k] || 0);
      const bv = (+B.genome?.[k] || 0);
      childG[k] = mutateGene( (av + bv) * 0.5 );
    }

    const cx = (A.pos.x + B.pos.x)/2;
    const cy = (A.pos.y + B.pos.y)/2;
    const sex = (Math.random()<0.5?'M':'F');
    // Stamm vom Elternteil A (oder B) übernehmen:
    const stammId = A.stammId || B.stammId || 0;

    spawnCell(childG, sex, cx, cy, 0.4, { stammId });

    A.cooldown = REPRO_COOLDOWN;
    B.cooldown = REPRO_COOLDOWN;
    A.energy = Math.max(0, A.energy - COST);
    B.energy = Math.max(0, B.energy - COST);

    used.add(A.id); used.add(B.id);
  }
}