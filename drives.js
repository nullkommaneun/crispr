// drives.js – Dueling-Policy für Zellenentscheidungen (Food vs Mate vs Wander)
// Online-Lernen (logistische Regression), Stamm-Bias, Duellfenster mit Bandit-Feedback.

import { on } from "./event.js";

/* ======================== Konfiguration ======================== */
const LS_W = "drives_w_v1";
const LS_B = "drives_bias_v1";
const LS_MISC = "drives_misc_v1";

const LR = 0.10;          // Lernrate für Gewichte
const L2 = 1e-4;          // L2-Regularisierung
const MAX_ABS_W = 5;      // Weight-Clipping
const LR_BIAS = 0.02;     // Lernrate pro Stamm-Bias
const BIAS_CLIP = 2.0;    // Bias-Grenze je Stamm

const WINDOW_SEC = 1.2;   // Duell-Fenster
const EPS = 0.10;         // ε-Exploration

/* ======================== State ======================== */
let w = loadJSON(LS_W) ?? initW();          // Gewichte des linearen Modells
let bStamm = loadJSON(LS_B) ?? {};          // Stamm→Bias (additiv zum Score)
let misc = loadJSON(LS_MISC) ?? { duels: 0, wins: 0 };

const mem = new Map();      // cellId -> laufendes Duell {t0, a, b, chosen, e0}
const mateTime = new Map(); // cellId -> letzte erfolgreiche Paarungszeit (sim t)

/* ======================== Utils ======================== */
const clamp = (x,a,b)=> Math.max(a, Math.min(b, x));
const sigmoid = (z)=> 1/(1+Math.exp(-z));
const dot = (a,b)=>{ let s=0; for(let i=0;i<a.length;i++) s+=a[i]*b[i]; return s; };
const sub = (a,b)=> a.map((v,i)=> v-b[i]);
function save(){
  try{ localStorage.setItem(LS_W, JSON.stringify(w)); }catch{}
  try{ localStorage.setItem(LS_B, JSON.stringify(bStamm)); }catch{}
  try{ localStorage.setItem(LS_MISC, JSON.stringify(misc)); }catch{}
}
function loadJSON(k){ try{ const s=localStorage.getItem(k); return s?JSON.parse(s):null; }catch{return null;} }
function initW(){
  // Feature-Vektor φ hat Länge 14 (siehe featuresForOption)
  // Start nahe vernünftiger Heuristik
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
   -0.5,  // distFood (negativ: je näher desto besser)
   -0.5,  // distMate (negativ)
    0.2,  // neighDensity (leicht negativ/positiv je nach Dynamik)
    0.0,  // oneHot(Food)
    0.0   // oneHot(Mate)  (Wander ist implizit, beide 0)
  ];
}

/* ======================== Public API ======================== */

// Muss beim App-Start aufgerufen werden
export function initDrives(){
  // Erfolgssignal für "Mate" aus Repro-Event ziehen
  on("cells:born", (payload)=>{
    const p = payload?.parents;
    const t = payload?.t ?? 0; // falls engine t mitgibt
    if(Array.isArray(p)){
      for(const id of p){ mateTime.set(id, t); }
    }
  });
  // Aufräumen bei Tod
  on("cells:died", (c)=> { mem.delete(c?.id); mateTime.delete(c?.id); });
}

// Liefert die primäre Option für diese Zelle (stabil für WINDOW_SEC)
export function getAction(cell, t, ctx){
  let m = mem.get(cell.id);
  if(m && (t - m.t0) < WINDOW_SEC){
    return m.chosen; // laufendes Duell fortsetzen
  }

  // Kandidaten bestimmen
  const C = candidates(cell, ctx); // {food?, mate?, wander:true}
  const opts = Object.keys(C).filter(k=>C[k]);
  if(opts.length===0) return "wander";

  // Features & Scores je Option
  const feats = {};
  const scores = {};
  for(const o of opts){
    feats[o] = featuresForOption(cell, ctx, o);
    scores[o] = scoreOption(cell, feats[o]);
  }

  // Wähle zwei Optionen mit größter Unsicherheit (nahe 0.5)
  // Heuristik: top2 nach Score, dann Unsicherheit p = σ(sA - sB)
  const sorted = opts.sort((a,b)=> scores[b]-scores[a]);
  const a = sorted[0];
  const b = sorted[1] ?? "wander";
  const p = sigmoid(scores[a] - scores[b]);
  let chosen = (p>=0.5)? a : b;

  // ε-Exploration
  if(Math.random()<EPS){
    chosen = opts[(Math.random()*opts.length)|0];
  }

  // Duell-Start merken
  mem.set(cell.id, { t0: t, a, b, chosen, e0: cell.energy });

  return chosen;
}

