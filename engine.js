// engine.js — Orchestrierung: Game-Loop, UI, Timescale, Annealing, Panels
// Micro-Profiler: Timings je Phase; emit('appops:timings', ...)

import { initErrorManager, breadcrumb } from "./errorManager.js";
import { setWorldSize, createAdamAndEve, step as entitiesStep } from "./entities.js";
import { step as reproductionStep, setMutationRate } from "./reproduction.js";
import { step as foodStep, setSpawnRate } from "./food.js";
import { draw, setPerfMode as rendererPerf } from "./renderer.js";
import { openEditor } from "./editor.js";
import { initTicker, setPerfMode as tickerPerf, pushFrame } from "./ticker.js";
import { emit, on } from "./event.js";
import { openDummyPanel, handleCanvasClickForDummy } from "./dummy.js";
import { initDrives } from "./drives.js";
import { getEnvState } from "./environment.js";

/* Laufzeit-Flags */
let running=false, timescale=1, perfMode=false;
const SPEED_STEPS=[1,5,10,50]; let speedIdx=0;
let lastTime=0, acc=0; const fixedDt=1/60; let simTime=0;
let annealAccum=0;

/* Topbar Height → CSS */
function setTopbarHeightVar() {
  const topbar = document.getElementById("topbar");
  const h = topbar ? (topbar.offsetHeight || 56) : 56;
  document.documentElement.style.setProperty("--topbar-h", h + "px");
}
let _topbarRO=null;
function installTopbarObserver(){
  const topbar=document.getElementById("topbar");
  if(!topbar) return;
  try{
    _topbarRO?.disconnect();
    _topbarRO = new ResizeObserver(()=>{
      setTopbarHeightVar();
      const canvas=document.getElementById("world");
      if(canvas){
        const rect=canvas.getBoundingClientRect();
        canvas.width=Math.round(rect.width);
        canvas.height=Math.round(rect.height);
        setWorldSize(canvas.width, canvas.height);
      }
    });
    _topbarRO.observe(topbar);
  }catch{}
}
function resizeCanvas(){
  setTopbarHeightVar();
  const canvas=document.getElementById("world");
  const rect=canvas.getBoundingClientRect();
  canvas.width=Math.round(rect.width);
  canvas.height=Math.round(rect.height);
  setWorldSize(canvas.width, canvas.height);
}

/* UI-Bindings */
function bindUI(){
  const btnStart  = document.getElementById("btnStart");
  const btnPause  = document.getElementById("btnPause");
  const btnReset  = document.getElementById("btnReset");
  const btnEditor = document.getElementById("btnEditor");
  const btnGenea  = document.getElementById("btnGenea");
  const btnDummy  = document.getElementById("btnDummy");
  const btnDiag   = document.getElementById("btnDiag");
  const btnAppOps = document.getElementById("btnAppOps");
  const btnSpeed  = document.getElementById("btnSpeed");

  btnStart.onclick = ()=>{ breadcrumb("ui:btn","Start"); start(); };
  btnPause.onclick = ()=>{ breadcrumb("ui:btn","Pause"); pause(); };
  btnReset.onclick = ()=>{ breadcrumb("ui:btn","Reset"); reset(); };
  btnEditor.onclick= ()=>{ breadcrumb("ui:btn","Editor"); openEditor(); };
  if (btnGenea) btnGenea.onclick = ()=> import("./genea.js").then(m=>m.openGenealogyPanel());
  if (btnDummy) btnDummy.onclick = ()=> openDummyPanel();
  if (btnDiag)  btnDiag.onclick  = ()=> import("./diag.js").then(m=>m.openDiagPanel());
  if (btnAppOps) btnAppOps.onclick = ()=> import("./appops_panel.js").then(m=>m.openAppOpsPanel());
  btnSpeed.onclick = ()=> cycleSpeed();

  const mu=document.getElementById("mutation");
  const fr=document.getElementById("foodrate");
  const pm=document.getElementById("perfmode");
  const mutVal=document.getElementById("mutVal");
  const foodVal=document.getElementById("foodVal");
  function updVals(){ if(mutVal) mutVal.textContent=`${Math.round(parseFloat(mu.value||"0"))}%`; if(foodVal) foodVal.textContent=`${Math.round(parseFloat(fr.value||"0"))}/s`; }
  mu.oninput=()=>{ setMutationRate(parseFloat(mu.value)); updVals(); };
  fr.oninput=()=>{ setSpawnRate(parseFloat(fr.value)); updVals(); };
  pm.oninput=()=> setPerfMode(pm.checked);
  [mu,fr].forEach(el=> el?.addEventListener("touchmove",(e)=>{ e.preventDefault(); },{passive:false}));

  const canvas=document.getElementById("world");
  canvas.addEventListener("click",(e)=>{ const r=canvas.getBoundingClientRect(); handleCanvasClickForDummy(e.clientX-r.left, e.clientY-r.top); });

  setMutationRate(parseFloat(mu.value));
  setSpawnRate(parseFloat(fr.value));
  setPerfMode(pm.checked);
  updVals();
  setTimescale(SPEED_STEPS[speedIdx]); updateSpeedButton();
}
function updateSpeedButton(){ const sp=document.getElementById("btnSpeed"); if(sp) sp.textContent=`Tempo ×${SPEED_STEPS[speedIdx]}`; }
function cycleSpeed(){ speedIdx=(speedIdx+1)%SPEED_STEPS.length; setTimescale(SPEED_STEPS[speedIdx]); updateSpeedButton(); }

