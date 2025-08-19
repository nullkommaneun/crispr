// genetics.js
// Gene, Rekombination, Mutationen, Inzucht-Malus + Survival-Score (für Editor/Advisor)

export const TRAITS = ['TEM','GRO','EFF','SCH']; // Tempo, Größe, Effizienz, Schutz
const clampGene = v => Math.max(1, Math.min(9, Math.round(v)));

export function createGenome(overrides = {}){
  const base = { TEM:5, GRO:5, EFF:5, SCH:5 };
  const g = { ...base, ...overrides };
  for (const t of TRAITS) g[t] = clampGene(g[t]);
  return g;
}

/**
 * Rekombination + Mutation.
 * - Basis: Mittel der Eltern ± sanfter Jitter
 * - Mutation: p_mut = base * (1 + 2*inbreeding) * SCH-Adjustment
 *   SCH-Adjustment reduziert p_mut bei hohem Schutz und erhöht bei geringem.
 * - Negativ-Bias bei Inzucht (EFF/SCH stärker betroffen)
 */
export function recombineGenes(momGenes, dadGenes, { mutationRate = 0.10, inbreeding = 0 } = {}){
  const child = {};
  const avgSCH = (momGenes.SCH + dadGenes.SCH) / 2;          // 1..9
  const schAdj  = 1 - 0.04 * (avgSCH - 5);                   // >5 → p runter, <5 → p rauf
  const p_mut   = Math.max(0.01, Math.min(0.7, mutationRate * (1 + 2*inbreeding) * schAdj));

  for (const t of TRAITS){
    const avg = (momGenes[t] + dadGenes[t]) / 2;
    let val   = clampGene(avg + (Math.random()*2 - 1) * 0.5); // sanfter Jitter

    if (Math.random() < p_mut){
      const weight   = (t === 'EFF' || t === 'SCH') ? 0.6 : 0.3;
      const negProb  = Math.min(0.95, 0.5 + inbreeding * weight);
      const delta    = (Math.random() < negProb) ? -1 : +1;
      val = clampGene(val + delta);
    }
    child[t] = val;
  }
  return child;
}

/** Heuristischer Survival-Score 0..100 (für Editor/Heuristik-Advisor). */
export function survivalScore(g){
  const norm = v => (v-1)/8; // 1..9 → 0..1
  return Math.round(
    (0.40*norm(g.EFF) +
     0.25*norm(g.SCH) +
     0.20*norm(g.TEM) +
     0.15*norm(g.GRO)) * 100
  );
}