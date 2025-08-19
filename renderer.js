// renderer.js – Canvas-Rendering (Grid → Nahrung → Zellen), kein Schlieren.

import { getStammColor } from './legend.js';

export class Renderer{
  constructor(canvas){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.highlightStammId = null;
    this._setupHiDPI();
  }
  _setupHiDPI(){
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const { width, height } = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
    this.ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  setHighlight(stammId){ this.highlightStammId = stammId; }
  _clear(){
    const { ctx } = this;
    const { width, height } = this.canvas.getBoundingClientRect();
    ctx.clearRect(0,0,width,height);
  }
  _drawGrid(){
    const { ctx } = this;
    const { width, height } = this.canvas.getBoundingClientRect();
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    const step = 22;
    for(let x=0;x<width;x+=step){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,height); ctx.stroke(); }
    for(let y=0;y<height;y+=step){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(width,y); ctx.stroke(); }
    ctx.restore();
  }
  _drawFoods(foods){
    const { ctx } = this; ctx.save();
    for(const f of foods){
      ctx.fillStyle = 'rgba(124,247,166,0.9)';
      ctx.fillRect(f.x-2, f.y-2, 4, 4);
    }
    ctx.restore();
  }
  _drawCells(cells){
    const { ctx } = this;
    ctx.save();
    for(const c of cells){
      if(c.dead) continue;
      const base = getStammColor(c.stammId);
      const faded = (this.highlightStammId!==null && this.highlightStammId!==c.stammId);
      const alpha = faded ? 0.25 : 1.0;

      // Glow für Highlight
      if(!faded){
        ctx.beginPath();
        ctx.fillStyle = `rgba(124,247,166,0.12)`;
        ctx.arc(c.x, c.y, c.radius+6, 0, Math.PI*2);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.fillStyle = base;
      ctx.globalAlpha = alpha;
      ctx.arc(c.x, c.y, c.radius, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  renderFrame({cells, foods}){
    this._clear();
    this._drawGrid();
    this._drawFoods(foods);
    this._drawCells(cells);
  }
}