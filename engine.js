// engine.js
// CRISPR Genetics Lab – App-Orchestrierung (UI, Loop, Lazy-Imports, Fehlerbanner)

import { bannerError, bannerWarn, bannerInfo, assertModule, safeImport } from './errorManager.js?v=apoc12';

// -----------------------------------------------------------------------------
// Kleiner interner Event-Bus (kein externes events.js nötig)
// -----------------------------------------------------------------------------
const listeners = new Map(); // evt -> Set<fn>
export function on(evt, fn){ if(!listeners.has(evt)) listeners.set(evt,new Set()); listeners.get(evt).add(fn); }
export function off(evt, fn){ const s=listeners.get(evt); if(s){ s.delete(fn); if(!s.size) listeners.delete(evt);} }
export function emit(evt, payload){ const s=listeners.get(evt); if(s){ for(const fn of s) try{ fn(payload);} catch(e){ console.error('[emit]',evt,e);} } }

// -----------------------------------------------------------------------------
// App-weit geteilte Zustände
// -----------------------------------------------------------------------------
const SPEED_STEPS = [1,5,10];
const state = {
  running: false,
  timescaleIdx: 0,           // 0→1x, 1→5x, 2→10x
  lastMs: 16.7,
  fps: 0,
  foodPerSec: 90,            // UI-Default
  mutationPct: 0.5,          // UI-Default
  highlight: { mode: 'all' },// {mode:'all'} | {mode:'stamm', id:number}
  aiMode: 'off',             // 'off'|'heuristic'|'model'
  counts: { cells: 0, staemme: 0 },
};

let $ = s => document.querySelector(s);

// DOM-Refs werden nach DOMContentLoaded gesetzt
let canvas, ctx, elPlay, elReset, elTimescale, elHlBtn, elEditor, elEnv;
let elMut, elFood, elHlSlider;

// Referenz auf Entities-API (lazy import)
let Entities = null;

// -----------------------------------------------------------------------------
// Öffentliche Labels (Ticker u.ä.)
// -----------------------------------------------------------------------------
export function getStatusLabel(){
  const spd = `${SPEED_STEPS[state.timescaleIdx]}x`;
  const last = `${state.lastMs.toFixed(1)}ms`;
  const mut = `${state.mutationPct.toFixed(1)}%`;
  const food = `${Math.round(state.foodPerSec)}/s`;
  const cells = state.counts.cells|0;
  const st = state.counts.staemme|0;
  const ai =
    state.aiMode === 'model' ? 'KI Modell aktiv' :
    state.aiMode === 'heuristic' ? 'KI Heuristik' :
    'KI Aus';
  return `FPS ${state.fps|0} • ${last} • Sim ${spd} • Mut ${mut} • Nahrung ${food} • Zellen ${cells} • Stämme ${st} • ${ai}`;
}

// -----------------------------------------------------------------------------
// Lazy Aktionen (Editor/Umwelt/Ticker)
// -----------------------------------------------------------------------------
export async function openEditor(){
  const m = await safeImport('./editor.js', 'editor.js', ['openEditor']);
  m.openEditor?.();
}
export async function openEnvPanel(){
  const m = await safeImport('./environment/panel.js', 'environment/panel.js', ['openEnvPanel']);
  m.openEnvPanel?.();
}
async function startTicker(){
  try{
    const m = await safeImport('./ticker.js', 'ticker.js', ['startTicker']);
    m.startTicker?.({ getLabel:getStatusLabel, refreshMs: 5000 });
  }catch(e){ /* Banner bereits gezeigt */ }
}

// -----------------------------------------------------------------------------
// UI-Bindings
// -----------------------------------------------------------------------------
function setTimescaleLabel(){
  if(elTimescale) elTimescale.textContent = `⚡ ${SPEED_STEPS[state.timescaleIdx]}x`;
}
function cycleTimescale(){
  state.timescaleIdx = (state.timescaleIdx + 1) % SPEED_STEPS.length;
  setTimescaleLabel();
}
function cycleHighlight(){
  // 'Alle Stämme' -> 'Stamm 1' -> 'Stamm 2' -> …
  if (!Entities || !Entities.getStammIds) { // Fallback ohne Entities
    state.highlight = state.highlight.mode === 'all' ? {mode:'stamm', id:1} : {mode:'all'};
  } else {
    const ids = Entities.getStammIds(); // z.B. [1,2,3]
    if (state.highlight.mode === 'all'){
      state.highlight = ids.length ? {mode:'stamm', id: ids[0]} : {mode:'all'};
    } else {
      const idx = ids.indexOf(state.highlight.id);
      const next = (idx + 1) % (ids.length || 1);
      state.highlight = (ids.length && next < ids.length) ? {mode:'stamm', id: ids[next]} : {mode:'all'};
    }
  }
  if (elHlBtn){
    if (state.highlight.mode === 'all') elHlBtn.textContent = 'Alle Stämme';
    else elHlBtn.textContent = `Stamm ${state.highlight.id}`;
  }
  emit('highlight:change', state.highlight);
}

