import { initErrorManager, breadcrumb } from "./errorManager.js";
import {
  applyEnvironment, setWorldSize, createAdamAndEve, step as entitiesStep,
  getCells, getFoodItems
} from "./entities.js";
import { step as reproductionStep, setMutationRate } from "./reproduction.js";
import { step as foodStep, setSpawnRate } from "./food.js";
import { draw, setPerfMode as rendererPerf } from "./renderer.js";
import { openEditor } from "./editor.js";
import { openEnvPanel, getEnvState } from "./environment.js";
import { initTicker, setPerfMode as tickerPerf, pushFrame } from "./ticker.js";
import { emit, on } from "./event.js";
import { openDummyPanel, handleCanvasClickForDummy } from "./dummy.js";

let running = false;
let timescale = 1;
let perfMode = false;

const SPEED_STEPS = [1, 5, 10, 50];
let speedIdx = 0;

let lastTime = 0, acc = 0;
const fixedDt = 1 / 60; // fixer Simulationsschritt (s)
let simTime = 0;

/** kompakter Snapshot für Crash Capsule */
function snapshot(){
  // kleine Hilfsfunktionen
  const round = (n)=> Math.abs(n)<1e-6?0:Math.round(n*100)/100;
  const cells = getCells();
  const foods = getFoodItems();

  // Zellen: nur Top 50, stark verdichtet
  const cellsMini = cells.slice(0,50).map(c=>({
    id:c.id, n:c.name, s:c.sex, st:c.stammId,
    p:[round(c.pos.x), round(c.pos.y)],
    v:[round(c.vel.x), round(c.vel.y)],
    e:round(c.energy), a:round(c.age), cd:round(c.cooldown),
    g:c.genome, d: !!c.isDummy
  }));

  // Food: nur Top 120
  const foodMini = foods.slice(0,120).map(f=>({x:round(f.x), y:round(f.y), a:round(f.amount)}));

  return {
    ts: Date.now(),
    simTime: round(simTime),
    timescale,
    perfMode,
    counts:{ cells: cells.length, food: foods.length },
    env: getEnvState(),
    cells: cellsMini,
    food: foodMini
  };
}

/** Canvas-Größe & Topbar-Abstand aktualisieren */
function resizeCanvas() {
  const canvas = document.getElementById("world");
  const topbar = document.getElementById("topbar");

  if (topbar) {
    const h = topbar.offsetHeight || 56;
    document.documentElement.style.setProperty("--topbar-h", h + "px");
  }

  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width);
  canvas.height = Math.round(rect.height);
  setWorldSize(canvas.width, canvas.height);
}

/** UI-Bindings */
function bindUI() {
  document.getElementById("btnStart").onclick = ()=>{ breadcrumb("ui:btn","Start"); start(); };
  document.getElementById("btnPause").onclick = ()=>{ breadcrumb("ui:btn","Pause"); pause(); };
  document.getElementById("btnReset").onclick = ()=>{ breadcrumb("ui:btn","Reset"); reset(); };
  document.getElementById("btnEditor").onclick = ()=>{ breadcrumb("ui:btn","Editor"); openEditor(); };
  document.getElementById("btnEnv").onclick = ()=>{ breadcrumb("ui:btn","Umwelt"); openEnvPanel(); };
  document.getElementById("btnDummy").onclick = ()=>{ breadcrumb("ui:btn","Dummy"); openDummyPanel(); };

  const mu = document.getElementById("mutation");
  mu.oninput = ()=>{ setMutationRate(parseFloat(mu.value)); breadcrumb("ui:slider","mutation:"+mu.value); };

  const fr = document.getElementById("foodrate");
  fr.oninput = ()=>{ setSpawnRate(parseFloat(fr.value)); breadcrumb("ui:slider","foodrate:"+fr.value); };

  const pm = document.getElementById("perfmode");
  pm.oninput = ()=>{ setPerfMode(pm.checked); breadcrumb("ui:toggle","perf:"+pm.checked); };

  const sp = document.getElementById("btnSpeed");
  sp.onclick = ()=>{ cycleSpeed(); breadcrumb("ui:btn","speed:"+SPEED_STEPS[speedIdx]); };

  const canvas = document.getElementById("world");
  canvas.addEventListener("click", (e)=>{
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    breadcrumb("world:click", { x: Math.round(x), y: Math.round(y) });
    handleCanvasClickForDummy(x, y);
  });

  setMutationRate(parseFloat(mu.value));
  setSpawnRate(parseFloat(fr.value));
  setPerfMode(pm.checked);
  setTimescale(SPEED_STEPS[speedIdx]);
  updateSpeedButton();
}

function updateSpeedButton(){
  const sp = document.getElementById("btnSpeed");
  if (sp) sp.textContent = `Tempo ×${SPEED_STEPS[speedIdx]}`;
}
function cycleSpeed(){
  speedIdx = (speedIdx + 1) % SPEED_STEPS.length;
  setTimescale(SPEED_STEPS[speedIdx]);
  updateSpeedButton();
}

/** Render-Loop (fixed updates + draw), ohne Promises */
function frame(now) {
  if (!running) return;
  now /= 1000;

  if (!lastTime) lastTime = now;
  let delta = Math.min(0.1, now - lastTime);
  lastTime = now;

  acc += delta * timescale;

  const desiredSteps = Math.floor(acc / fixedDt);
  const maxSteps = Math.min(60, Math.max(8, Math.ceil(timescale * 1.2)));

  const steps = Math.min(desiredSteps, maxSteps);
  const env = getEnvState();

  for (let s = 0; s < steps; s++) {
    entitiesStep(fixedDt, env, simTime);
    reproductionStep(fixedDt);
    foodStep(fixedDt);
    simTime += fixedDt;
    acc -= fixedDt;
  }

  if (Math.floor(acc / fixedDt) > maxSteps) {
    acc = fixedDt * maxSteps;
  }

  draw();
  pushFrame(fixedDt, 1 / delta);
  requestAnimationFrame(frame);
}

/** Public API */
export function boot() {
  // Build-ID (nur zur Orientierung)
  window.__BUILD_ID = `mdc1-${new Date().toISOString()}`;

  try{
    initErrorManager({
      pauseOnError:true,
      captureConsole:true,
      snapshot,                // <- hier geben wir den Snapshot-Hook rein
    });
  }catch(e){}

  on("error:panic", ()=> pause());
  on("error:resume", ()=> start());

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  createAdamAndEve();
  applyEnvironment(getEnvState());

  initTicker();
  emit("ui:speed", timescale);

  bindUI();
  draw();

  window.__APP_BOOTED = true;
}

export function start(){ if (!running) { running = true; lastTime = 0; requestAnimationFrame(frame); } }
export function pause(){ running = false; }
export function reset(){
  running = false;
  import("./food.js").then(m => m.spawnClusters());
  import("./entities.js").then(m => { m.createAdamAndEve(); });
  draw();
}
export function setTimescale(x){
  timescale = Math.max(0.1, Math.min(50, x));
  emit("ui:speed", timescale);
}
export function setPerfMode(on){
  perfMode = !!on;
  rendererPerf(perfMode);
  tickerPerf(perfMode);
}

window.addEventListener("DOMContentLoaded", boot);