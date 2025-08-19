// legend.js
// Farbverwaltung für Stämme + Zeichnung der Legende im Canvas.

const colorCache = new Map();

function colorForStamm(stammId){
  if(colorCache.has(stammId)) return colorCache.get(stammId);
  // Reproduzierbare HSL-Farbe aus ID
  const hue = (stammId * 57) % 360;
  const sat = 70;
  const light = 55;
  const c = `hsl(${hue} ${sat}% ${light}%)`;
  colorCache.set(stammId, c);
  return c;
}

export function resetLegend(){
  colorCache.clear();
}

export function getStammColor(stammId){ return colorForStamm(stammId); }

/** Zeichnet die Legende unten links im Canvas */
export function drawLegend(ctx, counts, highlightStammId){
  const entries = Object.entries(counts).sort((a,b)=>Number(a[0])-Number(b[0]));
  const pad = 8;
  const box = 14;
  const lineH = 18;
  const w = 160;
  const h = entries.length*lineH + pad*2 + 18;

  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(8, ctx.canvas.height - h - 8, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.strokeRect(8.5, ctx.canvas.height - h - 7.5, w-1, h-1);

  ctx.fillStyle = 'white';
  ctx.font = '12px system-ui';
  ctx.fillText('Stämme', 16, ctx.canvas.height - h + 16);

  let y = ctx.canvas.height - h + 34;
  for(const [stammId, count] of entries){
    const color = colorForStamm(Number(stammId));
    ctx.fillStyle = color;
    ctx.fillRect(16, y-12, box, box);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(16.5, y-11.5, box-1, box-1);

    ctx.fillStyle = 'white';
    const label = `Stamm ${stammId}: ${count}`;
    if(highlightStammId !== null && Number(stammId)!==highlightStammId){
      ctx.globalAlpha = 0.5;
    } else {
      ctx.globalAlpha = 1.0;
    }
    ctx.fillText(label, 16 + box + 8, y);
    ctx.globalAlpha = 1.0;
    y += lineH;
  }
  ctx.restore();
}
