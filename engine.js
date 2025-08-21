import { initErrorManager, breadcrumb } from "./errorManager.js";
import {
  applyEnvironment, setWorldSize, createAdamAndEve, step as entitiesStep
} from "./entities.js";
import { step as reproductionStep, setMutationRate } from "./reproduction.js";
import { step as foodStep, setSpawnRate } from "./food.js";
import { draw, setPerfMode as rendererPerf } from "./renderer.js";
import { openEditor } from "./editor.js";
import { openEnvPanel, getEnvState } from "./environment.js";
import { initTicker, setPerfMode as tickerPerf, pushFrame } from "./ticker.js";
import { emit, on } from "./event.js";
import { openDummyPanel, handleCanvasClickForDummy } from "./dummy.js";
import { initDrives } from "./drives.js";
import { openDiagPanel } from "./diag.js";

let running=false, timescale=1, perfMode=false;
const SPEED_STEPS=[1,5,10,50]; let speedIdx=0;
let lastTime=0, acc=0; const fixedDt=1/60; let simTime=0; let annealAccum=0;

function resizeCanvas(){
  const canvas=document.getElementById("world");
  const topbar=document.getElementById("topbar");
  if(topbar){ const h=topbar.offsetHeight||56; document.documentElement.style.setProperty("--topbar-h", h+"px"); }
  const rect=canvas.getBoundingClientRect(); canvas.width=Math.round(rect.width); canvas.height=Math.round(rect.height);
  setWorldSize(canvas.width, canvas.height);
}
function bindUI(){
  document.getElementById("btnStart").onclick = ()=>{ breadcrumb("ui:btn","Start"); start(); };
  document.getElementById("btnPause").onclick = ()=>{ breadcrumb("ui:btn","Pause"); pause(); };
  document.getElementById("btnReset").onclick = ()=>{ breadcrumb("ui:btn","Reset"); reset(); };
  document.getElementById("btnEditor").onclick= ()=>{ breadcrumb("ui:btn","Editor"); openEditor(); };
  document.getElementById("btnEnv").onclick   = ()=>{ breadcrumb("ui:btn","Umwelt"); openEnvPanel(); };
  const btnDummy=document.getElementById("btnDummy"); if(btnDummy) btnDummy.onclick=()=>{ breadcrumb("ui:btn","Dummy"); openDummyPanel(); };
  const btnDiag =document.getElementById("btnDiag");  if(btnDiag)  btnDiag.onclick =()=>{ breadcrumb("ui:btn","Diagnose"); openDiagPanel(); };

  const mu=document.getElementById("mutation"); mu.oninput=()=> setMutationRate(parseFloat(mu.value));
  const fr=document.getElementById("foodrate");  fr.oninput=()=> setSpawnRate(parseFloat(fr.value));
  const pm=document.getElementById("perfmode");  pm.oninput=()=> setPerfMode(pm.checked);

  const sp=document.getElementById("btnSpeed");  sp.onclick = ()=>{ cycleSpeed(); };

  const canvas=document.getElementById("world");
  canvas.addEventListener("click",(e)=>{ const r=canvas.getBoundingClientRect(); handleCanvasClickForDummy(e.clientX-r.left, e.clientY-r.top); });

  setMutationRate(parseFloat(mu.value)); setSpawnRate(parseFloat(fr.value)); setPerfMode(pm.checked);
  setTimescale(SPEED_STEPS[speedIdx]); updateSpeedButton();
}
function updateSpeedButton(){ const sp=document.getElementById("btnSpeed"); if(sp) sp.textContent=`Tempo ×${SPEED_STEPS[speedIdx]}`; }
function cycleSpeed(){ speedIdx=(speedIdx+1)%SPEED_STEPS.length; setTimescale(SPEED_STEPS[speedIdx]); updateSpeedButton(); }
function annealMutation(dt){ annealAccum+=dt; if(annealAccum<1) return; annealAccum=0; if(simTime>120) setMutationRate(8); else if(simTime>30) setMutationRate(12); else setMutationRate(30); }

function frame(now){
  if(!running) return; now/=1000;
  if(!lastTime) lastTime=now; const delta=Math.min(0.1, now-lastTime); lastTime=now;
  acc += delta * timescale;
  const desiredSteps=Math.floor(acc/fixedDt), maxSteps=Math.min(60, Math.max(8, Math.ceil(timescale*1.2)));
  const steps=Math.min(desiredSteps, maxSteps);
  const env=getEnvState();

  for(let s=0;s<steps;s++){
    entitiesStep(fixedDt, env, simTime);
    reproductionStep(fixedDt);
    foodStep(fixedDt);
    simTime += fixedDt; acc -= fixedDt;
    annealMutation(fixedDt);
  }
  if(Math.floor(acc/fixedDt)>maxSteps) acc=fixedDt*maxSteps;

  draw(); pushFrame(fixedDt, 1/delta); requestAnimationFrame(frame);
}

export function boot(){
  try{ initErrorManager({ pauseOnError:true, captureConsole:true }); }catch{}
  on("error:panic", ()=> pause()); on("error:resume", ()=> start());
  resizeCanvas(); window.addEventListener("resize", resizeCanvas);

  initDrives(); createAdamAndEve(); applyEnvironment(getEnvState());
  initTicker(); emit("ui:speed", timescale);
  bindUI(); draw();
  window.__APP_BOOTED = true;
}

export function start(){ if(!running){ running=true; lastTime=0; requestAnimationFrame(frame); } }
export function pause(){ running=false; }
export function reset(){ running=false; import("./food.js").then(m=>m.spawnClusters()); import("./entities.js").then(m=>{ m.createAdamAndEve(); }); draw(); }
export function setTimescale(x){ timescale=Math.max(0.1, Math.min(50, x)); emit("ui:speed", timescale); }
export function setPerfMode(on){ perfMode=!!on; import("./renderer.js").then(m=>m.setPerfMode(perfMode)); import("./ticker.js").then(m=>m.setPerfMode(perfMode)); }
window.addEventListener("DOMContentLoaded", boot);