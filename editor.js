// editor.js
// Neuer CRISPR-Editor: 3-Stufen-Advisor, sortierte Zellenliste (Score), What-if Prognose & Erklär-Chips.

import { Advisor } from './advisor.js';
import * as Entities from './entities.js';
import { on, emit } from './event.js';

let modalEl = null;
let listEl = null;
let modeButtons = null;
let modelUrlInput = null;
let statusBadge = null;
let draft = null;        // aktueller Entwurf { TEM..MET }
let selectedCell = null; // aktuell angeklickte Zelle
let whatIfEl = null;     // Anzeige Prognose + Delta
let chipsWrap = null;    // Trait-Erklärungen
let traitRows = {};      // { TEM: {dec, val, inc} ... }

const TRAITS = ['TEM','GRO','EFF','SCH','MET'];

function ensureModal() {
  if (modalEl) return;

  modalEl = document.createElement('div');
  modalEl.id = 'editorModal';
  modalEl.className = 'modal';

  modalEl.innerHTML = `
    <div class="modalHeader">
      <h2>CRISPR‑Editor</h2>
      <button class="btn btn-ghost" id="editorClose">✕</button>
    </div>
    <div class="modalBody editorBody">
      <div class="editorLeft">
        <section>
          <h3>Traits anpassen</h3>
          <div id="traitRows"></div>
          <div id="whatIf" class="whatIfBox">
            <div class="scoreLine">
              <span>Prognose (Entwurf):</span>
              <strong id="whatIfScore">—</strong>
              <small id="whatIfDelta"></small>
            </div>
            <div id="traitChips" class="traitChips"></div>
          </div>
          <div class="btnRow">
            <button class="btn btn-accent" id="applyBtn">Übernehmen</button>
            <span class="hint">Neue Zellen aus dem Editor starten immer als <strong>neuer Stamm</strong>.</span>
          </div>
        </section>
      </div>

      <div class="editorRight">
        <section class="advisorPanel">
          <div class="advisorHeader">
            <div>KI‑Advisor:</div>
            <div class="seg seg-3" id="advisorSeg">
              <button data-mode="off">Aus</button>
              <button data-mode="heuristic">Heuristik</button>
              <button data-mode="model">KI‑Modell</button>
            </div>
          </div>

          <div class="advisorStatus">
            <span id="advisorStatusDot" class="dot dot-idle"></span>
            <span id="advisorStatusText">Modus: —</span>
          </div>

          <div class="modelLoader">
            <input id="modelUrl" type="text" spellcheck="false" value="${Advisor.modelName || 'models/model.json'}" />
            <button class="btn" id="loadModelBtn">Modell laden</button>
          </div>
        </section>

        <section>
          <h3>Lebende Zellen • Prognose</h3>
          <div id="cellList" class="cellList"></div>
        </section>
      </div>
    </div>
  `;

  document.body.appendChild(modalEl);

  // Elemente sammeln
  listEl = modalEl.querySelector('#cellList');
  modelUrlInput = modalEl.querySelector('#modelUrl');
  statusBadge = modalEl.querySelector('#advisorStatusText');
  whatIfEl = modalEl.querySelector('#whatIf');
  chipsWrap = modalEl.querySelector('#traitChips');
  modeButtons = modalEl.querySelectorAll('#advisorSeg button');

  // Close
  modalEl.querySelector('#editorClose').addEventListener('click', close);

  // Advisor‑Mode Schalter
  modeButtons.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      Advisor.setMode(btn.dataset.mode);
      updateAdvisorHeader();
      refreshCellList(true);
      refreshWhatIf();
    });
  });

  // Modell laden
  modalEl.querySelector('#loadModelBtn').addEventListener('click', async ()=>{
    const url = modelUrlInput.value.trim() || 'models/model.json';
    await Advisor.loadModel(url);
  });

  // Traits UI bauen
  const rowsWrap = modalEl.querySelector('#traitRows');
  rowsWrap.innerHTML = '';
  TRAITS.forEach(tr=>{
    const row = document.createElement('div');
    row.className = 'traitRow';
    row.innerHTML = `
      <label>${labelForTrait(tr)}</label>
      <div class="stepper">
        <button class="btn sm" data-act="dec">−1</button>
        <div class="val" data-val>5</div>
        <button class="btn sm" data-act="inc">+1</button>
      </div>
    `;
    rowsWrap.appendChild(row);
    traitRows[tr] = {
      row,
      dec: row.querySelector('[data-act="dec"]'),
      inc: row.querySelector('[data-act="inc"]'),
      val: row.querySelector('[data-val]')
    };

    traitRows[tr].dec.addEventListener('click', ()=>{ changeTrait(tr, -1); });
    traitRows[tr].inc.addEventListener('click', ()=>{ changeTrait(tr, +1); });
  });

  // Apply
  modalEl.querySelector('#applyBtn').addEventListener('click', ()=>applyDraft());

  // Advisor Events
  on('advisor:modeChanged', ()=>{ updateAdvisorHeader(); refreshCellList(true); refreshWhatIf(); });
  on('advisor:status', ()=>{ updateAdvisorHeader(); });
  on('advisor:scoresInvalidated', ()=> refreshCellList(false));

  // Engine-Änderungen -> Liste in 1Hz aktualisieren
  setInterval(()=> refreshCellList(false), 1000);
}

