// renderer.js
// Zeichnet: Grid → Nahrung → Zellen. Kein Schlieren. Legend im Canvas.

import { drawLegend } from './legend.js';
import { getStammCounts, cellColor } from './entities.js';

export class Renderer {
  constructor(canvas){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.pixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    this.highlightStammId = null;
  }

  setHighlight(stammIdOrNull){
    this.highlightStammId = stammIdOrNull;
  }

  resize(){
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    const pr = this.pixelRatio;
    const w = Math.floor(cssW * pr);
    const h = Math.floor(cssH * pr);
    if(this.canvas.width !== w || this.canvas.height !== h){
      this.canvas.width = w; this.canvas.height = h;
    }
  }

  clear(){
    const {ctx, canvas} = this;
    ctx.clearRect(0,0,canvas.width,canvas.height);
  }

  drawGrid(){
    const {ctx, canvas} = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    const step = 40 * this.pixelRatio;
    for(let x=0; x<canvas.width; x+=step){
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke();
    }
    for(let y=0; y<canvas.height; y+=step){
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke();
    }
    ctx.restore();
  }

  drawFoods(foods){
    const {ctx} = this;
    ctx.save();
    ctx.fillStyle = 'rgba(100, 255, 150, 0.9)';
    for(const f of foods){
      const x = Math.round(f.x * this.pixelRatio);
      const y = Math.round(f.y * this.pixelRatio);
      ctx.fillRect(x-2, y-2, 4, 4);
    }
    ctx.restore();
  }

  drawCells(cells){
    const {ctx} = this;
    ctx.save();
    for(const c of cells){
      if(c.dead) continue;
      const color = cellColor(c, this.highlightStammId);
      const x = Math.round(c.x * this.pixelRatio);
      const y = Math.round(c.y * this.pixelRatio);
      const r = Math.max(2, c.radius) * this.pixelRatio;

      ctx.globalAlpha = color.alpha;
      ctx.fillStyle = color.fill;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI*2);
      ctx.fill();

      // kleiner Innenpunkt für Geschlecht
      ctx.globalAlpha = color.alpha * 0.9;
      ctx.fillStyle = c.sex === 'm' ? 'rgba(120,180,255,0.9)' : 'rgba(255,160,200,0.9)';
      ctx.beginPath(); ctx.arc(x, y, Math.max(1, r*0.35), 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  drawLegendOverlay(){
    const counts = getStammCounts();
    drawLegend(this.ctx, counts, this.highlightStammId);
  }

  renderFrame({cells, foods}){
    this.resize();
    this.clear();
    this.drawGrid();
    this.drawFoods(foods);
    this.drawCells(cells);
    this.drawLegendOverlay();
  }
}