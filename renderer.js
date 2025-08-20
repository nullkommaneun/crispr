import { getEnvState } from './environment.js';
import { getStammColor } from './entities.js';

let canvas, ctx;
let perfMode = false;

export function draw(state, env) {
    if (!canvas) {
        canvas = document.getElementById('canvas');
        ctx = canvas.getContext('2d');
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Draw env overlays
    if (env.acid.enabled) {
        ctx.fillStyle = 'rgba(255,0,0,0.1)';
        ctx.fillRect(0, 0, env.acid.range, canvas.height);
        ctx.fillRect(canvas.width - env.acid.range, 0, env.acid.range, canvas.height);
        ctx.fillRect(0, 0, canvas.width, env.acid.range);
        ctx.fillRect(0, canvas.height - env.acid.range, canvas.width, env.acid.range);
    }
    // Similar for other env, simplified
    // Draw food
    state.food.forEach(f => {
        ctx.fillStyle = '#0f0';
        ctx.fillRect(f.pos.x - 2.5, f.pos.y - 2.5, 5, 5);
    });
    // Draw cells
    state.cells.forEach(c => {
        const color = getStammColor(c.stammId);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(c.pos.x, c.pos.y, c.genome.GRÖ * 5, 0, Math.PI * 2);
        ctx.fill();
    });
    if (perfMode) {
        // No extra effects
    } else {
        // Add shadows if not perf
        ctx.shadowColor = 'white';
        ctx.shadowBlur = 5;
    }
}

export function setPerfMode(on) {
    perfMode = on;
}