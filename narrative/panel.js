import { on } from '../event.js';
import { getStammCounts } from '../entities.js';

let dnaDaily = document.getElementById('dna-daily');

export function initNarrative() {
    on('cells:born', pushStory);
    on('cells:died', pushStory);
    on('food:consumed', pushStory);
    // Throttle and dedupe
}

export function pushStory(evt) {
    // Generate story arc messages
    dnaDaily.innerHTML += `<p>${evt.type}: ${JSON.stringify(evt.payload)}</p>`;
}

export function openDaily() {
    dnaDaily.style.display = 'block';
}

export function closeDaily() {
    dnaDaily.style.display = 'none';
}