function labelForTrait(t) {
  switch (t) {
    case 'TEM': return 'TEM – Tempo';
    case 'GRO': return 'GRÖ – Größe';
    case 'EFF': return 'EFF – Effizienz';
    case 'SCH': return 'SCH – Schutz';
    case 'MET': return 'MET – Metabolismus';
    default: return t;
  }
}

function open() {
  ensureModal();
  modalEl.classList.add('open');

  // Default: ausgewählte Zelle = erste lebende (falls vorhanden)
  const cells = safeLivingCells();
  selectedCell = cells[0] || null;
  draft = selectedCell ? { ...selectedCell.genes } : { TEM:5,GRO:5,EFF:5,SCH:5,MET:5 };
  syncTraitUI();
  updateAdvisorHeader();
  refreshCellList(true);
  refreshWhatIf();
}

function close() {
  if (!modalEl) return;
  modalEl.classList.remove('open');
}

export function init() {
  ensureModal();
  close(); // nicht automatisch anzeigen
}

export function isOpen() {
  return modalEl?.classList.contains('open') || false;
}

// ---------- Trait‑Interaktionen --------------------------------------------

function changeTrait(k, d) {
  if (!draft) return;
  draft[k] = clampInt((draft[k] ?? 5) + d, 1, 9);
  syncTraitUI();
  refreshWhatIf();
}

function clampInt(v, lo, hi) { return Math.min(hi, Math.max(lo, Math.round(v))); }

function syncTraitUI() {
  TRAITS.forEach(k=>{
    traitRows[k].val.textContent = String(draft?.[k] ?? 5);
  });
}

// ---------- What‑if‑Prognose & Erklär-Chips --------------------------------

function refreshWhatIf() {
  if (!whatIfEl || !draft) return;

  const energy = selectedCell?.energy ?? 30;
  const baseScore = selectedCell ? (Advisor.predict(selectedCell) ?? null) : null;
  const whatIfScore = Advisor.predictTraits(draft, energy);

  // Score Anzeige
  const scoreEl = modalEl.querySelector('#whatIfScore');
  const deltaEl = modalEl.querySelector('#whatIfDelta');
  if (Advisor.mode === 'off') {
    scoreEl.textContent = '—';
    deltaEl.textContent = '';
  } else {
    if (whatIfScore == null) {
      scoreEl.textContent = '—';
      deltaEl.textContent = '';
    } else {
      scoreEl.textContent = `${whatIfScore}%`;
      if (baseScore == null) {
        deltaEl.textContent = '';
      } else {
        const d = whatIfScore - baseScore;
        deltaEl.textContent = d === 0 ? '±0 pp' : (d>0?`+${d} pp`:`${d} pp`);
      }
    }
  }

  // Erklär-Chips
  chipsWrap.innerHTML = '';
  const expl = Advisor.explainTraits ? Advisor.explainTraits(draft, energy) : null;
  if (expl && Advisor.mode !== 'off') {
    TRAITS.forEach(k=>{
      const d = expl[k]?.delta ?? 0;
      const chip = document.createElement('span');
      chip.className = 'chip ' + (d>0?'pos':(d<0?'neg':'neu'));
      const sign = d>0?'+':(d<0?'':'±');
      chip.textContent = `${labelShort(k)} ${sign}${Math.abs(d)} pp`;
      chipsWrap.appendChild(chip);
    });
  }
}

function labelShort(k){
  return {TEM:'TEM',GRO:'GRÖ',EFF:'EFF',SCH:'SCH',MET:'MET'}[k] || k;
}

// ---------- Zellenliste -----------------------------------------------------

