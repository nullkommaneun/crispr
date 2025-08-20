// drives.js – Dueling-Policy (Food/Mate/Wander) mit Online-Lernen,
// Stamm-Bias, Duellfenster, Hunger-Failsafe und Diagnose-Trace.

import { on } from "./event.js";

/* =================== Konfiguration =================== */
const LS_W = "drives_w_v1";
const LS_B = "drives_bias_v1";
const LS_MISC = "drives_misc_v1";

const LR = 0.10;          // Lernrate (Gewichte)
const L2 = 1e-4;          // L2-Regularisierung
const MAX_ABS_W = 5;      // |w|-Clip
const LR_BIAS = 0.02;     // Lernrate Stamm-Bias
const BIAS_CLIP = 2.0;

const WINDOW_SEC = 1.0;   // << kürzeres Entscheidungsfenster
const EPS = 0.10;         // ε-Exploration
const HUNGER_GATE = 0.45; // << wenn Energie/Cap < 0.45 und Food sichtbar -> Food erzwingen

/* =================== State =================== */
let w = loadJSON(LS_W) ?? initW();
let bStamm = loadJSON(LS_B) ?? {};
let misc = loadJSON(LS_MISC) ?? { duels: 0, wins: 0 };

const mem = new Map();      // cellId -> {t0, a, b, chosen, e0, forced?}
const mateTime = new Map(); // cellId -> t (sim)
let TRACE_ON = true;
const TRACE_MAX = 80;
const trace = [];           // Array von Diagnose-Einträgen

/* =================== Utils =================== */
const clamp = (x,a,b)=> Math.max(a, Math.min(b,x));
const sigmoid = (z)=> 1/(1+Math.exp(-z));
const dot = (a,b)=>{ let s=0; for(let i=0;i<a.length;i++) s+=a[i]*b[i]; return s; };
const sub = (a,b)=> a.map((v,i)=> v-b[i]);
const round2 = (n)=> Math.abs(n)<1e-6?0:Math.round(n*100)/100;

function save(){
  try{ localStorage.setItem(LS_W, JSON.stringify(w)); }catch{}
  try{ localStorage.setItem(LS_B, JSON.stringify(bStamm)); }catch{}
  try{ localStorage.setItem(LS_MISC, JSON.stringify(misc)); }catch{}
}
function loadJSON(k){ try{ const s=localStorage.getItem(k); return s?JSON.parse(s):null; }catch{return null;} }
function initW(){
  // φ-Länge 14 (siehe featuresForOption)
  return [
    0.0,   // Bias
    1.0,   // +EFF
    0.7,   // +TEM
    0.4,   // +GRÖ
    0.3,   // +SCH
   -0.9,   // -MET
    0.8,   // +Energie
   -0.4,   // -Alter
   -0.6,   // -Hazard
   -0.6,   // distFood (negativ: je näher desto besser)  << stärker
   -0.4,   // distMate
    0.1,   // neighDensity (leicht)
    0.0,   // oneHot(Food)
    0.0    // oneHot(Mate)
  ];
}

/* =================== Öffentliche API =================== */
export function initDrives(){
  on("cells:born", (payload)=>{
    const p = payload?.parents;
    const t = payload?.t ?? 0;
    if(Array.isArray(p)) for(const id of p){ mateTime.set(id, t); }
  });
  on("cells:died", (c)=> { mem.delete(c?.id); mateTime.delete(c?.id); });
}

export function setTracing(on){ TRACE_ON = !!on; }

/** Textdump der letzten Entscheidungen (zum Kopieren) */
export function getTraceText(lastN=24){
  const arr = trace.slice(-lastN);
  const wr = misc.duels ? Math.round(100 * misc.wins / misc.duels) : 0;
  const lines = [];
  lines.push(`DRIVES TRACE · duels=${misc.duels} winRate=${wr}% · pools=${Object.keys(bStamm).length}`);
  for(const t of arr){
    lines.push([
      `t0=${round2(t.t0)}s dur=${round2(t.dur)}s`,
      `cell=${t.id}(${t.name}) st=${t.st}`,
      `opt=${t.opt}${t.forced?"*":""} p=${round2(t.p)}`,
      `dE=${round2(t.dE)} E=${round2(t.e0)}→${round2(t.e1)}`,
      `dFood=${round2(t.dFood??-1)} dMate=${round2(t.dMate??-1)} haz=${round2(t.haz)}`,
      `winner=${t.win} scoreΔ=${round2(t.scoreDelta)}`
    ].join(" · "));
  }
  return lines.join("\n");
}

