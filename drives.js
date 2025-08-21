// drives.js – Dueling-Policy (Food/Mate/Wander) mit Online-Lernen,
// Stamm-Bias, dynamischem (distanzbasiertem) Duellfenster, Hunger-Failsafe
// und Diagnose-Trace.

import { on } from "./event.js";
import { CONFIG } from "./config.js";

/* ===== Konfiguration ===== */
const LS_W    = "drives_w_v1";
const LS_B    = "drives_bias_v1";
const LS_MISC = "drives_misc_v1";

const LR        = 0.10;   // Lernrate
const L2        = 1e-4;   // L2-Regularisierung
const MAX_ABS_W = 5;      // |w|-Clip
const LR_BIAS   = 0.02;   // Stamm-Bias-Lernrate
const BIAS_CLIP = 2.0;

const WIN_BASE   = 0.60;  // Basiskorridor (s)
const WIN_MIN    = 0.45;  // min Fenster (s)
const WIN_MAX    = 1.60;  // max Fenster (s)
const SPEED_SAFETY = 0.75;// Sicherheitsfaktor auf v (Reibung/Steering)
const EPS        = 0.10;  // ε-Exploration
const HUNGER_GATE= 0.45;  // Energie/Cap < 45% → Food erzwingen
const EARLY_DE_ABS = 2.0; // Early-Close bei |ΔE| ≥ 2
const K_DIST     = 0.25;  // Reward-Gewicht pro gewonnener Pixel Distanz zu Food

/* ===== State ===== */
let w      = loadJSON(LS_W)    ?? initW();
let bStamm = loadJSON(LS_B)    ?? {};
let misc   = loadJSON(LS_MISC) ?? { duels:0, wins:0 };

const mem = new Map();  // cellId -> {tAccum,tMax,a,b,chosen,e0,forced,ctx0,mated}
let TRACE_ON = true;
const TRACE_MAX = 80;
const trace = [];

/* ===== Utils ===== */
const clamp =(x,a,b)=> Math.max(a, Math.min(b,x));
const sigmoid=(z)=> 1/(1+Math.exp(-z));
const dot   =(a,b)=>{ let s=0; for(let i=0;i<a.length;i++) s+=a[i]*b[i]; return s; };
const sub   =(a,b)=> a.map((v,i)=> v-b[i]);
const r2    =(n)=> Math.abs(n)<1e-6 ? 0 : Math.round(n*100)/100;
function save(){ try{ localStorage.setItem(LS_W,JSON.stringify(w)); }catch{} try{ localStorage.setItem(LS_B,JSON.stringify(bStamm)); }catch{} try{ localStorage.setItem(LS_MISC,JSON.stringify(misc)); }catch{} }
function loadJSON(k){ try{ const s=localStorage.getItem(k); return s?JSON.parse(s):null; }catch{ return null; } }
function initW(){
  // φ-Länge 14 (Gene, Zustand, Distanzen, Nachbarn, One-Hot)
  return [
    0.0,  // Bias
    1.0,  // +EFF
    0.7,  // +TEM
    0.4,  // +GRÖ
    0.3,  // +SCH
   -0.9,  // -MET
    0.8,  // +Energie
   -0.4,  // -Alter
   -0.6,  // -Hazard
   -0.6,  // distFood
   -0.4,  // distMate
    0.1,  // neighDensity
    0.0,  // oneHot(Food)
    0.0   // oneHot(Mate)
  ];
}

/* ===== Events: Paarung markieren ===== */
on("cells:born", (payload)=>{
  const p = payload && payload.parents;
  if(Array.isArray(p)){
    for(const id of p){ const m = mem.get(id); if(m) m.mated = true; }
  }
});

/* ===== Public API ===== */
export function initDrives(){ /* NOP */ }
export function setTracing(on){ TRACE_ON = !!on; }
export function getTraceText(lastN=24){
  const arr = trace.slice(-lastN);
  const wr  = misc.duels ? Math.round(100*misc.wins/misc.duels) : 0;
  const lines = [];
  lines.push(`DRIVES TRACE · duels=${misc.duels} winRate=${wr}% · pools=${Object.keys(bStamm).length}`);
  for(const t of arr){
    lines.push([
      `dur=${r2(t.dur)}s`,
      `cell=${t.id}(${t.name}) st=${t.st}`,
      `opt=${t.opt}${t.forced?"*":""} p=${r2(t.p)}`,
      `dE=${r2(t.dE)} E=${r2(t.e0)}→${r2(t.e1)}`,
      `dFood=${r2(t.dFoodNow??-1)} dMate=${r2(t.dMate??-1)} haz=${r2(t.haz)}`,
      `winner=${t.win} scoreΔ=${r2(t.scoreDelta)}`
    ].join(" · "));
  }
  return lines.join("\n");
}

