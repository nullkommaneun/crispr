// ticker.js
// Technischer Ticker (FPS, Last, Sim, Mutation, Nahrung/s, Zellen, Food, Stämme, KI)
// + Tipps. Aktualisierung gedrosselt (~5 s). Exportiert getStatusLabel für andere Module.

import { on, emit, EVT } from './event.js';

const SELECTOR_BAR  = '#techTicker'; // optional: <div id="techTicker">
const SELECTOR_TIPS = '#techTips';   // optional: <div id="techTips">

let lastStats = {
  fps: 0,               // gemittelt
  last: 0,              // Auslastung in %
  sim: '1x',            // Timescale-Label
  mut: 0.5,             // Mutation in %
  foodRate: 0,          // Nahrung / s
  cells: 0,
  food: 0,
  tribes: 0,
  ai: 'Aus'             // 'Aus' | 'Heuristik' | 'Modell aktiv'
};

let barEl = null;
let tipsEl = null;
let lastUpdate = 0;
const UPDATE_EVERY_MS = 5000;

const clamp = (n,a=0,b=1e9)=>Math.max(a,Math.min(b,n));
const pct   = v => `${clamp(Math.round(v), 0, 999)}%`;
const int   = v => `${clamp(Math.round(v), 0, 99999)}`;

/** Liefert den kompakten Status-String (wird von engine.js benutzt). */
export function getStatusLabel(s = lastStats) {
  const fps  = s.fps ?? 0;
  const last = s.last ?? 0;
  const sim  = s.sim ?? '1x';
  const mutV = Number.isFinite(s.mut) ? `${(s.mut).toFixed(1)}%` : String(s.mut ?? '0.0%');
  const food = s.foodRate ?? s.foodPerSec ?? 0;
  const cells = s.cells ?? 0;
  const foods = s.food ?? 0;
  const tribes= s.tribes ?? 0;
  const ai    = s.ai ?? 'Aus';
  return `FPS ${int(fps)} • Last ${pct(last)} • Sim ${sim} • Mut ${mutV} • Nahrung ${int(food)}/s • Zellen ${int(cells)} • Food ${int(foods)} • Stämme ${int(tribes)} • KI ${ai}`;
}

function tryUpdateBar(nowMs = performance.now()){
  if (!barEl) return;
  if (nowMs - lastUpdate < UPDATE_EVERY_MS) return;
  lastUpdate = nowMs;
  barEl.textContent = getStatusLabel();
}

function showTip(text){
  if (!tipsEl || !text) return;
  tipsEl.textContent = text;
}

/** Von außen neue Stats einspielen. */
export function setStats(partial){
  if (!partial || typeof partial !== 'object') return;
  lastStats = { ...lastStats, ...partial };
  tryUpdateBar();
}

/** Initialisierung – Event-Hooks setzen, DOM-Elemente finden. */
export function initTicker(){
  barEl  = document.querySelector(SELECTOR_BAR);
  tipsEl = document.querySelector(SELECTOR_TIPS);

  on(EVT.STATUS, ({ stats, tip, status }) => {
    if (stats) setStats(stats);
    if (tip)   showTip(String(tip));
    if (status && typeof status === 'string') showTip(status);
  });

  on(EVT.TICK, () => tryUpdateBar());
  on(EVT.TIMESCALE_CHANGED, ({ label }) => setStats({ sim: label || '1x' }));
  on(EVT.ADVISOR_MODE_CHANGED, ({ modeLabel }) => setStats({ ai: modeLabel || 'Aus' }));

  // Erstes Rendering
  tryUpdateBar(0);
}

export default { initTicker, setStats, getStatusLabel };