function safeLivingCells() {
  // Versuche robuste API – falls getCells nicht existiert, fallback auf Entities.cells
  let cells = [];
  try {
    cells = typeof Entities.getCells === 'function' ? Entities.getCells() : (Entities.cells || []);
  } catch { cells = []; }
  return cells.filter(c => c && c.alive !== false);
}

function refreshCellList(forceSort) {
  if (!listEl) return;
  const cells = safeLivingCells();

  let rows = cells.map(c=>{
    const score = Advisor.predict(c);
    return {
      id: c.id,
      name: c.name || `Zelle #${c.id}`,
      stamm: c.stammId ?? (c.stamm ?? '?'),
      sex: c.sex || (Math.random()<0.5?'m':'f'), // fallback
      energy: Math.round(c.energy ?? 0),
      score: (Advisor.mode === 'off') ? null : (score ?? null),
      ref: c
    };
  });

  if (Advisor.mode !== 'off' || forceSort) {
    rows.sort((a,b)=>{
      if (a.score==null && b.score==null) return (a.id||0) - (b.id||0);
      if (a.score==null) return 1;
      if (b.score==null) return -1;
      if (b.score !== a.score) return b.score - a.score;
      if (b.energy !== a.energy) return b.energy - a.energy;
      return (a.id||0) - (b.id||0);
    });
  }

  // Render
  const frag = document.createDocumentFragment();
  rows.forEach(r=>{
    const item = document.createElement('button');
    item.className = 'cellRow';
    item.innerHTML = `
      <span class="cellName">${r.name}</span>
      <span class="muted">• Stamm ${r.stamm}</span>
      <span class="sex">${r.sex==='f'?'♀':'♂'}</span>
      <span class="score">${r.score==null?'—':(r.score+'%')}</span>
    `;
    item.addEventListener('click', ()=>{
      selectedCell = r.ref;
      draft = { ...(selectedCell?.genes ?? draft) };
      syncTraitUI();
      refreshWhatIf();
    });
    frag.appendChild(item);
  });

  listEl.innerHTML = '';
  listEl.appendChild(frag);
}

// ---------- Advisor UI / Status --------------------------------------------

function updateAdvisorHeader() {
  const dot = modalEl.querySelector('#advisorStatusDot');
  const txt = modalEl.querySelector('#advisorStatusText');

  // Segmented active
  modeButtons.forEach(b=>{
    b.classList.toggle('active', b.dataset.mode === Advisor.mode);
  });

  // Status
  let statusText = `Modus: ${Advisor.mode === 'off' ? 'Aus' : (Advisor.mode==='heuristic'?'Heuristik':'KI')}`;
  if (Advisor.mode === 'model') {
    if (Advisor.status === 'ready') statusText += ` • Modell: ${Advisor.modelName || 'geladen'}`;
    else if (Advisor.status === 'loading') statusText += ` • lädt…`;
    else if (Advisor.status === 'error') statusText += ` • Fehler`;
  }
  txt.textContent = statusText;

  dot.className = 'dot ' + (
    Advisor.mode === 'model'
      ? (Advisor.status === 'ready' ? 'dot-ok' : (Advisor.status === 'loading' ? 'dot-warn' : 'dot-err'))
      : 'dot-idle'
  );
}

// ---------- Apply -> neue Zelle (neuer Stamm) -------------------------------

function applyDraft() {
  if (!draft) return;
  try {
    const w = (Entities.getWorldSize?.().w) || 800;
    const h = (Entities.getWorldSize?.().h) || 600;
    const x = Math.random() * w * 0.8 + 0.1*w;
    const y = Math.random() * h * 0.8 + 0.1*h;

    const stammId =
      (Entities.newStammId?.()) ??
      (Entities.nextStammId?.()) ??
      undefined; // Fallback: Entities vergibt

    const sex = Math.random() < 0.512 ? 'm' : 'f';

    if (typeof Entities.createCell === 'function') {
      Entities.createCell({
        name: 'CRISPR',
        sex,
        stammId,
        x, y,
        genes: { ...draft },
        energy: 36
      });
    } else {
      // Fallback: engine/spawn hören auf dieses Event
      emit('editor:createCell', { x, y, sex, stammId, genes: { ...draft } });
    }
  } catch (e) {
    console.error(e);
    emit('error', { where: 'editor.apply', error: String(e) });
  }
}

// ---------- Exporte ---------------------------------------------------------

export const Editor = { init, open, close, isOpen };
export default Editor;