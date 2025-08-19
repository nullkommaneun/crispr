// genetics.js
// Gene, Rekombination, Mutationen, Inzucht-Malus + Survival-Score (für Editor/Advisor)

export const TRAITS = ['TEM','GRO','EFF','SCH']; // Tempo, Größe, Effizienz, Schutz

const clampGene = v => Math.max(1, Math.min(9, Math.round(v)));

export function createGenome(overrides = {}){
  const base = { TEM:5, GRO:5, EFF:5, SCH:5 };
  const g = { ...base, ...overrides };
  for(const t of TRAITS) g[t] = clampGene(g[t]);
  return g;
}

/**
 * Rekombination + Mutation.
 * - Grundwert: Mittel der Eltern ± kleiner Rausch
 * - Mutation: p = mutationRate * (1 + 2*inbreeding)
 * - Inzucht-Malus: Bias zu negativen Mutationen (v.a. bei EFF/SCH)
 */
export function recombineGenes(momGenes, dadGenes, { mutationRate=0.10, inbreeding=0 } = {}){
  const child = {};
  for(const t of TRAITS){
    // Basismischung + sanfter Jitter
    const avg = (momGenes[t] + dadGenes[t]) / 2;
    let val = clampGene(avg + (Math.random()*2-1)*0.5);

    // Mutations-Wahrscheinlichkeit erhöht sich mit Verwandtschaft
    const pMut = mutationRate * (1 + 2*inbreeding);
    if(Math.random() < pMut){
      // Negativ-Bias bei Inzucht; EFF/SCH stärker betroffen
      const baseNeg = 0.5; // 50/50 ohne Inzucht
      const extraNeg = inbreeding * (t==='EFF' || t==='SCH' ? 0.8 : 0.5);
      const negProb = Math.min(0.95, baseNeg + extraNeg); // max. 95% negativ
      const delta = (Math.random() < negProb) ? -1 : +1;
      val = clampGene(val + delta);
    }
    child[t] = val;
  }
  return child;
}

/** Heuristischer Survival-Score 0..100 (für Editor/Heuristik-Advisor). */
export function survivalScore(g){
  const norm = v => (v-1)/8; // 1..9 → 0..1
  // Effizienz & Schutz sind wichtiger
  const score =
        0.40*norm(g.EFF) +
        0.25*norm(g.SCH) +
        0.20*norm(g.TEM) +
        0.15*norm(g.GRO);
  return Math.round(score*100);
}