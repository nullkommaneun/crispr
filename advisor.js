let mode = 'off';

export function setMode(m) {
    mode = m;
}

export function getMode() {
    return mode;
}

export function scoreCell(cell) {
    if (mode === 'off') return 0;
    if (mode === 'heuristic') {
        return (cell.genome.EFF + cell.genome.SCH) / (cell.genome.MET + 1);
    }
    if (mode === 'model') {
        return Math.random(); // Dummy
    }
    return 0;
}

export function sortCells(cells) {
    return [...cells].sort((a, b) => scoreCell(b) - scoreCell(a));
}