function bindUI(){
  // Canvas
  canvas = $('#board');
  if (!canvas){
    // Fallback: Canvas erzeugen (falls noch nicht in HTML)
    const host = document.querySelector('#board-host') || document.body;
    canvas = document.createElement('canvas');
    canvas.id = 'board';
    canvas.style.cssText = 'display:block; width:100%; height:60vh;';
    host.appendChild(canvas);
  }
  ctx = canvas.getContext('2d', { alpha: false });

  // Toolbar
  elPlay      = $('#btnPlay');
  elReset     = $('#btnReset');
  elTimescale = $('#btnTimescale');
  elHlBtn     = $('#btnHighlight');
  elEditor    = $('#btnEditor');
  elEnv       = $('#btnEnv');

  elMut       = $('#sliderMutation');
  elFood      = $('#sliderFood');
  elHlSlider  = $('#sliderHighlight');

  // Events
  elPlay?.addEventListener('click', togglePlay);
  elReset?.addEventListener('click', doReset);
  elTimescale?.addEventListener('click', () => { cycleTimescale(); emit('timescale', SPEED_STEPS[state.timescaleIdx]); });
  elHlBtn?.addEventListener('click', cycleHighlight);
  elEditor?.addEventListener('click', openEditor);
  elEnv?.addEventListener('click', openEnvPanel);

  elMut?.addEventListener('input', () => {
    state.mutationPct = Number(elMut.value);
    if (Entities?.setMutationPct) Entities.setMutationPct(state.mutationPct);
  });
  elFood?.addEventListener('input', () => {
    state.foodPerSec = Number(elFood.value);
    if (Entities?.setFoodRate) Entities.setFoodRate(state.foodPerSec);
  });
  elHlSlider?.addEventListener('input', () => {
    // nur UI – reale Visualisierung handled Entities.draw ggf. selbst
    emit('highlight:intensity', Number(elHlSlider.value));
  });

  setTimescaleLabel();
  cycleHighlight(); // initialen Text setzen
}

// -----------------------------------------------------------------------------
// Simulation (Loop & Resize)
// -----------------------------------------------------------------------------
let rafId = 0, lastT = performance.now();

function resize(){
  const r = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const w = Math.max(320, Math.floor(r.width  * dpr));
  const h = Math.max(320, Math.floor(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h){
    canvas.width = w; canvas.height = h;
    if (Entities?.setWorldSize) Entities.setWorldSize(w, h);
  }
}

function loop(now){
  rafId = state.running ? requestAnimationFrame(loop) : 0;
  const rawDt = Math.max(0, Math.min(100, now - lastT));
  lastT = now;

  const dt = rawDt * SPEED_STEPS[state.timescaleIdx]; // timescaled ms
  state.lastMs = rawDt;

  // FPS gleitend mitteln
  const instFPS = rawDt > 0 ? 1000/rawDt : 0;
  state.fps = state.fps * 0.9 + instFPS * 0.1;

  // Update
  if (Entities?.update) {
    try { Entities.update(dt); }
    catch(e){
      bannerError('Simulationsfehler in Entities.update', e.message);
      console.error(e);
      state.running = false;
    }
  }

  // Render
  if (Entities?.draw && ctx) {
    try { Entities.draw(ctx, state.highlight); }
    catch(e){
      bannerError('Renderfehler in Entities.draw', e.message);
      console.error(e);
      state.running = false;
    }
  }

  // Metriken abrufen (freiwillig)
  if (Entities?.getCounts){
    const c = Entities.getCounts();
    if (c){ state.counts.cells = c.cells|0; state.counts.staemme = c.staemme|0; }
  }
}

function togglePlay(){
  state.running = !state.running;
  elPlay && (elPlay.textContent = state.running ? 'Pause' : 'Play');
  if (state.running && !rafId) { lastT = performance.now(); rafId = requestAnimationFrame(loop); }
}
function doReset(){
  try{ Entities?.reset?.(); }catch(e){ console.error(e); }
  state.running = false;
  elPlay && (elPlay.textContent = 'Play');
  // optional: Neu-Spawns übernehmen, je nach Entities
}

// -----------------------------------------------------------------------------
// Bootstrapping
// -----------------------------------------------------------------------------
async function boot(){
  bindUI();
  resize();
  window.addEventListener('resize', resize, { passive:true });

  // Lazy: Ticker starten
  startTicker();

  // Entities laden und minimal prüfen
  try{
    const mod = await safeImport('./entities.js', 'entities.js');
    // Ab hier keine named imports → keine harten Bindings, aber weiche Checks:
    Entities = mod;

    // bekannte Einstellungs-Setter nutzen, falls vorhanden
    if (Entities.setWorldSize) Entities.setWorldSize(canvas.width, canvas.height);
    if (Entities.setFoodRate)  Entities.setFoodRate(state.foodPerSec);
    if (Entities.setMutationPct) Entities.setMutationPct(state.mutationPct);

    // optionaler Initial-Spawn (Adam/Eva + Kinder), falls vorhanden
    if (Entities.spawnAdamEva) {
      try { Entities.spawnAdamEva({ childrenPerParent:4, staggerMs:1000 }); }
      catch(e){ bannerWarn('Spawn-Init übersprungen', 'spawnAdamEva hat geworfen.'); console.warn(e); }
    }

    // Start
    state.running = true;
    elPlay && (elPlay.textContent = 'Pause');
    lastT = performance.now();
    rafId = requestAnimationFrame(loop);

  }catch(e){
    // Banner wurde bereits in safeImport gezeigt
    console.error('[engine] boot failed', e);
  }
}

document.addEventListener('DOMContentLoaded', boot);