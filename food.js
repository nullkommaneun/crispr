import { getCells, addFoodItem, removeFoodItem, getFoodItems } from './entities.js';
import { emit } from './event.js';

let hotspots = [];
let spawnRate = 1;

export function step(dt) {
    hotspots.forEach(h => {
        h.pos.x += (Math.random() - 0.5) * 2;
        h.pos.y += (Math.random() - 0.5) * 2;
        // Clamp to world
        h.pos.x = Math.max(0, Math.min(h.pos.x, worldWidth));
        h.pos.y = Math.max(0, Math.min(h.pos.y, worldHeight));
    });
    if (Math.random() < spawnRate * dt) {
        spawnCluster();
    }
    consumeFood();
}

function spawnCluster() {
    const pos = {x: Math.random() * worldWidth, y: Math.random() * worldHeight};
    hotspots.push({pos, radius: 50, density: 10});
    for (let i = 0; i < 10; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 50;
        addFoodItem({pos: {x: pos.x + Math.cos(angle) * dist, y: pos.y + Math.sin(angle) * dist}, energy: 10});
    }
}

function consumeFood() {
    const cells = getCells();
    const food = getFoodItems();
    for (let i = food.length - 1; i >= 0; i--) {
        const f = food[i];
        cells.forEach(cell => {
            const dist = Math.hypot(cell.pos.x - f.pos.x, cell.pos.y - f.pos.y);
            if (dist < cell.genome.GRÖ * 5) {
                cell.energy += f.energy;
                removeFoodItem(i);
                emit('food:consumed', {cellId: cell.id});
            }
        });
    }
}

export function setSpawnRate(perSec) {
    spawnRate = perSec;
}