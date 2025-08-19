// reproduction.js
// Paarungsverhalten: Bei Begegnung m/f entsteht Nachwuchs.
// Kind bekommt Gene durch Rekombination + Mutation (mit Inzucht-Malus).

import { Events, EVT } from './events.js';
import { recombineGenes } from './genetics.js';

const MATE_DISTANCE_FACTOR = 1.2;   // wie nah müssen sie sein (Summe Radien * Faktor)
const MATE_COOLDOWN_SEC   = 6;      // Eltern brauchen Pause
const ENERGY_COST         = 5;      // Energiekosten pro Elternteil

function now(){ return performance.now()/1000; }

/**
 * @param {Array} aliveCells - nur lebende Zellen
 * @param {Function} spawnFn - (params) => newCell
 * @param {{mutationRate:number, relatednessFn:function}} options
 */
export function evaluateMatingPairs(aliveCells, spawnFn, { mutationRate=0.1, relatednessFn }){
  const n = aliveCells.length;
  if(n <= 1) return;

  const t = now();

  for(let i=0;i<n;i++){
    const a = aliveCells[i];
    for(let j=i+1;j<n;j++){
      const b = aliveCells[j];
      if(a.dead || b.dead) continue;
      if(a.sex === b.sex) continue;

      // Nähe prüfen
      const dx = a.x - b.x, dy = a.y - b.y;
      const rr = (a.radius + b.radius) * MATE_DISTANCE_FACTOR;
      if (dx*dx + dy*dy > rr*rr) continue;

      // Cooldown
      if((t - (a.lastMateAt||0)) < MATE_COOLDOWN_SEC) continue;
      if((t - (b.lastMateAt||0)) < MATE_COOLDOWN_SEC) continue;

      // Mutter/Father bestimmen
      const mother = a.sex==='f' ? a : b;
      const father = a.sex==='m' ? a : b;

      const rel = typeof relatednessFn === 'function' ? relatednessFn(a,b) : 0;
      const genes = recombineGenes(mother.genes, father.genes, { mutationRate, inbreeding: rel });

      const px = (a.x + b.x)/2 + (Math.random()*12-6);
      const py = (a.y + b.y)/2 + (Math.random()*12-6);

      const child = spawnFn({
        x: px, y: py,
        genes,
        stammId: mother.stammId,                      // Stammlinie = Mutter
        parents: { motherId: mother.id, fatherId: father.id },
        energy: 14
      });

      // Eltern belasten & pausieren
      a.lastMateAt = b.lastMateAt = t;
      a.energy = Math.max(0, a.energy - ENERGY_COST);
      b.energy = Math.max(0, b.energy - ENERGY_COST);

      // Events
      Events.emit(EVT.MATE,  { aId:a.id, bId:b.id, motherId:mother.id, fatherId:father.id, relatedness: rel });
      Events.emit(EVT.BIRTH, { id: child.id, stammId: child.stammId, parents: child.parents });

      // Mini-Abstoßung, damit sie nicht festkleben
      const ang = Math.atan2(dy, dx), push = 10;
      a.vx +=  Math.cos(ang) * push; a.vy +=  Math.sin(ang) * push;
      b.vx += -Math.cos(ang) * push; b.vy += -Math.sin(ang) * push;
    }
  }
}