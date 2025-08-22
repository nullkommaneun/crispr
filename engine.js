// engine.js — Orchestrierung: Game-Loop, UI, Timescale, Annealing, Panels
// mobile-ready: Topbar-Höhe wird laufend gemessen (ResizeObserver) und an CSS übergeben.

import { initErrorManager, breadcrumb } from "./errorManager.js";

import {
  setWorldSize,
  createAdamAndEve,
  step as entitiesStep
} from "./entities.js";

import {
  step as reproductionStep,
  setMutationRate
} from "./reproduction.js";

import {
  step as foodStep,
  setSpawnRate
} from "./food.js";

import { draw, setPerfMode as rendererPerf } from "./renderer.js";
import { openEditor } from "./editor.js";

import {
  initTicker,
  setPerfMode as tickerPerf,
  pushFrame
} from "./ticker.js";

import { emit, on } from "./event.js";
import { openDummyPanel, handleCanvasClickForDummy } from "./dummy.js";
import { initDrives } from "./drives.js";
import { getEnvState } from "./environment.js";

/* ---------- Laufzeit-Flags ---------- */
let running = false;
let timescale = 1;
let perfMode = false;

const SPEED_STEPS = [1, 5, 10, 50];
let speedIdx = 0;

let lastTime = 0;
let acc = 0;
const fixedDt = 1 / 60;
let simTime = 0;

// Mutation-Annealing (sekündlich)
let annealAccum = 0;

/* =========================================================
   Topbar-Höhe korrekt an CSS geben (über --topbar-h)
   ========================================================= */
function setTopbarHeightVar() {
  const topbar = document.getElementById("topbar");
  const h = topbar ? (topbar.offsetHeight || 56) : 56;
  document.documentElement.style.setProperty("--topbar-h", h + "px");
}

let _topbarRO = null;
function installTopbarObserver() {
  const topbar = document.getElementById("topbar");
  if (!topbar) return;
  try {
    _topbarRO?.disconnect();
    _topbarRO = new ResizeObserver(() => {
      setTopbarHeightVar();
      const canvas = document.getElementById("world");
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        canvas.width = Math.round(rect.width);
        canvas.height = Math.round(rect.height);
        setWorldSize(canvas.width, canvas.height);
      }
    });
    _topbarRO.observe(topbar);
  } catch {}
}

/* ---------- Canvas-Resize ---------- */
function resizeCanvas() {
  setTopbarHeightVar();
  const canvas = document.getElementById("world");
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width);
  canvas.height = Math.round(rect.height);
  setWorldSize(canvas.width, canvas.height);
}

/* =========================================================
   UI-Bindings
   ========================================================= */
function bindUI() {
  // Hauptbuttons
  const btnStart  = document.getElementById("btnStart");
  const btnPause  = document.getElementById("btnPause");
  const btnReset  = document.getElementById("btnReset");
  const btnEditor = document.getElementById("btnEditor");
  const btnGenea  = document.getElementById("btnGenea");
  const btnDummy  = document.getElementById("btnDummy");
  const btnDiag   = document.getElementById("btnDiag");
  const btnSpeed  = document.getElementById("btnSpeed");

  btnStart.onclick  = () => { breadcrumb("ui:btn","Start"); start(); };
  btnPause.onclick  = () => { breadcrumb("ui:btn","Pause"); pause(); };
  btnReset.onclick  = () => { breadcrumb("ui:btn","Reset"); reset(); };
  btnEditor.onclick = () => { breadcrumb("ui:btn","Editor"); openEditor(); };

  if (btnGenea) btnGenea.onclick = () => { breadcrumb("ui:btn","Genealogy"); import("./genea.js").then(m => m.openGenealogyPanel()); };
  if (btnDummy) btnDummy.onclick = () => { breadcrumb("ui:btn","Dummy"); openDummyPanel(); };
  if (btnDiag)  btnDiag.onclick  = () => { breadcrumb("ui:btn","Diagnose"); import("./diag.js").then(m => m.openDiagPanel()); };

  btnSpeed.onclick = () => { cycleSpeed(); };

  // Slider / Switches
  const mu = document.getElementById("mutation");
  const fr = document.getElementById("foodrate");
  const pm = document.getElementById("perfmode");

  // Werte-Badges (neben Slidern)
  const mutVal  = document.getElementById("mutVal");
  const foodVal = document.getElementById("foodVal");

  function updateDisplayVals(){
    if (mutVal)  mutVal.textContent  = `${Math.round(parseFloat(mu.value||"0"))}%`;
    if (foodVal) foodVal.textContent = `${Math.round(parseFloat(fr.value||"0"))}/s`;
  }

  mu.oninput = () => { setMutationRate(parseFloat(mu.value)); updateDisplayVals(); };
  fr.oninput = () => { setSpawnRate(parseFloat(fr.value));  updateDisplayVals(); };
  pm.oninput = () => { setPerfMode(pm.checked); };

  // Touch: Scroll-Safe (kein Page-Scroll während Sliderbedienung)
  [mu,fr].forEach(el=>{
    if(!el) return;
    el.addEventListener("touchmove", (e)=>{ e.preventDefault(); }, {passive:false});
  });

  // Canvas-Interaktionen (Dummy)
  const canvas = document.getElementById("world");
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    handleCanvasClickForDummy(e.clientX - rect.left, e.clientY - rect.top);
  });

  // Startwerte
  setMutationRate(parseFloat(mu.value));
  setSpawnRate(parseFloat(fr.value));
  setPerfMode(pm.checked);
  updateDisplayVals();
  setTimescale(SPEED_STEPS[speedIdx]);
  updateSpeedButton();
}

