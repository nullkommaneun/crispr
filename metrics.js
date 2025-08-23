// metrics.js — Ticker + Phasen-EMA (entities, reproduction, food, draw)

const EMA_A = 0.15; // Glättung
const phases = { entities:0, reproduction:0, food:0, draw:0 };

let _tickBeg = 0;
let _samples = 0;
let _foodCount = 0;

export function beginTick(){ _tickBeg = performance.now(); }
export function commitTick(dt, foodItems, extra){
  _samples++;
  _foodCount = foodItems|0;
  // extra (z.B. means) wird aktuell nur durchgereicht – Panel kann es lesen, wenn gewünscht
  lastExtra = extra || null;
}

let lastExtra = null;
export function getLastExtra(){ return lastExtra; }
export function getFoodCount(){ return _foodCount; }
export function getSampleCount(){ return _samples; }

// Phasenmessung
export function phaseStart(){ return performance.now(); }
export function phaseEnd(name, t0){
  const t = performance.now() - t0;
  if (name in phases){
    phases[name] = phases[name]*(1-EMA_A) + t*EMA_A;
  }
  return t;
}
export function getPhase(name){ return phases[name] || 0; }
export function getPhases(){ return { ...phases }; }

// (Optionale) Energie-Samples für Ökonomie-Panel
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