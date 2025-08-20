// engine.js
import { initErrorManager, showError, safeImport } from './errorManager.js';
import { on, emit } from './event.js';
import * as Entities from './entities.js';
import { initAdvisor } from './advisor.js';
import { mountTicker, registerFrame } from './ticker.js';
import { initDaily } from './dnaDaily.js';

initErrorManager();
initAdvisor();
initDaily();

// ---------- Canvas
let canvas = document.getElementById('sim');
if (!canvas) {
  canvas = document.createElement('canvas');
  canvas.id='sim';
  document.body.appendChild(canvas);
}
const ctx = canvas.getContext('2d', { alpha:false });

function resize(){
  const w = Math.max(640, Math.floor(window.innerWidth  * 0.98));
  const h = Math.max(420, Math.floor(window.innerHeight * 0.70));
  canvas.width = w; canvas.height = h;
  Entities.setWorldSize(w, h);
}
window.addEventListener('resize', resize);
resize();

// ---------- State
let running = false;
let timescaleIdx = 0;
const TIMES = [1,5,10];
let perfMode = false;

function getDt(tsNow){
  const dt = (tsNow - lastTs)/1000;
  return Math.min(dt * TIMES[timescaleIdx], 1/15); // clamp
}

function clearScreen(){
  ctx.fillStyle = '#0b0f0f';
  ctx.fillRect(0,0,canvas.width,canvas.height);
}

function draw(){
  clearScreen();
  Entities.draw(ctx);
}

let lastTs = performance.now();
function loop(ts){
  if (running) {
    const dt = getDt(ts);
    Entities.update(dt);
    draw();
    registerFrame();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------- Controls (IDs optional – falls nicht vorhanden, werden sie ignoriert)
const $play      = document.getElementById('btnPlay')      || document.querySelector('[data-role="play"]');
const $reset     = document.getElementById('btnReset')     || document.querySelector('[data-role="reset"]');
const $time      = document.getElementById('btnTimescale') || document.querySelector('[data-role="timescale"]');
const $mut       = document.getElementById('sliderMutation') || document.querySelector('[data-role="mutation"]');
const $food      = document.getElementById('sliderFood')     || document.querySelector('[data-role="food"]');
const $highlight = document.getElementById('btnHighlight')   || document.querySelector('[data-role="highlight"]');
const $editor    = document.getElementById('btnEditor')      || document.querySelector('[data-role="editor"]');
const $env       = document.getElementById('btnEnv')         || document.querySelector('[data-role="env"]');
const $perf      = document.getElementById('btnPerf')        || document.querySelector('[data-role="perf"]');

// Play / Pause
$play?.addEventListener('click', ()=>{
  running = !running;
  $play.textContent = running ? 'Pause' : 'Play';
});
$reset?.addEventListener('click', ()=>{
  Entities.reset(); Entities.spawnAdamEva();
  clearScreen(); draw();
});

// Timescale zyklisch
function updateTimescaleLabel(){ if ($time) $time.textContent = `⚡ ${TIMES[timescaleIdx]}x`; }
$time?.addEventListener('click', ()=>{
  timescaleIdx = (timescaleIdx+1) % TIMES.length;
  updateTimescaleLabel();
});
updateTimescaleLabel();

// Mutation in %
function setMutationFromUI(v){
  const pct = Math.max(0, Math.min(0.10, v)); // 0..0.10
  Entities.setMutationPct(pct);
}
if ($mut) {
  const init = 0.005; // 0.5%
  $mut.value = init*100; setMutationFromUI(init);
  $mut.addEventListener('input', ()=> setMutationFromUI($mut.value/100));
}

// Food /s
function setFoodFromUI(vps){ Entities.setFoodRate(vps); }
if ($food) {
  $food.value = 90; setFoodFromUI(90);
  $food.addEventListener('input', ()=> setFoodFromUI(+$food.value));
}

// Highlight zyklen (Alle → Stamm IDs)
$highlight?.addEventListener('click', ()=>{
  const ids = Entities.getStammIds();
  if (!ids.length) { Entities.setHighlightStamm(null); $highlight.textContent='Alle Stämme'; return; }
  let idx = ids.indexOf(currentHighlightId);
  idx = (idx+1) % (ids.length+1); // +1 = alle
  currentHighlightId = (idx===ids.length) ? null : ids[idx];
  Entities.setHighlightStamm(currentHighlightId);
  $highlight.textContent = currentHighlightId? `Stamm ${currentHighlightId}` : 'Alle Stämme';
});
let currentHighlightId = null;

// Editor (lazy)
$editor?.addEventListener('click', async ()=>{
  const m = await safeImport('./editor.js', ['openEditor']);
  m.openEditor();
});

// Umwelt (lazy)
$env?.addEventListener('click', async ()=>{
  const m = await safeImport('./environment/panel.js', ['openEnvPanel']);
  m.openEnvPanel();
});

// Performance‑Modus
function applyPerf(){
  if (perfMode) {
    Entities.setPerfProfile({ drawStride:2, renderScale:0.8 });
  } else {
    Entities.setPerfProfile({ drawStride:1, renderScale:1 });
  }
}
$perf?.addEventListener('click', ()=>{
  perfMode = !perfMode; applyPerf();
  $perf.textContent = perfMode ? 'Performance: AN' : 'Performance: AUS';
});
applyPerf();

// Start
Entities.reset();
Entities.spawnAdamEva();
mountTicker();
running = true;
$play && ($play.textContent='Pause');

// Event‑Hinweis bei Fehler
on('error', (e)=> showError(e?.message??String(e)));