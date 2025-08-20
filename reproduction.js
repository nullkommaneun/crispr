import { getCells, createCell } from './entities.js';
import { emit } from './event.js';

let mutationRate = 0.1; // Updated from UI via engine

export function step(dt) {
    const cells = getCells();
    for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
            tryPair(cells[i], cells[j], dt);
        }
    }
}

function tryPair(a, b, dt) {
    if (a.cooldown > 0 || b.cooldown > 0) return;
    if (a.sex === b.sex) return;
    const dist = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
    if (dist > a.genome.GRÖ * 5 + b.genome.GRÖ * 5) return;
    const newGenome = recombine(a.genome, b.genome);
    mutate(newGenome, mutationRate);
    const crossBreedChance = 0.1;
    const newStammId = Math.random() < crossBreedChance ? Math.max(a.stammId, b.stammId) + 1 : a.stammId;
    createCell({ pos: midpoint(a.pos, b.pos), sex: Math.random() > 0.5 ? 'm' : 'f', stammId: newStammId, genome: newGenome });
    a.cooldown = 10;
    b.cooldown = 10;
    a.energy -= 20;
    b.energy -= 20;
    emit('cells:born', {parentA: a.id, parentB: b.id});
}

function recombine(g1, g2) {
    const newG = {};
    for (let key in g1) {
        newG[key] = (g1[key] + g2[key]) / 2;
    }
    return newG;
}

function mutate(genome, rate) {
    for (let key in genome) {
        if (Math.random() < rate) {
            genome[key] += (Math.random() - 0.5) * 0.2;
            genome[key] = Math.max(0.1, genome[key]); // Prevent negative
        }
    }
}

function midpoint(p1, p2) {
    return {x: (p1.x + p2.x)/2, y: (p1.y + p2.y)/2};
}