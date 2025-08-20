// engine.js – Gameloop, UI, Orchestrierung (Fixed Timestep)

import { initErrorManager, setContextGetter, assertModule, showError } from './errorManager.js';
import { Events, EVT } from './event.js';
import { Renderer } from './renderer.js';
import { seedWorld } from './spawn.js';
import * as Entities from './entities.js';
import { initTicker } from './ticker.js';
import { initNarrativePanel } from './narrative/panel.js';
import { initAdvisor, updateAdvisor } from './advisor.js';
import { initEditor, openEditor } from './editor.js';
import { initEnvironment, openEnvironment } from './environment.js';

let renderer;
let running = false;
let timescale = 1;

const FIXED_DT = 1/60;
const MAX_ACC  = 0.25;
let lastTs = 0, accumulator = 0;

let fps = 0;
let tickCount = 0;
let highlightStammId = null;
const actionLog = [];
const logAction = s => { actionLog.push(s); if(actionLog.length>20) actionLog.shift(); };

// ---- UI -------------------------------------------------------------------
function setupUI(){
  const btnPlay = document.getElementById('btnPlayPause');
  const btnReset = document.getElementById('btnReset');
  const btnSpeed = document.getElementById('btnSpeedCycle');
  const mutRange = document.getElementById('mutationRate');
  const foodRange= document.getElementById('foodRate');
  const mutVal   = document.getElementById('mutationRateVal');
  const foodVal  = document.getElementById('foodRateVal');
  const btnEditor= document.getElementById('btnEditor');
  const btnEnv   = document.getElementById('btnEnv');
  const btnHighlightCycle = document.getElementById('btnHighlightCycle');
  const canvas   = document.getElementById('simCanvas');

  btnPlay.addEventListener('click', ()=> toggleRun());
  window.addEventListener('keydown', (e)=>{ if(e.code==='Space'){ e.preventDefault(); toggleRun(); } });

  btnReset.addEventListener('click', ()=>{ resetWorld(); refreshHighlightButton(); logAction('Reset'); });

  // Timescale zyklisch
  const steps=[1,5,10];
  const applyTs=v=>{ timescale=v; btnSpeed.textContent=`⚡ ${v}×`; Events.emit(EVT.STATUS,{source:'engine',key:'timescale',value:v}); };
  btnSpeed.addEventListener('click', ()=>{ const i=(steps.indexOf(timescale)+1)%steps.length; applyTs(steps[i]); });
  applyTs(1);

  // Mutation 0..10% (Default 0.5%)
  const applyMut=()=>{
    const pct=Number(mutRange.value);
    Entities.setMutationRate(pct/100);
    mutVal.textContent = `${pct.toFixed(1).replace('.0','')} %`;
    Events.emit(EVT.STATUS,{source:'engine',key:'mutationRatePct',value:pct});
  };
  mutRange.addEventListener('input', applyMut); applyMut();

  // Nahrung 0..360 /s  → Entities erwartet /min
  const applyFood=()=>{
    const perSec = Number(foodRange.value);
    Entities.setFoodRate(perSec*60);
    foodVal.textContent = `${perSec|0} /s`;
    Events.emit(EVT.STATUS,{source:'engine',key:'foodRatePerSec',value:perSec});
  };
  foodRange.addEventListener('input', applyFood); applyFood();

  btnEditor.addEventListener('click', openEditor);
  btnEnv?.addEventListener('click', openEnvironment);

  // Highlight-Knopf
  function getOrder(){ const c=Entities.getStammCounts(); return ['all',...Object.keys(c).sort((a,b)=>Number(a)-Number(b))]; }
  function refreshHighlightButton(){
    const c=Entities.getStammCounts();
    if(highlightStammId!==null && !c[highlightStammId]){ highlightStammId=null; renderer.setHighlight(null); }
    btnHighlightCycle.textContent = (highlightStammId===null) ? 'Alle Stämme' : `Stamm ${highlightStammId} (${c[highlightStammId]||0})`;
  }
  btnHighlightCycle.addEventListener('click', ()=>{
    const ids=getOrder(); const cur=(highlightStammId===null)?'all':String(highlightStammId);
    const idx=(ids.indexOf(cur)+1)%ids.length; const next=ids[idx];
    highlightStammId=(next==='all')?null:Number(next); renderer.setHighlight(highlightStammId);
    Events.emit(EVT.HIGHLIGHT_CHANGED,{stammId:highlightStammId}); refreshHighlightButton();
  });
  refreshHighlightButton();
  Events.on(EVT.BIRTH, refreshHighlightButton); Events.on(EVT.DEATH, refreshHighlightButton);

  // Canvas-Größe
  function onResize(){ const r=canvas.getBoundingClientRect(); Entities.setWorldSize(r.width, r.height); renderer.handleResize?.(); }
  if('ResizeObserver' in window) new ResizeObserver(onResize).observe(canvas); else window.addEventListener('resize', onResize);
  onResize();
}

function toggleRun(){ running=!running; document.getElementById('btnPlayPause').textContent = running?'⏸ Pause':'▶️ Play'; }

function resetWorld(){
  Entities.resetEntities?.();
  const rect=document.getElementById('simCanvas').getBoundingClientRect();
  Entities.setWorldSize(rect.width, rect.height);
  seedWorld(rect.width, rect.height);
  accumulator=0;
  Events.emit(EVT.STATUS,{source:'engine',text:'Welt zurückgesetzt'});
}

// ---- Init / Loop -----------------------------------------------------------
function init(){
  initErrorManager();
  setContextGetter(()=>({ tick:tickCount, fps, canvasW:renderer?.canvas?.width??0, canvasH:renderer?.canvas?.height??0, lastActions:actionLog }));

  assertModule('Renderer', Renderer);

  initTicker();
  initNarrativePanel();
  initAdvisor();
  initEditor();
  initEnvironment();

  const canvas = document.getElementById('simCanvas');
  renderer = new Renderer(canvas);
  const rect = canvas.getBoundingClientRect();
  Entities.setWorldSize(rect.width, rect.height);
  seedWorld(rect.width, rect.height);

  setupUI();

  running=true; document.getElementById('btnPlayPause').textContent='⏸ Pause';
  requestAnimationFrame(loop);
}

function loop(ts){
  if(!lastTs) lastTs = ts;
  const dtRaw = (ts - lastTs) / 1000; lastTs = ts;
  const instFps = 1 / Math.max(1e-6, dtRaw); fps = 0.9*fps + 0.1*instFps;

  if(running){
    accumulator += Math.min(MAX_ACC, dtRaw * timescale);
    let steps = 0;
    while (accumulator >= FIXED_DT) {
      Entities.updateWorld(FIXED_DT);
      accumulator -= FIXED_DT;
      steps++; if(steps>6){ accumulator=0; break; }
      tickCount++;
    }
    renderer.renderFrame({ cells: Entities.cells||[], foods: Entities.foods||[] });
    updateAdvisor(performance.now()/1000);
    Events.emit(EVT.TICK, { tick: tickCount, fps });
  }
  requestAnimationFrame(loop);
}

function start(){ try{ init(); }catch(err){ showError('Initialisierung fehlgeschlagen', err); } }
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', start, { once:true }); else start();