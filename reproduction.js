/**
 * reproduction.js — Paarung/Mutation (leichtgewichtig, real)
 * Exports: step(dt), setMutationRate(v), getMutationRate(), scheduleStartPush(opts)
 *
 * Logik:
 *  - Partnerwahl pragmatisch: M/F, erwachsen, genug Energie, Cooldown=0, nahe beisammen
 *  - Spawn: Kind nahe Elternmittelpunkt, Gene = Mittelwert ± Mutation (Gauss), Sex zufällig
 *  - Kosten: Energieabzug bei Eltern, Cooldown
 */

import { getCells, spawnChild } from "./entities.js";

let _mutationRate = 8;   // % (UI-Default)
let _startPush = null;   // { perParent:number, interval:number, t:number, done:boolean } | null

const CFG = {
  PAIR_DIST: 16,          // Annäherung für Paarung
  ADULT_AGE: 12,          // muss mit entities.js (JUV_AGE_S) harmonieren
  ENERGY_MIN_REL: 0.55,   // mind. 55% Energie für Paarung
  ENERGY_COST: 24,        // Energieabzug je Elternteil
  COOLDOWN_S: 8,          // Paarungs-Cooldown (s)
  MAX_BIRTHS_PER_TICK: 2  // Tick-Limit (Performance & Balance)
};

function clamp(v, lo, hi){ return v < lo ? lo : (v > hi ? hi : v); }
function randn(){
  // Box-Muller
  let u=0, v=0; while(u===0) u=Math.random(); while(v===0) v=Math.random();
  return Math.sqrt(-2.0*Math.log(u)) * Math.cos(2.0*Math.PI*v);
}

export function setMutationRate(v){
  const n = Math.max(0, Math.min(100, (v|0)));
  _mutationRate = n;
}
export function getMutationRate(){ return _mutationRate|0; }

export function scheduleStartPush(opts){
  const perParent = Math.max(0, opts?.perParent|0);
  const interval  = Math.max(0.1, +opts?.interval || 0.75);
  _startPush = { perParent, interval, t: 0, done:false };
}

function mutateGene(x){
  // σ skaliert mit Mutationsrate: 0.03 .. 0.10
  const sigma = 0.03 + 0.07 * (_mutationRate / 100);
  return clamp(x + randn()*sigma, 0, 1);
}

function recombineGenes(ga, gb){
  const child = {
    EFF: mutateGene((ga.EFF ?? 0.5 + gb.EFF ?? 0.5)/2),
    MET: mutateGene((ga.MET ?? 0.5 + gb.MET ?? 0.5)/2),
    SCH: mutateGene((ga.SCH ?? 0.5 + gb.SCH ?? 0.5)/2),
    TEM: mutateGene((ga.TEM ?? 0.5 + gb.TEM ?? 0.5)/2),
    "GRÖ": mutateGene(((ga["GRÖ"] ?? ga.GRO ?? 0.5) + (gb["GRÖ"] ?? gb.GRO ?? 0.5))/2)
  };
  return child;
}

function eligible(c){
  return c.age >= CFG.ADULT_AGE &&
         (c.cooldown||0) <= 0 &&
         (c.energyRel || (c.energy/140)) >= CFG.ENERGY_MIN_REL;
}

export function step(dt){
  // 0) optionale Start-Impulse (nur Timer, keine harte Kopplung)
  if (_startPush && !_startPush.done){
    _startPush.t += Math.max(0, +dt || 0);
    if (_startPush.t >= _startPush.interval){
      _startPush.t = 0;
      _mutationRate = Math.max(_mutationRate, 8);
      _startPush.perParent--;
      if (_startPush.perParent <= 0) _startPush.done = true;
    }
  }

  const cells = getCells();
  if (!cells || cells.length < 2) return;

  // 1) schnelle Partition in M/F + Eligibility
  const males = [];
  const females = [];
  for (let i=0;i<cells.length;i++){
    const c = cells[i];
    c.energyRel = (c.energy / 140); // kleine Hilfszahl
    if (!eligible(c)) continue;
    if (c.sex === "M") males.push(c);
    else if (c.sex === "F") females.push(c);
  }
  if (!males.length || !females.length) return;

  // 2) Paare finden (naiv, aber begrenzt)
  let births = 0;
  const used = new Set(); // IDs, die schon gepaart wurden in diesem Tick

  for (let i=0;i<males.length && births < CFG.MAX_BIRTHS_PER_TICK;i++){
    const m = males[i];
    if (used.has(m.id)) continue;

    // bevorzugt Partnerinnen, die "wantMate" signalisiert haben
    let bestF = null, bestD2 = CFG.PAIR_DIST * CFG.PAIR_DIST;

    for (let j=0;j<females.length;j++){
      const f = females[j];
      if (used.has(f.id)) continue;
      const dx = f.pos.x - m.pos.x, dy = f.pos.y - m.pos.y;
      const d2 = dx*dx + dy*dy;
      if (d2 <= bestD2){
        // Bonus, wenn beiden "wantMate" gesetzt haben
        const bonus = ((m.drive?.wantMate?1:0) + (f.drive?.wantMate?1:0));
        // Für gleiche Distanz gewinnt höherer Bonus (einfach)
        if (!bestF || bonus > ((bestF.drive?.wantMate?1:0) + (m.drive?.wantMate?1:0))) {
          bestD2 = d2; bestF = f;
        } else {
          bestD2 = d2; bestF = f;
        }
      }
    }

    if (!bestF) continue;

    // 3) Kosten & Cooldown
    m.energy = Math.max(0, m.energy - CFG.ENERGY_COST);
    bestF.energy = Math.max(0, bestF.energy - CFG.ENERGY_COST);
    m.cooldown = CFG.COOLDOWN_S;
    bestF.cooldown = CFG.COOLDOWN_S;

    // 4) Kind erzeugen – Gene: Mittelwert ± Mutation
    const genes = recombineGenes(m.genes || {}, bestF.genes || {});
    const x = (m.pos.x + bestF.pos.x)/2 + (Math.random()*2-1)*6;
    const y = (m.pos.y + bestF.pos.y)/2 + (Math.random()*2-1)*6;
    spawnChild(x, y, genes, Math.random()<0.5 ? "M" : "F");

    used.add(m.id); used.add(bestF.id);
    births++;
  }
}