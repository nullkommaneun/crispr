// engine.js — Boot/Loop + Boot-Flag + Heartbeat + Seeding-Guard

import { initErrorManager, report } from "./errorManager.js";
import { getCells, getFoodItems, setWorldSize, createAdamAndEve, applyEnvironment } from "./entities.js";
import * as entities from "./entities.js";
import * as reproduction from "./reproduction.js";
import * as food from "./food.js";
import * as renderer from "./renderer.js";
import { emit } from "./event.js";
import * as metrics from "./metrics.js";

export const breadcrumb = undefined; // Kompat-Fallback

let running=false, lastTime=0, timescale=1, perfMode=false;

function markBoot(ok=true){ try{ window.__bootOK=!!ok; document.documentElement.dataset.boot=ok?'1':'0'; }catch{} }
function heartbeat(){
  try{
    window.__frameCount=(window.__frameCount|0)+1;
    const now=performance.now(), prev=window.__lastStepPrev||now, dt=now-prev;
    window.__lastStepPrev=now; window.__lastStepAt=now;
    if(dt>0&&dt<1000){ const a=.15, fps=1000/dt; window.__fpsEMA=(window.__fpsEMA==null)?fps:window.__fpsEMA*(1-a)+fps*a; }
    window.__cellsN=getCells().length|0; window.__foodN=getFoodItems().length|0;
  }catch{}
}

export function setTimescale(x){ timescale=Math.max(.1,Math.min(50,+x||1)); }
export function setPerfMode(on){ perfMode=!!on; renderer.setPerfMode(perfMode); window.__perfMode=perfMode; emit('perf:mode',{on:perfMode}); }
export function start(){ if(!running){ running=true; loop(); } }
export function pause(){ running=false; }
export function reset(){ try{ running=false; createAdamAndEve(); lastTime=performance.now(); emit('app:reset',{}); markBoot(true); start(); }catch(e){ report(e,{where:'reset'});} }

export function boot(){
  try{
    initErrorManager();
    const canvas=document.getElementById('scene'); const r=canvas.getBoundingClientRect();
    setWorldSize(Math.max(2,r.width),Math.max(2,r.height));
    createAdamAndEve(); applyEnvironment({});

    // initiale Slider-Werte anwenden
    try{
      const sm=document.getElementById('sliderMutation'); if(sm) reproduction.setMutationRate(+sm.value|0);
      const sf=document.getElementById('sliderFood');     if(sf) food.setSpawnRate(+sf.value||6);
    }catch{}

    lastTime=performance.now(); markBoot(true); start();

    // Seeding-Guard (falls leer)
    setTimeout(()=>{ try{
      if(getCells().length===0){ console.warn('[engine] seeding Adam&Eva (guard)'); createAdamAndEve(); }
      if(getFoodItems().length===0){ const rate=(+document.getElementById('sliderFood')?.value||6); food.setSpawnRate(rate); for(let i=0;i<24;i++) food.step(.12); }
    }catch(e){ console.warn('seeding-guard',e);} }, 250);

  }catch(err){ report(err,{where:'boot'}); }
}

function loop(){
  if(!running) return;
  const now=performance.now(); let dt=(now-lastTime)/1000*timescale; if(dt>0.2) dt=0.2; lastTime=now;
  try{ step(dt, now/1000); }catch(e){ report(e,{where:'loop.step'}); }
  requestAnimationFrame(loop);
}
function step(dt,tSec){
  metrics.beginTick();
  let t0=metrics.phaseStart(); entities.step(dt,{},tSec); metrics.phaseEnd('entities',t0);
  t0=metrics.phaseStart(); reproduction.step(dt);       metrics.phaseEnd('reproduction',t0);
  t0=metrics.phaseStart(); food.step(dt);               metrics.phaseEnd('food',t0);
  t0=metrics.phaseStart(); renderer.draw({cells:getCells(),food:getFoodItems()},{}); metrics.phaseEnd('draw',t0);
  emit('econ:snapshot', metrics.readEnergyAndReset());
  heartbeat();
}