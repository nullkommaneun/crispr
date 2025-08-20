let mode = 'off';
// Assume TensorFlow.js loaded externally or dummy

export function setMode(m) {
    mode = m;
}

export function getMode() {
    return mode;
}

export function scoreCell(cell) {
    if (mode === 'off') return 0;
    if (mode === 'heuristic') {
        // Rules: e.g., low MET + high EFF -> high score
        return cell.genome.EFF / cell.genome.MET;
    }
    if (mode === 'model') {
        // Dummy or tfjs predict
        return Math.random();
    }
}

export function sortCells(cells) {
    return cells.sort((a, b) => scoreCell(b) - scoreCell(a));
}