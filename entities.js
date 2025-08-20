import { emit } from './event.js';
import { random } from './utils.js'; // Assume a utils.js for helpers

let cells = [];
let foodItems = [];
let stamme = new Map();
let worldWidth = 800;
let worldHeight = 600;
let nextId = 0;
let nextStammId = 0;

export function createAdamAndEve() {
    cells = [];
    stamme.clear();
    const adam = createCell({ pos: {x: worldWidth/4, y: worldHeight/2}, sex: 'm', stammId: nextStammId++, genome: defaultGenome() });
    const eve = createCell({ pos: {x: 3*worldWidth/4, y: worldHeight/2}, sex: 'f', stammId: adam.stammId, genome: defaultGenome() });
}

function defaultGenome() {
    return { TEM: 1, GRÖ: 1, EFF: 1, SCH: 1, MET: 1 };
}

export function createCell(opts) {
    const cell = {
        id: nextId++,
        name: `Cell${nextId}`,
        sex: opts.sex,
        stammId: opts.stammId,
        pos: opts.pos,
        vel: {x: 0, y: 0},
        energy: 100,
        age: 0,
        cooldown: 0,
        genome: opts.genome
    };
    cells.push(cell);
    if (!stamme.has(cell.stammId)) {
        stamme.set(cell.stammId, { color: randomColor(), stats: {} });
    }
    emit('cells:born', cell);
    return cell;
}

export function killCell(id) {
    cells = cells.filter(c => c.id !== id);
    emit('cells:died', id);
}

export function getCells() {
    return cells;
}

export function getFoodItems() {
    return foodItems;
}

export function step(dt, env) {
    cells.forEach(cell => {
        // Physics and behavior based on genome
        const speed = cell.genome.TEM * 10; // Example
        // Hunger: seek food
        // Social: seek partners
        // Wall repulsion
        // Update pos, vel, energy, age, cooldown
        cell.age += dt;
        cell.energy -= cell.genome.MET * dt; // Metabolic cost
        if (cell.energy <= 0) killCell(cell.id);
    });
    applyEnvironment(env);
}

export function applyEnvironment(env) {
    cells.forEach(cell => {
        // Apply damages from env: acid, barb, fence, nano
        if (env.acid.enabled && nearBorder(cell.pos, env.acid.range)) {
            cell.energy -= env.acid.dps * dt / cell.genome.SCH;
        }
        // Similar for others
    });
}

function nearBorder(pos, range) {
    return pos.x < range || pos.x > worldWidth - range || pos.y < range || pos.y > worldHeight - range;
}

export function setWorldSize(w, h) {
    worldWidth = w;
    worldHeight = h;
}

export function getStammCounts() {
    const counts = {};
    cells.forEach(c => counts[c.stammId] = (counts[c.stammId] || 0) + 1);
    return counts;
}

function randomColor() {
    return `#${Math.floor(Math.random()*16777215).toString(16)}`;
}