import { getCells, addFoodItem, removeFoodItem, getFoodItems, worldWidth, worldHeight } from './entities.js';
import { emit } from './event.js';

let hotspots = [];
let spawnRate = 1;
let nextHotspotId = 0;

export function step(dt) {
    hotspots.forEach(h => {
        const oldPos = {x: h.pos.x, y: h.pos.y};
        h.pos.x += (Math.random() - 0.5) * 2;
        h.pos.y += (Math.random() - 0.5) * 2;
        h.pos.x = Math.max(0, Math.min(h.pos.x, worldWidth));
        h.pos.y = Math.max(0, Math.min(h.pos.y, worldHeight));
        const deltaX = h.pos.x - oldPos.x;
        const deltaY = h.pos.y - oldPos.y;
        h.foods.forEach(f => {
            f.pos.x += deltaX;
            f.pos.y += deltaY;
        });
    });
    if (Math.random() < spawnRate * dt) {
        spawnCluster();
    }
    consumeFood();
}

function spawnCluster() {
    const pos = {x: Math.random() * worldWidth, y: Math.random() * worldHeight};
    const h = {id: nextHotspotId++, pos, radius: 50, density: 10, foods: []};
    hotspots.push(h);
    for (let i = 0; i < 10; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * h.radius;
        const f = {
            pos: {x: pos.x + Math.cos(angle) * dist, y: pos.y + Math.sin(angle) * dist},
            energy: 10,
            hotspot: h
        };
        addFoodItem(f);
        h.foods.push(f);
    }
}

function consumeFood() {
    const cells = getCells();
    const food = getFoodItems();
    for (let i = food.length - 1; i >= 0; i--) {
        const f = food[i];
        for (let j = 0; j < cells.length; j++) {
            const cell = cells[j];
            const dist = Math.hypot(cell.pos.x - f.pos.x, cell.pos.y - f.pos.y);
            if (dist < cell.genome.GRÖ * 5 + 5) {
                cell.energy += f.energy;
                if (f.hotspot) {
                    f.hotspot.foods = f.hotspot.foods.filter(ff => ff !== f);
                }
                removeFoodItem(i);
                emit('food:consumed', {cellId: cell.id});
                break;
            }
        }
    }
}

export function setSpawnRate(perSec) {
    spawnRate = perSec;
}