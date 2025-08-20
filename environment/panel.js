import { getEnvState, setEnvState } from '../environment.js';

let envPanel = document.getElementById('env-panel');

export function openEnvPanel() {
    envPanel.style.display = 'block';
    updateEnvUI();
}

export function closeEnvPanel() {
    envPanel.style.display = 'none';
}

function updateEnvUI() {
    const state = getEnvState();
    // Render checkboxes/sliders for acid, barb, etc.
    // On change: setEnvState(updated)
}