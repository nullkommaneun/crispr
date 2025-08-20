import { setMode, getMode, sortCells, scoreCell } from './advisor.js';
import { getCells } from './entities.js';
import { on, emit } from './event.js';

const editorPanel = document.getElementById('editor-panel');
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
    updateEditorUI();
}

export function getAdvisorMode() {
    return advisorMode;
}

function updateEditorUI() {
    const sorted = sortCells(getCells());
    editorPanel.innerHTML = '<h3>CRISPR Editor</h3>';
    sorted.forEach(cell => {
        const div = document.createElement('div');
        div.innerHTML = `Cell ${cell.id}: Score ${scoreCell(cell).toFixed(2)}<br>`;
        // Add sliders for traits, but simplified
        editorPanel.appendChild(div);
    });
}