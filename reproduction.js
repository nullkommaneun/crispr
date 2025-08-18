// reproduction.js
// Paarungsverhalten & Nachwuchs-Erzeugung.

import { recombineGenes } from './genetics.js';
import { Events, EVT } from './events.js';

export const MATING = Object.freeze({
  MIN_AGE: 3,          // Sekunden
  MIN_ENERGY: 12,      // Energiepunkte
  ENERGY_COST_PARENT: 6,
  ENERGY_BONUS_CHILD: 8
});

/**
 * Prüft und führt ggf. Paarung aus.
 * - cells: Array aller Zellen
 * - makeChild: Funktion(params) -> Cell  (vom Entities-Modul bereitgestellt)
 * - opts: {mutationRate, relatednessFn}
 */
export function evaluateMatingPairs(cells, makeChild, opts){
  const { mutationRate, relatednessFn } = opts;
  // Naive O(n^2) Paarprüfung – für kleine Population ausreichend.
  for(let i=0;i<cells.length;i++){
    const a = cells[i]; if(a.dead) continue;
    for(let j=i+1;j<cells.length;j++){
      const b = cells[j]; if(b.dead) continue;

      // Geschlechter verschieden?
      if(a.sex === b.sex) continue;

      const r = a.radius + b.radius;
      const dx = a.x - b.x, dy = a.y - b.y;
      const d2 = dx*dx + dy*dy;
      if(d2 > r*r) continue;

      // Basale Paarungsbedingungen
      if(a.age < MATING.MIN_AGE || b.age < MATING.MIN_AGE) continue;
      if(a.energy < MATING.MIN_ENERGY || b.energy < MATING.MIN_ENERGY) continue;

      // Paarungswahrscheinlichkeit abhängig von Energie & Kompatibilität
      const energyFactor = Math.min((a.energy + b.energy)/60, 1);
      const chance = 0.25 + 0.5*energyFactor; // 0.25..0.75
      if(Math.random() > chance) continue;

      // Inzucht (Relatedness)
      const rel = relatednessFn ? relatednessFn(a, b) : 0;

      // Nachwuchs erzeugen
      const protection = Math.round((a.genes.SCH + b.genes.SCH)/2);
      const genes = recombineGenes(a.genes, b.genes, {
        mutationRate, relatedness: rel, protection
      });

      // Kind übernimmt Stamm der Mutter (konstant für Legende); Editor erzeugt neue Stämme separat.
      const mother = a.sex === 'f' ? a : b;
      const father = a.sex === 'm' ? a : b;

      a.energy -= MATING.ENERGY_COST_PARENT;
      b.energy -= MATING.ENERGY_COST_PARENT;

      const child = makeChild({
        x: (a.x + b.x)/2 + (Math.random()*6-3),
        y: (a.y + b.y)/2 + (Math.random()*6-3),
        genes,
        stammId: mother.stammId,
        parents: { motherId: mother.id, fatherId: father.id },
        energy: MATING.ENERGY_BONUS_CHILD,
      });

      Events.emit(EVT.BIRTH, { childId: child.id, motherId: mother.id, fatherId: father.id, relatedness: rel });
      Events.emit(EVT.MATE,  { aId:a.id, bId:b.id, childId: child.id, relatedness: rel });
    }
  }
}