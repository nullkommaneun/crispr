// ticker.js – Technischer Marquee-Ticker (nur Metriken + Tipps, keine Spiel-Ereignisse)
// - aktualisiert alle ~5 s
// - konstante Laufgeschwindigkeit (Pixel/s), nahtloser Loop via doppeltem Inhalt
// - zeigt: FPS, Frame(ms), Auslastung, Sim-Rate, Mutation, Nahrung/min,
//          Zellen, Food, Stämme, KI-Modus (Aus / Heuristik / Modell)
// - akzeptiert NUR "Tipp"-Events (z. B. aus Advisor) – alles andere wird ignoriert

import { Events, EVT } from './event.js';
import * as Entities from './entities.js';
import { getStatusLabel } from './advisor.js';

let elInner, elContent;

const REFRESH_MS      = 5000;  // Poll-Intervall
const SPEED_PX_SEC    = 60;    // konstante Laufgeschwindigkeit
const TIP_TTL_SEC     = 40;    // Tipps bleiben bis zu 40 s
const FPS_WINDOW_SEC  = 5;     // gleitendes Mittel für FPS

const state = {
  fpsSamples: [],                 // [ [t, fps], ... ]
  tipQueue: [],                   // {text, ts}
  metrics: { ts: 1, mut: 0.10, foodRate: 90 }
};

// ---------- Event-Aufnahme --------------------------------------------------

Events.on(EVT.TICK, (d)=>{
  if(!d?.fps) return;
  const t = performance.now()/1000;
  state.fpsSamples.push([t, d.fps]);
  // Fenster abschneiden
  while (state.fpsSamples.length && (t - state.fpsSamples[0][0] > FPS_WINDOW_SEC)) {
    state.fpsSamples.shift();
  }
});

// NUR Tipps mit Label "Tipp" zulassen (keine Spielereignisse/Editor/Startbonus/Reset)
Events.on(EVT.TIP, (d)=>{
  if(!d?.text) return;
  if((d.label || '').toLowerCase() !== 'tipp') return; // Filter
  const txt = d.text;
  state.tipQueue.push({ text: txt, ts: performance.now()/1000 });
  if(state.tipQueue.length > 6) state.tipQueue.shift();
});

// Statuswerte nur mitschneiden (nicht anzeigen)
Events.on(EVT.STATUS, (d)=>{
  if(!d) return;
  if(d.key === 'timescale')         state.metrics.ts       = Number(d.value) || 1;
  else if(d.key === 'mutationRate') state.metrics.mut      = Number(d.value) || state.metrics.mut;
  else if(d.key === 'foodRate')     state.metrics.foodRate = Number(d.value) || state.metrics.foodRate;
});

// ---------- Metriken aufbereiten -------------------------------------------

function getMetrics(){
  // FPS-Mittel
  let fps = 0;
  if(state.fpsSamples.length){
    fps = state.fpsSamples.reduce((a,[,v])=>a+v,0) / state.fpsSamples.length;
  }
  fps = Math.max(1, Math.min(240, fps));
  const frameMs = 1000 / fps;

  // Auslastung relativ zu 60 FPS (16.7 ms Budget)
  const loadPct = Math.min(300, Math.round((frameMs / 16.7) * 100));

  const cells = Entities.cells.filter(c=>!c.dead).length;
  const foods = Entities.foods.length;
  const stamm = Object.keys(Entities.getStammCounts()).length;

  // KI-Status
  let ki = getStatusLabel?.() || 'Berater: Aus';
  ki = ki.replace(/^Berater:\s*/,''); // "Aus" | "Heuristik aktiv" | "Modell aktiv"

  const world = Entities.getWorldConfig();
  const mut      = Math.round(100 * (state.metrics.mut ?? world.mutationRate));
  const foodRate = Math.round(state.metrics.foodRate ?? world.foodRate);
  const ts       = state.metrics.ts || 1;

  return { fps: Math.round(fps), frameMs: frameMs.toFixed(1), load: loadPct, cells, foods, stamm, mut, foodRate, ts, ki };
}

function metricsLine(){
  const m = getMetrics();
  const parts = [
    `FPS ${m.fps}`, `${m.frameMs}ms`, `Last ${m.load}%`,
    `Sim ${m.ts}×`, `Mut ${m.mut}%`, `Nahrung ${m.foodRate}/min`,
    `Zellen ${m.cells}`, `Food ${m.foods}`, `Stämme ${m.stamm}`,
    `KI ${m.ki}`
  ];
  return parts.join('  •  ');
}

// ---------- Anzeige (nahtloser Marquee) ------------------------------------

function applyMarqueeSpeed(){
  // doppelte Nachricht -> animiere -50% der Trackbreite
  const chunk = elContent.querySelector('.chunk');
  if(!chunk) return;
  const chunkWidth = chunk.offsetWidth; // in CSS-Pixeln
  const seconds = Math.max(12, chunkWidth / SPEED_PX_SEC);
  elContent.style.setProperty('--marquee-dur', `${seconds}s`);

  // Animation sauber neu starten
  elContent.style.animation = 'none';
  // Reflow erzwingen
  void elContent.offsetWidth;
  elContent.style.animation = '';
}

function setTrackText(text){
  // Doppeln für nahtlosen Loop
  const safe = escapeHtml(text);
  elContent.innerHTML = `<span class="chunk">${safe}</span><span class="gap">  </span><span class="chunk">${safe}</span>`;
  applyMarqueeSpeed();
}

function escapeHtml(s){ return String(s).replace(/[<>&"]/g, m => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[m])); }

// Wählt die nächste Meldung (Tipps haben Priorität)
function nextMessage(){
  const now = performance.now()/1000;
  state.tipQueue = state.tipQueue.filter(t => now - t.ts < TIP_TTL_SEC);
  if (state.tipQueue.length){
    return state.tipQueue.shift().text;
  }
  return metricsLine();
}

// ---------- Public ----------------------------------------------------------

export function initTicker(){
  elInner   = document.getElementById('tickerInner');
  elContent = document.getElementById('tickerContent');
  if(!elInner || !elContent) return;

  // Initial anzeigen + periodisches Update
  setTrackText(nextMessage());
  setInterval(()=> setTrackText(nextMessage()), REFRESH_MS);

  // Bei Resize die Geschwindigkeit anpassen
  window.addEventListener('resize', () => applyMarqueeSpeed(), { passive:true });
}