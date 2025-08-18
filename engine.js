// engine.js
// Gameloop, Tick, UI-Verknüpfung, Gesamtorchestrierung.

import { initErrorManager, setContextGetter, assertModule, showError } from './errorManager.js';
import { Events, EVT } from './events.js';
import { Renderer } from './renderer.js';
import { seedWorld } from './spawn.js';
import * as Entities from './entities.js';
import { initTicker } from './ticker.js';
import { initNarrativePanel } from './narrative/panel.js';
import { initAdvisor, setEnabled as setAdvisorEnabled, getStatusLabel, tryLoadModel, updateAdvisor } from './advisor.js';
import { initEditor, openEditor } from './editor.js';

let renderer;
let running = false;
let timescale = 1;
let lastTs = 0;
let fps = 0;
let tickCount = 0;
let highlightStammId = null;
const actionLog = [];

function logAction(s){ actionLog.push(s); if(actionLog.length>20) actionLog.shift(); }

function setupUI(){
  const btnPlay = document.getElementById('btnPlayPause');
  const btnReset = document.getElementById('btnReset');
  const selScale = document.getElementById('timescale');
  const mutRange = document.getElementById('mutationRate');
  const foodRange = document.getElementById('foodRate');
  const mutVal = document.getElementById('mutationRateVal');
  const foodVal = document.getElementById('foodRateVal');
  const btnEditor = document.getElementById('btnEditor');
  const btnExport = document.getElementById('btnExport');
  const fileImport = document.getElementById('fileImport');
  const highlightSel = document.getElementById('highlightSelect');
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
    logAction('Reset');
  });

  // Timescale
  selScale.addEventListener('change', ()=>{
    timescale = Number(selScale.value) || 1;
    Events.emit(EVT.STATUS, {source:'engine', text:`Timescale: ${timescale}×`});
  });

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
      refreshHighlightOptions();
      logAction('Import');
    }catch(err){ showError('Import fehlgeschlagen', err); }
  });

  // Highlight
  highlightSel.addEventListener('change', ()=>{
    const v = highlightSel.value;
    highlightStammId = v==='all' ? null : Number(v);
    renderer.setHighlight(highlightStammId);
    Events.emit(EVT.HIGHLIGHT_CHANGED, { stammId: highlightStammId });
  });

  // Advisor
  btnAdvisor.addEventListener('click', async ()=>{
    const current = advisorStatus.textContent.includes('Aus');
    setAdvisorEnabled(!current);
    advisorStatus.textContent = getStatusLabel();
    editorAdvisorStatus.textContent = advisorStatus.textContent.replace('Berater: ','');
    if(!current){
      // optional: TF.js versuchen zu laden
      const ok = await tryLoadModel();
      advisorStatus.textContent = getStatusLabel();
      editorAdvisorStatus.textContent = advisorStatus.textContent.replace('Berater: ','');
    }
  });

  // Canvas Größe an Renderer melden
  function onResize(){
    const rect = canvas.getBoundingClientRect();
    Entities.setWorldSize(rect.width, rect.height);
  }
  new ResizeObserver(onResize).observe(canvas);
  onResize();

  // Legende-Optionen initialisieren
  function refreshHighlightOptions(){
    const counts = Entities.getStammCounts();
    const sel = highlightSel;
    const current = sel.value;
    sel.innerHTML = `<option value="all">Alle Stämme</option>` +
      Object.keys(counts).sort((a,b)=>Number(a)-Number(b))
        .map(id=>`<option value="${id}">Stamm ${id} (${counts[id]})</option>`).join('');
    if(current && [...sel.options].some(o=>o.value===current)) sel.value = current;
  }
  refreshHighlightOptions();
  // Bei Geburten/Toden aktualisieren
  Events.on(EVT.BIRTH, refreshHighlightOptions);
  Events.on(EVT.DEATH, refreshHighlightOptions);
}

function toggleRun(){
  running = !running;
  const btn = document.getElementById('btnPlayPause');
  btn.textContent = running ? '⏸ Pause' : '▶️ Play';
}

function resetWorld(){
  Entities.resetEntities();
  const rect = document.getElementById('simCanvas').getBoundingClientRect();
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

  // Grundfunktionalität prüfen
  assertModule('Renderer', Renderer);
  assertModule('Entities', Entities);

  // Module initialisieren
  initTicker();
  initNarrativePanel();
  initAdvisor();
  initEditor();

  // Renderer
  const canvas = document.getElementById('simCanvas');
  renderer = new Renderer(canvas);

  // Welt seed
  const rect = canvas.getBoundingClientRect();
  Entities.setWorldSize(rect.width, rect.height);
  seedWorld(rect.width, rect.height);

  setupUI();

  // Start pausiert?
  toggleRun(); // gleich starten
  requestAnimationFrame(loop);
}

function loop(ts){
  const dtRaw = (ts - (lastTs || ts)) / 1000;
  lastTs = ts;
  const dt = Math.min(0.05, dtRaw) * timescale; // clamp

  if(running){
    tickCount++;
    Entities.updateWorld(dt);
    renderer.renderFrame({ cells: Entities.cells, foods: Entities.foods });
    updateAdvisor(performance.now()/1000);
    // FPS-Schätzung
    fps = 0.9*fps + 0.1*(1/(dtRaw||1/60));
    Events.emit(EVT.TICK, { tick: tickCount, fps });
  }

  requestAnimationFrame(loop);
}

// Narrative-Spezifische Headlines aufsetzen (einmalig)
function setupNarrativeTriggers(){
  // Bei Reset: IDs zurückgesetzt → Status in Narrative/Ticker andeuten
  Events.on(EVT.RESET, ()=> {
    Events.emit(EVT.TIP, {label:'Reset', text:'Welt und IDs wurden zurückgesetzt.'});
  });
  // Zusätzliche nüchterne Status-Hinweise
  Events.on(EVT.MATE, (d)=>{
    if(d.relatedness >= 0.25){
      Events.emit(EVT.TIP, {label:'Genetik', text:'Inzucht erkannt – höhere Wahrscheinlichkeit negativer Mutationen.'});
    }
  });
}

window.addEventListener('DOMContentLoaded', ()=>{
  try{
    init();
    setupNarrativeTriggers();
  }catch(err){
    showError('Initialisierung fehlgeschlagen', err);
  }
});