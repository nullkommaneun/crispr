// legend.js – Farben pro Stamm + Reset + reservierte Food-Farbe

const colorCache = new Map();

// Reservierte Food-Farbzone (Hue in Grad)
const FOOD_HUE = 50;          // Amber/Matrix-Gelb
const FOOD_HUE_RANGE = 24;    // ± Grad um FOOD_HUE werden übersprungen

function hsl(h, s, l, a = 1){ return `hsla(${h} ${s}% ${l}% / ${a})`; }

/**
 * Liefert eine gut unterscheidbare Stammsfarbe (Golden-Angle),
 * überspringt dabei die reservierte Food-Hue-Zone.
 */
export function getStammColor(id){
  if (colorCache.has(id)) return colorCache.get(id);

  // Golden-Angle-Hue
  let hue = (id * 137.508) % 360;

  // Hue in den Bereich [0..360)
  hue = (hue + 360) % 360;

  // Reservierte Food-Zone um FOOD_HUE vermeiden
  const inReserved = (h)=> {
    const d = ((h - FOOD_HUE + 540) % 360) - 180; // [-180..180] Abstand
    return Math.abs(d) <= FOOD_HUE_RANGE;
  };
  while (inReserved(hue)) hue = (hue + FOOD_HUE_RANGE * 2) % 360;

  const col = hsl(Math.round(hue), 70, 58, 1);
  colorCache.set(id, col);
  return col;
}

/** Stammlisten usw. zurücksetzen */
export function resetLegend(){ colorCache.clear(); }

/** Food-Farbe (reserviert) – falls du sie woanders brauchst */
export function getFoodColor(){
  return hsl(FOOD_HUE, 100, 60, 0.95); // Amber/Matrix-Gelb
}