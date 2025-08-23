// engine.js — Boot/Loop/Topbar/Events + Phasen-Instrumentierung + Boot-Flag + Seeding-Guard

import { initErrorManager, report } from "./errorManager.js";
import {
  getCells, getFoodItems, setWorldSize,
  createAdamAndEve, applyEnvironment
} from "./entities.js";
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

// ---- Heartbeat für Diagnose ----
function heartbeat(){
  try{
    window.__frameCount = (window.__frameCount|0) + 1;
    window.__lastStepAt = performance.now();
    const prev = window.__lastStepPrev || performance.now();
    const dt = performance.now() - prev;
    window.__lastStepPrev = performance.now();
    if (dt > 0 && dt < 1000){
      const a = 0.15, fps = 1000/dt;
      window.__fpsEMA = (window.__fpsEMA==null) ? fps : window.__fpsEMA*(1-a) + fps*a;
    }
    // kleine Live-Zähler (optional auslesbar)
    window.__cellsN = getCells().length|0;
    window.__foodN  = getFoodItems().length|0;
  }catch{}
}

// Public API
export function setTimescale(x){ timescale = Math.max(0.1, Math.min(50, +x||1)); }
export function setPerfMode(on){
  perfMode = !!on;
  renderer.setPerfMode(perfMode);
  window.__perfMode = perfMode;
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
    start(); // direkt wieder anlaufen
  }catch(e){ report(e,{where:"reset"}); }
}

export function boot(){
  try{
    initErrorManager();

    // Canvas-Größe ermitteln
    const canvas = document.getElementById("scene");
    const rect = canvas.getBoundingClientRect();
    setWorldSize(Math.max(2,rect.width), Math.max(2,rect.height));

    // Startzustand & Umwelt (aktuell aus)
    createAdamAndEve();
    applyEnvironment({});

    // --- UI-Parameter initial anwenden (Mutation %, Nahrung/s) ---
    try{
      const sm = document.getElementById('sliderMutation');
      const sf = document.getElementById('sliderFood');
      if (sm) reproduction.setMutationRate(+sm.value|0);
      if (sf) food.setSpawnRate(+sf.value||6);
    }catch(e){ console.warn('initial slider apply failed', e); }

    lastTime = performance.now();
    markBoot(true);
    start();

    // --- Post-Boot Seeding-Guard ---
    // Wenn nach kurzer Zeit immer noch keine Zellen/kein Food da sind → nachhelfen.
    setTimeout(()=>{
      try{
        if (getCells().length === 0){
          console.warn('[engine] seeding Adam & Eva (guard)');
          createAdamAndEve();
        }
        if (getFoodItems().length === 0){
          // Pre-Warm des Food-Spawns, ohne food.js API zu ändern:
          const rate = (document.getElementById('sliderFood')?.value ? +document.getElementById('sliderFood').value : 6);
          food.setSpawnRate(rate||6);
          for (let i=0;i<24;i++) food.step(0.12); // ~3s simulieren → initiale Items/Cluster
        }
      }catch(e){ console.warn('seeding-guard failed', e); }
    }, 250);

  }catch(err){ report(err,{where:"boot"}); }
}

function loop(){
  if(!running) return;
  const now = performance.now();
  let dt = (now - lastTime)/1000 * timescale;
  if (dt > 0.2) dt = 0.2;   // clamp
  lastTime = now;

  try{ step(dt, now/1000); }
  catch(e){ report(e,{where:"loop.step"}); }

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

  // Ökonomie-Sample an UI
  const econ = metrics.readEnergyAndReset();
  emit("econ:snapshot", econ);

  heartbeat();
}