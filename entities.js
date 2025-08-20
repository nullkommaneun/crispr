import { emit } from './event.js';

let cells = [];
let foodItems = [];
let stamme = new Map();
let worldWidth = 800;
let worldHeight = 600;
let nextId = 0;
let nextStammId = 0;

export function createAdamAndEve() {
    cells = [];
    foodItems = [];
    stamme.clear();
    nextStammId = 0;
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

export function addFoodItem(item) {
    foodItems.push(item);
}

export function removeFoodItem(index) {
    foodItems.splice(index, 1);
}

export function step(dt, env) {
    cells.forEach(cell => {
        // Basic physics and behavior
        const speed = cell.genome.TEM * 10;
        // Simple random movement for demo
        cell.vel.x += (Math.random() - 0.5) * 2;
        cell.vel.y += (Math.random() - 0.5) * 2;
        // Clamp velocity
        const velMag = Math.hypot(cell.vel.x, cell.vel.y);
        if (velMag > speed) {
            cell.vel.x = (cell.vel.x / velMag) * speed;
            cell.vel.y = (cell.vel.y / velMag) * speed;
        }
        cell.pos.x += cell.vel.x * dt;
        cell.pos.y += cell.vel.y * dt;
        // Wall bounce
        if (cell.pos.x < 0 || cell.pos.x > worldWidth) cell.vel.x *= -1;
        if (cell.pos.y < 0 || cell.pos.y > worldHeight) cell.vel.y *= -1;
        cell.age += dt;
        cell.energy -= cell.genome.MET * dt;
        if (cell.energy <= 0) killCell(cell.id);
        if (cell.cooldown > 0) cell.cooldown -= dt;
    });
    applyEnvironment(env);
}

export function applyEnvironment(env) {
    const dt = 1; // Assuming dt passed or fixed
    cells.forEach(cell => {
        if (env.acid.enabled && nearBorder(cell.pos, env.acid.range)) {
            cell.energy -= env.acid.dps * dt / cell.genome.SCH;
        }
        if (env.barb.enabled && nearBorder(cell.pos, env.barb.range)) {
            cell.energy -= env.barb.dps * dt / cell.genome.SCH;
        }
        if (env.fence.enabled && nearBorder(cell.pos, env.fence.range) && Math.random() < env.fence.period * dt) {
            cell.vel.x += (Math.random() - 0.5) * env.fence.impulse;
            cell.vel.y += (Math.random() - 0.5) * env.fence.impulse;
        }
        if (env.nano.enabled) {
            cell.energy -= env.nano.dps * dt / cell.genome.SCH;
        }
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

export function getStammColor(stammId) {
    const stamm = stamme.get(stammId);
    return stamm ? stamm.color : '#ffffff'; // Fallback white
}

function randomColor() {
    return `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`;
}