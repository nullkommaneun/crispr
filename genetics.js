// genetics.js – Gene, Rekombination, Mutationen, Heuristik-Score

export const TRAITS = ['TEM','GRO','EFF','SCH','MET']; // + MET (Stoffwechsel)

const clamp1to9 = v => Math.max(1, Math.min(9, Math.round(v)));

export function createGenome(seed = {}){
  const g = {};
  for (const t of TRAITS) g[t] = clamp1to9(seed[t] ?? 5);
  return g;
}

/**
 * Rekombination: Mittelwert + Variation, Mutationschance; Inzucht treibt zu Extremen.
 */
export function recombineGenes(mom, dad, { mutationRate = 0.1, inbreeding = 0 } = {}){
  const child = {};
  for (const t of TRAITS){
    const avg = (mom[t] + dad[t]) / 2;
    let val = avg + (Math.random()*2 - 1);     // kleine Variation
    if (Math.random() < mutationRate){
      val += (Math.random()<0.5 ? -1 : 1) * (1 + Math.random()*1.2);
    }
    if (inbreeding >= 0.25){
      val += (Math.random()<0.5 ? -1 : 1) * (inbreeding*2);
    }
    child[t] = clamp1to9(val);
  }
  return child;
}

/**
 * Survival-Score (0..100) – heuristisch:
 * TEM+, EFF+++, SCH+, GRO± (leicht), MET optimum bei 5 (Abweichung −).
 */
export function survivalScore(g){
  const n = x => (x-5)/4;         // -1..1
  const metPenalty = -Math.abs(n(g.MET)); // Abweichung von 5 kostet
  let s = 50
    + 50*0.30*n(g.TEM)      // Tempo
    + 60*0.35*n(g.EFF)      // Effizienz am stärksten
    + 45*0.15*n(g.SCH)      // Schutz
    + 25*0.10*n(g.GRO)      // Größe leicht
    + 35*0.10*(metPenalty); // MET-Optimum
  return Math.max(0, Math.min(100, Math.round(s)));
}