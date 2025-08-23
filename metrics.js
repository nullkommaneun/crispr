// metrics.js — kompatible Diagnose-API + Phasen-Instrumentierung (EMA)
//
// Neue API (für App-Ops):
//   phaseStart(), phaseEnd(name), getPhases(), getPhase(name)
//   beginTick(), commitTick(dt, foodItems, extra), readEnergyAndReset(), sampleEnergy()
//
// Legacy-API (für diag.js):
//   addSpawn(kind, count=1, energy=0)
//   getEconSnapshot(), getPopSnapshot(), getDriftSnapshot()
//   getMateSnapshot(), mateStart(), mateEnd()

import { on } from "./event.js";

/* ===== Phasen (EMA) ===== */
const EMA_A = 0.15;
const phases = { entities:0, reproduction:0, food:0, draw:0 };

export function phaseStart(){ return performance.now(); }
export function phaseEnd(name, t0){
  const t = performance.now() - t0;
  if (name in phases) phases[name] = phases[name]*(1-EMA_A) + t*EMA_A;
  return t;
}
export function getPhase(name){ return phases[name] || 0; }
export function getPhases(){ return { ...phases }; }

/* ===== Tick/Extra ===== */
let _samples = 0;
let _foodCount = 0;
let lastExtra = null;

export function beginTick(){ /* noop */ }
export function commitTick(_dt, foodItemsCount, extra){
  _samples++;
  _foodCount = foodItemsCount|0;
  lastExtra = extra || null;
  if (extra && extra.means){
    const t = performance.now()/1000;
    _geneHistory.push({ t, means: extra.means });
    if (_geneHistory.length > 600) _geneHistory.shift();
  }
}
export function getLastExtra(){ return lastExtra; }
export function getFoodCount(){ return _foodCount; }
export function getSampleCount(){ return _samples; }

/* ===== Ökonomie (Energie) ===== */
const energyAcc = { intake:0, base:0, move:0, env:0, eatSamples:0, eatHits:0 };
export function sampleEnergy({intake=0,base=0,move=0,env=0,eating=false}={}){
  energyAcc.intake += intake;
  energyAcc.base   += base;
  energyAcc.move   += move;
  energyAcc.env    += env;
  energyAcc.eatSamples++;
  if (eating) energyAcc.eatHits++;
}
export function readEnergyAndReset(){
  const out = { ...energyAcc };
  energyAcc.intake=energyAcc.base=energyAcc.move=energyAcc.env=0;
  energyAcc.eatSamples=energyAcc.eatHits=0;
  return out;
}

/* ===== Spawn/Inventory (Legacy) ===== */
const spawn = { items:0, energy:0 };
export function addSpawn(kind, count=1, energy=0){
  spawn.items  += (count|0);
  spawn.energy += (+energy||0);
}

/* ===== Population (Legacy) ===== */
const birthsTS = [];
const deathsTS = [];
let lastDeathAgeSec = 0;

on("cells:born", ()=> {
  birthsTS.push(performance.now()/1000);
  while(birthsTS.length && birthsTS[0] < birthsTS[birthsTS.length-1]-300) birthsTS.shift();
});
on("cells:died", (c)=> {
  deathsTS.push(performance.now()/1000);
  lastDeathAgeSec = (c?.age || 0);
  while(deathsTS.length && deathsTS[0] < deathsTS[deathsTS.length-1]-300) deathsTS.shift();
});

export function getPopSnapshot(){
  const now = performance.now()/1000;
  const b = birthsTS.filter(t=>t>now-60).length;
  const d = deathsTS.filter(t=>t>now-60).length;
  return { birthsPerMin:b, deathsPerMin:d, lastDeathAgeSec };
}

/* ===== Gen-Drift (Legacy) ===== */
const _geneHistory = []; // {t, means:{TEM,GRÖ,EFF,SCH,MET}}
export function getDriftSnapshot(){ return { series:_geneHistory.slice(-300) }; }

/* ===== Ökonomie-Snapshot (Legacy) ===== */
export function getEconSnapshot(){
  const e = { ...energyAcc };
  const net = e.intake - (e.base + e.move + e.env);
  const eatingQuote = e.eatSamples ? (e.eatHits / e.eatSamples) : 0;
  return {
    intake:e.intake, base:e.base, move:e.move, env:e.env,
    net, eatingQuote, samples:e.eatSamples,
    foodItems:_foodCount, spawnItems:spawn.items, spawnEnergy:spawn.energy
  };
}

/* ===== Mating (Legacy) ===== */
let _mateOpen = 0;
export function mateStart(){ _mateOpen++; }
export function mateEnd(){ if(_mateOpen>0) _mateOpen--; }

export function getMateSnapshot(){
  const d = (typeof window!=="undefined" && window.__drivesDiag) ? window.__drivesDiag : null;
  if (!d){
    return { duels:0, wins:0, winRate:0, K_DIST:0.05, R_PAIR:28, WIN:[0,0], pools:0 };
  }
  return {
    duels: d.duels|0, wins: d.wins|0, winRate:+d.winRate||0,
    K_DIST:+d.K_DIST||0.05, R_PAIR:+d.R_PAIR||28,
    WIN: Array.isArray(d.WIN)? d.WIN : [d.wins|0, d.duels|0],
    pools: d.pools|0
  };
}