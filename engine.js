// engine.js
// Gameloop, Tick, UI-Verknüpfung, Gesamtorchestrierung.

import { initErrorManager, setContextGetter, assertModule, showError } from './errorManager.js';
import { Events, EVT } from './events.js';
import { Renderer } from './renderer.js';
import { seedWorld } from './spawn.js';
import * as Entities from './entities.js';
import { initTicker } from './ticker.js';
import { initNarrativePanel } from './narrative/panel.js';
import { initAdvisor, setEnabled as setAdvisorEnabled, getStatusLabel, tryLoadTF, updateAdvisor } from './advisor.js';
import { initEditor, openEditor } from './editor.js';

let renderer;
let running = false;
let timescale = 1;
let lastTs = 0;
let fps = 0;
let tickCount = 0;
let highlightStammId = null; // null = Alle
const actionLog = [];

function logAction(s){ actionLog.push(s); if(actionLog.length>20) actionLog.shift(); }

function setupUI(){
  const btnPlay = document.getElementById('btnPlayPause');
  const btnReset = document.getElementById('btnReset');
  const btnSpeed = document.getElementById('btnSpeedCycle');
  const mutRange = document.getElementById('mutationRate');
  const foodRange = document.getElementById('foodRate');
  const mutVal = document.getElementById('mutationRateVal');
  const foodVal = document.getElementById('foodRateVal');
  const btnEditor = document.getElementById('btnEditor');
  const btnExport = document.getElementById('btnExport');
  const fileImport = document.getElementById('fileImport');
  const btnHighlightCycle = document.getElementById('btnHighlightCycle');
  const btnAdvisor = document.getElementById('btnAdvisor');
  const advisorStatus = document.getElementById('advisorStatus');
  const editorAdvisorStatus = document.getElementById('editorAdvisorStatus');
  const canvas = document.getElementById('simCanvas');

  // Play/Pause
  btnPlay.addEventListener('click', ()=> toggleRun());
  window.addEventListener('keydown', (e)=>{ if(e.code==='Space'){ e.preventDefault(); toggleRun(); } });

  // Reset
  btnReset.addEventListener('click', ()=> {
    resetWorld();
    refreshHighlightButton(); // nach neuem Seed
    logAction('Reset');
  });

  // Timescale (Button zyklisch 1×→5×→10×)
  const speedSteps = [1,5,10];
  function applyTimescale(v){
    timescale = v;
    btnSpeed.textContent = `⚡ ${timescale}×`;
    Events.emit(EVT.STATUS, {source:'engine', text:`Timescale: ${timescale}×`});
  }
  btnSpeed.addEventListener('click', ()=>{
    const idx = (speedSteps.indexOf(timescale)+1) % speedSteps.length;
    applyTimescale(speedSteps[idx]);
  });
  applyTimescale(1);

  // Mutation
  function applyMut(){ 
    const p = Number(mutRange.value)/100;
    Entities.setMutationRate(p);
    mutVal.textContent = `${Math.round(p*100)}%`;
  }
  mutRange.addEventListener('input', applyMut); applyMut();

  // Nahrung
  function applyFood(){
    const r = Number(foodRange.value);
    Entities.setFoodRate(r);
    foodVal.textContent = `${r}`;
  }
  foodRange.addEventListener('input', applyFood); applyFood();

  // Editor
  btnEditor.addEventListener('click', openEditor);

  // Export
  btnExport.addEventListener('click', ()=>{
    try{
      const json = Entities.exportState();
      const blob = new Blob([json], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `crispr_world_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      logAction('Export');
    }catch(err){ showError('Export fehlgeschlagen', err); }
  });

  // Import
  fileImport.addEventListener('change', async (e)=>{
    const file = e.target.files?.[0]; if(!file) return;
    try{
      const text = await file.text();
      Entities.importState(text);
      refreshHighlightButton();
      logAction('Import');
    }catch(err){ showError('Import fehlgeschlagen', err); }
  });

  // Highlight (Button zyklisch: Alle → Stamm 1 → Stamm 2 → …)
  function getHighlightOrder(){
    const counts = Entities.getStammCounts();
    return ['all', ...Object.keys(counts).sort((a,b)=>Number(a)-Number(b))];
  }
  function refreshHighlightButton(){
    const counts = Entities.getStammCounts();
    if (highlightStammId!==null && !counts[highlightStammId]) {
      // derzeitiger Stamm existiert nicht mehr → zurück auf Alle
      highlightStammId = null;
      renderer.setHighlight(null);
    }
    const label = (highlightStammId===null)
      ? 'Alle Stämme'
      : `Stamm ${highlightStammId} (${counts[highlightStammId]||0})`;
    btnHighlightCycle.textContent = label;
  }
  btnHighlightCycle.addEventListener('click', ()=>{
    const ids = getHighlightOrder();
    const cur = (highlightStammId===null) ? 'all' : String(highlightStammId);
    const idx = (ids.indexOf(cur)+1) % ids.length;
    const next = ids[idx];
    highlightStammId = (next==='all') ? null : Number(next);
    renderer.setHighlight(highlightStammId);
    Events.emit(EVT.HIGHLIGHT_CHANGED, { stammId: highlightStammId });
    refreshHighlightButton();
  });
  refreshHighlightButton();
  Events.on(EVT.BIRTH, refreshHighlightButton);
  Events.on(EVT.DEATH, refreshHighlightButton);

  // Advisor
  btnAdvisor.addEventListener('click', async ()=>{
    const isOff = advisorStatus.textContent.includes('Aus');
    setAdvisorEnabled(isOff);
    advisorStatus.textContent = getStatusLabel();
    if (editorAdvisorStatus) {
      editorAdvisorStatus.textContent = advisorStatus.textContent.replace('Berater: ','');
    }
    if(isOff){
      await tryLoadTF(); // TF-Bib bereitstellen (Modell optional)
      advisorStatus.textContent = getStatusLabel();
      if (editorAdvisorStatus) {
        editorAdvisorStatus.textContent = advisorStatus.textContent.replace('Berater: ','');
      }
    }
  });

  // Canvas-Größe → Welt
  function onResize(){
    const rect = canvas.getBoundingClientRect();
    Entities.setWorldSize(rect.width, rect.height);
  }
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(canvas);
  else window.addEventListener('resize', onResize);
  onResize();
}

function toggleRun(){
  running = !running;
  const btn = document.getElementById('btnPlayPause');
  btn.textContent = running ? '⏸ Pause' : '▶️ Play';
}

function resetWorld(){
  Entities.resetEntities();
  const rect = document.getElementById('simCanvas').getBoundingClientRect();
  Entities.setWorldSize(rect.width, rect.height);
  seedWorld(rect.width, rect.height);
  Events.emit(EVT.STATUS, {source:'engine', text:'Welt zurückgesetzt'});
}

function init(){
  initErrorManager();
  setContextGetter(()=>({
    tick: tickCount,
    fps,
    canvasW: renderer?.canvas?.width ?? 0,
    canvasH: renderer?.canvas?.height ?? 0,
    lastActions: actionLog
  }));

  assertModule('Renderer', Renderer);
  assertModule('Entities', Entities);

  initTicker();
  initNarrativePanel();
  initAdvisor();
  initEditor();

  const canvas = document.getElementById('simCanvas');
  renderer = new Renderer(canvas);

  const rect = canvas.getBoundingClientRect();
  Entities.setWorldSize(rect.width, rect.height);
  seedWorld(rect.width, rect.height);

  setupUI();

  running = true;
  document.getElementById('btnPlayPause').textContent = '⏸ Pause';
  requestAnimationFrame(loop);
}

function loop(ts){
  const dtRaw = (ts - (lastTs || ts)) / 1000;
  lastTs = ts;
  const dt = Math.min(0.05, dtRaw) * timescale;

  if(running){
    tickCount++;
    Entities.updateWorld(dt);
    renderer.renderFrame({ cells: Entities.cells, foods: Entities.foods });
    updateAdvisor(performance.now()/1000);
    fps = 0.9*fps + 0.1*(1/(dtRaw||1/60));
    Events.emit(EVT.TICK, { tick: tickCount, fps });
  }
  requestAnimationFrame(loop);
}

function setupNarrativeTriggers(){
  Events.on(EVT.RESET, ()=> {
    Events.emit(EVT.TIP, {label:'Reset', text:'Welt und IDs wurden zurückgesetzt.'});
  });
  Events.on(EVT.MATE, (d)=>{
    if(d.relatedness >= 0.25){
      Events.emit(EVT.TIP, {label:'Genetik', text:'Inzucht erkannt – höhere Wahrscheinlichkeit negativer Mutationen.'});
    }
  });
}

function start(){
  try{
    init();
    setupNarrativeTriggers();
  }catch(err){
    showError('Initialisierung fehlgeschlagen', err);
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}