import { initErrorManager } from "./errorManager.js";
import { applyEnvironment, setWorldSize, createAdamAndEve } from "./entities.js";
import { step as reproductionStep, setMutationRate } from "./reproduction.js";
import { step as foodStep, setSpawnRate } from "./food.js";
import { draw, setPerfMode as rendererPerf } from "./renderer.js";
import { openEditor } from "./editor.js";
import { openEnvPanel, getEnvState } from "./environment.js";
import { initNarrative, openDaily } from "./narrative/panel.js";
import { initTicker, setPerfMode as tickerPerf, pushFrame } from "./ticker.js";

let running = false;
let timescale = 1;
let perfMode = false;

let lastTime = 0, acc = 0;
const fixedDt = 1 / 60; // fixed update step (s)
let simTime = 0;

/** Canvas-Größe & Topbar-Abstand aktualisieren */
function resizeCanvas() {
  const canvas = document.getElementById("world");
  const topbar = document.getElementById("topbar");

  // Dynamische Topbar-Höhe an CSS-Var weiterreichen (für mobilen Zeilenumbruch)
  if (topbar) {
    const h = topbar.offsetHeight || 56;
    document.documentElement.style.setProperty("--topbar-h", h + "px");
  }

  // Interne Canvas-Auflösung an sichtbare Größe koppeln (sharp rendering)
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width);
  canvas.height = Math.round(rect.height);
  setWorldSize(canvas.width, canvas.height);
}

/** UI-Bindings */
function bindUI() {
  document.getElementById("btnStart").onclick = start;
  document.getElementById("btnPause").onclick = pause;
  document.getElementById("btnReset").onclick = reset;
  document.getElementById("btnEditor").onclick = openEditor;
  document.getElementById("btnEnv").onclick = openEnvPanel;
  document.getElementById("btnDaily").onclick = openDaily;

  const ts = document.getElementById("timescale");
  ts.oninput = () => setTimescale(parseFloat(ts.value));

  const mu = document.getElementById("mutation");
  mu.oninput = () => setMutationRate(parseFloat(mu.value));

  const fr = document.getElementById("foodrate");
  fr.oninput = () => setSpawnRate(parseFloat(fr.value));

  const pm = document.getElementById("perfmode");
  pm.oninput = () => setPerfMode(pm.checked);

  // Defaultwerte an Module übergeben
  setTimescale(parseFloat(ts.value));
  setMutationRate(parseFloat(mu.value));
  setSpawnRate(parseFloat(fr.value));
  setPerfMode(pm.checked);
}

/** Fixed-Update Zyklus für alle Simulationssysteme */
function update(dt) {
  const env = getEnvState();
  // entities.step dynamisch importieren (vermeidet harte Zyklen)
  return import("./entities.js").then(({ step: entitiesStep }) => {
    entitiesStep(dt, env, simTime);
    reproductionStep(dt);
    foodStep(dt);
  });
}

/** Render-Loop (fixed update + draw) */
function frame(now) {
  if (!running) return;
  now /= 1000;

  if (!lastTime) lastTime = now;
  let delta = Math.min(0.1, now - lastTime); // clamp, falls Tab geweckt
  lastTime = now;
  acc += delta * timescale;

  let steps = 0;
  const maxSteps = 8; // safety, um Spiral-of-death zu vermeiden
  const promises = [];

  while (acc >= fixedDt && steps < maxSteps) {
    promises.push(update(fixedDt));
    acc -= fixedDt;
    simTime += fixedDt;
    steps++;
  }

  Promise.all(promises).then(() => {
    draw();
    // dtSim = fixedDt; fps = 1/delta (Display-FPS, nicht Sim-FPS)
    pushFrame(fixedDt, 1 / delta);
    requestAnimationFrame(frame);
  });
}

/** Public API */
export function boot() {
  initErrorManager();
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  createAdamAndEve();
  applyEnvironment(getEnvState());

  initNarrative();
  initTicker();
  bindUI();

  // Initiales Draw
  draw();
}

export function start() {
  if (!running) {
    running = true; lastTime = 0;
    requestAnimationFrame(frame);
  }
}
export function pause() { running = false; }
export function reset() {
  running = false; // stoppen
  // Food-Cluster neu aufsetzen & Startpopulation wiederherstellen
  import("./food.js").then(m => m.spawnClusters());
  import("./entities.js").then(m => { m.createAdamAndEve(); });
  draw();
}
export function setTimescale(x) {
  timescale = Math.max(0.1, Math.min(8, x));
}
export function setPerfMode(on) {
  perfMode = !!on;
  rendererPerf(perfMode);
  tickerPerf(perfMode);
}

window.addEventListener("DOMContentLoaded", boot);