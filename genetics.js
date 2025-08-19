// genetics.js
// Gene, Rekombination, Mutationen, Inzucht-Malus.

import { Events, EVT } from './events.js';

export const TRAITS = Object.freeze(['TEM','GRO','EFF','SCH']);

export function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

/** Erstellt ein standardisiertes Genom. Wertebereich 1..9, Startwert 5 */
export function createGenome(base = {TEM:5, GRO:5, EFF:5, SCH:5}){
  const g = {};
  for(const t of TRAITS){ g[t] = clamp(Math.round(base[t] ?? 5), 1, 9); }
  return g;
}

/** Re-Kombination zweier Genome + Mutation (inkl. Inzucht-Malus) */
export function recombineGenes(mother, father, opts){
  const { mutationRate = 0.1, relatedness = 0, protection = 5 } = opts || {};
  const child = {};
  for(const t of TRAITS){
    // Kreuzung: zufällig Gen der Mutter oder des Vaters, leichter Mittelwert-Drall
    const pick = Math.random() < 0.5 ? mother[t] : father[t];
    const avg = Math.round((mother[t] + father[t]) / 2);
    const base = Math.random() < 0.25 ? avg : pick;

    let gene = base;

    // Mutationslogik:
    // Grundwahrscheinlichkeit aus mutationRate (0..1).
    // Inzucht-Malus: bei hoher Verwandtschaft steigt Wahrscheinlichkeit für negative Mutationen.
    // Schutz (SCH) der Eltern reduziert negative Effekte leicht.
    const protective = (protection - 5) * 0.03; // -0.12..+0.12
    const negBias = clamp(relatedness * 0.8 - protective, 0, 0.9); // 0..0.9
    const pMut = clamp(mutationRate + relatedness * 0.2, 0, 0.95);

    if(Math.random() < pMut){
      const neg = Math.random() < (0.5 + negBias);
      gene += neg ? -1 : +1;
      gene = clamp(gene, 1, 9);
      Events.emit(EVT.MUTATION, {
        trait: t, negative: neg, newValue: gene,
        negBias, mutationRate: pMut
      });
    }
    child[t] = gene;
  }
  return child;
}

/** Heuristischer Survival-Score (0..100) zur Bewertung in UI/Editor */
export function survivalScore(genome){
  // Ausbalancierte Mischung – Effizienz und Schutz zählen etwas mehr.
  const {TEM, GRO, EFF, SCH} = genome;
  const speed = 5 + (TEM-5)*2;       // -8..+8
  const size  = 5 + (GRO-5)*2;
  const eff   = 5 + (EFF-5)*3;
  const prot  = 5 + (SCH-5)*3;
  const raw = speed + size + eff + prot; // ~ 8..32
  return clamp(Math.round((raw/32)*100), 0, 100);
}
