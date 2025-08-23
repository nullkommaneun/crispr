// engine.js — Boot/Loop + Boot-Flag + Heartbeat + AppOps-Telemetrie

import { initErrorManager, report } from "./errorManager.js";
import {
  getCells,
  getFoodItems,
  setWorldSize,
  createAdamAndEve,
  applyEnvironment
} from "./entities.js";
import * as entities from "./entities.js";
import * as reproduction from "./reproduction.js";
import * as food from "./food.js";
import * as renderer from "./renderer.js";
import { emit } from "./event.js";
import * as metrics from "./metrics.js";

// Für alte Stellen, die 'breadcrumb' importieren:
export const breadcrumb = undefined;

// Laufzeitstatus
let running   = false;
let lastTime  = 0;
let timescale = 1;
let perfMode  = false;

/* ------------------------------ Boot-Flag ------------------------------ */

function markBoot(ok = true) {
  try {
    // Preflight nutzt __bootOK; der Bootstrap-Watchdog schaut auf __APP_BOOTED
    window.__bootOK      = !!ok;
    window.__APP_BOOTED  = !!ok;
    document.documentElement.dataset.boot = ok ? "1" : "0";
  } catch {}
}

/* ------------------------------ Heartbeat ------------------------------ */

function heartbeat() {
  try {
    window.__frameCount = (window.__frameCount | 0) + 1;

    const now  = performance.now();
    const prev = window.__lastStepPrev || now;
    const dt   = now - prev;

    window.__lastStepPrev = now;
    window.__lastStepAt   = now;

    if (dt > 0 && dt < 1000) {
      const a   = 0.15;
      const fps = 1000 / dt;
      window.__fpsEMA = (window.__fpsEMA == null) ? fps : (window.__fpsEMA * (1 - a) + fps * a);
    }

    window.__cellsN = getCells().length  | 0;
    window.__foodN  = getFoodItems().length | 0;
  } catch {}
}

/* --------------------------- Public Controls --------------------------- */

export function setTimescale(x) {
  timescale = Math.max(0.1, Math.min(50, +x || 1));
}

export function setPerfMode(on) {
  perfMode = !!on;
  try { renderer.setPerfMode(perfMode); } catch {}
  try { window.__perfMode = perfMode; } catch {}
  try { emit("perf:mode", { on: perfMode }); } catch {}
}

export function start() {
  if (!running) {
    running = true;
    loop();
  }
}

export function pause() {
  running = false;
}

export function reset() {
  try {
    running  = false;
    createAdamAndEve();
    lastTime = performance.now();
    emit("app:reset", {});
    markBoot(true);
    start();
  } catch (e) {
    report(e, { where: "reset" });
  }
}

/* --------------------------------- Boot -------------------------------- */

export function boot() {
  try {
    // Preflight/Debug darf Boot temporär unterdrücken
    if (window.__NO_BOOT === true) {
      console.warn("[engine] boot(): unterdrückt durch __NO_BOOT");
      return;
    }

    initErrorManager();

    const canvas = document.getElementById("scene");
    // Fallback, falls Layout zum Zeitpunkt 0px misst
    const r = canvas?.getBoundingClientRect?.() || { width: 800, height: 500 };
    setWorldSize(Math.max(2, r.width), Math.max(2, r.height));

    // Welt initialisieren
    createAdamAndEve();
    applyEnvironment({}); // no-op (API-Vertrag sichern)

    // Slider-Startwerte defensiv anwenden
    try {
      const sm = document.getElementById("sliderMutation");
      if (sm) reproduction.setMutationRate(+sm.value | 0);
      const sf = document.getElementById("sliderFood");
      if (sf) food.setSpawnRate(+sf.value || 6);
    } catch {}

    lastTime = performance.now();
    markBoot(true);
    start();

    // Guard: wenn nach kurzem keine Entities/Food existieren, seeden
    setTimeout(() => {
      try {
        if (getCells().length === 0) {
          console.warn("[engine] seeding Adam&Eva (guard)");
          createAdamAndEve();
        }
        if (getFoodItems().length === 0) {
          const rate = +document.getElementById("sliderFood")?.value || 6;
          food.setSpawnRate(rate);
          for (let i = 0; i < 24; i++) food.step(0.12);
        }
      } catch (e) {
        console.warn("[engine] seeding-guard warn:", e);
      }
    }, 250);

  } catch (err) {
    report(err, { where: "boot" });
  }
}

/* ----------------------------- Game Loop ------------------------------- */

function loop() {
  if (!running) return;
  const now = performance.now();
  let dt    = ((now - lastTime) / 1000) * timescale;
  if (dt > 0.2) dt = 0.2;
  lastTime = now;

  try {
    step(dt, now / 1000);
  } catch (e) {
    report(e, { where: "loop.step" });
  }

  requestAnimationFrame(loop);
}

function step(dt, tSec) {
  // Phasen messen (für App-Ops/Diagnose)
  try { metrics.beginTick(); } catch {}

  try {
    let t0 = metrics.phaseStart ? metrics.phaseStart() : 0;
    entities.step(dt, {}, tSec);
    if (metrics.phaseEnd) metrics.phaseEnd("entities", t0);

    t0 = metrics.phaseStart ? metrics.phaseStart() : 0;
    reproduction.step(dt);
    if (metrics.phaseEnd) metrics.phaseEnd("reproduction", t0);

    t0 = metrics.phaseStart ? metrics.phaseStart() : 0;
    food.step(dt);
    if (metrics.phaseEnd) metrics.phaseEnd("food", t0);

    t0 = metrics.phaseStart ? metrics.phaseStart() : 0;
    renderer.draw({ cells: getCells(), food: getFoodItems() }, {});
    if (metrics.phaseEnd) metrics.phaseEnd("draw", t0);

    // Ökonomie-Snapshot (falls vorhanden)
    try { emit("econ:snapshot", metrics.readEnergyAndReset?.()); } catch {}
  } catch (e) {
    report(e, { where: "step" });
  }

  // App-Ops Telemetrie (rahmenlos — darf nie den Loop blockieren)
  try {
    const desired = Math.max(1, Math.round(60 * timescale));
    const max     = 60;
    emit("appops:frame", { desired, max });

    const p = (metrics.getPhases && metrics.getPhases()) || {};
    emit("appops:timings", {
      ent:   Math.round(p.entities      || 0),
      repro: Math.round(p.reproduction  || 0),
      food:  Math.round(p.food          || 0),
      draw:  Math.round(p.draw          || 0),
    });
  } catch {}

  heartbeat();
}