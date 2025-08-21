// drives.js – Dueling-Policy (Food/Mate/Wander) mit Online-Lernen,
// Stamm-Bias, distanzbasiertem Entscheidungsfenster, Hunger-Failsafe,
// Single-Option-Schutz, Paarungs-Bonus und Diagnose-Trace.

import { on } from "./event.js";
import { CONFIG } from "./config.js";

const LS_W="drives_w_v1", LS_B="drives_bias_v1", LS_MISC="drives_misc_v1";
const LR=0.10, L2=1e-4, MAX_ABS_W=5, LR_BIAS=0.02, BIAS_CLIP=2.0;
const WIN_MIN=0.70, WIN_MAX=2.50, EPS=0.08, HUNGER_GATE=0.45, EARLY_DE_ABS=2.0;
const K_DIST=0.90, R_PAIR=12;

let w      = loadJSON(LS_W)    ?? initW();
let bStamm = loadJSON(LS_B)    ?? {};
let misc   = loadJSON(LS_MISC) ?? { duels:0, wins:0 };

const mem = new Map(); let TRACE_ON=true; const TRACE_MAX=80; const trace=[];

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const sigmoid=(z)=>1/(1+Math.exp(-z));
const dot=(a,b)=>{let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s;};
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const rnd2=(n)=>Math.abs(n)<1e-6?0:Math.round(n*100)/100;

function save(){ try{localStorage.setItem(LS_W,JSON.stringify(w));}catch{} try{localStorage.setItem(LS_B,JSON.stringify(bStamm));}catch{} try{localStorage.setItem(LS_MISC,JSON.stringify(misc));}catch{} }
function loadJSON(k){ try{const s=localStorage.getItem(k);return s?JSON.parse(s):null;}catch{return null;} }
function initW(){ return [0.0,1.0,0.7,0.4,0.3,-0.9,0.8,-0.4,-0.6,-0.9,-0.4,0.1,2.0,0.0]; }

on("cells:born",(p)=>{ const arr=p&&p.parents; if(Array.isArray(arr)) for(const id of arr){ const m=mem.get(id); if(m) m.mated=true; }});

export function initDrives(){} export function setTracing(on){TRACE_ON=!!on;}
export function getTraceText(n=24){ const arr=trace.slice(-n); const wr=misc.duels?Math.round(100*misc.wins/misc.duels):0;
  const out=[`DRIVES TRACE · duels=${misc.duels} winRate=${wr}% · pools=${Object.keys(bStamm).length}`];
  for(const t of arr){ out.push(`dur=${rnd2(t.dur)}s · cell=${t.id}(${t.name}) st=${t.st} · opt=${t.opt}${t.forced?"*":""} p=${rnd2(t.p)} · dE=${rnd2(t.dE)} E=${rnd2(t.e0)}→${rnd2(t.e1)} · dFood=${rnd2(t.dFoodNow??-1)} dMate=${rnd2(t.dMate??-1)} haz=${rnd2(t.haz)} · winner=${t.win} scoreΔ=${rnd2(t.scoreDelta)}`); } return out.join("\n"); }

export function getAction(cell,_t,ctx){
  const m=mem.get(cell.id); if(m && m.tAccum<(m.tMax??1)) return m.chosen;

  const C={wander:true}; if(ctx.food && ctx.foodDist!=null) C.food=true; if(cell.cooldown<=0 && ctx.mate && ctx.mateDist!=null) C.mate=true;
  const opts=Object.keys(C).filter(k=>C[k]); if(!opts.length) return "wander";

  const feats={},scores={}; for(const o of opts){ feats[o]=featuresForOption(cell,ctx,o); scores[o]=dot(w,feats[o])+(bStamm[String(cell.stammId??0)]||0); }
  const sorted=opts.slice().sort((a,b)=>scores[b]-scores[a]);

  let a=sorted[0], b=sorted[1]??sorted[0], single=(a===b);
  let p = single?0.5: sigmoid((scores[a]||0)-(scores[b]||0));
  let chosen = single? a : (p>=0.5?a:b), forced=false;

  // ε-Exploration (nur bei 2 Optionen)
  if(!single && Math.random() < EPS){
    chosen = (chosen===a ? b : a);
    p = 0.5;
  }

  const cap=120*(1+0.08*((cell.genome?.GRÖ??5)-5));
  const eFrac=clamp(cell.energy/cap,0,1);
  if(eFrac<HUNGER_GATE && C.food){ chosen="food"; forced=true; if(single) b="food"; p=0.75; }

  const sMin = Math.max(0.6, (ctx.worldMin ?? 640)/640);
  let tMax=1.0;
  if(chosen==="food" && ctx.foodDist!=null){
    const vEst=(CONFIG.cell.baseSpeed||35)*(0.7+0.08*(cell.genome?.TEM??5))*0.60*sMin;
    tMax=clamp(ctx.foodDist/Math.max(1,vEst)+0.35, WIN_MIN, WIN_MAX);
  }else if(chosen==="mate" && ctx.mateDist!=null){
    const vEst=(CONFIG.cell.baseSpeed||35)*(0.7+0.08*(cell.genome?.TEM??5))*0.60*sMin;
    tMax=clamp(ctx.mateDist/Math.max(1,vEst)+0.35+0.25, WIN_MIN, WIN_MAX);
  }

  mem.set(cell.id,{tAccum:0,tMax,a,b,chosen,e0:cell.energy,forced,ctx0:{foodSeen:ctx.foodDist!=null,foodDist0:ctx.foodDist??null},mated:false,single});
  return chosen;
}

