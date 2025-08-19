// renderer.js – sauberes Rendering ohne Schlieren + dezentes Grid (Matrix-grünes Food)

import { getStammColor } from './legend.js';

export class Renderer {
  constructor(canvas){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dprCap = 2;
    this.dpr = Math.min(this.dprCap, window.devicePixelRatio || 1);
    this.bg = '#0a1015';
    this.showGlow = false; // aus
    this.gridLayer = document.createElement('canvas');
    this.gridNeedsRedraw = true;
    this.highlightStammId = null;
    this.handleResize();
  }

  handleResize(){
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width  * this.dpr));
    const h = Math.max(1, Math.round(rect.height * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h){
      this.canvas.width = w; this.canvas.height = h;
      this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
      this.gridNeedsRedraw = true;
    }
  }
  setHighlight(id){ this.highlightStammId = id; }

  drawGridLayer(){
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width  * this.dpr));
    const h = Math.max(1, Math.round(rect.height * this.dpr));
    if (this.gridLayer.width !== w || this.gridLayer.height !== h){
      this.gridLayer.width = w; this.gridLayer.height = h;
    }
    const g = this.gridLayer.getContext('2d');
    g.setTransform(1,0,0,1,0,0);
    g.clearRect(0,0,w,h);
    g.strokeStyle = 'rgba(255,255,255,0.06)';
    g.lineWidth = 1;
    const step = Math.round(24 * this.dpr);
    for(let x=0;x<=w;x+=step){ g.beginPath(); g.moveTo(x+0.5,0); g.lineTo(x+0.5,h); g.stroke(); }
    for(let y=0;y<=h;y+=step){ g.beginPath(); g.moveTo(0,y+0.5); g.lineTo(w,y+0.5); g.stroke(); }
    this.gridNeedsRedraw = false;
  }

  fillBackground(){
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.save();
    this.ctx.fillStyle = this.bg;
    this.ctx.fillRect(0,0,rect.width,rect.height);
    this.ctx.restore();
  }

  drawFoods(foods){
    const { ctx } = this;
    ctx.save();
    // Matrix-Grün (#00FF41)
    ctx.fillStyle = 'rgba(0,255,65,0.95)';
    for(const f of foods){
      ctx.fillRect(f.x-2, f.y-2, 4, 4);
    }
    ctx.restore();
  }

  drawCells(cells){
    const { ctx } = this;
    ctx.save();
    for(const c of cells){
      if(c.dead) continue;
      const faded = (this.highlightStammId!==null && this.highlightStammId!==c.stammId);
      ctx.globalAlpha = faded ? 0.35 : 1.0;

      if(this.showGlow && !faded){
        ctx.fillStyle = 'rgba(124,247,166,0.12)';
        ctx.beginPath(); ctx.arc(c.x, c.y, c.radius+6, 0, Math.PI*2); ctx.fill();
      }

      ctx.fillStyle = getStammColor(c.stammId);
      ctx.beginPath(); ctx.arc(c.x, c.y, c.radius, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  renderFrame({cells, foods}){
    this.handleResize();
    if(this.gridNeedsRedraw) this.drawGridLayer();

    this.fillBackground();
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.drawImage(this.gridLayer, 0, 0, rect.width, rect.height);

    this.drawFoods(foods);
    this.drawCells(cells);
  }
}