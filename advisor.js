// advisor.js
// KI-Berater (Heuristik; optional TF.js). Sendet Tipps/Status über den Event-Bus.

import { Events, EVT } from './events.js';

const state = {
  enabled: false,
  usingModel: false,
  lastTipAt: 0,
  metrics: {
    births: 0,
    deaths: 0,
    hungerDeaths: 0,
  }
};

export function initAdvisor(){
  // Ereignisse sammeln
  Events.on(EVT.BIRTH, ()=> state.metrics.births++);
  Events.on(EVT.DEATH, (d)=> {
    state.metrics.deaths++;
    if(d?.reason==='hunger') state.metrics.hungerDeaths++;
  });
  Events.on(EVT.HUNGER_CRISIS, (d)=>{
    tip('🔥 Hungersnot erkannt', `Mehr als ${d.inLastMinute} Zellen in 60s gestorben. Tipp: Erhöhe die Nahrung oder senke die Timescale.`);
  });
  Events.on(EVT.OVERPOP, (d)=>{
    tip('🐝 Überbevölkerung', `Population ${d.population}. Tipp: Reduziere die Nahrung, erhöhe die Mutationsrate oder setze die Welt zurück.`);
  });
}

function tip(label, text){
  Events.emit(EVT.TIP, { label, text });
}

export function setEnabled(on){
  state.enabled = on;
  Events.emit(EVT.STATUS, { source:'advisor', text: on ? 'Heuristik aktiv' : 'Berater aus' });
}

export function getStatusLabel(){
  if(!state.enabled) return 'Berater: Aus';
  return state.usingModel ? 'Berater: Modell geladen' : 'Berater: Heuristik aktiv';
}

export async function tryLoadModel(){
  // Optional: TF.js dynamisch laden (kein Pflichtpfad)
  return new Promise((resolve)=>{
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.14.0/dist/tf.min.js';
    script.async = true;
    script.onload = ()=>{
      state.usingModel = !!window.tf;
      Events.emit(EVT.STATUS, { source:'advisor', text: state.usingModel ? 'Modell geladen' : 'Heuristik aktiv' });
      resolve(state.usingModel);
    };
    script.onerror = ()=> resolve(false);
    document.head.appendChild(script);
  });
}

let lastHeuristicCheck = 0;
/** Wird periodisch vom Engine-Tick aufgerufen */
export function updateAdvisor(nowSec){
  if(!state.enabled) return;
  if(nowSec - lastHeuristicCheck < 5) return; // alle 5s
  lastHeuristicCheck = nowSec;

  // Einfache Heuristik: viele Hungertote -> Tipp
  if(state.metrics.hungerDeaths >= 5){
    tip('Tipp', 'Viele Zellen verhungern. Erhöhe die Nahrung über den Schieberegler.');
    state.metrics.hungerDeaths = 0;
  }
  // Geburt/Tod-Balance
  if(state.metrics.deaths > state.metrics.births*1.5){
    tip('Tipp', 'Sterben deutlich mehr Zellen als geboren werden. Prüfe Mutationsrate und Nahrung.');
    state.metrics.deaths = 0; state.metrics.births = 0;
  }
}