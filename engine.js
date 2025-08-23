// engine.js — Boot/Loop/Topbar/Events + Phasen-Instrumentierung + Boot-Flag + Heartbeat

import { initErrorManager, report } from "./errorManager.js";
import { getCells, getFoodItems, setWorldSize, createAdamAndEve, applyEnvironment } from "./entities.js";
import * as entities from "./entities.js";
import * as reproduction from "./reproduction.js";
import * as food from "./food.js";
import * as renderer from "./renderer.js";
import { emit } from "./event.js";
import * as metrics from "./metrics.js";

let running = false;
let lastTime = 0;
let timescale = 1;
let perfMode = false;

// ---- Boot-Flag für Preflight/Guard ----
function markBoot(ok=true){
  try {
    window.__bootOK = !!ok;
    document.documentElement.dataset.boot = ok ? "1" : "0";
  } catch {}
}

// ---- Heartbeat (für Preflight/Diag) ----
function heartbeat(){
  try{
    window.__frameCount = (window.__frameCount|0) + 1;
    window.__lastStepAt = performance.now();
    // grobe FPS-Schätzung (EMA)
    const dt = performance.now() - (window.__lastStepPrev||performance.now());
    window.__lastStepPrev = performance.now();
    if (dt > 0 && dt < 1000){
      const fps = 1000/dt;
      const a = 0.15;
      window.__fpsEMA = (window.__fpsEMA==null) ? fps : window.__fpsEMA*(1-a) + fps*a;
    }
  }catch{}
}

// Exporte (von index.html benutzt)
export function setTimescale(x){ timescale = Math.max(0.1, Math.min(50, +x||1)); }
export function setPerfMode(on){
  perfMode = !!on;
  renderer.setPerfMode(perfMode);
  emit("perf:mode", { on:perfMode });
}
export function start(){ if(!running){ running=true; loop(); } }
export function pause(){ running=false; }
export function reset(){
  try{
    running=false;
    createAdamAndEve();
    lastTime = performance.now();
    emit("app:reset",{});
    markBoot(true);
  }catch(e){ report(e,{where:"reset"}); }
}

export function boot(){
  try{
    initErrorManager();

    // Canvas-Größe ermitteln
    const canvas = document.getElementById("scene");
    const rect = canvas.getBoundingClientRect();
    setWorldSize(rect.width, rect.height);

    // Startzustand
    createAdamAndEve();
    applyEnvironment({}); // Umwelt aktuell deaktiviert
    lastTime = performance.now();

    // Auto-Start
    markBoot(true);
    start();
  }catch(err){ report(err,{where:"boot"}); }
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

  const econ = metrics.readEnergyAndReset();
  emit("econ:snapshot", econ);

  // Heartbeat setzen
  heartbeat();
}