// Jede Sim-Iteration nach der Physik aufrufen, um Fenster zu schließen & zu lernen
export function afterStep(cell, t, ctx){
  const m = mem.get(cell.id);
  if(!m) return;
  if((t - m.t0) < WINDOW_SEC) return;

  const e1 = cell.energy;
  let reward = e1 - m.e0; // Energie-Differenz enthält Bewegung & Schaden
  // Bonus, falls Paarung in Fenster
  const mt = mateTime.get(cell.id);
  if(mt!=null && mt >= m.t0 && mt <= t){
    reward += 20; // Paarung zählt deutlich
  }

  // Duell-Label
  let winner = m.chosen, loser = (m.chosen===m.a ? m.b : m.a);
  if(reward < 0) { const tmp=winner; winner=loser; loser=tmp; }

  // Update
  const xa = featuresForOption(cell, ctx, winner);
  const xb = featuresForOption(cell, ctx, loser);
  const x = sub(xa, xb);                          // Δ-Feature
  const p = sigmoid(dot(w, x));                   // Gewinnwahrscheinlichkeit
  const y = 1;                                    // ausgeführte Option = Label 1
  for(let i=0;i<w.length;i++){
    w[i] += LR * ((y - p)*x[i] - L2*w[i]);
    if(w[i] >  MAX_ABS_W) w[i] =  MAX_ABS_W;
    if(w[i] < -MAX_ABS_W) w[i] = -MAX_ABS_W;
  }
  // Stamm-Bias anpassen (klein, additiv)
  const st = String(cell.stammId??0);
  const deltaB = LR_BIAS * (y - p);
  bStamm[st] = clamp((bStamm[st] ?? 0) + deltaB, -BIAS_CLIP, BIAS_CLIP);

  misc.duels++; if(reward>=0) misc.wins++;
  save();

  mem.delete(cell.id);
}

/* ======================== Kernfunktionen ======================== */

// Kandidaten je Zelle/Kontext
function candidates(cell, ctx){
  const C = { wander: true };
  if(ctx.food && ctx.foodDist != null) C.food = true;
  // Paarung nur wenn Cooldown 0 und Mate vorhanden
  if(cell.cooldown<=0 && ctx.mate && ctx.mateDist != null) C.mate = true;
  return C;
}

// Feature-Vektor φ(c, ctx, option) – Länge 14
function featuresForOption(cell, ctx, option){
  const g = cell.genome;
  const z = (v)=> (v - 5)/5;

  const cap = 120 * (1 + 0.08*(g.GRÖ - 5));
  const eFrac = clamp(cell.energy / cap, 0, 1);
  const ageN = clamp(cell.age / 120, 0, 1);

  const hazard = clamp(ctx.hazard ?? 0, 0, 1);
  // Distanz-Normalisierung (0..1) relativ zur kleineren Weltkante
  const normD = (d)=> {
    if(d==null) return 1; // „unendlich“ fern
    const base = Math.max(1, Math.min(ctx.worldMin ?? 512, 1024));
    return clamp(d / base, 0, 1);
  };
  const dFood = normD(ctx.foodDist);
  const dMate = normD(ctx.mateDist);
  const neigh = clamp((ctx.neighCount ?? 0)/8, 0, 2); // 0..~2

  // One-Hot-Flags
  const isFood = option==="food" ? 1 : 0;
  const isMate = option==="mate" ? 1 : 0;

  return [
    1.0,           // Bias
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