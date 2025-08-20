let mode = "off"; // "off" | "heuristic" | "model"

/** Set mode */
export function setMode(m){ mode=m; }
/** Get mode */
export function getMode(){ return mode; }

/** Score a cell (higher is better). If model==on, we use a placeholder linear model */
export function scoreCell(cell){
  const g = cell.genome;
  if(mode==="off") return 0;

  // Heuristik: niedriger MET + gute EFF + mittlere SCH + solide TEM -> besser
  if(mode==="heuristic"){
    const s =
      1.0*(g.EFF) +
      0.6*(g.TEM) +
      0.5*(10 - Math.abs(g.SCH - 6)) +  // sweet spot nahe 6
      0.8*(10 - g.MET) +                 // niedriger MET bevorzugt
      0.3*(g.GRÖ);
    // konditionell: Energie & Alter
    return s + Math.min(cell.energy/20, 5) - (cell.age/120);
  }

  // "model": Dummy-Ersatz ohne externe Files
  const s =
    0.9*g.EFF + 0.7*g.TEM + 0.4*g.GRÖ + 0.5*(10-g.MET) + 0.3*g.SCH
    + 0.02*cell.energy - 0.01*cell.age;
  return s;
}

export function sortCells(cells){
  return [...cells].sort((a,b)=>scoreCell(b)-scoreCell(a));
}