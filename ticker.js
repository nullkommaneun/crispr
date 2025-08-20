import { getEnvState } from './environment.js';
import { on } from './event.js';

let ticker = document.getElementById('ticker');
let perfMode = false;
let interval;

export function initTicker() {
    interval = setInterval(updateSnapshot, 5000);
    on('env:changed', updateSnapshot);
}

export function setPerfMode(on) {
    perfMode = on;
    if (perfMode) clearInterval(interval); // Throttle more
}

export function updateSnapshot() {
    // Calculate FPS, sim speed, mutation %, etc.
    ticker.innerHTML = `FPS: ..., Env: ${JSON.stringify(getEnvState())}`;
}