/* Annealing */
function annealMutation(dt){
  annealAccum += dt;
  if (annealAccum < 1) return;
  annealAccum = 0;
  if (simTime > 120) setMutationRate(8);
  else if (simTime > 30) setMutationRate(12);
  else setMutationRate(30);
}

/* Game-Loop mit Micro-Profiler */
function frame(now){
  if(!running) return;
  now/=1000;
  if(!lastTime) lastTime=now;
  const delta=Math.min(0.1, now-lastTime);
  lastTime=now;

  acc += delta * timescale;
  const desiredSteps=Math.floor(acc/fixedDt);
  const maxSteps=Math.min(60, Math.max(8, Math.ceil(timescale*1.2)));
  const steps=Math.min(desiredSteps, maxSteps);
  const env=getEnvState(); // neutral

  // Micro-Profiler Aggregate je Frame
  let tEnt=0, tRep=0, tFood=0;

  for(let s=0;s<steps;s++){
    let t0=performance.now(); entitiesStep(fixedDt, env, simTime); tEnt += performance.now()-t0;
    t0=performance.now(); reproductionStep(fixedDt); tRep += performance.now()-t0;
    t0=performance.now(); foodStep(fixedDt);        tFood+= performance.now()-t0;

    simTime += fixedDt; acc -= fixedDt;
    annealMutation(fixedDt);
  }
  const backlogAfter = Math.floor(acc / fixedDt);
  if (backlogAfter > maxSteps) acc = fixedDt * maxSteps;

  const tDraw0=performance.now(); draw(); const tDraw=performance.now()-tDraw0;

  // an App-Ops melden
  emit("appops:frame", { desired: desiredSteps, max: maxSteps, steps, delta, timescale });
  emit("appops:timings", { ent:tEnt, repro:tRep, food:tFood, draw:tDraw, steps });

  pushFrame(fixedDt, 1/delta);
  requestAnimationFrame(frame);
}

/* Public API */
export function boot(){
  try{ initErrorManager({ pauseOnError:true, captureConsole:true }); }catch{}
  on("error:panic", ()=> pause()); on("error:resume", ()=> start());
  resizeCanvas(); installTopbarObserver(); window.addEventListener("resize", resizeCanvas);
  initDrives(); createAdamAndEve(); initTicker(); bindUI(); draw();
  window.__APP_BOOTED = true;
}
export function start(){ if(!running){ running=true; lastTime=0; requestAnimationFrame(frame); } }
export function pause(){ running=false; }
export function reset(){ running=false; import("./food.js").then(m=>m.spawnClusters()); import("./entities.js").then(m=>m.createAdamAndEve()); draw(); }
export function setTimescale(x){ timescale=Math.max(0.1, Math.min(50, x)); emit("ui:speed", timescale); }
export function setPerfMode(on){ perfMode=!!on; rendererPerf(perfMode); tickerPerf(perfMode); }

/* Boot-Guard */
(function ensureBoot(){
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", boot);
  else try{ boot(); }catch(e){ console.error("boot() error", e); }
})();