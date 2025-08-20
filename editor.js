// editor.js
// CRISPR-Editor: Modal-UI zum Anpassen von Traits + KI/Heuristik-Steuerung.
// Bietet stabile benannte Exporte (openEditor, initEditor, …) und einen Default-Namespace "Editor".

import { on, emit, EVT } from './event.js';
import * as Entities from './entities.js';
import {
  Advisor,                // Namespace (aus advisor.js): enthält u.a. getAdvisorMode, scoreGenome, …
  AdvisorMode,
  getAdvisorMode,
  getAdvisorModeLabel,
  toggleAdvisorMode,
  loadAdvisorModel,
  scoreGenome
} from './advisor.js';

// -------------------------------------------------------------
// Internals
// -------------------------------------------------------------
let modalEl = null;
let isOpen = false;
let currentCellId = null;
let modelInputEl = null;
let modeBtnEl = null;
let cellListEl = null;

const TRAITS = ['TEM','GRO','EFF','SCH','MET'];
const DEFAULT_GENOME = { TEM:5, GRO:5, EFF:5, SCH:5, MET:5 };

// Hilfsadapter: robust ggü. unterschiedlichen Entities-APIs
const api = {
  listCells: () =>
    (Entities.getAllCells?.() ?? Entities.getCells?.() ?? Entities.listCells?.() ?? Entities.cells ?? []),
  getCell: (id) => {
    const arr = api.listCells();
    return Array.isArray(arr) ? arr.find(c => c?.id === id) : null;
  },
  // optional: neues Wesen erzeugen – wenn nicht vorhanden, nur Event senden
  createCell: (opts) => {
    if (Entities.createCell) return Entities.createCell(opts);
    emit(EVT.EDITOR_SPAWN_REQUEST, opts);
    return null;
  },
  // Genome eines existierenden Wesens ändern (selten genutzt)
  updateGenome: (id, g) => {
    if (Entities.updateGenome) return Entities.updateGenome(id, g);
    emit(EVT.EDITOR_UPDATE_REQUEST, { id, genome: g });
  }
};

// -------------------------------------------------------------
// UI-Erzeugung
// -------------------------------------------------------------
function ensureModal() {
  if (modalEl) return;

  modalEl = document.createElement('div');
  modalEl.id = 'crispr-editor-modal';
  modalEl.style.cssText = `
    position: fixed; inset: 0; z-index: 10000;
    display: none; align-items: center; justify-content: center;
    background: rgba(0,0,0,.45);
  `;

  const panel = document.createElement('div');
  panel.style.cssText = `
    width: min(920px, 92vw); max-height: 88vh; overflow: hidden;
    background: #0f1513; color: #dfe9e7; border: 1px solid #20302a; border-radius: 12px;
    box-shadow: 0 8px 40px rgba(0,0,0,.6);
    display: grid; grid-template-columns: 1fr 1fr; gap: 0; 
  `;

  // Linke Seite: Traits
  const left = document.createElement('div');
  left.style.cssText = 'padding:18px 18px 12px 18px; border-right:1px solid #1d2a25;';
  left.innerHTML = `
    <h3 style="margin:0 0 12px 0; font:600 18px system-ui">CRISPR‑Editor</h3>
    <div id="trait-grid" style="display:grid; grid-template-columns: 1fr auto auto auto; gap:8px; align-items:center;"></div>
    <div style="margin-top:14px; display:flex; gap:8px; align-items:center;">
      <button id="btn-editor-apply" style="padding:8px 12px; border-radius:8px; background:#1f3d32; color:#e8fff7; border:1px solid #275041;">Übernehmen</button>
      <span style="opacity:.8; font-size:12px">Neue Zellen aus dem Editor starten immer als <b>neuer Stamm</b>.</span>
    </div>
  `;

  // Rechte Seite: Zellenliste + Advisor
  const right = document.createElement('div');
  right.style.cssText = 'padding:18px 18px 12px 18px;';
  right.innerHTML = `
    <h3 style="margin:0 0 12px 0; font:600 18px system-ui">Lebende Zellen · Prognose</h3>
    <div id="cell-list" style="display:flex; flex-direction:column; gap:8px; height:48vh; overflow:auto;"></div>
    <div style="margin-top:14px; padding:10px; border:1px solid #23342d; border-radius:8px; background:#0c1512;">
      <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
        <span>KI‑Advisor:</span>
        <button id="btn-mode" style="padding:6px 10px; border-radius:8px; background:#1f3d32; color:#e8fff7; border:1px solid #275041;"></button>
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        <input id="model-url" value="models/model.json" style="flex:1; padding:8px; border-radius:8px; border:1px solid #23342d; background:#0b130f; color:#e8fff7" />
        <button id="btn-load-model" style="padding:8px 12px; border-radius:8px; background:#233d7a; color:#fff; border:1px solid #2e4b98">Modell laden</button>
      </div>
      <div id="mode-sub" style="margin-top:6px; opacity:.8; font-size:12px"></div>
    </div>
  `;

  // Close X
  const close = document.createElement('button');
  close.textContent = '×';
  close.title = 'Schließen';
  close.style.cssText = `
    position:absolute; top:8px; right:8px; width:32px; height:32px; 
    border-radius:8px; border:1px solid #24352e; background:#0d1714; color:#cfe9dc; font-size:18px;
  `;
  close.addEventListener('click', closeEditor);

  panel.append(left, right);
  modalEl.append(panel, close);
  document.body.appendChild(modalEl);

  // Cache UI-Refs
  modelInputEl = modalEl.querySelector('#model-url');
  modeBtnEl = modalEl.querySelector('#btn-mode');
  cellListEl = modalEl.querySelector('#cell-list');

  // Trait-Grid aufbauen
  buildTraitGrid();

  // Buttons
  modalEl.querySelector('#btn-editor-apply')?.addEventListener('click', onApply);
  modeBtnEl?.addEventListener('click', () => {
    toggleAdvisorMode();
    refreshHeader();
    refreshCells(); // Sortierung kann sich ändern
  });
  modalEl.querySelector('#btn-load-model')?.addEventListener('click', async () => {
    const url = modelInputEl?.value?.trim() || 'models/model.json';
    const res = await loadAdvisorModel(url);
    if (res?.ok) {
      // automatisch auf Modell schalten
      toggleAdvisorMode(); // OFF -> HEUR -> MODEL (wenn geladen)
    }
    refreshHeader();
    refreshCells();
  });

  refreshHeader();
}

