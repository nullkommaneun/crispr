// advisor.js – Heuristik / optional TF.js Modell, mit Auto-Start und sauberem "Aus"-Modus
// - Wenn Advisor AUS: predictProbability() gibt null zurück (Editor zeigt "–").
// - Auto-Start: versucht models/model.json zu laden. Fallback: eingebettetes Mini-Modell.
// - Das eingebettete Modell approximiert die Heuristik (Gewichte ähnlich survivalScore).

import { Events, EVT } from './event.js';
import { survivalScore } from './genetics.js';

const DEFAULT_MODEL_URL = 'models/model.json';

const state = {
  enabled: false,
  libReady: false,
  model: null,
  useModel: false,        // true = NN, false = Heuristik (nur wenn enabled)
  metrics: { births:0, deaths:0, hungerDeaths:0 },
  lastHeuristicAt: 0,
  autoTried: false
};

export function initAdvisor(){
  // leichte Telemetrie für Tipps
  Events.on(EVT.BIRTH, ()=> state.metrics.births++);
  Events.on(EVT.DEATH, (d)=> {
    state.metrics.deaths++;
    if(d?.reason==='hunger') state.metrics.hungerDeaths++;
  });

  // Auto-Start: versuche Default-Modell zu laden, sonst Embedded-Modell
  autoStartModel().catch(()=>{/* stiller Fallback */});
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

export function isEnabled(){ return !!state.enabled; }
export function isModelLoaded(){ return !!state.model; }

export async function tryLoadTF(){
  if(state.libReady) return true;
  return new Promise((resolve)=>{
    if(document.querySelector('script[data-crispr-tf]')){
      state.libReady = !!window.tf;
      return resolve(state.libReady);
    }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.14.0/dist/tf.min.js';
    s.async = true; s.defer = true; s.dataset.crisprTf = '1';
    s.onload = ()=>{ state.libReady = !!window.tf; resolve(state.libReady); };
    s.onerror = ()=> resolve(false);
    document.head.appendChild(s);
  });
}

export async function loadModelFromUrl(url){
  const ok = await tryLoadTF();
  if(!ok) return null;
  const tf = window.tf;
  const m = await tf.loadLayersModel(url);
  state.model = m;
  state.useModel = true;
  setEnabled(true);
  Events.emit(EVT.STATUS, { source:'advisor', text:'Modell geladen' });
  return m;
}

// Mini-Modell, das die Heuristik grob approximiert (keine Trainingsdaten nötig)
async function buildEmbeddedModel(){
  const ok = await tryLoadTF();
  if(!ok) return null;
  const tf = window.tf;
  const model = tf.sequential();
  // Eingabe: 4 Merkmale (TEM,GRO,EFF,SCH) normalisiert auf [0..1]
  model.add(tf.layers.dense({ units: 1, inputShape: [4], activation: 'sigmoid', useBias: true }));
  // Gewichte lehnen sich an survivalScore-Gewichte an (TEM/EFF stärker)
  const W = tf.tensor2d([[1.4],[0.6],[1.4],[0.7]]); // shape [4,1]
  const b = tf.tensor1d([-1.0]);                    // Bias -> Mittel ~0.5
  model.layers[0].setWeights([W, b]);
  return model;
}

async function autoStartModel(){
  if(state.autoTried) return;
  state.autoTried = true;

  // 1) Versuche Default-Datei zu laden
  try {
    const m = await loadModelFromUrl(DEFAULT_MODEL_URL);
    if(m){ setEnabled(true); setUseModel(true); return; }
  } catch (e) {
    // weiter zum Fallback
  }

  // 2) Fallback: eingebettetes Modell aufbauen
  try{
    const m = await buildEmbeddedModel();
    if(m){
      state.model = m;
      state.useModel = true;
      setEnabled(true);
      Events.emit(EVT.STATUS, { source:'advisor', text:'Modell geladen (embedded)' });
      return;
    }
  }catch(e){
    // 3) Notfall: Advisor bleibt AUS, Heuristik optional vom Nutzer aktivierbar
    setEnabled(false);
    state.useModel = false;
  }
}

export async function cycleAdvisorMode(defaultModelUrl){
  // Reihenfolge: Aus → Heuristik → Modell → Aus …
  if(!state.enabled){
    setEnabled(true);
    state.useModel = false;
    return 'heuristic';
  }
  if(state.enabled && !state.useModel){
    // Heuristik → Modell
    const url = defaultModelUrl || DEFAULT_MODEL_URL;
    try{
      await loadModelFromUrl(url);
      state.useModel = true;
      return 'model';
    }catch{
      // kein Modell verfügbar → zurück zu Aus
      setEnabled(false);
      state.useModel = false;
      return 'off';
    }
  }
  // Modell → Aus
  setEnabled(false);
  state.useModel = false;
  return 'off';
}

export function predictProbability(genome){
  // AUS -> keine Ausgabe
  if(!state.enabled) return null;

  // Mit Modell
  if(state.useModel && state.model && window.tf){
    const tf = window.tf;
    // Normalisierung 1..9 -> 0..1
    const x = [genome.TEM, genome.GRO, genome.EFF, genome.SCH].map(v => (v-1)/8);
    const t = tf.tensor2d([x]);      // [1,4]
    const y = state.model.predict(t);
    let p;
    if(Array.isArray(y)) { p = (y[0].dataSync?.()[0] ?? 0.5); y.forEach(t=>t.dispose?.()); }
    else { p = (y.dataSync?.()[0] ?? 0.5); y.dispose?.(); }
    t.dispose?.();
    return Math.max(0, Math.min(1, p));
  }

  // Heuristik (enabled, aber ohne Modell)
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