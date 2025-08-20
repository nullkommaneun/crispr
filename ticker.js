// ticker.js – Technischer Marquee-Ticker (nur Technik, KEINE Spiel-Ereignisse)
//
// - keine EVT.TIP-Verarbeitung mehr
// - sammelt FPS (gleitendes Mittel), liest Statuswerte (Timescale, Mutation, Nahrung/s)
// - aktualisiert Text alle ~5 s
// - konstante Scrolling-Geschwindigkeit, nahtloser Loop

import { on, off, emit, once, EVT } from './event.js';
import * as Entities from './entities.js';
import { getStatusLabel } from './advisor.js';

let elInner, elContent;

const REFRESH_MS     = 5000;
const SPEED_PX_SEC   = 60;
const FPS_WINDOW_SEC = 5;

const state = {
  fpsSamples: [],
  metrics: {
    ts: 1,            // Timescale
    mutPct: 0.5,      // Mutation in %
    foodPerSec: 90    // Nahrung/s
  }
};

// ---------- Sammeln: NUR TICK & STATUS -------------------------------------

Events.on(EVT.TICK, (d)=>{
  if(!d?.fps) return;
  const t = performance.now()/1000;
  state.fpsSamples.push([t, d.fps]);
  while (state.fpsSamples.length && t - state.fpsSamples[0][0] > FPS_WINDOW_SEC) {
    state.fpsSamples.shift();
  }
});

// Statuswerte: unterstützen alte & neue Keys
Events.on(EVT.STATUS, (d)=>{
  if(!d) return;
  switch (d.key) {
    case 'timescale':         state.metrics.ts        = Number(d.value) || 1; break;
    case 'mutationRatePct':   state.metrics.mutPct    = Number(d.value) || state.metrics.mutPct; break;
    case 'mutationRate':      state.metrics.mutPct    = Math.round((Number(d.value)||0)*1000)/10; break; // falls Prozent nicht direkt kommt
    case 'foodRatePerSec':    state.metrics.foodPerSec= Number(d.value) || state.metrics.foodPerSec; break;
    default: break; // andere Status-Texte ignorieren
  }
});

// KEIN Events.on(EVT.TIP, ...) mehr – Spielereignisse werden explizit ignoriert.

// ---------- Metriken aufbereiten -------------------------------------------

function getMetrics(){
  // FPS-Mittel
  let fps = 0;
  if(state.fpsSamples.length){
    fps = state.fpsSamples.reduce((a,[,v])=>a+v,0)/state.fpsSamples.length;
  }
  fps = Math.max(1, Math.min(240, fps));
  const frameMs = 1000 / fps;
  const loadPct = Math.min(300, Math.round((frameMs / 16.7) * 100));

  const cells = (Entities.cells || []).filter(c=>!c.dead).length;
  const foods = (Entities.foods || []).length;
  const stamm = Object.keys(Entities.getStammCounts?.() || {}).length;

  let ki = getStatusLabel?.() || 'Berater: Aus';
  ki = ki.replace(/^Berater:\s*/,''); // "Aus" | "Heuristik aktiv" | "Modell aktiv"

  const ts  = state.metrics.ts || 1;
  const mut = (state.metrics.mutPct ?? 0).toFixed((state.metrics.mutPct%1)?1:0);
  const foodPerSec = Math.round(state.metrics.foodPerSec ?? ((Entities.getWorldConfig?.().foodRate||0)/60));

  return { fps:Math.round(fps), frameMs:frameMs.toFixed(1), load:loadPct,
           cells, foods, stamm, ts, mut, foodPerSec, ki };
}

function metricsLine(){
  const m = getMetrics();
  const parts = [
    `FPS ${m.fps}`, `${m.frameMs}ms`, `Last ${m.load}%`,
    `Sim ${m.ts}×`, `Mut ${m.mut}%`, `Nahrung ${m.foodPerSec}/s`,
    `Zellen ${m.cells}`, `Food ${m.foods}`, `Stämme ${m.stamm}`,
    `KI ${m.ki}`
  ];
  return parts.join('  •  ');
}

// ---------- Anzeige (nahtloser Marquee) ------------------------------------

function applyMarqueeSpeed(){
  const chunk = elContent.querySelector('.chunk');
  if(!chunk) return;
  const w = chunk.offsetWidth; // px
  const seconds = Math.max(12, w / SPEED_PX_SEC);
  elContent.style.setProperty('--marquee-dur', `${seconds}s`);
  elContent.style.animation = 'none'; void elContent.offsetWidth; elContent.style.animation = '';
}

function setTrackText(text){
  const safe = escapeHtml(text);
  elContent.innerHTML = `<span class="chunk">${safe}</span><span class="gap">  </span><span class="chunk">${safe}</span>`;
  applyMarqueeSpeed();
}

function escapeHtml(s){
  return String(s).replace(/[<>&"]/g, m => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[m]));
}

// ---------- Public ----------------------------------------------------------

export function initTicker(){
  elInner   = document.getElementById('tickerInner');
  elContent = document.getElementById('tickerContent');
  if(!elInner || !elContent) return;

  setTrackText(metricsLine());
  setInterval(()=> setTrackText(metricsLine()), REFRESH_MS);
  window.addEventListener('resize', () => applyMarqueeSpeed(), { passive:true });
}