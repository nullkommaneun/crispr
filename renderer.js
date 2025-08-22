// renderer.js — Canvas-Rendering mit einfachem Culling (nur Sichtbereich + Puffer zeichnen)

import { getCells, getFoodItems, worldSize } from "./entities.js";
import { CONFIG } from "./config.js";

let perfMode=false;
export function setPerfMode(on){ perfMode=!!on; }

export function draw(){
  const canvas = document.getElementById("world");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const { width:W, height:H } = worldSize();

  // Hintergrund (dezente Grid/Glow – billig)
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if (!perfMode){
    ctx.fillStyle = "rgba(255,255,255,0.02)";
    for(let x=0; x<canvas.width; x+=30){ ctx.fillRect(x,0,1,canvas.height); }
    for(let y=0; y<canvas.height; y+=30){ ctx.fillRect(0,y,canvas.width,1); }
  }

  // Sichtbereich (Viewport = Canvas), kleiner Puffer
  const pad = 24;

  // FOOD (kleine Quadrate/Kreuze, Matrix-Grün)
  {
    const food = getFoodItems();
    ctx.save();
    ctx.translate(0,0);
    ctx.strokeStyle = "#2ee56a";
    ctx.fillStyle   = "#2ee56a";
    for(const f of food){
      if (f.x < -pad || f.x > W+pad || f.y < -pad || f.y > H+pad) continue; // culling
      if (perfMode){
        ctx.fillRect(f.x-1, f.y-1, 2, 2);
      }else{
        ctx.beginPath();
        ctx.moveTo(f.x-2, f.y); ctx.lineTo(f.x+2, f.y);
        ctx.moveTo(f.x, f.y-2); ctx.lineTo(f.x, f.y+2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // CELLS (runde Marker, Geschlechtsfarbe)
  {
    const cells = getCells();
    ctx.save();
    for(const c of cells){
      const r = CONFIG.cell.radius*(0.7+0.1*(c.genome.GRÖ));
      if (c.pos.x < -pad-r || c.pos.x > W+pad+r || c.pos.y < -pad-r || c.pos.y > H+pad+r) continue; // culling

      ctx.beginPath();
      ctx.fillStyle = c.color || "#27c7ff";
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 1;
      ctx.arc(c.pos.x, c.pos.y, r, 0, Math.PI*2);
      ctx.fill();
      if (!perfMode) ctx.stroke();

      if (!perfMode){
        // dezente Mini-Info: Energie als kleiner Bogen
        const eFrac = Math.max(0, Math.min(1, c.energy / (CONFIG.cell.energyMax*(1+0.08*(c.genome.GRÖ-5)))));
        ctx.beginPath();
        ctx.strokeStyle="rgba(255,255,255,0.35)";
        ctx.lineWidth=1;
        ctx.arc(c.pos.x, c.pos.y, r+1.5, -Math.PI/2, -Math.PI/2 + eFrac*2*Math.PI);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}