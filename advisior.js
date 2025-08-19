// advisor.js
// KI-Berater: Heuristik; optional TensorFlow.js + Modell.
// Modus: Aus • Heuristik • Modell. Steuerung erfolgt im Editor.

import { Events, EVT } from './events.js';
import { survivalScore } from './genetics.js';

const state = {
  enabled: false,
  libReady: false,   // tf.js Bibliothek geladen?
  model: null,       // tf.Model (optional)
  useModel: false,   // wenn Modell vorhanden, ob es aktiv genutzt wird
  metrics: { births:0, deaths:0, hungerDeaths:0 },
  lastHeuristicAt: 0
};

export function initAdvisor(){
  Events.on(EVT.BIRTH, ()=> state.metrics.births++);
  Events.on(EVT.DEATH, (d)=> {
    state.metrics.deaths++;
    if(d?.reason==='hunger') state.metrics.hungerDeaths++;
  });
}

function tip(label, text){ Events.emit(EVT.TIP, { label, text }); }

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

/** Lädt NUR die TF.js Bibliothek (ohne Modell). */
export async function tryLoadTF(){
  if(state.libReady) return true;
  return new Promise((resolve)=>{
    const existing = document.querySelector('script[data-crispr-tf]');
    if(existing){ state.libReady = !!window.tf; return resolve(state.libReady); }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.14.0/dist/tf.min.js';
    s.async = true; s.defer = true; s.dataset.crisprTf = '1';
    s.onload = ()=>{ state.libReady = !!window.tf; resolve(state.libReady); };
    s.onerror = ()=> resolve(false);
    document.head.appendChild(s);
  });
}

/** Lädt ein TF.js Layers-Model (URL zeigt auf model.json). */
export async function loadModelFromUrl(url){
  const ok = await tryLoadTF();
  if(!ok) return null;
  const tf = window.tf;
  state.model = await tf.loadLayersModel(url);
  state.useModel = true;
  setEnabled(true);
  Events.emit(EVT.STATUS, { source:'advisor', text:'Modell geladen' });
  return state.model;
}

/** Zyklischer Moduswechsel für den Editor: Off → Heuristik → Modell (falls vorhanden) → Heuristik ... */
export async function cycleAdvisorMode(defaultModelUrl){
  if(!state.enabled){
    setEnabled(true);
    await tryLoadTF();
    state.useModel = false;
    return 'heuristic';
  }
  if(state.model){
    state.useModel = !state.useModel;
    return state.useModel ? 'model' : 'heuristic';
  }
  // Kein Modell vorhanden → versuchen zu laden, falls URL gegeben, sonst ausschalten
  if(defaultModelUrl){
    const m = await loadModelFromUrl(defaultModelUrl).catch(()=>null);
    if(m){ state.useModel = true; return 'model'; }
  }
  setEnabled(false);
  state.useModel = false;
  return 'off';
}

/** Prognose 0..1 (TF‑Modell falls aktiv, sonst Heuristik). */
export function predictProbability(genome){
  if(state.enabled && state.useModel && state.model && window.tf){
    const tf = window.tf;
    const x = [genome.TEM, genome.GRO, genome.EFF, genome.SCH].map(v=>v/9);
    const t = tf.tensor2d([x]);
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

export function isModelLoaded(){ return !!state.model; }

/** Periodische Heuristik-Tipps, wenn der Berater aktiv ist. */
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