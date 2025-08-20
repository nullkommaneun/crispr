import { initErrorManager } from "./errorManager.js";
import { CONFIG } from "./config.js";
import { on, emit } from "./event.js";

import {
  applyEnvironment, getCells, getFoodItems, setWorldSize, createAdamAndEve
} from "./entities.js";

import { step as reproductionStep, setMutationRate } from "./reproduction.js";
import { step as foodStep, setSpawnRate } from "./food.js";
import { draw, setPerfMode as rendererPerf } from "./renderer.js";
import { openEditor } from "./editor.js";
import { openEnvPanel, getEnvState } from "./environment.js";
import { initNarrative, openDaily } from "./narrative/panel.js";
import { initTicker, setPerfMode as tickerPerf, pushFrame } from "./ticker.js";

let running=false;
let timescale=1;
let perfMode=false;

let lastTime=0, acc=0;
const fixedDt = 1/60; // fixed update
let simTime = 0;

function resizeCanvas(){
  const canvas = document.getElementById("world");
  // keep internal resolution matching CSS size for sharp rendering
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width);
  canvas.height = Math.round(rect.height);
  setWorldSize(canvas.width, canvas.height);
}

function bindUI(){
  document.getElementById("btnStart").onclick = start;
  document.getElementById("btnPause").onclick = pause;
  document.getElementById("btnReset").onclick = reset;
  document.getElementById("btnEditor").onclick = openEditor;
  document.getElementById("btnEnv").onclick = openEnvPanel;
  document.getElementById("btnDaily").onclick = openDaily;

  const ts = document.getElementById("timescale");
  ts.oninput = ()=> setTimescale(parseFloat(ts.value));

  const mu = document.getElementById("mutation");
  mu.oninput = ()=> setMutationRate(parseFloat(mu.value));

  const fr = document.getElementById("foodrate");
  fr.oninput = ()=> setSpawnRate(parseFloat(fr.value));

  const pm = document.getElementById("perfmode");
  pm.oninput = ()=> setPerfMode(pm.checked);

  // default values to modules
  setTimescale(parseFloat(ts.value));
  setMutationRate(parseFloat(mu.value));
  setSpawnRate(parseFloat(fr.value));
  setPerfMode(pm.checked);
}

function update(dt){
  // Forward fixed steps to modules
  const env = getEnvState();

  // entities.step lives inside entities.js and needs env; import on demand to avoid circular reference
  return import("./entities.js").then(({ step: entitiesStep })=>{
    entitiesStep(dt, env, simTime);
    reproductionStep(dt);
    foodStep(dt);
  });
}

function frame(now){
  if(!running){ return; }
  now /= 1000;
  if(!lastTime) lastTime = now;
  let delta = Math.min(0.1, now - lastTime);
  lastTime = now;
  acc += delta * timescale;

  // process fixed steps
  let steps=0;
  const maxSteps = 8; // safety
  const promises=[];
  while(acc >= fixedDt && steps < maxSteps){
    promises.push(update(fixedDt));
    acc -= fixedDt;
    simTime += fixedDt;
    steps++;
  }

  Promise.all(promises).then(()=>{
    draw();
    pushFrame(fixedDt, 1/delta);
    requestAnimationFrame(frame);
  });
}

/** Public API */
export function boot(){
  initErrorManager();
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  createAdamAndEve();
  applyEnvironment(getEnvState());

  initNarrative();
  initTicker();

  bindUI();

  // initial draw
  draw();
}

export function start(){ if(!running){ running=true; lastTime=0; requestAnimationFrame(frame); } }
export function pause(){ running=false; }
export function reset(){
  running=false; // stop
  import("./food.js").then(m=>m.spawnClusters()); // reset clusters
  import("./entities.js").then(m=>{ m.createAdamAndEve(); });
  draw();
}
export function setTimescale(x){ timescale = Math.max(0.1, Math.min(8, x)); }
export function setPerfMode(on){
  perfMode = !!on;
  rendererPerf(perfMode);
  tickerPerf(perfMode);
}

window.addEventListener("DOMContentLoaded", boot);