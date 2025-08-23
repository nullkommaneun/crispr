// engine.js — Boot/Loop/Topbar/Events

import { initErrorManager, report } from "./errorManager.js";
import { getCells, getFoodItems } from "./entities.js";
import * as entities from "./entities.js";
import * as reproduction from "./reproduction.js";
import * as food from "./food.js";
import * as renderer from "./renderer.js";
import { on, emit } from "./event.js";
import * as metrics from "./metrics.js";
import { openEditor } from "./editor.js";
import { openEnvPanel } from "./environment.js";

let running = false;
let lastTime = 0;
let timescale = 1;
let perfMode = false;

export function boot(){
  try{
    initErrorManager();
    const canvas = document.getElementById("scene");
    const rect = canvas.getBoundingClientRect();
    entities.setWorldSize(rect.width, rect.height);
    entities.createAdamAndEve();
    entities.applyEnvironment({}); // Umwelteffekte derzeit aus
    lastTime = performance.now();
    hookUI();
  }catch(err){ report(err,{where:"boot"}); }
}

function hookUI(){
  document.getElementById("btnStart")?.addEventListener("click", start);
  document.getElementById("btnPause")?.addEventListener("click", pause);
  document.getElementById("btnReset")?.addEventListener("click", reset);
  document.getElementById("btnEditor")?.addEventListener("click", openEditor);
  document.getElementById("btnEnv")?.addEventListener("click", openEnvPanel);
  const perf = document.getElementById("chkPerf");
  perf?.addEventListener("change", ()=> setPerfMode(!!perf.checked));
}

export function start(){ if(!running){ running=true; loop(); } }
export function pause(){ running=false; }
export function reset(){
  try{
    running=false;
    entities.createAdamAndEve();
    lastTime = performance.now();
    emit("app:reset",{});
  }catch(e){ report(e,{where:"reset"}); }
}
export function setTimescale(x){ timescale = Math.max(0.1, Math.min(50, +x||1)); }
export function setPerfMode(on){
  perfMode = !!on;
  renderer.setPerfMode(perfMode);
  emit("perf:mode", { on:perfMode });
}

function loop(){
  if(!running) return;
  const now = performance.now();
  let dt = (now - lastTime)/1000 * timescale;
  if (dt > 0.2) dt = 0.2;   // clamp
  lastTime = now;

  try{
    step(dt, now/1000);
  }catch(e){ report(e,{where:"loop.step"}); }

  requestAnimationFrame(loop);
}

function step(dt, tSec){
  metrics.beginTick();

  // ==== Entities ====
  let t0 = metrics.phaseStart();
  entities.step(dt, {}, tSec);
  metrics.phaseEnd("entities", t0);

  // ==== Reproduction ====
  t0 = metrics.phaseStart();
  reproduction.step(dt);
  metrics.phaseEnd("reproduction", t0);

  // ==== Food ====
  t0 = metrics.phaseStart();
  food.step(dt);
  metrics.phaseEnd("food", t0);

  // ==== Render ====
  t0 = metrics.phaseStart();
  renderer.draw({ cells:getCells(), food:getFoodItems() }, {});
  metrics.phaseEnd("draw", t0);

  // optional: Ökonomie zur Anzeige berechnen/lesen
  const econ = metrics.readEnergyAndReset();
  emit("econ:snapshot", econ);
}