function buildTraitGrid() {
  const grid = modalEl.querySelector('#trait-grid');
  grid.innerHTML = '';

  // Aktuelle Auswahl (oder Defaults)
  const cur = currentSelectionGenome();

  // Kopfzeilen
  grid.append(labelEl('Trait'), labelEl('−'), labelEl('Wert'), labelEl('+'));

  TRAITS.forEach(tr => {
    const v = cur[tr] ?? 5;

    const minus = btnSmall('−', () => adjustTrait(tr, -1));
    const plus  = btnSmall('+', () => adjustTrait(tr, +1));
    const val   = valueBadge(`val-${tr}`, v);
    const name  = labelEl(trName(tr));

    grid.append(name, minus, val, plus);
  });
}

function labelEl(txt) {
  const span = document.createElement('div');
  span.textContent = txt;
  span.style.cssText = 'opacity:.9; font-size:13px;';
  return span;
}

function btnSmall(txt, onClick) {
  const b = document.createElement('button');
  b.textContent = txt;
  b.style.cssText = `
    width:36px; padding:6px 0; border-radius:8px; border:1px solid #2a3d35; 
    background:#0c1512; color:#dff2ea;
  `;
  b.addEventListener('click', onClick);
  return b;
}

function valueBadge(id, v) {
  const b = document.createElement('div');
  b.id = id;
  b.textContent = String(v);
  b.style.cssText = `
    min-width:38px; text-align:center; padding:6px 8px; border-radius:8px;
    background:#14201c; border:1px solid #22342c;
  `;
  return b;
}

function trName(key){ 
  switch(key){
    case 'TEM': return 'TEM – Tempo';
    case 'GRO': return 'GRÖ – Größe';
    case 'EFF': return 'EFF – Effizienz';
    case 'SCH': return 'SCH – Schutz';
    case 'MET': return 'MET – Metabolismus';
    default: return key;
  }
}

function currentSelectionGenome() {
  const cell = currentCellId ? api.getCell(currentCellId) : null;
  return cell?.genes ?? { ...DEFAULT_GENOME };
}

function setTraitValue(key, v) {
  const clamped = Math.max(1, Math.min(9, Math.round(v)));
  const badge = modalEl.querySelector(`#val-${key}`);
  if (badge) badge.textContent = String(clamped);
}

function adjustTrait(key, delta) {
  const cur = currentSelectionGenome();
  const next = Math.max(1, Math.min(9, (cur[key] ?? 5) + delta));
  setTraitValue(key, next);
}

