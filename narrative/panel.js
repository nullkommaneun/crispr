// narrative/panel.js
// DNA Daily – Boulevard-Schlagzeilen, ereignisgetrieben.
// Fehlertolerant: läuft auch, wenn kein Container im DOM vorhanden ist.

import { on, emit, EVT } from '../event.js';

let feedEl = null;   // Container, in dem die Meldungen landen
let inited = false;

const MAX_ITEMS = 80;

// Dedupe-Zeiten pro Schlüssel
const lastKeyAt = new Map();
function shouldSkip(key, cooldownMs) {
  const now = performance.now();
  const last = lastKeyAt.get(key) ?? 0;
  if (now - last < cooldownMs) return true;
  lastKeyAt.set(key, now);
  return false;
}

// Mehrere mögliche Container-Namen unterstützen (best effort)
function resolveFeedEl() {
  const candidates = [
    '#newspaper .feed',
    '#narrative .feed',
    '#narrativeFeed',
    '#newsFeed',
    '#dnaDailyFeed',
    '.dna-daily-feed'
  ];
  for (const sel of candidates) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  // Fallback: Erzeuge minimalen Container unterhalb eines "DNA Daily"-Blocks, wenn möglich
  const titleEl = [...document.querySelectorAll('*')].find(n => /DNA\s*Daily/i.test(n.textContent || ''));
  if (titleEl && titleEl.parentElement) {
    const box = document.createElement('div');
    box.className = 'dna-daily-feed';
    titleEl.parentElement.appendChild(box);
    return box;
  }
  return null; // not fatal
}

function el(html) {
  const div = document.createElement('div');
  div.innerHTML = html.trim();
  return div.firstElementChild;
}

function pushHeadline({icon='📰', title='', source='CRISPR News'}) {
  if (!feedEl) return; // fail-soft
  const item = el(`
    <div class="np-item">
      <div class="np-line"><strong>${icon} ${escapeHtml(title)}</strong></div>
      <div class="np-meta">${escapeHtml(source)} • ${new Date().toLocaleTimeString()}</div>
    </div>
  `);
  feedEl.prepend(item);
  // Limit
  while (feedEl.children.length > MAX_ITEMS) {
    feedEl.lastElementChild?.remove();
  }
}

// Minimal XSS-Schutz
function escapeHtml(s) {
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;');
}

/* ---------- Schlagzeilen-Generatoren ---------- */

const romance = [
  id => `Liebesstory im Labor! Zelle #${id} sucht Nähe – Experten sprechen von starker Anziehung.`,
  id => `Herzklopfen bei #${id}: Begegnung mit Partnerzelle sorgt für Aufsehen.`,
  id => `DNA-Match! Zelle #${id} trifft auf genetisch passenden Partner.`,
];

const scandalInbreed = [
  (a,b)=>`Skandal! Zelle #${a} paart sich mit Verwandter #${b} – Forscher warnen vor Mutationsrisiken.`,
  (a,b)=>`Aufreger: #${a} und #${b} – zu nah verwandt? Inzuchtverdacht im Labor.`,
];

const mutationNews = [
  id => `🧪 Mutation-Alarm! Nachwuchs #${id} zeigt auffällige Merkmale.`,
  id => `Gen-Schub: Zelle #${id} kommt mit neuer Kombination auf die Welt.`,
];

const famineNews = [
  ()=>`🔥 Hungersnot! Zu wenig Nahrung in Reichweite – Verteilung kollabiert.`,
  ()=>`⚠️ Alarm: Viele Zellen ohne Energiequellen – Forscher raten, Nahrung zu erhöhen.`,
];

const overcrowdNews = [
  ()=>`🐝 Überbevölkerung! Dichte Cluster stören Nahrungssuche – Kollisionen nehmen zu.`,
  ()=>`Dicht an dicht: Das Labor platzt – Stabilität gefährdet.`,
];

function pick(arr){ return arr[(Math.random()*arr.length)|0]; }

/* ---------- Event-Handler ---------- */

function handleMate({ aId, bId, relatedness = 0 }) {
  // relatedness ~ 0..1 (optional)
  if (relatedness >= 0.125) { // Cousin-Level ~ 1/8
    if (shouldSkip('inbreed', 40000)) return;
    pushHeadline({ icon:'📰', title: pick(scandalInbreed)(aId ?? '?', bId ?? '?'), source: 'DNA Daily' });
  } else {
    if (shouldSkip('romance', 15000)) return;
    const id = Math.random() < 0.5 ? aId : bId;
    pushHeadline({ icon:'❤️', title: pick(romance)(id ?? '?'), source: 'DNA Daily' });
  }
}

function handleBirth({ childId, mutationStrength = 0 }) {
  if (mutationStrength > 0.01) {
    if (shouldSkip('mutation', 20000)) return;
    pushHeadline({ icon:'🧬', title: pick(mutationNews)(childId ?? '?'), source: 'CRISPR News' });
  }
}

function handleStatus({ stats = {} }) {
  // Fail-soft: stats können fehlen/teilweise leer sein
  const cells = stats.cells ?? 0;
  const foodPerSec = stats.foodRate ?? stats.foodPerSec ?? 0;
  const deathsLastMin = stats.deathsLastMin ?? 0;

  // Hungersnot: wenig Nahrung vs. Bedarf / oder viele Tode kurz hintereinander
  if ((foodPerSec < Math.max(5, cells * 0.15)) || deathsLastMin > 10) {
    if (!shouldSkip('famine', 30000)) {
      pushHeadline({ icon:'🔥', title: pick(famineNews)(), source: 'DNA Daily' });
    }
  }

  // Überbevölkerung (einfache Heuristik)
  if (cells > 180 && (foodPerSec < cells * 0.4)) {
    if (!shouldSkip('overcrowd', 45000)) {
      pushHeadline({ icon:'🐝', title: pick(overcrowdNews)(), source: 'CRISPR News' });
    }
  }
}

function handleExtinction({ tribeId }) {
  if (shouldSkip(`extinct:${tribeId}`, 60000)) return;
  pushHeadline({ icon:'⚰️', title:`Drama! Stamm ${tribeId ?? '?'} ist vollständig erloschen.`, source:'DNA Daily' });
}

/* ---------- Init ---------- */

export function initNarrativePanel() {
  if (inited) return;
  inited = true;

  feedEl = resolveFeedEl(); // kann null sein – dann werden Headline-Aufrufe still ignoriert

  on(EVT.MATE, handleMate);
  on(EVT.BIRTH, handleBirth);
  on(EVT.STATUS, handleStatus);
  on(EVT.DEATH, (d)=>{ if (d?.extinct && d.tribeId!=null) handleExtinction(d); });

  // Optionaler Willkommens-Hook
  pushHeadline({ icon:'🗞️', title:'DNA Daily meldet sich live aus dem Labor.', source:'DNA Daily' });
}

// Für bestehende Aufrufe, die evtl. default erwarten:
export default { initNarrativePanel };