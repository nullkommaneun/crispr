import { setMode, getMode, sortCells } from './advisor.js';
import { getCells } from './entities.js';
import { on, emit } from './event.js';

let editorPanel = document.getElementById('editor-panel');
let advisorMode = 'off';

export function openEditor() {
    editorPanel.style.display = 'block';
    updateEditorUI();
}

export function closeEditor() {
    editorPanel.style.display = 'none';
}

export function setAdvisorMode(mode) {
    advisorMode = mode;
    setMode(mode);
}

export function getAdvisorMode() {
    return advisorMode;
}

function updateEditorUI() {
    const sorted = sortCells(getCells());
    // Render list with traits editors, tooltips
    // Example: sliders for TEM, etc.
}