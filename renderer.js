// renderer.js – Canvas-Rendering (Grid → Nahrung → Zellen), kein Schlieren.
// Food ist deutlich unterscheidbar: Amber-Farbe + Diamantform (gedrehter Square).

import { getStammColor, getFoodColor } from './legend.js';

export class Renderer{
  constructor(canvas){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    // Mobile-DPR kappen – spart GPU
    this.dprCap = 2;
    this.dpr = Math.min(this.dprCap, window.devicePixelRatio || 1);

    this.bg = '#0a1210';
    this.highlightStammId = null;

    // Grid als Offscreen-Layer
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
      this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0); // in CSS-Pixel zeichnen
      this.gridNeedsRedraw = true;
    }
  }

  setHighlight(stammId){ this.highlightStammId = stammId; }

  /* ---------- Grid-Layer ---------- */
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

    this.gridNeedsRedraw = false;
  }

  /* ---------- Hintergrund ---------- */
  fillBackground(){
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.save();
    this.ctx.fillStyle = this.bg;
    this.ctx.fillRect(0,0,rect.width,rect.height);
    this.ctx.restore();
  }

  /* ---------- Nahrung (Food) – Diamantform + reservierte Farbe ---------- */
  drawFoods(foods){
    const ctx = this.ctx;
    const FILL = getFoodColor();             // Amber reserviert
    const STROKE = 'rgba(0,0,0,0.35)';

    ctx.save();
    ctx.fillStyle = FILL;
    ctx.strokeStyle = STROKE;
    ctx.lineWidth = 1;

    const s = 5; // Kantenlänge des kleinen Squares (vor Rotation)
    for(const f of foods){
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(Math.PI / 4);           // 45° → Diamant
      ctx.beginPath();
      ctx.rect(-s/2, -s/2, s, s);        // kleiner Square
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  /* ---------- Zellen ---------- */
  drawCells(cells){
    const ctx = this.ctx;
    ctx.save();
    for(const c of cells){
      if(c.dead) continue;

      const faded = (this.highlightStammId!==null && this.highlightStammId!==c.stammId);
      ctx.globalAlpha = faded ? 0.35 : 1;

      ctx.fillStyle = getStammColor(c.stammId);
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.radius, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---------- Frame ---------- */
  renderFrame({cells, foods}){
    this.handleResize();
    if(this.gridNeedsRedraw) this.drawGridLayer();

    this.fillBackground();

    const rect = this.canvas.getBoundingClientRect();
    // Grid-Layer in CSS-Pixeln zeichnen
    this.ctx.drawImage(this.gridLayer, 0, 0, rect.width, rect.height);

    this.drawFoods(foods);
    this.drawCells(cells);
  }
}