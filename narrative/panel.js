import { on } from '../event.js';
import { getStammCounts } from '../entities.js';

const dnaDaily = document.getElementById('dna-daily');
let stories = [];

export function initNarrative() {
    on('cells:born', evt => pushStory('Born: ' + JSON.stringify(evt)));
    on('cells:died', evt => pushStory('Died: ' + JSON.stringify(evt)));
    on('food:consumed', evt => pushStory('Food consumed: ' + JSON.stringify(evt)));
    on('env:changed', evt => pushStory('Env changed: ' + JSON.stringify(evt)));
}

export function pushStory(msg) {
    stories.push(msg);
    if (stories.length > 10) stories.shift();
    dnaDaily.innerHTML = stories.join('<br>');
}

export function openDaily() {
    dnaDaily.style.display = 'block';
}

export function closeDaily() {
    dnaDaily.style.display = 'none';
}