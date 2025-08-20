// renderer.js – Canvas-Rendering (Grid → Nahrung → Zellen), kein Schlieren.
// Food: Amber-Diamant (aus legend.getFoodColor). Rand: Gefahren-Overlay aus environment.

import { getStammColor, getFoodColor } from './legend.js';
import { getEnvState } from './environment.js';

export class Renderer{
  constructor(canvas){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dprCap = 2;
    this.dpr = Math.min(this.dprCap, window.devicePixelRatio || 1);
    this.bg  = '#0a1210';
    this.highlightStammId = null;
    this.gridLayer = document.createElement('canvas');
    this.gridNeedsRedraw = true;
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

    g.strokeStyle = 'rgba(255,255,255,0.055)';
    g.lineWidth = 1;
    const step = Math.round(24 * this.dpr);
    for(let x=0; x<=w; x+=step){ g.beginPath(); g.moveTo(x+0.5,0); g.lineTo(x+0.5,h); g.stroke(); }
    for(let y=0; y<=h; y+=step){ g.beginPath(); g.moveTo(0,y+0.5); g.lineTo(w,y+0.5); g.stroke(); }
  }

  fillBackground(){
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.save(); this.ctx.fillStyle = this.bg;
    this.ctx.fillRect(0,0,rect.width,rect.height); this.ctx.restore();
  }

  drawFoods(foods){
    const ctx = this.ctx;
    const FILL = getFoodColor();
    const STROKE = 'rgba(0,0,0,0.35)';
    ctx.save(); ctx.fillStyle = FILL; ctx.strokeStyle = STROKE; ctx.lineWidth = 1;
    const s = 5;
    for(const f of foods){
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(Math.PI/4);
      ctx.beginPath(); ctx.rect(-s/2, -s/2, s, s); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    ctx.restore();
  }

  drawCells(cells){
    const ctx = this.ctx;
    ctx.save();
    for(const c of cells){
      if(c.dead) continue;
      const faded = (this.highlightStammId!==null && this.highlightStammId!==c.stammId);
      ctx.globalAlpha = faded ? 0.35 : 1;
      ctx.fillStyle = getStammColor(c.stammId);
      ctx.beginPath(); ctx.arc(c.x, c.y, c.radius, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  drawHazardOverlay(){
    const ctx = this.ctx;
    const rect = this.canvas.getBoundingClientRect();
    const st = getEnvState();

    // Säure: innerer gelbgrüner Schimmer
    if (st.acid.enabled){
      ctx.save();
      ctx.strokeStyle = 'rgba(255,240,120,0.35)';
      ctx.lineWidth = 6;
      ctx.strokeRect(3,3, rect.width-6, rect.height-6);
      ctx.restore();
    }
    // Stacheldraht: kleine Dreiecke entlang der Kante (sparsam)
    if (st.barbed.enabled){
      ctx.save();
      ctx.fillStyle = 'rgba(200,200,200,0.45)';
      const step = 22; const h=6;
      for(let x=8; x<=rect.width-8; x+=step){ // oben
        ctx.beginPath(); ctx.moveTo(x, 8); ctx.lineTo(x+6, 8+h); ctx.lineTo(x-6, 8+h); ctx.closePath(); ctx.fill();
      }
      for(let x=8; x<=rect.width-8; x+=step){ // unten
        ctx.beginPath(); ctx.moveTo(x, rect.height-8); ctx.lineTo(x+6, rect.height-8-h); ctx.lineTo(x-6, rect.height-8-h); ctx.closePath(); ctx.fill();
      }
      for(let y=8; y<=rect.height-8; y+=step){ // links
        ctx.beginPath(); ctx.moveTo(8, y); ctx.lineTo(8+h, y+6); ctx.lineTo(8+h, y-6); ctx.closePath(); ctx.fill();
      }
      for(let y=8; y<=rect.height-8; y+=step){ // rechts
        ctx.beginPath(); ctx.moveTo(rect.width-8, y); ctx.lineTo(rect.width-8-h, y+6); ctx.lineTo(rect.width-8-h, y-6); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    // Elektro: bläuliche Leuchtkante
    if (st.electric.enabled){
      ctx.save();
      ctx.strokeStyle = 'rgba(120,190,255,0.55)';
      ctx.lineWidth = 3;
      ctx.setLineDash([8,6]);
      ctx.strokeRect(2,2, rect.width-4, rect.height-4);
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  renderFrame({cells, foods}){
    this.handleResize();
    if(this.gridNeedsRedraw){ this.drawGridLayer(); this.gridNeedsRedraw=false; }

    this.fillBackground();

    const rect = this.canvas.getBoundingClientRect();
    this.ctx.drawImage(this.gridLayer, 0, 0, rect.width, rect.height);

    this.drawHazardOverlay();
    this.drawFoods(foods);
    this.drawCells(cells);
  }
}