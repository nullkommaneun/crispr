// ticker.js
// Technischer Ticker (FPS, Last, Sim, Mutation, Nahrung/s, Zellen, Food, Stämme, KI)
// + Tipps. Aktualisierung gedrosselt (~5 s). Exportiert getStatusLabel für andere Module.

import { on, emit, EVT } from './event.js';

const SELECTOR_BAR = '#techTicker';     // <div id="techTicker">…</div> (optional)
const SELECTOR_TIPS = '#techTips';      // <div id="techTips">…</div>  (optional)

let lastStats = {
  fps: 0,            // gemittelt
  last: 0,           // Auslastung in %
  sim: '1x',         // Timescale-Label
  mut: 0.5,          // Mutation in %
  foodRate: 0,       // Nahrung / s
  cells: 0,
  food: 0,
  tribes: 0,
  ai: 'Aus'          // 'Aus' | 'Heuristik' | 'Modell aktiv'
};

let barEl = null;
let tipsEl = null;

let lastUpdate = 0;
const UPDATE_EVERY_MS = 5000;

// --- Hilfen -----------------------------------------------------------------

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
function pct(v){ return `${clamp(Math.round(v), 0, 999)}%`; }
function int(v){ return `${clamp(Math.round(v), 0, 99999)}`; }

/**
 * Liefert einen kompakten Status-String. Wird auch von engine.js importiert.
 * @param {object} s – optional; wenn nicht gegeben, werden die letzten Werte benutzt
 */
export function getStatusLabel(s = lastStats) {
  const fps  = s.fps ?? 0;
  const last = s.last ?? 0;
  const sim  = s.sim ?? '1x';
  // mut kann Zahl (0.5) oder schon % sein; auf 1 Nachkommastelle runden
  const mutV = Number.isFinite(s.mut) ? `${(s.mut).toFixed(1)}%` : String(s.mut ?? '0.0%');
  const foodRate = s.foodRate ?? s.foodPerSec ?? 0;
  const cells = s.cells ?? 0;
  const food  = s.food ?? 0;
  const tribes = s.tribes ?? 0;
  const ai = s.ai ?? 'Aus';

  return `FPS ${int(fps)} • Last ${pct(last)} • Sim ${sim} • Mut ${mutV} • Nahrung ${int(foodRate)}/s • Zellen ${int(cells)} • Food ${int(food)} • Stämme ${int(tribes)} • KI ${ai}`;
}

/** Interne Aktualisierung der DOM-Balken (gedrosselt). */
function tryUpdateBar(nowMs = performance.now()) {
  if (!barEl) return;
  if (nowMs - lastUpdate < UPDATE_EVERY_MS) return;
  lastUpdate = nowMs;
  barEl.textContent = getStatusLabel();
}

/** Tipps rotieren als einzelner, sachlicher Hinweis. */
function showTip(text) {
  if (!tipsEl || !text) return;
  tipsEl.textContent = text;
}

// --- Öffentliche API ---------------------------------------------------------

/** Von außen neue Stats einspielen; wird auch via EVT.STATUS genutzt. */
export function setStats(partial) {
  if (!partial || typeof partial !== 'object') return;
  lastStats = { ...lastStats, ...partial };
  tryUpdateBar();
}

/** Initialisierung – UI-Elemente auflösen + Event-Hooks setzen. */
export function initTicker() {
  barEl  = document.querySelector(SELECTOR_BAR);
  tipsEl = document.querySelector(SELECTOR_TIPS);

  // Status-Updates aus dem Spiel entgegennehmen
  on(EVT.STATUS, ({ stats, tip, status }) => {
    if (stats) setStats(stats);
    if (tip)   showTip(String(tip));
    if (status && typeof status === 'string') showTip(status);
  });

  // Auf TICK nur leicht gedrosselt den Balken aktualisieren (ruckelfrei)
  on(EVT.TICK, () => tryUpdateBar());

  // Bei Timescale-/Advisor-Änderungen sofort spiegeln
  on(EVT.TIMESCALE_CHANGED, ({ label }) => setStats({ sim: label || '1x' }));
  on(EVT.ADVISOR_MODE_CHANGED, ({ modeLabel }) => setStats({ ai: modeLabel || 'Aus' }));

  // Erstausgabe
  tryUpdateBar(0);
}

// Default-Export (optional, falls irgendwo default importiert wird)
export default { initTicker, setStats, getStatusLabel };