export function afterStep(cell,dt,ctx){
  const m=mem.get(cell.id); if(!m) return; m.tAccum+=dt;
  const e1=cell.energy, dE=e1-m.e0;

  if(m.single){
    const timeUp=m.tAccum>=(m.tMax??1);
    if(timeUp || Math.abs(dE)>=EARLY_DE_ABS || m.mated){ tracePush(m,cell,ctx,dE,m.chosen,0); mem.delete(cell.id); }
    return;
  }

  let distGain=0; if(m.ctx0.foodSeen){ const d0=(m.ctx0.foodDist0!=null)?m.ctx0.foodDist0:Infinity; const dN=(ctx.foodDist!=null)?ctx.foodDist:Infinity; distGain=Math.max(0,d0-dN); }
  let shaped=dE + K_DIST*distGain; if(m.mated) shaped+=R_PAIR;

  const early=Math.abs(dE)>=EARLY_DE_ABS || m.mated, timeUp=m.tAccum>=(m.tMax??1);
  if(!early && !timeUp) return;

  let winner=m.chosen, loser=(m.chosen===m.a?m.b:m.a); if(shaped<0){ const tmp=winner; winner=loser; loser=tmp; }

  const xa=featuresForOption(cell,ctx,winner), xb=featuresForOption(cell,ctx,loser);
  const x=sub(xa,xb), p=sigmoid(dot(w,x)), y=1;

  for(let i=0;i<w.length;i++){ w[i]+= LR * ((y-p)*x[i] - L2*w[i]); if(w[i]>MAX_ABS_W) w[i]=MAX_ABS_W; if(w[i]<-MAX_ABS_W) w[i]=-MAX_ABS_W; }
  const st=String(cell.stammId??0); bStamm[st]=clamp((bStamm[st]||0)+LR_BIAS*(y-p), -BIAS_CLIP, BIAS_CLIP);

  const keys=Object.keys(bStamm);
  if(keys.length){ for(const k of keys) bStamm[k]*=0.998; const mean=keys.reduce((s,k)=>s+bStamm[k],0)/keys.length; for(const k of keys) bStamm[k]-=mean; }

  misc.duels++; if(shaped>=0 || m.mated) misc.wins++; save();

  tracePush(m,cell,ctx,shaped,winner,dot(w,xa)-dot(w,xb));
  mem.delete(cell.id);
}

export function getDrivesSnapshot(){
  try{ return { misc:(misc||{duels:0,wins:0}), w:[...w], bStamm:{...bStamm},
    cfg:{WIN_MIN,WIN_MAX,EPS,HUNGER_GATE,EARLY_DE_ABS,K_DIST,R_PAIR}, recent:[...trace].slice(-12) }; }
  catch{ return { misc:{duels:0,wins:0}, w:[], bStamm:{}, cfg:{}, recent:[] }; }
}

function featuresForOption(cell,ctx,option){
  const g=cell.genome; const z=(v)=>(v-5)/5;
  const cap=120*(1+0.08*(g.GRÖ-5)); const eFrac=clamp(cell.energy/cap,0,1);
  const ageN=clamp(cell.age/120,0,1); const hazard=clamp(ctx.hazard??0,0,1);
  const normD=(d)=>{ if(d==null) return 1; const base=Math.max(1,Math.min(ctx.worldMin??512,1024)); return clamp(d/base,0,1); };

  const metZ = z(g.MET);
  const dFood=normD(ctx.foodDist), dMate=normD(ctx.mateDist);
  const neigh=clamp((ctx.neighCount??0)/8,0,2);
  const isFood= option==="food"?1:0, isMate= option==="mate"?1:0;

  return [1.0, z(g.EFF), z(g.TEM), z(g.GRÖ), z(g.SCH), metZ, eFrac, -ageN, -hazard, dFood, dMate, neigh, isFood, isMate];
}
function tracePush(m,cell,ctx,shaped,winner,scoreDelta){
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