/** Primäre Option wählen; stabil bis Fenster-Ende. */
export function getAction(cell, _t, ctx){
  const m = mem.get(cell.id);
  if(m && m.tAccum < (m.tMax ?? WIN_BASE)) return m.chosen;

  // Kandidaten
  const C = candidates(cell, ctx);
  const opts = Object.keys(C).filter(k=>C[k]);
  if(opts.length===0) return "wander";

  // Scores
  const feats={}, scores={};
  for(const o of opts){ feats[o]=featuresForOption(cell,ctx,o); scores[o]=scoreOption(cell,feats[o]); }
  const sorted = opts.slice().sort((a,b)=> scores[b]-scores[a]);

  let a = sorted[0];
  let b = sorted[1] ?? (sorted[0]==="food" ? "mate" : "food");
  let p = sigmoid((scores[a]||0)-(scores[b]||0));
  let chosen = (p>=0.5)? a : b;
  let forced = false;

  // Hunger-Failsafe
  const cap = 120 * (1 + 0.08*((cell.genome?.GRÖ??5) - 5));
  const eFrac = clamp(cell.energy/cap, 0, 1);
  if(eFrac < HUNGER_GATE && C.food){
    chosen = "food"; forced = true;
    if(b === "food") b = sorted.find(o=>o!=="food") || "wander";
    p = 0.75;
  }

  // Dynamisches Fenster: Food/Mate benötigen Reisezeit
  let tMax = WIN_BASE;
  if(chosen==="food" && ctx.foodDist!=null){
    const vEst = CONFIG.cell.baseSpeed * (0.7 + 0.08*(cell.genome?.TEM ?? 5)) * SPEED_SAFETY; // px/s
    const tNeed = ctx.foodDist / Math.max(1, vEst);
    tMax = clamp(tNeed * 1.15, WIN_MIN, WIN_MAX);
  }else if(chosen==="mate" && ctx.mateDist!=null){
    const vEst = CONFIG.cell.baseSpeed * (0.7 + 0.08*(cell.genome?.TEM ?? 5)) * SPEED_SAFETY;
    const tNeed = ctx.mateDist / Math.max(1, vEst);
    tMax = clamp(tNeed * 1.15, WIN_MIN, WIN_MAX);
  }

  mem.set(cell.id, {
    tAccum: 0, tMax,
    a, b, chosen, e0: cell.energy, forced,
    ctx0: snapshotCtx(ctx), mated:false
  });
  return chosen;
}

/** Nach jedem Physik-Tick: dt aufs Fenster addieren, Reward aus ΔE + K·distGain. */
export function afterStep(cell, dt, ctx){
  const m = mem.get(cell.id);
  if(!m) return;

  m.tAccum += dt;

  const e1 = cell.energy, e0 = m.e0;
  const dE = e1 - e0;

  // Reward-Shaping: Distanzgewinn zu Food (wenn anfangs Food sichtbar war)
  let distGain = 0;
  if(m.ctx0.foodSeen){
    const d0 = (m.ctx0.foodDist0 != null) ? m.ctx0.foodDist0 : Infinity;
    const dN = (ctx.foodDist       != null) ? ctx.foodDist       : Infinity;
    distGain = Math.max(0, d0 - dN); // nur Gewinn zählt
  }
  const shapedReward = dE + K_DIST * distGain;

  const early = Math.abs(dE) >= EARLY_DE_ABS || m.mated;
  const timeUp = m.tAccum >= (m.tMax ?? WIN_BASE);
  if(!early && !timeUp) return;

  // Gewinner/Verlierer bestimmen
  let winner = m.chosen, loser = (m.chosen===m.a? m.b : m.a);
  if(shapedReward < 0) { const tmp=winner; winner=loser; loser=tmp; }

  const xa = featuresForOption(cell, ctx, winner);
  const xb = featuresForOption(cell, ctx, loser);
  const x  = sub(xa, xb);
  const p  = sigmoid(dot(w, x));
  const y  = 1;

  // Update
  for(let i=0;i<w.length;i++){
    w[i] += LR * ((y - p)*x[i] - L2*w[i]);
    if(w[i] >  MAX_ABS_W) w[i] =  MAX_ABS_W;
    if(w[i] < -MAX_ABS_W) w[i] = -MAX_ABS_W;
  }
  const st = String(cell.stammId??0);
  const deltaB = LR_BIAS * (y - p);
  bStamm[st] = clamp((bStamm[st] ?? 0) + deltaB, -BIAS_CLIP, BIAS_CLIP);

  misc.duels++; if(shapedReward>=0 || m.mated) misc.wins++; save();

  // Trace
  if(TRACE_ON){
    const scA = dot(w, xa), scB = dot(w, xb);
    trace.push({
      dur:m.tAccum, id:cell.id, name:cell.name, st:cell.stammId,
      opt:m.chosen, forced:m.forced, p,
      e0, e1, dE: shapedReward,             // zeigen den geformten Reward
      dFoodNow: ctx.foodDist ?? null, dMate: ctx.mateDist ?? null, haz: ctx.hazard ?? 0,
      win:winner, scoreDelta:(scA - scB)
    });
    if(trace.length > TRACE_MAX) trace.shift();
  }

  mem.delete(cell.id);
}

/* ===== intern ===== */
function candidates(cell, ctx){
  const C = { wander:true };
  if(ctx.food && ctx.foodDist!=null) C.food = true;
  if(cell.cooldown<=0 && ctx.mate && ctx.mateDist!=null) C.mate = true;
  return C;
}

// φ(c, ctx, option) – Länge 14
function featuresForOption(cell, ctx, option){
  const g = cell.genome;
  const z = (v)=> (v - 5)/5;

  const cap   = 120 * (1 + 0.08*(g.GRÖ - 5));
  const eFrac = clamp(cell.energy / cap, 0, 1);
  const ageN  = clamp(cell.age / 120, 0, 1);
  const hazard= clamp(ctx.hazard ?? 0, 0, 1);

  const normD=(d)=>{ if(d==null) return 1; const base=Math.max(1,Math.min(ctx.worldMin??512,1024)); return clamp(d/base,0,1); };
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
function snapshotCtx(ctx){
  return {
    foodSeen: ctx.foodDist != null,
    foodDist0: ctx.foodDist ?? null,
    hazard0: ctx.hazard ?? 0
  };
}