/** primäre Option (stabil für WINDOW_SEC) */
export function getAction(cell, t, ctx){
  let m = mem.get(cell.id);
  if(m && (t - m.t0) < WINDOW_SEC){
    return m.chosen;
  }

  // Kandidaten
  const C = candidates(cell, ctx); // {food?, mate?, wander:true}
  const opts = Object.keys(C).filter(k=>C[k]);
  if(opts.length===0) return "wander";

  // Features + Scores
  const feats = {};
  const scores = {};
  for(const o of opts){
    feats[o] = featuresForOption(cell, ctx, o);
    scores[o] = scoreOption(cell, feats[o]);
  }

  // Top-2
  const sorted = opts.slice().sort((a,b)=> scores[b]-scores[a]);
  let a = sorted[0];
  let b = sorted[1] ?? (sorted[0]==="food" ? "mate" : "food");
  let p = sigmoid((scores[a] ?? 0) - (scores[b] ?? 0));
  let chosen = (p>=0.5)? a : b;
  let forced = false;

  // HUNGER-FAILSAFE: Energie zu niedrig + Food sichtbar → Food erzwingen
  const cap = 120 * (1 + 0.08*((cell.genome?.GRÖ??5) - 5));
  const eFrac = clamp(cell.energy / cap, 0, 1);
  if(eFrac < HUNGER_GATE && C.food){
    chosen = "food";
    forced = true;
    // falls "b" auch food ist (kann bei 1 Option passieren), setze b sinnvoll
    if(b === "food") b = sorted.find(o=>o!=="food") || "wander";
    // p synthetisch: 0.75 (wir "glauben" an Food im Hungerfall)
    p = 0.75;
  }

  mem.set(cell.id, { t0: t, a, b, chosen, e0: cell.energy, forced, ctx0: snapshotCtxForTrace(ctx) });
  return chosen;
}

/** nach der Physik: Fenster schließen & lernen */
export function afterStep(cell, t, ctx){
  const m = mem.get(cell.id);
  if(!m) return;
  if((t - m.t0) < WINDOW_SEC) return;

  const e1 = cell.energy, e0 = m.e0;
  let reward = e1 - e0;

  // Paarungsbonus
  const mt = mateTime.get(cell.id);
  if(mt!=null && mt >= m.t0 && mt <= t) reward += 20;

  // winner/loser + Update
  let winner = m.chosen, loser = (m.chosen===m.a? m.b : m.a);
  if(reward < 0) { const tmp=winner; winner=loser; loser=tmp; }

  const xa = featuresForOption(cell, ctx, winner);
  const xb = featuresForOption(cell, ctx, loser);
  const x = sub(xa, xb);
  const p = sigmoid(dot(w, x));
  const y = 1;
  for(let i=0;i<w.length;i++){
    w[i] += LR * ((y - p)*x[i] - L2*w[i]);
    if(w[i] >  MAX_ABS_W) w[i] =  MAX_ABS_W;
    if(w[i] < -MAX_ABS_W) w[i] = -MAX_ABS_W;
  }
  // Stamm-Bias
  const st = String(cell.stammId??0);
  const deltaB = LR_BIAS * (y - p);
  bStamm[st] = clamp((bStamm[st] ?? 0) + deltaB, -BIAS_CLIP, BIAS_CLIP);

  misc.duels++; if(reward>=0) misc.wins++; save();

  // Trace-Eintrag
  if(TRACE_ON){
    const scA = dot(w, xa), scB = dot(w, xb);
    trace.push({
      t0: m.t0, dur: (t - m.t0), id: cell.id, name: cell.name, st: cell.stammId,
      opt: m.chosen, forced: m.forced, p,
      e0, e1, dE: (e1 - e0),
      dFood: ctx.foodDist ?? null, dMate: ctx.mateDist ?? null, haz: ctx.hazard ?? 0,
      win: winner, scoreDelta: (scA - scB)
    });
    if(trace.length > TRACE_MAX) trace.shift();
  }

  mem.delete(cell.id);
}

/* =================== intern =================== */
function candidates(cell, ctx){
  const C = { wander: true };
  if(ctx.food && ctx.foodDist != null) C.food = true;
  if(cell.cooldown<=0 && ctx.mate && ctx.mateDist != null) C.mate = true;
  return C;
}

// φ(c, ctx, option) – Länge 14
function featuresForOption(cell, ctx, option){
  const g = cell.genome;
  const z = (v)=> (v - 5)/5;

  const cap = 120 * (1 + 0.08*(g.GRÖ - 5));
  const eFrac = clamp(cell.energy / cap, 0, 1);
  const ageN = clamp(cell.age / 120, 0, 1);

  const hazard = clamp(ctx.hazard ?? 0, 0, 1);
  const normD = (d)=> {
    if(d==null) return 1;
    const base = Math.max(1, Math.min(ctx.worldMin ?? 512, 1024));
    return clamp(d / base, 0, 1);
  };
  const dFood = normD(ctx.foodDist);
  const dMate = normD(ctx.mateDist);
  const neigh = clamp((ctx.neighCount ?? 0)/8, 0, 2);

  const isFood = option==="food" ? 1 : 0;
  const isMate = option==="mate" ? 1 : 0;

  return [
    1.0,
    z(g.EFF),
    z(g.TEM),
    z(g.GRÖ),
    z(g.SCH),
    -z(g.MET),
    eFrac,
    -ageN,
    -hazard,
    dFood,
    dMate,
    neigh,
    isFood,
    isMate
  ];
}
function scoreOption(cell, phi){
  const base = dot(w, phi);
  const b = bStamm[String(cell.stammId??0)] ?? 0;
  return base + b;
}
function snapshotCtxForTrace(ctx){
  return {
    food: !!ctx.food, foodDist: ctx.foodDist ?? null,
    mate: !!ctx.mate, mateDist: ctx.mateDist ?? null,
    hazard: ctx.hazard ?? 0
  };
}