import { getCells } from './entities.js';
import { emit } from './event.js';

let hotspots = []; // {pos, radius, density}
let spawnRate = 1;
let foodItems = []; // From entities, but manage here?

export function step(dt) {
    // Wander hotspots
    hotspots.forEach(h => {
        h.pos.x += Math.random() * 2 - 1;
        h.pos.y += Math.random() * 2 - 1;
    });
    // Spawn food
    if (Math.random() < spawnRate * dt) {
        spawnCluster();
    }
    // Consumption by cells
    getCells().forEach(cell => {
        // Find nearby food, consume, increase energy
    });
}

export function spawnClusters(n = 1) {
    for (let i = 0; i < n; i++) {
        hotspots.push({pos: {x: Math.random()*worldWidth, y: Math.random()*worldHeight}, radius: 50, density: 10});
    }
}

export function setSpawnRate(perSec) {
    spawnRate = perSec;
}