// advisor.js – Heuristik / optional TF.js Modell; erkennt 4- oder 5-Feature-Input.

import { Events, EVT } from './event.js';
import { survivalScore } from './genetics.js';

const DEFAULT_MODEL_URL = 'models/model.json';

const state = { enabled:false, libReady:false, model:null, useModel:false, lastHeuristicAt:0 };

export function initAdvisor(){}

export function setEnabled(on){ state.enabled=!!on; Events.emit(EVT.STATUS,{source:'advisor',text:getStatusLabel().replace('Berater: ','')}); }
export function setUseModel(on){ state.useModel=!!on && !!state.model; Events.emit(EVT.STATUS,{source:'advisor',text:getStatusLabel().replace('Berater: ','')}); }
export function getStatusLabel(){ if(!state.enabled) return 'Berater: Aus'; if(state.useModel&&state.model) return 'Berater: Modell aktiv'; return 'Berater: Heuristik aktiv'; }

export async function tryLoadTF(){
  if(state.libReady) return true;
  return new Promise((resolve)=>{
    if(document.querySelector('script[data-crispr-tf]')){ state.libReady=!!window.tf; return resolve(state.libReady); }
    const s=document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.14.0/dist/tf.min.js';
    s.async=true; s.defer=true; s.dataset.crisprTf='1';
    s.onload=()=>{ state.libReady=!!window.tf; resolve(state.libReady); };
    s.onerror=()=> resolve(false);
    document.head.appendChild(s);
  });
}
export async function loadModelFromUrl(url=DEFAULT_MODEL_URL){
  const ok=await tryLoadTF(); if(!ok) return null;
  const tf=window.tf; state.model=await tf.loadLayersModel(url);
  state.useModel=true; setEnabled(true);
  Events.emit(EVT.STATUS,{source:'advisor',text:'Modell geladen'}); return state.model;
}
export async function cycleAdvisorMode(defaultModelUrl){
  if(!state.enabled){ setEnabled(true); state.useModel=false; return 'heuristic'; }
  if(state.enabled && !state.useModel){ try{ await loadModelFromUrl(defaultModelUrl||DEFAULT_MODEL_URL); state.useModel=true; return 'model'; } catch{ setEnabled(false); state.useModel=false; return 'off'; } }
  setEnabled(false); state.useModel=false; return 'off';
}
function modelInputDim(){ try{ const sh=state.model?.inputs?.[0]?.shape; const d=Array.isArray(sh)? sh[sh.length-1]:null; return (d===5||d===4)?d:4; }catch{ return 4; } }
export function predictProbability(genome){
  if(!state.enabled) return null;
  if(state.useModel && state.model && window.tf){
    const tf=window.tf; const dim=modelInputDim();
    const v4=[genome.TEM,genome.GRO,genome.EFF,genome.SCH].map(v=>(v-1)/8);
    const x=dim===5? [...v4,(genome.MET-1)/8] : v4;
    const t=tf.tensor2d([x]); const y=state.model.predict(t); let p;
    if(Array.isArray(y)){ p=(y[0].dataSync?.()[0]??0.5); y.forEach(t=>t.dispose?.()); } else { p=(y.dataSync?.()[0]??0.5); y.dispose?.(); }
    t.dispose?.(); return Math.max(0, Math.min(1, p));
  }
  return survivalScore(genome)/100;
}
export function updateAdvisor(){} // keine Tipps in den Ticker injizieren