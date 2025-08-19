// advisor.js
// KI-Berater: Heuristik; optional TensorFlow.js + Modell.
// Liefert Prognose für den Editor und sendet Tipps/Status in den Ticker.

import { Events, EVT } from './events.js';
import { survivalScore } from './genetics.js';

const state = {
  enabled: false,
  libReady: false,   // tf.js Bibliothek geladen?
  model: null,       // tf.Model (optional)
  metrics: { births:0, deaths:0, hungerDeaths:0 },
  lastHeuristicAt: 0
};

export function initAdvisor(){
  Events.on(EVT.BIRTH, ()=> state.metrics.births++);
  Events.on(EVT.DEATH, (d)=> {
    state.metrics.deaths++;
    if(d?.reason==='hunger') state.metrics.hungerDeaths++;
  });
  Events.on(EVT.HUNGER_CRISIS, (d)=>{
    tip('🔥 Hungersnot', `> ${d.inLastMinute} Todesfälle in 60 s. Tipp: Nahrung erhöhen oder Timescale senken.`);
  });
  Events.on(EVT.OVERPOP, (d)=>{
    tip('🐝 Überbevölkerung', `Population ${d.population}. Tipp: Nahrung reduzieren oder Mutationsrate erhöhen.`);
  });
}

function tip(label, text){ Events.emit(EVT.TIP, { label, text }); }

export function setEnabled(on){
  state.enabled = on;
  Events.emit(EVT.STATUS, { source:'advisor', text: getStatusLabel().replace('Berater: ','') });
}

export function getStatusLabel(){
  if(!state.enabled) return 'Berater: Aus';
  if(state.model)     return 'Berater: Modell geladen';
  if(state.libReady)  return 'Berater: Heuristik (TF bereit)';
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
  Events.emit(EVT.STATUS, { source:'advisor', text:'Modell geladen' });
  return state.model;
}

/** Kompatibilitäts‑Alias: alte Aufrufer erwarteten tryLoadModel(). */
export async function tryLoadModel(url){
  // Mit URL: echtes Modell laden, ohne URL: nur TF-Bibliothek bereitstellen.
  return url ? loadModelFromUrl(url) : tryLoadTF();
}

/** Prognose 0..1 (TF‑Modell falls vorhanden, sonst Heuristik). */
export function predictProbability(genome){
  if(state.model && window.tf){
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
  // Heuristik: nutzt unsere Survival-Score-Skala 0..100
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