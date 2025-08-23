// renderer.js — Minimalzeichner (sichtbar & robust)
let ctx=null, perf=false;

export function setPerfMode(on){ perf=!!on; }
function ensureCtx(){
  if (ctx) return ctx;
  const c=document.getElementById('scene');
  ctx = c.getContext('2d', { alpha:false });
  return ctx;
}

export function draw(state){
  const g=ensureCtx(); if(!g) return;
  const c=g.canvas, W=c.width, H=c.height;

  // Clear
  g.fillStyle='#0f1720'; g.fillRect(0,0,W,H);

  // Optional: dezentes Grid
  if (!perf){
    g.strokeStyle='rgba(80,110,140,.15)'; g.lineWidth=1;
    for(let x=0;x<W;x+=80){ g.beginPath(); g.moveTo(x,0); g.lineTo(x,H); g.stroke(); }
    for(let y=0;y<H;y+=80){ g.beginPath(); g.moveTo(0,y); g.lineTo(W,y); g.stroke(); }
  }

  // Food: fallback auf globale Liste, falls state.food leer ist
  const foods = (state && state.food && state.food.length) ? state.food
               : (Array.isArray(window.__FOODS) ? window.__FOODS : []);
  g.fillStyle='#44d07a';
  for (let i=0;i<foods.length;i++){
    const f=foods[i]; const x=f.x|0, y=f.y|0;
    g.fillRect(x-2, y-2, 4, 4);
  }

  // Cells (M blau, F pink)
  const cells = state?.cells || [];
  for (let i=0;i<cells.length;i++){
    const c0=cells[i]; const x=c0.pos?.x||0, y=c0.pos?.y||0;
    const r = Math.max(3, Math.min(10, (c0.genome?.['GRÖ']||5)));
    g.beginPath(); g.arc(x, y, r, 0, Math.PI*2);
    g.fillStyle = (c0.sex==='M') ? '#4aa3ff' : '#ff7bc1';
    g.fill();
    if (!perf){
      g.strokeStyle='rgba(255,255,255,.15)'; g.lineWidth=1; g.stroke();
    }
  }
}