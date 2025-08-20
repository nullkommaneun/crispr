import { emit } from './event.js';

let cells = [];
let foodItems = [];
let stamme = new Map();
export let worldWidth = 800;
export let worldHeight = 600;
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
        const acc = {x: 0, y: 0};

        // Wall repulsion
        const repDist = 50;
        if (cell.pos.x < repDist) acc.x += (repDist - cell.pos.x) / repDist * 10;
        if (cell.pos.x > worldWidth - repDist) acc.x -= (cell.pos.x - (worldWidth - repDist)) / repDist * 10;
        if (cell.pos.y < repDist) acc.y += (repDist - cell.pos.y) / repDist * 10;
        if (cell.pos.y > worldHeight - repDist) acc.y -= (cell.pos.y - (worldHeight - repDist)) / repDist * 10;

        // Hunger: seek food if low energy
        if (cell.energy < 70) {
            let closestFood = null;
            let minDist = Infinity;
            getFoodItems().forEach(f => {
                const dist = Math.hypot(cell.pos.x - f.pos.x, cell.pos.y - f.pos.y);
                if (dist < minDist) {
                    minDist = dist;
                    closestFood = f;
                }
            });
            if (closestFood && minDist < 200) {
                const dx = closestFood.pos.x - cell.pos.x;
                const dy = closestFood.pos.y - cell.pos.y;
                const mag = Math.hypot(dx, dy) || 1;
                acc.x += (dx / mag) * cell.genome.EFF * 5;
                acc.y += (dy / mag) * cell.genome.EFF * 5;
            }
        }

        // Social: seek compatible partner
        let closestPartner = null;
        let minDist = Infinity;
        getCells().forEach(other => {
            if (other.id === cell.id || other.sex === cell.sex || other.cooldown > 0) return;
            const pref = (other.stammId === cell.stammId) ? 1 : 0.1;
            if (Math.random() < pref) {
                const dist = Math.hypot(cell.pos.x - other.pos.x, cell.pos.y - other.pos.y);
                if (dist < minDist) {
                    minDist = dist;
                    closestPartner = other;
                }
            }
        });
        if (closestPartner && minDist < 150) {
            const dx = closestPartner.pos.x - cell.pos.x;
            const dy = closestPartner.pos.y - cell.pos.y;
            const mag = Math.hypot(dx, dy) || 1;
            acc.x += (dx / mag) * cell.genome.TEM * 3;
            acc.y += (dy / mag) * cell.genome.TEM * 3;
        }

        // Random wander
        acc.x += (Math.random() - 0.5) * 2;
        acc.y += (Math.random() - 0.5) * 2;

        // Update velocity
        cell.vel.x += acc.x * dt;
        cell.vel.y += acc.y * dt;

        // Clamp velocity to max speed
        const maxSpeed = cell.genome.TEM * 10;
        const velMag = Math.hypot(cell.vel.x, cell.vel.y);
        if (velMag > maxSpeed) {
            cell.vel.x = (cell.vel.x / velMag) * maxSpeed;
            cell.vel.y = (cell.vel.y / velMag) * maxSpeed;
        }

        // Update position
        cell.pos.x += cell.vel.x * dt;
        cell.pos.y += cell.vel.y * dt;

        // Bounce if out of bounds
        if (cell.pos.x < 0) { cell.pos.x = 0; cell.vel.x *= -1; }
        if (cell.pos.x > worldWidth) { cell.pos.x = worldWidth; cell.vel.x *= -1; }
        if (cell.pos.y < 0) { cell.pos.y = 0; cell.vel.y *= -1; }
        if (cell.pos.y > worldHeight) { cell.pos.y = worldHeight; cell.vel.y *= -1; }

        // Age and energy
        cell.age += dt;
        cell.energy -= cell.genome.MET * dt + (velMag * 0.01 * dt); // Basal + movement cost
        if (cell.energy <= 0) killCell(cell.id);
        if (cell.cooldown > 0) cell.cooldown -= dt;
    });
    applyEnvironment(env, dt);
}

export function applyEnvironment(env, dt) {
    cells.forEach(cell => {
        if (env.acid.enabled && nearBorder(cell.pos, env.acid.range)) {
            cell.energy -= (env.acid.dps * dt) / cell.genome.SCH;
        }
        if (env.barb.enabled && nearBorder(cell.pos, env.barb.range)) {
            cell.energy -= (env.barb.dps * dt) / cell.genome.SCH;
        }
        if (env.fence.enabled && nearBorder(cell.pos, env.fence.range) && Math.random() < env.fence.period * dt) {
            cell.vel.x += (Math.random() - 0.5) * env.fence.impulse;
            cell.vel.y += (Math.random() - 0.5) * env.fence.impulse;
        }
        if (env.nano.enabled) {
            cell.energy -= (env.nano.dps * dt) / cell.genome.SCH;
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