function updateSpeedButton() {
  const sp = document.getElementById("btnSpeed");
  if (sp) sp.textContent = `Tempo ×${SPEED_STEPS[speedIdx]}`;
}

function cycleSpeed() {
  speedIdx = (speedIdx + 1) % SPEED_STEPS.length;
  setTimescale(SPEED_STEPS[speedIdx]);
  updateSpeedButton();
}

/* =========================================================
   Annealing der Mutationsrate
   ========================================================= */
function annealMutation(dt) {
  annealAccum += dt;
  if (annealAccum < 1) return; // 1x pro Sekunde
  annealAccum = 0;

  // 0–30 s → 30 %, 30–120 s → 12 %, >120 s → 8 %
  if (simTime > 120) setMutationRate(8);
  else if (simTime > 30) setMutationRate(12);
  else setMutationRate(30);
}

/* =========================================================
   Game-Loop
   ========================================================= */
function frame(now) {
  if (!running) return;
  now /= 1000;

  if (!lastTime) lastTime = now;
  const delta = Math.min(0.1, now - lastTime);
  lastTime = now;

  acc += delta * timescale;

  const desiredSteps = Math.floor(acc / fixedDt);
  const maxSteps = Math.min(60, Math.max(8, Math.ceil(timescale * 1.2)));
  const steps = Math.min(desiredSteps, maxSteps);

  const env = getEnvState(); // Stub (neutral)

  for (let s = 0; s < steps; s++) {
    entitiesStep(fixedDt, env, simTime);
    reproductionStep(fixedDt);
    foodStep(fixedDt);
    simTime += fixedDt;
    acc -= fixedDt;

    annealMutation(fixedDt);
  }

  if (Math.floor(acc / fixedDt) > maxSteps) {
    acc = fixedDt * maxSteps;
  }

  draw();
  pushFrame(fixedDt, 1 / delta);
  requestAnimationFrame(frame);
}

/* =========================================================
   Public API
   ========================================================= */
export function boot() {
  try { initErrorManager({ pauseOnError: true, captureConsole: true }); } catch {}
  on("error:panic",  () => pause());
  on("error:resume", () => start());

  resizeCanvas();
  installTopbarObserver();
  window.addEventListener("resize", resizeCanvas);

  initDrives();
  createAdamAndEve();
  initTicker();

  bindUI();
  draw();

  window.__APP_BOOTED = true;
}

export function start() {
  if (!running) {
    running = true;
    lastTime = 0;
    requestAnimationFrame(frame);
  }
}

export function pause() { running = false; }

export function reset() {
  running = false;
  import("./food.js").then(m => m.spawnClusters());
  import("./entities.js").then(m => { m.createAdamAndEve(); });
  draw();
}

export function setTimescale(x) {
  timescale = Math.max(0.1, Math.min(50, x));
  emit("ui:speed", timescale);
}

export function setPerfMode(on) {
  perfMode = !!on;
  rendererPerf(perfMode);
  tickerPerf(perfMode);
}

/* =========================================================
   Boot-Guard
   ========================================================= */
(function ensureBoot() {
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", boot);
  } else {
    try { boot(); } catch (e) { console.error("boot() error", e); }
  }
})();