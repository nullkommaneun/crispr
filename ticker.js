import { getEnvState } from './environment.js';
import { on } from './event.js';
import { getCells, getFoodItems } from './entities.js';

const ticker = document.getElementById('ticker');
let perfMode = false;
let interval;

export function initTicker() {
    interval = setInterval(updateSnapshot, 5000);
    on('env:changed', updateSnapshot);
}

export function setPerfMode(on) {
    perfMode = on;
    if (perfMode) {
        clearInterval(interval);
        interval = setInterval(updateSnapshot, 10000); // Throttle
    } else {
        clearInterval(interval);
        interval = setInterval(updateSnapshot, 5000);
    }
}

function updateSnapshot() {
    const fps = 'N/A'; // Placeholder, calculate if needed
    const cellCount = getCells().length;
    const foodCount = getFoodItems().length;
    ticker.innerHTML = `FPS: ${fps}, Cells: ${cellCount}, Food: ${foodCount}, Env: ${JSON.stringify(getEnvState())}`;
}