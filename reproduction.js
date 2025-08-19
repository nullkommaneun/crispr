// reproduction.js
// Paarungsverhalten: Bei Begegnung m/f entsteht Nachwuchs.
// Energie-Checks & Cooldown nutzen die aus Genen abgeleiteten Zelleigenschaften.

import { Events, EVT } from './events.js';
import { recombineGenes } from './genetics.js';

const MATE_DISTANCE_FACTOR = 1.2;   // Distanz: Summe Radien * Faktor

function now(){ return performance.now()/1000; }

function eligibleForMating(c, tNow){
  if (c.dead) return false;
  const cd = c.derived?.mateCooldown ?? 6;
  const thr = c.derived?.mateEnergyThreshold ?? 14;
  if ((tNow - (c.lastMateAt || 0)) < cd) return false;
  return c.energy >= thr;
}

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

      // Energie & Cooldown
      if (!eligibleForMating(a, t) || !eligibleForMating(b, t)) continue;

      // Mutter/Vater
      const mother = a.sex==='f' ? a : b;
      const father = a.sex==='m' ? a : b;

      const rel   = typeof relatednessFn === 'function' ? relatednessFn(a,b) : 0;
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
      const costA = a.derived?.mateEnergyCost ?? 4;
      const costB = b.derived?.mateEnergyCost ?? 4;
      a.lastMateAt = b.lastMateAt = t;
      a.energy = Math.max(0, a.energy - costA);
      b.energy = Math.max(0, b.energy - costB);

      // Events
      Events.emit(EVT.MATE,  { aId:a.id, bId:b.id, motherId:mother.id, fatherId:father.id, relatedness: rel });
      Events.emit(EVT.BIRTH, { id: child.id, stammId: child.stammId, parents: child.parents });

      // Leichte Abstoßung, damit sie nicht „kleben“
      const ang = Math.atan2(dy, dx), push = 10;
      a.vx +=  Math.cos(ang) * push; a.vy +=  Math.sin(ang) * push;
      b.vx += -Math.cos(ang) * push; b.vy += -Math.sin(ang) * push;
    }
  }
}