// -------------------------------------------------------------
// Render: Zellenliste & Header
// -------------------------------------------------------------
function refreshHeader() {
  const lbl = getAdvisorModeLabel?.() ?? 'Aus';
  if (modeBtnEl) modeBtnEl.textContent = `Modus: ${lbl}`;
  const sub = modalEl.querySelector('#mode-sub');
  if (sub) {
    const mode = getAdvisorMode?.() ?? AdvisorMode.OFF;
    sub.textContent = `Modi: Aus • Heuristik • Modell (TensorFlow.js) — aktuell: ${lbl}`;
    if (mode === AdvisorMode.OFF) sub.textContent += ' • Prognosen ausgeblendet';
  }
}

function refreshCells() {
  if (!cellListEl) return;
  cellListEl.innerHTML = '';

  const cells = api.listCells();
  const mode = getAdvisorMode?.() ?? AdvisorMode.OFF;

  // Score berechnen (nur wenn aktiv)
  const rows = (cells || []).map(c => {
    const g = c?.genes ?? DEFAULT_GENOME;
    const s = (mode === AdvisorMode.OFF) ? null : (scoreGenome?.(g) ?? null);
    return { id: c?.id, name: c?.name ?? `Zelle #${c?.id ?? '?'}`, stamm: c?.stammId ?? c?.stamm ?? '?', score: s };
  });

  // absteigend sortieren, 'null' ans Ende
  rows.sort((a,b) => (b.score ?? -1) - (a.score ?? -1));

  rows.forEach(r => {
    const line = document.createElement('button');
    line.style.cssText = `
      width:100%; text-align:left; padding:10px; border-radius:10px;
      background:#0c1512; border:1px solid #1f2e28; color:#e6f7f1;
      display:flex; align-items:center; justify-content:space-between; gap:12px;
    `;
    const left = document.createElement('div');
    left.textContent = `${r.name}  •  Stamm ${r.stamm}`;
    left.style.cssText = 'white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';

    const right = document.createElement('div');
    right.style.cssText = 'min-width:40px; text-align:right; opacity:.9;';
    right.textContent = (r.score == null) ? '—' : `${r.score}%`;

    line.append(left, right);
    line.addEventListener('click', () => {
      currentCellId = r.id;
      buildTraitGrid();
    });

    cellListEl.appendChild(line);
  });
}

// -------------------------------------------------------------
// Apply: neue Zelle erzeugen (neuer Stamm)
// -------------------------------------------------------------
function onApply() {
  // Traitwerte aus Badges sammeln
  const g = {};
  TRAITS.forEach(k => {
    const v = Number(modalEl.querySelector(`#val-${k}`)?.textContent ?? 5);
    g[k] = Math.max(1, Math.min(9, v|0));
  });

  // sofort als neue Zelle (neuer Stamm) spawnen
  api.createCell?.({
    name: null,                        // Engine/Entities vergibt Namen (Adam/Eva/…)
    sex: null,                         // Engine definiert Geschlecht
    stammId: 'new',                    // Kennzeichen für neuen Stamm (Engine legt echte ID an)
    genes: g,
    fromEditor: true
  });

  // UI Feedback
  const btn = modalEl.querySelector('#btn-editor-apply');
  if (btn) {
    const old = btn.textContent;
    btn.textContent = 'Erstellt ✓';
    setTimeout(() => (btn.textContent = old), 900);
  }

  // Liste aktualisieren
  refreshCells();
}

// -------------------------------------------------------------
// Public API
// -------------------------------------------------------------
export function initEditor() {
  ensureModal();
  // Falls es in deiner Toolbar einen „Editor“-Button gibt, hier anbinden:
  const trigger = document.getElementById('btn-editor') || document.querySelector('[data-open="editor"]');
  if (trigger && !trigger.dataset.bound) {
    trigger.addEventListener('click', toggleEditor);
    trigger.dataset.bound = '1';
  }

  // Bei Änderungen aus der Simulation (Zellgeburt/Tod) Liste aktualisieren
  on(EVT.ENTITIES_CHANGED, () => {
    if (isOpen) refreshCells();
  });

  refreshHeader();
}

export function openEditor() {
  ensureModal();
  isOpen = true;
  modalEl.style.display = 'flex';
  // Standard: aktuelle Zellen anzeigen
  refreshHeader();
  refreshCells();
  buildTraitGrid();
  emit(EVT.UI_EDITOR_OPENED, {});
}

export function closeEditor() {
  if (!modalEl) return;
  isOpen = false;
  modalEl.style.display = 'none';
  emit(EVT.UI_EDITOR_CLOSED, {});
}

export function toggleEditor() {
  if (isOpen) closeEditor(); else openEditor();
}

export function isEditorOpen() { return !!isOpen; }

// Default-Namespace (komfortabel für Default-Importe)
const Editor = { initEditor, openEditor, closeEditor, toggleEditor, isEditorOpen };
export default Editor;