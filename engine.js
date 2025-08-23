// engine.js — Boot/Loop + Boot-Flag + Heartbeat + AppOps-Telemetrie (robust)

import { initErrorManager, report } from "./errorManager.js";
import { getCells, getFoodItems, setWorldSize, createAdamAndEve, applyEnvironment } from "./entities.js";
import * as entities from "./entities.js";
import * as reproduction from "./reproduction.js";
import * as food from "./food.js";
import * as renderer from "./renderer.js";
import { emit } from "./event.js";
import * as metrics from "./metrics.js";

export const breadcrumb = undefined; // Kompat-Fallback

let running = false;
let lastTime = 0;
let timescale = 1;
let perfMode = false;

// Hilfsflag: während Preflight/App-Ops offen -> sanfter zeichnen
function diagOpen() {
  return !!(window.__pfOpen || window.__opsOpen);
}

/* -------------------------------- Boot-Flag -------------------------------- */
function markBoot(ok = true) {
  try {
    // Preflight nutzt __bootOK; Bootstrap-Watchdog schaut auf __APP_BOOTED
    window.__bootOK = !!ok;
    window.__APP_BOOTED = !!ok;
    document.documentElement.dataset.boot = ok ? "1" : "0";
  } catch {}
}

/* -------------------------------- Heartbeat -------------------------------- */
function heartbeat() {
  try {
    window.__frameCount = (window.__frameCount | 0) + 1;
    const now = performance.now();
    const prev = window.__lastStepPrev || now;
    const dt = now - prev;
    window.__lastStepPrev = now;
    window.__lastStepAt = now;

    if (dt > 0 && dt < 1000) {
      const a = 0.15;
      const fps = 1000 / dt;
      window.__fpsEMA = window.__fpsEMA == null ? fps : window.__fpsEMA * (1 - a) + fps * a;
    }
    window.__cellsN = getCells().length | 0;
    window.__foodN = getFoodItems().length | 0;
  } catch {}
}

/* ------------------------------ Public Controls ---------------------------- */
export function setTimescale(x) { timescale = Math.max(0.1, Math.min(50, +x || 1)); }
export function setPerfMode(on) {
  perfMode = !!on;
  renderer.setPerfMode(perfMode);
  window.__perfMode = perfMode;
  emit("perf:mode", { on: perfMode });
}
export function start() { if (!running) { running = true; loop(); } }
export function pause() { running = false; }
export function reset() {
  try {
    running = false;
    createAdamAndEve();
    lastTime = performance.now();
    emit("app:reset", {});
    markBoot(true);
    start();
  } catch (e) { report(e, { where: "reset" }); }
}

/* ----------------------------------- Boot ---------------------------------- */
export function boot() {
  try {
    initErrorManager();

    const canvas = document.getElementById("scene");
    const r = canvas.getBoundingClientRect();
    setWorldSize(Math.max(2, r.width), Math.max(2, r.height));

    createAdamAndEve();
    applyEnvironment({}); // API-Vertrag sichern

    // initiale Slider ins System
    try {
      const sm = document.getElementById("sliderMutation");
      if (sm) reproduction.setMutationRate(+sm.value | 0);
      const sf = document.getElementById("sliderFood");
      if (sf) food.setSpawnRate(+sf.value || 6);
    } catch {}

    lastTime = performance.now();
    markBoot(true);
    start();

    // Seeding-Guard
    setTimeout(() => {
      try {
        if (getCells().length === 0) { console.warn("[engine] seeding Adam&Eva (guard)"); createAdamAndEve(); }
        if (getFoodItems().length === 0) {
          const rate = +document.getElementById("sliderFood")?.value || 6;
          food.setSpawnRate(rate);
          for (let i = 0; i < 24; i++) food.step(0.12);
        }
      } catch (e) { console.warn("seeding-guard", e); }
    }, 250);
  } catch (err) { report(err, { where: "boot" }); }
}

/* --------------------------------- Game Loop -------------------------------- */
let jankStreak = 0;
const MAX_DT = 0.2;    // harte Kappe pro Schritt
const JANK_MS = 500;   // >500ms Rechenzeit = "extrem"
const JANK_LIMIT = 4;  // so oft hintereinander → Sofort-Pause

function loop() {
  if (!running) return;
  const now = performance.now();
  let dt = ((now - lastTime) / 1000) * timescale;
  if (dt > MAX_DT) dt = MAX_DT;
  lastTime = now;

  let used = 0;
  try {
    const before = performance.now();
    step(dt, now / 1000);
    used = performance.now() - before;
  } catch (e) {
    report(e, { where: "loop.step" });
  }

  // Jank-Guard
  if (used > JANK_MS) jankStreak++; else jankStreak = 0;
  if (jankStreak >= JANK_LIMIT) {
    console.warn("[engine] Emergency pause due to sustained jank");
    pause();
    jankStreak = 0;
  }

  requestAnimationFrame(loop);
}

function step(dt, tSec) {
  // 1) Phasen messen
  metrics.beginTick();

  let t0 = metrics.phaseStart();
  entities.step(dt, {}, tSec);
  metrics.phaseEnd("entities", t0);

  t0 = metrics.phaseStart();
  reproduction.step(dt);
  metrics.phaseEnd("reproduction", t0);

  t0 = metrics.phaseStart();
  food.step(dt);
  metrics.phaseEnd("food", t0);

  // 2) Zeichnen – sanft, wenn Diagnose/OPS offen
  const frameNo = (window.__frameCount | 0);
  const skipDraw = diagOpen() && (frameNo % 3 !== 0);
  t0 = metrics.phaseStart();
  if (!skipDraw) renderer.draw({ cells: getCells(), food: getFoodItems() }, {});
  metrics.phaseEnd("draw", t0);

  // 3) Energie/Telemetry
  emit("econ:snapshot", metrics.readEnergyAndReset());

  try {
    const desired = Math.max(1, Math.round(60 * timescale));
    const max = 60;
    emit("appops:frame", { desired, max });

    const p = (metrics.getPhases && metrics.getPhases()) || {};
    emit("appops:timings", {
      ent:  Math.round(p.entities || 0),
      repro:Math.round(p.reproduction || 0),
      food: Math.round(p.food || 0),
      draw: Math.round(p.draw || 0)
    });
  } catch {
    // Telemetrie darf nie blockieren
  }

  heartbeat();
}