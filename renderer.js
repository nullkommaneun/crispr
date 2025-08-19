// renderer.js – sauberes Rendering ohne Schlieren + dezentes Grid

import { getStammColor } from './legend.js';

export class Renderer {
  constructor(canvas){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // DPR kappen (Mobile spart viel GPU)
    this.dprCap = 2;
    this.dpr = Math.min(this.dprCap, window.devicePixelRatio || 1);

    // Darstellungsoptionen
    this.bg = '#0a1015';   // Labor-Hintergrund
    this.showGlow = false; // Glow aus, um Schmieren zu vermeiden

    // Offscreen-Grid
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
      // Zeichnen in CSS-Pixeln
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.gridNeedsRedraw = true;
    }
  }

  setHighlight(id){ this.highlightStammId = id; }

  // ---------- Grid als Offscreen-Layer ----------
  drawGridLayer(){
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width  * this.dpr));
    const h = Math.max(1, Math.round(rect.height * this.dpr));

    if (this.gridLayer.width !== w || this.gridLayer.height !== h){
      this.gridLayer.width = w; this.gridLayer.height = h;
    }
    const g = this.gridLayer.getContext('2d');
    g.setTransform(1,0,0,1,0,0); // Gerätepixel
    g.clearRect(0,0,w,h);

    // Dezentes, pixelgenaues Grid
    g.strokeStyle = 'rgba(255,255,255,0.06)';
    g.lineWidth = 1;

    const step = Math.round(24 * this.dpr);
    // Vertikale Linien (0.5-Offset → crisp)
    for(let x=0; x<=w; x+=step){
      g.beginPath();
      g.moveTo(x + 0.5, 0);
      g.lineTo(x + 0.5, h);
      g.stroke();
    }
    // Horizontale Linien
    for(let y=0; y<=h; y+=step){
      g.beginPath();
      g.moveTo(0, y + 0.5);
      g.lineTo(w, y + 0.5);
      g.stroke();
    }
    this.gridNeedsRedraw = false;
  }

  // ---------- Primitives ----------
  fillBackground(){
    const { ctx } = this;
    const rect = this.canvas.getBoundingClientRect();
    ctx.save();
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, rect.width, rect.height);  // volle Fläche -> keine Schlieren
    ctx.restore();
  }

  drawFoods(foods){
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = 'rgba(124,247,166,0.9)';
    for(const f of foods){
      ctx.fillRect(f.x - 2, f.y - 2, 4, 4);
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

      // Optionaler Glow nur im Highlight-Fall
      if(this.showGlow && !faded){
        ctx.fillStyle = 'rgba(124,247,166,0.12)';
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.radius + 6, 0, Math.PI*2);
        ctx.fill();
      }

      ctx.fillStyle = getStammColor(c.stammId);
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.radius, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }

  renderFrame({ cells, foods }){
    // Größe prüfen + Grid ggf. neu rendern
    this.handleResize();
    if(this.gridNeedsRedraw) this.drawGridLayer();

    // 1) Hintergrund vollflächig
    this.fillBackground();

    // 2) Grid-Layer zeichnen (in CSS-Pixeln)
    const rect = this.canvas.getBoundingClientRect();
    // drawImage erwartet CSS-Pixel (weil setTransform auf dpr steht)
    this.ctx.drawImage(this.gridLayer, 0, 0, rect.width, rect.height);

    // 3) Inhalte
    this.drawFoods(foods);
    this.drawCells(cells);
  }
}