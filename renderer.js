import { getEnvState } from './environment.js';

let canvas, ctx;
let perfMode = false;

export function draw(state, env) {
    if (!canvas) {
        canvas = document.getElementById('canvas');
        ctx = canvas.getContext('2d');
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Draw grid
    // Draw env overlays: acid glow, barbs, fence impulses, nano fog
    if (env.acid.enabled) {
        // Draw glow at borders
    }
    // Draw food: green hotspots/clusters
    state.food.forEach(f => {
        ctx.fillStyle = '#0f0';
        ctx.fillRect(f.pos.x, f.pos.y, 5, 5);
    });
    // Draw cells: colored circles
    state.cells.forEach(c => {
        const color = stamme.get(c.stammId).color;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(c.pos.x, c.pos.y, c.genome.GRÖ * 5, 0, Math.PI*2);
        ctx.fill();
    });
    if (perfMode) {
        // Simplify: no shadows, etc.
    }
}

export function setPerfMode(on) {
    perfMode = on;
}