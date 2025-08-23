// renderer.js — DPI-scharfer Minimalzeichner (sichtbar & robust)

let ctx = null;
let perf = false;

// interner Resize-Cache
let lastW = 0, lastH = 0, lastDPR = 0;

export function setPerfMode(on){ perf = !!on; }

function getCanvas(){
  return document.getElementById("scene");
}

function ensureCtx(){
  if (ctx) return ctx;
  const c = getCanvas();
  if (!c) return null;
  ctx = c.getContext("2d", { alpha:false, desynchronized:true });
  // Beim ersten Mal gleich richtig größenkorrigieren
  resizeIfNeeded();
  return ctx;
}

// Passt die Canvas-Pixelgröße an die CSS-Größe * devicePixelRatio an
function resizeIfNeeded(){
  const c = getCanvas();
  if (!c) return;

  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  const rect = c.getBoundingClientRect();
  const cssW = Math.max(2, Math.round(rect.width));
  const cssH = Math.max(2, Math.round(rect.height));
  const pxW  = cssW * dpr;
  const pxH  = cssH * dpr;

  if (c.width !== pxW || c.height !== pxH || lastDPR !== dpr){
    c.width  = pxW;
    c.height = pxH;
    // Mapping: 1 Leinwand-Einheit == 1 CSS-Pixel
    const g = ctx || c.getContext("2d", { alpha:false, desynchronized:true });
    if (g) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx = g;
    }
    lastW = cssW; lastH = cssH; lastDPR = dpr;
  }
}

// Responsive: bei Resize/Rotation einmal neu justieren
try{
  window.addEventListener("resize", ()=>{ if (ctx) resizeIfNeeded(); }, { passive:true });
}catch{}

export function draw(state){
  const g = ensureCtx(); if (!g) return;
  resizeIfNeeded();

  const c = g.canvas;
  const W = (lastW || c.width);
  const H = (lastH || c.height);

  // Hintergrund
  g.fillStyle = "#0f1720";
  g.fillRect(0, 0, W, H);

  // Optional: dezentes Grid (nur wenn nicht im Perf-Mode)
  if (!perf){
    g.strokeStyle = "rgba(80,110,140,.15)";
    g.lineWidth = 1;
    for(let x = 0; x < W; x += 80){ g.beginPath(); g.moveTo(x,0); g.lineTo(x,H); g.stroke(); }
    for(let y = 0; y < H; y += 80){ g.beginPath(); g.moveTo(0,y); g.lineTo(W,y); g.stroke(); }
  }

  // Food (grün, kleine Quadrate)
  const foods = state?.food || [];
  if (foods.length){
    g.fillStyle = "#44d07a";
    for (let i = 0; i < foods.length; i++){
      const f = foods[i]; const x = (f.x|0), y = (f.y|0);
      // winzig, aber sichtbar
      g.fillRect(x - 2, y - 2, 4, 4);
    }
  }

  // Zellen (M blau, F pink)
  const cells = state?.cells || [];
  for (let i = 0; i < cells.length; i++){
    const c0 = cells[i];
    const x  = c0.pos?.x || 0;
    const y  = c0.pos?.y || 0;
    // Radius aus Gen "GRÖ" ableiten (robust begrenzt)
    const r  = Math.max(3, Math.min(10, +(c0.genome?.["GRÖ"] ?? 5)));

    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = (c0.sex === "M") ? "#4aa3ff" : "#ff7bc1";
    g.fill();

    if (!perf){
      g.strokeStyle = "rgba(255,255,255,.15)";
      g.lineWidth = 1;
      g.stroke();
    }
  }
}