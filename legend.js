// legend.js – Farben pro Stamm + Reset

const colorCache = new Map();

export function resetLegend(){ colorCache.clear(); }

function hsl(h,s,l,a=1){ return `hsla(${h} ${s}% ${l}% / ${a})`; }

export function getStammColor(id){
  if(colorCache.has(id)) return colorCache.get(id);
  // deterministische, gut unterscheidbare Palette (Golden Angle)
  const hue = (id * 137.508) % 360;
  const col = hsl(Math.round(hue), 70, 58, 1);
  colorCache.set(id, col);
  return col;
}