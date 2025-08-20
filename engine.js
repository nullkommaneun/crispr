import { createAdamAndEve, step as entitiesStep, getCells, getFoodItems, applyEnvironment, setWorldSize } from './entities.js';
import { step as reproductionStep } from './reproduction.js';
import { step as foodStep, setSpawnRate } from './food.js';
import { draw, setPerfMode as rendererSetPerfMode } from './renderer.js';
import { openEditor } from './editor.js';
import { openEnvPanel, getEnvState } from './environment.js';
import { on, emit } from './event.js';
import { initTicker, setPerfMode as tickerSetPerfMode } from './ticker.js';
import { initNarrative } from './narrative/panel.js';
import { initErrorManager } from './errorManager.js';

let running = false;
let timescale = 1;
let perfMode = false;
let lastTime = 0;
let mutationRate = 0.1;
let foodRate = 1;
let canvas, ctx;

export function boot() {
    initErrorManager();
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');
    setWorldSize(canvas.width, canvas.height);
    createAdamAndEve();
    applyEnvironment(getEnvState());
    initTicker();
    initNarrative();
    setupUIEvents();
}

function setupUIEvents() {
    document.getElementById('start-btn').addEventListener('click', start);
    document.getElementById('pause-btn').addEventListener('click', pause);
    document.getElementById('reset-btn').addEventListener('click', reset);
    document.getElementById('editor-btn').addEventListener('click', openEditor);
    document.getElementById('env-panel-btn').addEventListener('click', openEnvPanel);
    document.getElementById('perf-mode-btn').addEventListener('click', () => setPerfMode(!perfMode));
    document.getElementById('timescale-slider').addEventListener('input', (e) => setTimescale(e.target.value));
    document.getElementById('mutation-rate-slider').addEventListener('input', (e) => mutationRate = e.target.value);
    document.getElementById('food-rate-slider').addEventListener('input', (e) => { foodRate = e.target.value; setSpawnRate(foodRate); });
}

export function start() {
    if (!running) {
        running = true;
        lastTime = performance.now();
        requestAnimationFrame(gameLoop);
    }
}

export function pause() {
    running = false;
}

export function reset() {
    pause();
    // Reset states
    createAdamAndEve();
    emit('reset');
}

export function setTimescale(x) {
    timescale = parseFloat(x);
}

export function setPerfMode(on) {
    perfMode = on;
    rendererSetPerfMode(on);
    tickerSetPerfMode(on);
}

function gameLoop(time) {
    if (!running) return;
    const dt = (time - lastTime) / 1000 * timescale;
    lastTime = time;

    entitiesStep(dt, getEnvState());
    reproductionStep(dt);
    foodStep(dt);

    draw({ cells: getCells(), food: getFoodItems() }, getEnvState());

    requestAnimationFrame(gameLoop);
}

boot();