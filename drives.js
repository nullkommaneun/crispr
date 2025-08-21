// drives.js – Dueling-Policy (Food/Mate/Wander) mit Online-Lernen,
// Stamm-Bias, distanzbasiertem Entscheidungsfenster, Hunger-Failsafe
// und Diagnose-Trace – robust gegen Single-Option-Fenster.

import { on } from "./event.js";
import { CONFIG } from "./config.js";

/* ===== Konfiguration ===== */
const LS_W    = "drives_w_v1";
const LS_B    = "drives_bias_v1";
const LS_MISC = "drives_misc_v1";

const LR        = 0.10;   // Lernrate
const L2        = 1e-4;   // L2-Regularisierung
const MAX_ABS_W = 5;
const LR_BIAS   = 0.02;
const BIAS_CLIP = 2.0;

const WIN_MIN   = 0.70;   // s
const WIN_MAX   = 2.00;   // s
const EPS       = 0.10;   // ε-Exploration
const HUNGER_GATE = 0.45; // Energie/Cap < 45% -> Food erzwingen
const EARLY_DE_ABS = 2.0; // sofort schließen bei |ΔE| >= 2
const K_DIST    = 0.60;   // Reward: Distanzgewinn→Energie-Äquivalent

/* ===== State ===== */
let w      = loadJSON(LS_W)    ?? initW();
let bStamm = loadJSON(LS_B)    ?? {};
let misc   = loadJSON(LS_MISC) ?? { duels:0, wins:0 };

const mem = new Map();  // cellId -> {tAccum,tMax,a,b,chosen,e0,forced,ctx0,mated,single}
let TRACE_ON = true;
const TRACE_MAX = 80;
const trace = [];

/* ===== Utils ===== */
const clamp = (x,a,b)=> Math.max(a, Math.min(b,x));
const sigmoid = (z)=> 1/(1+Math.exp(-z));
const dot = (a,b)=>{ let s=0; for(let i=0;i<a.length;i++) s+=a[i]*b[i]; return s; };
const sub = (a,b)=> a.map((v,i)=>v-b[i]);

