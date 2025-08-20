import { getCells, createCell } from './entities.js';
import { emit } from './event.js';

let mutationRate = 0.1; // Set from engine

export function step(dt) {
    const cells = getCells();
    for (let i = 0; i < cells.length; i++) {
        for (let j = i+1; j < cells.length; j++) {
            tryPair(cells[i], cells[j]);
        }
    }
}

export function tryPair(a, b) {
    if (a.cooldown > 0 || b.cooldown > 0) return;
    if (a.sex === b.sex) return;
    // Check proximity
    const dist = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
    if (dist > 10) return; // Example radius
    // Recombine genomes
    const newGenome = recombine(a.genome, b.genome);
    mutate(newGenome, mutationRate);
    const newStammId = Math.random() < 0.1 ? nextStammId++ : a.stammId; // Slight cross-breeding
    createCell({ pos: midpoint(a.pos, b.pos), sex: Math.random() > 0.5 ? 'm' : 'f', stammId: newStammId, genome: newGenome });
    a.cooldown = 10; b.cooldown = 10; // Example
    a.energy -= 20; b.energy -= 20;
}

function recombine(g1, g2) {
    return Object.fromEntries(Object.keys(g1).map(k => [k, (g1[k] + g2[k]) / 2]));
}

function mutate(genome, rate) {
    Object.keys(genome).forEach(k => {
        if (Math.random() < rate) genome[k] += Math.random() * 0.2 - 0.1;
    });
}

function midpoint(p1, p2) {
    return {x: (p1.x + p2.x)/2, y: (p1.y + p2.y)/2};
}