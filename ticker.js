// ticker.js – Technischer Marquee-Ticker (nur Metriken + Tipps, keine Live-Events)
// - aktualisiert alle ~5 s
// - konstante Laufschrift-Geschwindigkeit (Pixel/s), kein Ruckeln
// - zeigt Metriken: FPS, Frame(ms), Auslastung, Sim-Rate, Mutation, Nahrung/min,
//                   Zellen, Food, Stämme (+ optional JS-Heap in MB)
// - nimmt TIP-Events an (Advisor etc.) und mischt sie zwischen den Metriken

import { Events, EVT } from './event.js';
import * as Entities from './entities.js';

let elContent, elInner;

const REFRESH_MS = 5000;          // Intervall für Textwechsel
const TIP_TTL_SEC = 30;           // Tipps bleiben bis zu 30 s in der Queue
const FPS_WINDOW_SEC = 5;         // Fenster für gleitenden FPS-Mittelwert
const PIXELS_PER_SEC = 60;        // konstante Laufgeschwindigkeit des Marquees

const state = {
  fpsSamples: [],                 // [ [t, fps], ... ] mit t in Sekunden
  tipQueue: [],
  metrics: { ts: 1, mut: 0.10, foodRate: 90 }
};

// ---- Event-Aufnahme -------------------------------------------------------

Events.on(EVT.TICK, (d)=>{
  if(!d?.fps) return;
  const t = performance.now()/1000;
  state.fpsSamples.push([t, d.fps]);
  // altes aus dem Fenster entfernen
  while (state.fpsSamples.length && (t - state.fpsSamples[0][0] > FPS_WINDOW_SEC)) {
    state.fpsSamples.shift();
  }
});

Events.on(EVT.TIP, (d)=>{
  if(!d?.text) return;
  const txt = d.label ? `${d.label}: ${d.text}` : d.text;
  state.tipQueue.push({ text: txt, ts: performance.now()/1000 });
  if(state.tipQueue.length > 6) state.tipQueue.shift();
});

// Status-Events tragen nur Werte, keine Anzeige im Ticker
Events.on(EVT.STATUS, (d)=>{
  if(!d) return;
  if(d.key === 'timescale')      state.metrics.ts = Number(d.value) || 1;
  else if(d.key === 'mutationRate') state.metrics.mut = Number(d.value) || state.metrics.mut;
  else if(d.key === 'foodRate')     state.metrics.foodRate = Number(d.value) || state.metrics.foodRate;
});

// ---- Metriken aufbereiten -------------------------------------------------

function computeMetrics(){
  // FPS-Mittel
  const samples = state.fpsSamples;
  let fpsAvg = samples.length ? samples.reduce((a,s)=>a+s[1],0)/samples.length : 0;
  fpsAvg = Math.max(1, Math.min(240, fpsAvg));
  const frameMs = 1000 / fpsAvg;

  // Auslastung: 100% ≈ 16.7 ms (60 FPS); >100% = über Budget
  const loadPct = Math.min(300, Math.round((frameMs / 16.7) * 100));

  // Zähler
  const cells = Entities.cells.filter(c=>!c.dead).length;
  const foods = Entities.foods.length;
  const stamm = Object.keys(Entities.getStammCounts()).length;

  // optional: Heapspeicher (nur Chrome)
  let mem = null;
  const pm = performance.memory;
  if (pm && pm.usedJSHeapSize) {
    mem = Math.round(pm.usedJSHeapSize / (1024*1024));
  }

  const world = Entities.getWorldConfig();
  const mut = Math.round(100 * (state.metrics.mut ?? world.mutationRate));
  const foodRate = Math.round(state.metrics.foodRate ?? world.foodRate);
  const ts = state.metrics.ts || 1;

  return { fps: Math.round(fpsAvg), frameMs: frameMs.toFixed(1),
           load: loadPct, cells, foods, stamm, mem, mut, foodRate, ts };
}

function metricsLine(){
  const m = computeMetrics();
  const parts = [
    `FPS ${m.fps}`, `${m.frameMs}ms`, `Last ${m.load}%`,
    `Sim ${m.ts}×`, `Mut ${m.mut}%`, `Nahrung ${m.foodRate}/min`,
    `Zellen ${m.cells}`, `Food ${m.foods}`, `Stämme ${m.stamm}`
  ];
  if (m.mem != null) parts.push(`${m.mem}MB`);
  return parts.join('  •  ');
}

// ---- Anzeige mit konstanter Geschwindigkeit -------------------------------

function applyConstantSpeed(){
  if(!elContent || !elInner) return;
  // Distanz: von rechts komplett rein bis links ganz raus
  const distance = elContent.scrollWidth + elInner.clientWidth;
  const seconds = Math.max(12, distance / PIXELS_PER_SEC);
  elContent.style.setProperty('--marquee-dur', `${seconds}s`);
  // Animation sauber neu starten (Textwechsel → reflow)
  elContent.style.animation = 'none';
  void elContent.offsetWidth; // reflow
  elContent.style.animation = '';
}

function show(text){
  if(!elContent) return;
  elContent.textContent = text;
  applyConstantSpeed();
}

function nextMessage(){
  const now = performance.now()/1000;
  // alte Tipps weg
  state.tipQueue = state.tipQueue.filter(t => now - t.ts < TIP_TTL_SEC);
  if (state.tipQueue.length){
    return state.tipQueue.shift().text; // Tipp hat Vorrang
  }
  return metricsLine();
}

// ---- Public ---------------------------------------------------------------

export function initTicker(){
  elContent = document.getElementById('tickerContent');
  elInner   = document.getElementById('tickerInner');
  if(!elContent || !elInner) return;

  // erste Ausgabe + periodische Aktualisierung
  show(nextMessage());
  setInterval(()=> show(nextMessage()), REFRESH_MS);
}