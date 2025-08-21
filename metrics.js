// metrics.js — zentrale Messwert-Sammlung (Ökonomie, Paarungs-Funnel, Population, Gen-Drift)
import { on } from "./event.js";

/* ===================== ÖKONOMIE / ENERGIE ===================== */
const econ = {
  acc: { dt:0, intake:0, base:0, move:0, env:0, eatingTime:0, sampleCells:0, spawnedItems:0, spawnedEnergy:0 },
  series: [] // [{ts, intake, base, move, env, net, eatingFrac, sample, spawnedItems, spawnedEnergy, inventory}]
};

export function beginTick(){ /* no-op */ }

export function sampleEnergy({ intake=0, base=0, move=0, env=0, eating=false }){
  econ.acc.intake += intake;
  econ.acc.base   += base;
  econ.acc.move   += move;
  econ.acc.env    += env;
  econ.acc.sampleCells += 1;
  if (eating) econ.acc.eatingTime += 1;
}

/* ===================== GEN-DRIFT (Zeitreihe) ===================== */
const drift = {
  series: [] // [{ts, n, TEM, GRÖ, EFF, SCH, MET}]
};

/* commitTick: ~1x/s – verdichtet Ökonomie + optional Gen-Drift */
export function commitTick(dt, inventory, geneStats){
  econ.acc.dt += dt;
  if (econ.acc.dt < 1) return; // publiziere grob sekündlich
  const sec = econ.acc.dt;

  const intake = econ.acc.intake / sec;
  const base   = econ.acc.base   / sec;
  const move   = econ.acc.move   / sec;
  const env    = econ.acc.env    / sec;
  const net    = intake - (base + move + env);
  const eatingFrac = econ.acc.sampleCells ? (econ.acc.eatingTime / econ.acc.sampleCells) : 0;

  econ.series.push({
    ts: Date.now(),
    intake: r2(intake), base: r2(base), move: r2(move), env: r2(env),
    net: r2(net), eatingFrac: r2(eatingFrac),
    sample: econ.acc.sampleCells,
    spawnedItems: econ.acc.spawnedItems,
    spawnedEnergy: econ.acc.spawnedEnergy,
    inventory
  });
  while (econ.series.length > 120) econ.series.shift();

  // --- Gen-Drift aufnehmen (Mittelwerte) ---
  if (geneStats && geneStats.n){
    const m = geneStats.means || {};
    drift.series.push({
      ts: Date.now(),
      n:  geneStats.n,
      TEM: r2(m.TEM), "GRÖ": r2(m["GRÖ"]), EFF: r2(m.EFF), SCH: r2(m.SCH), MET: r2(m.MET)
    });
    while (drift.series.length > 180) drift.series.shift(); // ~3 Minuten
  }

  // Reset Ökonomie-Akkus
  econ.acc = { dt:0, intake:0, base:0, move:0, env:0, eatingTime:0, sampleCells:0, spawnedItems:0, spawnedEnergy:0 };
}

/* Food-Spawns (von food.js) */
export function addSpawn(items, energy){
  econ.acc.spawnedItems  += (items|0);
  econ.acc.spawnedEnergy += (energy||0);
}

/* Snapshots */
export function getEconSnapshot(){ return { v:1, kind:"econ", last: econ.series.slice(-10) }; }
export function getDriftSnapshot(){ return { v:1, kind:"drift", last: drift.series.slice(-180) }; }

/* ===================== PAARUNGS-TRICHTER ===================== */
const mateMap = new Map(); // cellId -> {t0, startDist}
const mateSeries = [];     // [{ts, dur, startDist, endDist, result}]

export function mateStart(cellId, startDist){
  mateMap.set(cellId, { t0: performance.now(), startDist: toNum(startDist) });
}
export function mateEnd(cellId, { result, endDist }){
  const m = mateMap.get(cellId); if(!m) return;
  mateMap.delete(cellId);
  const dur = (performance.now() - m.t0)/1000;
  mateSeries.push({
    ts: Date.now(),
    dur: r2(dur),
    startDist: toNum(m.startDist),
    endDist: toNum(endDist),
    result // "success" | "timeout" | "no_progress" | "progress_timeout"
  });
  while(mateSeries.length > 100) mateSeries.shift();
}
export function getMateSnapshot(){
  const since = Date.now() - 60000;
  const recent = mateSeries.filter(x=>x.ts >= since);
  const total = recent.length;
  const succ  = recent.filter(x=>x.result==="success").length;
  const succRate = total ? Math.round(100*succ/total) : 0;
  const mean = (arr,sel)=> arr.length ? (arr.reduce((s,x)=>s+sel(x),0)/arr.length) : 0;
  const avgDur   = r2(mean(recent, x=>x.dur));
  const avgStart = r2(mean(recent.filter(x=>x.startDist!=null), x=>x.startDist));
  const avgEnd   = r2(mean(recent.filter(x=>x.endDist!=null),   x=>x.endDist));
  const reasons = {
    success: succ,
    timeout: recent.filter(x=>x.result==="timeout").length,
    no_progress: recent.filter(x=>x.result==="no_progress").length,
    progress_timeout: recent.filter(x=>x.result==="progress_timeout").length
  };
  return { v:1, kind:"mate", last: recent.slice(-20), kpis: { attempts: total, success: succ, successRate: succRate, avgDur, avgStart, avgEnd, reasons } };
}

/* ===================== POPULATION ===================== */
const pop = { births: [], deaths: [] };
on("cells:born", ()=>{ pop.births.push(Date.now()); if(pop.births.length>1000) pop.births.shift(); });
on("cells:died",  (c)=>{ pop.deaths.push({ t:Date.now(), age: toNum(c?.age) }); if(pop.deaths.length>1000) pop.deaths.shift(); });

export function getPopSnapshot(){
  const since = Date.now() - 60000;
  const bpm = pop.births.filter(t=>t>=since).length;
  const dNow = pop.deaths.filter(x=>x.t>=since);
  const dpm = dNow.length;
  const meanAge = dNow.length ? r2(dNow.reduce((s,x)=>s+(x.age||0),0)/dNow.length) : 0;
  return { v:1, kind:"pop", bpm, dpm, meanDeathAge: meanAge, lastDeaths: dNow.slice(-10) };
}

/* Helpers */
const r2 = (n)=> Math.abs(n)<1e-9 ? 0 : Math.round(n*100)/100;
const toNum  = (x)=> (x==null || isNaN(x)) ? null : Number(x);