function save(){
  try{ localStorage.setItem(LS_W, JSON.stringify(w)); }catch{}
  try{ localStorage.setItem(LS_B, JSON.stringify(bStamm)); }catch{}
  try{ localStorage.setItem(LS_MISC, JSON.stringify(misc)); }catch{}
}
function loadJSON(key){
  try{ const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; }
  catch{ return null; }
}
function initW(){
  // φ-Länge 14
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

/* Paarung im laufenden Fenster markieren */
on("cells:born", (payload)=>{
  const p = payload && payload.parents;
  if(Array.isArray(p)){ for(const id of p){ const m=mem.get(id); if(m) m.mated=true; } }
});

/* ===== Public API ===== */
export function initDrives(){ /* NOP */ }
export function setTracing(on){ TRACE_ON=!!on; }
export function getTraceText(lastN=24){
  const arr = trace.slice(-lastN);
  const wr  = misc.duels ? Math.round(100*misc.wins/misc.duels) : 0;
  const lines = [`DRIVES TRACE · duels=${misc.duels} winRate=${wr}% · pools=${Object.keys(bStamm).length}`];
  for(const t of arr){
    lines.push(
      `dur=${rnd2(t.dur)}s · cell=${t.id}(${t.name}) st=${t.st} · opt=${t.opt}${t.forced?"*":""} p=${rnd2(t.p)} · dE=${rnd2(t.dE)} E=${rnd2(t.e0)}→${rnd2(t.e1)} · dFood=${rnd2(t.dFoodNow??-1)} dMate=${rnd2(t.dMate??-1)} haz=${rnd2(t.haz)} · winner=${t.win} scoreΔ=${rnd2(t.scoreDelta)}`
    );
  }
  return lines.join("\n");
}

/** Option wählen (stabil, bis Fenster-Ende) */
export function getAction(cell, _t, ctx){
  const m = mem.get(cell.id);
  if(m && m.tAccum < (m.tMax ?? 1)) return m.chosen;

  // Kandidaten
  const C = { wander:true };
  if(ctx.food && ctx.foodDist!=null) C.food=true;
  if(cell.cooldown<=0 && ctx.mate && ctx.mateDist!=null) C.mate=true;

  const opts = Object.keys(C).filter(k=>C[k]);
  if(opts.length===0) return "wander";

  // Scores
  const feats={}, scores={};
  for(const o of opts){
    feats[o]=featuresForOption(cell,ctx,o);
    scores[o]=dot(w,feats[o]) + (bStamm[String(cell.stammId??0)]||0);
  }
  const sorted=opts.slice().sort((a,b)=>scores[b]-scores[a]);

  let a=sorted[0], b=sorted[1] ?? sorted[0];
  let single = (a===b);
  let p = single ? 0.5 : sigmoid((scores[a]||0)-(scores[b]||0));
  let chosen = single ? a : (p>=0.5? a : b);
  let forced=false;

  // Hunger-Failsafe
  const cap=120*(1+0.08*((cell.genome?.GRÖ??5)-5));
  const eFrac=clamp(cell.energy/cap,0,1);
  if(eFrac<HUNGER_GATE && C.food){ chosen="food"; forced=true; if(single) b="food"; p=0.75; }

  // Fenster-Dauer schätzen
  let tMax = 1.0;
  if(chosen==="food" && ctx.foodDist!=null){
    const vEst = (CONFIG.cell.baseSpeed||35) * (0.7 + 0.08*(cell.genome?.TEM??5)) * 0.60;
    tMax = clamp(ctx.foodDist / Math.max(1,vEst) + 0.35, WIN_MIN, WIN_MAX);
  }else if(chosen==="mate" && ctx.mateDist!=null){
    const vEst = (CONFIG.cell.baseSpeed||35) * (0.7 + 0.08*(cell.genome?.TEM??5)) * 0.60;
    tMax = clamp(ctx.mateDist / Math.max(1,vEst) + 0.35, WIN_MIN, WIN_MAX);
  }

  mem.set(cell.id, {
    tAccum:0, tMax,
    a,b,chosen,e0:cell.energy,forced,
    ctx0:{ foodSeen: ctx.foodDist!=null, foodDist0: ctx.foodDist??null },
    mated:false, single
  });
  return chosen;
}

/** Nach jedem Tick: dt aufs Fenster, Reward = ΔE + K_DIST·distGain (nur bei 2 Optionen) */
export function afterStep(cell, dt, ctx){
  const m=mem.get(cell.id); if(!m) return;
  m.tAccum += dt;

  const e1=cell.energy, dE=e1 - m.e0;

  // Single-Option-Fenster -> nicht gegen "wander" trainieren
  if(m.single){
    const timeUp = m.tAccum >= (m.tMax ?? 1);
    if(timeUp || Math.abs(dE)>=EARLY_DE_ABS || m.mated){
      tracePush(m, cell, ctx, dE, m.chosen, 0);
      mem.delete(cell.id);
    }
    return;
  }

  // Distanz-Gewinn zu Food (wenn am Anfang sichtbar)
  let distGain=0;
  if(m.ctx0.foodSeen){
    const d0 = (m.ctx0.foodDist0!=null)?m.ctx0.foodDist0:Infinity;
    const dN = (ctx.foodDist      !=null)?ctx.foodDist      :Infinity;
    distGain = Math.max(0, d0 - dN);
  }
  const shaped = dE + K_DIST*distGain;

  const early = Math.abs(dE)>=EARLY_DE_ABS || m.mated;
  const timeUp= m.tAccum >= (m.tMax??1);
  if(!early && !timeUp) return;

  // Gewinner bestimmen
  let winner=m.chosen, loser=(m.chosen===m.a?m.b:m.a);
  if(shaped<0){ const tmp=winner; winner=loser; loser=tmp; }

  const xa = featuresForOption(cell, ctx, winner);
  const xb = featuresForOption(cell, ctx, loser);
  const x  = sub(xa, xb);
  const p  = sigmoid(dot(w,x));
  const y  = 1;

  // Update
  for(let i=0;i<w.length;i++){
    w[i] += LR * ((y-p)*x[i] - L2*w[i]);
    if(w[i]> MAX_ABS_W) w[i]= MAX_ABS_W;
    if(w[i]<-MAX_ABS_W) w[i]=-MAX_ABS_W;
  }
  const st=String(cell.stammId??0);
  bStamm[st]=clamp((bStamm[st]||0)+LR_BIAS*(y-p), -BIAS_CLIP, BIAS_CLIP);

  misc.duels++; if(shaped>=0 || m.mated) misc.wins++; save();

  tracePush(m, cell, ctx, shaped, winner, dot(w,xa)-dot(w,xb));
  mem.delete(cell.id);
}

/* ===== Snapshot-Export für Diagnose ===== */
export function getDrivesSnapshot(){
  try{
    return {
      misc: (misc || {duels:0,wins:0}),
      w: Array.isArray(w) ? [...w] : [],
      bStamm: {...bStamm},
      cfg: { WIN_MIN, WIN_MAX, EPS, HUNGER_GATE, EARLY_DE_ABS, K_DIST },
      recent: [...trace].slice(-12)
    };
  }catch(e){
    return { misc:{duels:0,wins:0}, w:[], bStamm:{}, cfg:{}, recent:[] };
  }
}

/* ===== intern ===== */
function featuresForOption(cell, ctx, option){
  const g=cell.genome;
  const z=(v)=>(v-5)/5;
  const cap=120*(1+0.08*(g.GRÖ-5));
  const eFrac=clamp(cell.energy/cap,0,1);
  const ageN=clamp(cell.age/120,0,1);
  const hazard=clamp(ctx.hazard??0,0,1);
  const normD=(d)=>{ if(d==null) return 1; const base=Math.max(1,Math.min(ctx.worldMin??512,1024)); return clamp(d/base,0,1); };
  const dFood=normD(ctx.foodDist), dMate=normD(ctx.mateDist);
  const neigh=clamp((ctx.neighCount??0)/8,0,2);
  const isFood = option==="food"?1:0, isMate=option==="mate"?1:0;
  return [1.0,z(g.EFF),z(g.TEM),z(g.GRÖ),z(g.SCH),-z(g.MET), eFrac, -ageN, -hazard, dFood, dMate, neigh, isFood, isMate];
}
function rnd2(n){ return Math.abs(n)<1e-6?0:Math.round(n*100)/100; }
function tracePush(m, cell, ctx, shaped, winner, scoreDelta){
  if(!TRACE_ON) return;
  trace.push({
    dur:m.tAccum, id:cell.id, name:cell.name, st:cell.stammId,
    opt:m.chosen, forced:m.forced, p:0,
    e0:m.e0, e1:cell.energy, dE:shaped,
    dFoodNow: ctx.foodDist ?? null, dMate: ctx.mateDist ?? null, haz: ctx.hazard ?? 0,
    win:winner, scoreDelta
  });
  if(trace.length>TRACE_MAX) trace.shift();
}