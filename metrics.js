// metrics.js — zentrale Messwert-Sammlung (Energie/Ökonomie, Paarungs-Funnel, Population)
import { on } from "./event.js";

/* ===================== ÖKONOMIE / ENERGIE ===================== */
// Wir akkumulieren pro Tick über eine Stichprobe (alle oder viele Zellen);
// commitTick() verdichtet ungefähr 1x/s in eine Zeitreihe.
const econ = {
  acc: { dt:0, intake:0, base:0, move:0, env:0, eatingTime:0, sampleCells:0, spawnedItems:0, spawnedEnergy:0 },
  series: [] // [{ts, intake, base, move, env, net, eatingFrac, sample, spawnedItems, spawnedEnergy, inventory}]
};

export function beginTick(){
  // nichts zu resetten außer per-second spawn-Akkus beim commit
  // (aggregation pro Tick erfolgt in sampleEnergy)
}

export function sampleEnergy({ intake=0, base=0, move=0, env=0, eating=false }){
  econ.acc.intake += intake;
  econ.acc.base   += base;
  econ.acc.move   += move;
  econ.acc.env    += env;
  econ.acc.sampleCells += 1;
  if (eating) econ.acc.eatingTime += 1; // pro Zelle & Tick: "ja" zählt 1
}

export function commitTick(dt, inventory){
  econ.acc.dt += dt;
  if (econ.acc.dt < 1) return; // nur ~1x/s publizieren

  const sec = econ.acc.dt;

  const intake = econ.acc.intake / sec;
  const base   = econ.acc.base   / sec;
  const move   = econ.acc.move   / sec;
  const env    = econ.acc.env    / sec;
  const net    = intake - (base + move + env);
  const eatingFrac = econ.acc.sampleCells ? (econ.acc.eatingTime / econ.acc.sampleCells) : 0;

  econ.series.push({
    ts: Date.now(),
    intake: round2(intake),
    base:   round2(base),
    move:   round2(move),
    env:    round2(env),
    net:    round2(net),
    eatingFrac: round2(eatingFrac),
    sample: econ.acc.sampleCells,
    spawnedItems: econ.acc.spawnedItems,
    spawnedEnergy: econ.acc.spawnedEnergy,
    inventory
  });
  while (econ.series.length > 60) econ.series.shift();

  // Reset Akkumulator
  econ.acc = { dt:0, intake:0, base:0, move:0, env:0, eatingTime:0, sampleCells:0, spawnedItems:0, spawnedEnergy:0 };
}

// Food-Spawns (von food.js)
export function addSpawn(items, energy){
  econ.acc.spawnedItems  += (items|0);
  econ.acc.spawnedEnergy += (energy||0);
}

/* Snapshot + Code */
export function getEconSnapshot(){
  return {
    v:1, kind:"econ",
    last: econ.series.slice(-10), // die letzten ~10 Sekunden
  };
}

/* ===================== PAARUNGS-TRICHTER ===================== */
const mateMap = new Map(); // cellId -> {t0, startDist}
const mateSeries = [];     // [{ts, dur, startDist, endDist, result}]

export function mateStart(cellId, startDist){
  mateMap.set(cellId, { t0: performance.now(), startDist: toNum(startDist) });
}

export function mateEnd(cellId, { result, endDist }){
  const m = mateMap.get(cellId);
  if(!m) return;
  mateMap.delete(cellId);
  const dur = (performance.now() - m.t0)/1000;
  mateSeries.push({
    ts: Date.now(),
    dur: round2(dur),
    startDist: toNum(m.startDist),
    endDist: toNum(endDist),
    result // "success" | "timeout" | "no_progress" | "progress_timeout"
  });
  while(mateSeries.length > 100) mateSeries.shift();
}

export function getMateSnapshot(){
  // Kennzahlen der letzten 60s
  const since = Date.now() - 60000;
  const recent = mateSeries.filter(x=>x.ts >= since);
  const total = recent.length;
  const succ  = recent.filter(x=>x.result==="success").length;
  const succRate = total ? Math.round(100*succ/total) : 0;

  const mean = (arr,sel)=> arr.length ? (arr.reduce((s,x)=>s+sel(x),0)/arr.length) : 0;
  const avgDur   = round2(mean(recent, x=>x.dur));
  const avgStart = round2(mean(recent.filter(x=>x.startDist!=null), x=>x.startDist));
  const avgEnd   = round2(mean(recent.filter(x=>x.endDist!=null),   x=>x.endDist));

  const reasons = {
    success: succ,
    timeout: recent.filter(x=>x.result==="timeout").length,
    no_progress: recent.filter(x=>x.result==="no_progress").length,
    progress_timeout: recent.filter(x=>x.result==="progress_timeout").length
  };

  return {
    v:1, kind:"mate",
    last: recent.slice(-20),
    kpis: { attempts: total, success: succ, successRate: succRate, avgDur, avgStart, avgEnd, reasons }
  };
}

/* ===================== POPULATION ===================== */
const pop = {
  births: [], // timestamps
  deaths: [], // {t, age}
};
on("cells:born", ()=>{ pop.births.push(Date.now()); if(pop.births.length>1000) pop.births.shift(); });
on("cells:died",  (c)=>{ pop.deaths.push({ t:Date.now(), age: toNum(c?.age) }); if(pop.deaths.length>1000) pop.deaths.shift(); });

export function getPopSnapshot(){
  const since = Date.now() - 60000;
  const bpm = pop.births.filter(t=>t>=since).length; // births/min
  const dNow = pop.deaths.filter(x=>x.t>=since);
  const dpm = dNow.length;

  const meanAge = dNow.length ? round2(dNow.reduce((s,x)=>s+(x.age||0),0)/dNow.length) : 0;

  return {
    v:1, kind:"pop",
    bpm, dpm, meanDeathAge: meanAge,
    lastDeaths: dNow.slice(-10)
  };
}

/* ===================== Helpers ===================== */
const round2 = (n)=> Math.abs(n)<1e-9 ? 0 : Math.round(n*100)/100;
const toNum  = (x)=> (x==null || isNaN(x)) ? null : Number(x);