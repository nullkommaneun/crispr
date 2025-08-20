import { getEnvState, setEnvState } from '../environment.js';

const envPanel = document.getElementById('env-panel');

export function openEnvPanel() {
    envPanel.style.display = 'block';
    updateEnvUI();
}

export function closeEnvPanel() {
    envPanel.style.display = 'none';
}

function updateEnvUI() {
    const state = getEnvState();
    envPanel.innerHTML = '<h3>Umwelt Panel</h3>';
    Object.keys(state).forEach(key => {
        const div = document.createElement('div');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = state[key].enabled;
        checkbox.addEventListener('change', () => {
            state[key].enabled = checkbox.checked;
            setEnvState(state);
        });
        div.appendChild(checkbox);
        div.appendChild(document.createTextNode(key));
        envPanel.appendChild(div);
    });
}