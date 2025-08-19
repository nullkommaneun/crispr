// ticker.js – Technischer Marquee-Ticker (nur Metriken + Tipps)

import { Events, EVT } from './event.js';
import * as Entities from './entities.js';
import { getStatusLabel } from './advisor.js';

let elInner, elContent;

const REFRESH_MS      = 5000;
const SPEED_PX_SEC    = 60;
const TIP_TTL_SEC     = 40;
const FPS_WINDOW_SEC  = 5;

const state = {
  fpsSamples: [],
  tipQueue: [],
  metrics: { ts: 1, mutPct: 0.5, foodPerSec: 90 }
};

Events.on(EVT.TICK, (d)=>{
  if(!d?.fps) return;
  const t = performance.now()/1000;
  state.fpsSamples.push([t, d.fps]);
  while (state.fpsSamples.length && (t - state.fpsSamples[0][0] > FPS_WINDOW_SEC)) state.fpsSamples.shift();
});

// Nur Tipps (Label exakt "Tipp") zulassen
Events.on(EVT.TIP, (d)=>{
  if(!d?.text || (d.label||'').toLowerCase() !== 'tipp') return;
  state.tipQueue.push({ text: d.text, ts: performance.now()/1000 });
  if(state.tipQueue.length > 6) state.tipQueue.shift();
});

// Statuswerte aufnehmen
Events.on(EVT.STATUS, (d)=>{
  if(!d) return;
  if(d.key === 'timescale')         state.metrics.ts        = Number(d.value) || 1;
  if(d.key === 'mutationRatePct')   state.metrics.mutPct    = Number(d.value) || state.metrics.mutPct;
  if(d.key === 'foodRatePerSec')    state.metrics.foodPerSec= Number(d.value) || state.metrics.foodPerSec;
});

function getMetrics(){
  let fps = 0;
  if(state.fpsSamples.length){
    fps = state.fpsSamples.reduce((a,[,v])=>a+v,0) / state.fpsSamples.length;
  }
  fps = Math.max(1, Math.min(240, fps));
  const frameMs = 1000 / fps;
  const loadPct = Math.min(300, Math.round((frameMs / 16.7) * 100));

  const cells = Entities.cells.filter(c=>!c.dead).length;
  const foods = Entities.foods.length;
  const stamm = Object.keys(Entities.getStammCounts()).length;

  let ki = getStatusLabel?.() || 'Berater: Aus';
  ki = ki.replace(/^Berater:\s*/,''); // "Aus" | "Heuristik aktiv" | "Modell aktiv"

  const ts  = state.metrics.ts || 1;
  const mut = (state.metrics.mutPct ?? 0).toFixed(state.metrics.mutPct%1 ? 1 : 0);
  const foodPerSec = Math.round(state.metrics.foodPerSec ?? (Entities.getWorldConfig().foodRate/60));

  return { fps: Math.round(fps), frameMs: frameMs.toFixed(1), load: loadPct, cells, foods, stamm, ts, mut, foodPerSec, ki };
}

function metricsLine(){
  const m = getMetrics();
  const parts = [
    `FPS ${m.fps}`, `${m.frameMs}ms`, `Last ${m.load}%`,
    `Sim ${m.ts}×`, `Mut ${m.mut}%`, `Nahrung ${m.foodPerSec}/s`,
    `Zellen ${m.cells}`, `Food ${m.foods}`, `Stämme ${m.stamm}`, `KI ${m.ki}`
  ];
  return parts.join('  •  ');
}

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
function escapeHtml(s){ return String(s).replace(/[<>&"]/g, m => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[m])); }
function nextMessage(){
  const now = performance.now()/1000;
  state.tipQueue = state.tipQueue.filter(t => now - t.ts < TIP_TTL_SEC);
  if (state.tipQueue.length) return state.tipQueue.shift().text;
  return metricsLine();
}

export function initTicker(){
  elInner   = document.getElementById('tickerInner');
  elContent = document.getElementById('tickerContent');
  if(!elInner || !elContent) return;
  setTrackText(nextMessage());
  setInterval(()=> setTrackText(nextMessage()), REFRESH_MS);
  window.addEventListener('resize', () => applyMarqueeSpeed(), { passive:true });
}