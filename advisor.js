// advisor.js – Heuristik / optional TF.js Modell
// Lade-Reihenfolge beim Start: models/model.js (embedded) → models/model.json (Layers-Format)
// - Ist ein Modell verfügbar, wird der Advisor automatisch AKTIV und "Modell aktiv" genutzt.
// - Wird der Advisor AUS geschaltet, gibt predictProbability() null zurück (Editor zeigt "–").

import { Events, EVT } from './event.js';
import { survivalScore } from './genetics.js';

const DEFAULT_MODEL_JSON   = 'models/model.json';     // echtes TF.js Layers-Modell (optional)
const DEFAULT_MODEL_MODULE = './models/model.js';     // eingebautes Standardmodell (diese Datei lieferst du mit)

const state = {
  enabled: false,
  libReady: false,
  model: null,
  useModel: false,        // true = NN, false = Heuristik (nur wenn enabled)
  metrics: { births:0, deaths:0, hungerDeaths:0 },
  lastHeuristicAt: 0,
  started: false
};

export function initAdvisor(){
  if (state.started) return;
  state.started = true;

  // Telemetrie für Tipps (Ticker)
  Events.on(EVT.BIRTH, ()=> state.metrics.births++);
  Events.on(EVT.DEATH, (d)=> {
    state.metrics.deaths++;
    if(d?.reason==='hunger') state.metrics.hungerDeaths++;
  });

  // Auto-Start des Standardmodells (JS-Modul zuerst; JSON wird nur genutzt, falls vorhanden)
  autoStart().catch(()=>{/* stiller Fallback auf Heuristik möglich */});
}

function tip(label, text){ Events.emit(EVT.TIP, { label, text }); }

// ------------------------- Public Status-API -------------------------------

export function setEnabled(on){
  state.enabled = !!on;
  Events.emit(EVT.STATUS, { source:'advisor', text: getStatusLabel().replace('Berater: ','') });
}

export function setUseModel(on){
  state.useModel = !!on && !!state.model;
  Events.emit(EVT.STATUS, { source:'advisor', text: getStatusLabel().replace('Berater: ','') });
}

export function getStatusLabel(){
  if(!state.enabled) return 'Berater: Aus';
  if(state.useModel && state.model) return 'Berater: Modell aktiv';
  return 'Berater: Heuristik aktiv';
}

export function isEnabled(){ return !!state.enabled; }
export function isModelLoaded(){ return !!state.model; }

// ------------------------- Laden / Auto-Start ------------------------------

export async function tryLoadTF(){
  if(state.libReady) return true;
  return new Promise((resolve)=>{
    if(document.querySelector('script[data-crispr-tf]')){
      state.libReady = !!window?.tf; return resolve(state.libReady);
    }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.14.0/dist/tf.min.js';
    s.async = true; s.defer = true; s.dataset.crisprTf = '1';
    s.onload = ()=>{ state.libReady = !!window?.tf; resolve(state.libReady); };
    s.onerror = ()=> resolve(false);
    document.head.appendChild(s);
  });
}

async function loadModelFromModule(modulePath = DEFAULT_MODEL_MODULE){
  const ok = await tryLoadTF(); if(!ok) throw new Error('TFJS konnte nicht geladen werden');
  const tf = window.tf;
  const mod = await import(modulePath);
  const builder = mod.buildModel || mod.default;
  if(typeof builder !== 'function') throw new Error('models/model.js exportiert keine buildModel()-Funktion');
  const m = await builder(tf);
  state.model = m;
  state.useModel = true;
  setEnabled(true);
  Events.emit(EVT.STATUS, { source:'advisor', text:'Modell geladen (embedded)' });
  return m;
}

export async function loadModelFromUrl(url = DEFAULT_MODEL_JSON){
  const ok = await tryLoadTF(); if(!ok) throw new Error('TFJS konnte nicht geladen werden');
  const tf = window.tf;
  const m = await tf.loadLayersModel(url);
  state.model = m;
  state.useModel = true;
  setEnabled(true);
  Events.emit(EVT.STATUS, { source:'advisor', text:'Modell geladen' });
  return m;
}

/** Boot: zuerst eingebettetes Standardmodell (models/model.js), dann – falls vorhanden – model.json */
async function autoStart(){
  // 1) eingebettetes Standardmodell
  try{
    await loadModelFromModule(DEFAULT_MODEL_MODULE);
  }catch(e){
    // 2) optionales echtes Layers-Modell
    try{
      await loadModelFromUrl(DEFAULT_MODEL_JSON);
    }catch(_){ /* Heuristik bleibt möglich */ }
  }
}

// Umschalten im Editor: Aus → Heuristik → Modell → Aus …
export async function cycleAdvisorMode(defaultModelUrl){
  if(!state.enabled){ setEnabled(true); state.useModel=false; return 'heuristic'; }
  if(state.enabled && !state.useModel){
    // Heuristik -> Modell (bevorzugt JSON, sonst embedded)
    try{ await loadModelFromUrl(defaultModelUrl || DEFAULT_MODEL_JSON); state.useModel=true; return 'model'; }
    catch{ await loadModelFromModule(DEFAULT_MODEL_MODULE); state.useModel=true; return 'model'; }
  }
  // Modell -> Aus
  setEnabled(false); state.useModel=false; return 'off';
}

// ------------------------- Inferenz / Tipps --------------------------------

export function predictProbability(genome){
  // AUS → keinerlei Wert
  if(!state.enabled) return null;

  // Modellmodus
  if(state.useModel && state.model && window.tf){
    const tf = window.tf;
    const x = [genome.TEM, genome.GRO, genome.EFF, genome.SCH].map(v => (v-1)/8); // 1..9 → 0..1
    const t = tf.tensor2d([x]);                 // [1,4]
    const y = state.model.predict(t);
    let p;
    if(Array.isArray(y)) { p = (y[0].dataSync?.()[0] ?? 0.5); y.forEach(t=>t.dispose?.()); }
    else { p = (y.dataSync?.()[0] ?? 0.5); y.dispose?.(); }
    t.dispose?.();
    return Math.max(0, Math.min(1, p));
  }

  // Heuristik
  return survivalScore(genome) / 100;
}

export function updateAdvisor(nowSec){
  if(!state.enabled) return;
  if(nowSec - state.lastHeuristicAt < 5) return;
  state.lastHeuristicAt = nowSec;

  if(state.metrics.hungerDeaths >= 5){
    tip('Tipp', 'Viele Zellen verhungern. Erhöhe die Nahrung über den Schieberegler.');
    state.metrics.hungerDeaths = 0;
  }
  if(state.metrics.deaths > state.metrics.births*1.5){
    tip('Tipp', 'Sterben deutlich mehr Zellen als geboren werden. Prüfe Mutationsrate und Nahrung.');
    state.metrics.deaths = 0; state.metrics.births = 0;
  }
}