import { getEnvState } from "./environment.js";
import { getCells, getFoodItems, worldSize, __radiusForDebug } from "./entities.js";
import { CONFIG } from "./config.js";

let canvas, ctx;
let perf = false;

export function setPerfMode(on){ perf = !!on; }

export function draw(){
  if(!canvas){
    canvas = document.getElementById("world");
    ctx = canvas.getContext("2d");
  }
  const {width, height} = worldSize();

  // clear
  if(perf){
    ctx.fillStyle = "#10161c";
    ctx.fillRect(0,0,canvas.width, canvas.height);
  }else{
    ctx.clearRect(0,0,canvas.width, canvas.height);
  }

  // grid faint already in CSS background; we add overlays here
  drawEnvironmentOverlay(ctx, width, height);

  // food
  const foods = getFoodItems();
  ctx.save();
  ctx.strokeStyle = CONFIG.colors.food;
  ctx.fillStyle = CONFIG.colors.food;
  for(const f of foods){
    // small cross/square
    if(perf){
      ctx.fillRect(f.x-2, f.y-2, 4, 4);
    }else{
      ctx.globalAlpha = Math.max(0.2, Math.min(1, f.amount/CONFIG.food.itemEnergy));
      ctx.beginPath();
      ctx.rect(f.x-3, f.y-3, 6, 6);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();

  // cells
  const cells = getCells();
  ctx.save();
  for(const c of cells){
    const r = __radiusForDebug(c);
    ctx.beginPath();
    ctx.arc(c.pos.x, c.pos.y, Math.max(3, r), 0, Math.PI*2);
    ctx.fillStyle = c.color;
    ctx.fill();
    if(!perf){
      // energy ring
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      const frac = Math.max(0, Math.min(1, c.energy/(CONFIG.cell.energyMax*(1+0.08*(c.genome.GRÖ-5)))));
      ctx.beginPath();
      ctx.arc(c.pos.x, c.pos.y, r+3, -Math.PI/2, -Math.PI/2 + frac*2*Math.PI);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawEnvironmentOverlay(ctx, w, h){
  const env = getEnvState();

  if(env.nano.enabled){
    ctx.fillStyle = CONFIG.colors.nano;
    ctx.fillRect(0,0,w,h);
  }

  if(env.acid.enabled){
    const r=env.acid.range;
    // top/bottom bands
    ctx.fillStyle = CONFIG.colors.acid;
    ctx.fillRect(0,0,w,r);
    ctx.fillRect(0,h-r,w,r);
    ctx.fillRect(0,0,r,h);
    ctx.fillRect(w-r,0,r,h);
  }

  if(env.fence.enabled){
    ctx.fillStyle = CONFIG.colors.fence;
    const r=env.fence.range;
    ctx.fillRect(0,0,w,3);
    ctx.fillRect(0,h-3,w,3);
    ctx.fillRect(0,0,3,h);
    ctx.fillRect(w-3,0,3,h);
    // subtle pulse dots
    if(!perf){
      ctx.globalAlpha=0.7;
      ctx.strokeStyle="rgba(180,210,255,0.35)";
      ctx.setLineDash([6,6]);
      ctx.strokeRect(6,6,w-12,h-12);
      ctx.setLineDash([]);
      ctx.globalAlpha=1;
    }
  }

  if(env.barb.enabled){
    const r=env.barb.range, step=18;
    ctx.strokeStyle = CONFIG.colors.barb;
    ctx.lineWidth = 1;
    for(let x=0;x<w;x+=step){
      ctx.beginPath(); ctx.moveTo(x, r); ctx.lineTo(x+step/2, 0); ctx.lineTo(x+step, r); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, h-r); ctx.lineTo(x+step/2, h); ctx.lineTo(x+step, h-r); ctx.stroke();
    }
    for(let y=0;y<h;y+=step){
      ctx.beginPath(); ctx.moveTo(r, y); ctx.lineTo(0, y+step/2); ctx.lineTo(r, y+step); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w-r, y); ctx.lineTo(w, y+step/2); ctx.lineTo(w-r, y+step); ctx.stroke();
    }
  }
}