// reproduction.js – Paarung mit Nachbarsuche (falls neighborQuery vorhanden)

import { Events, EVT } from './event.js';
import { recombineGenes } from './genetics.js';

const MATE_DISTANCE_FACTOR = 1.2;
const now = ()=> performance.now()/1000;

function eligible(c,tNow){
  if(c.dead) return false;
  const cd=c.derived?.mateCooldown ?? 6;
  const thr=c.derived?.mateEnergyThreshold ?? 14;
  if((tNow-(c.lastMateAt||0)) < cd) return false;
  return c.energy >= thr;
}

/**
 * alive: Array<cell>
 * spawnFn: (params)=>cell
 * opts: { mutationRate, relatednessFn, neighborQuery?: (cell)=>Iterable<cell> }
 */
export function evaluateMatingPairs(alive, spawnFn, opts){
  const { mutationRate=0.1, relatednessFn, neighborQuery } = opts || {};
  const t = now();

  if (neighborQuery){
    // Pro Zelle nur Kandidaten aus Nachbarschaft (einseitig: nur b.id > a.id)
    for(const a of alive){
      for(const b of neighborQuery(a)){
        if(b.id <= a.id) continue;
        if(a.sex === b.sex) continue;
        // Nähe
        const dx=a.x-b.x, dy=a.y-b.y;
        const rr=(a.radius+b.radius)*MATE_DISTANCE_FACTOR;
        if(dx*dx+dy*dy > rr*rr) continue;
        if(!eligible(a,t) || !eligible(b,t)) continue;

        const mother = a.sex==='f' ? a : b;
        const father = a.sex==='m' ? a : b;
        const rel   = typeof relatednessFn==='function' ? relatednessFn(a,b) : 0;
        const genes = recombineGenes(mother.genes, father.genes, { mutationRate, inbreeding: rel });

        const px=(a.x+b.x)/2 + (Math.random()*12-6);
        const py=(a.y+b.y)/2 + (Math.random()*12-6);

        const child = spawnFn({
          x:px, y:py, genes,
          stammId: mother.stammId,
          parents: { motherId: mother.id, fatherId: father.id },
          energy: 14
        });

        const costA=a.derived?.mateEnergyCost ?? 4;
        const costB=b.derived?.mateEnergyCost ?? 4;
        a.lastMateAt=b.lastMateAt=t;
        a.energy=Math.max(0,a.energy-costA);
        b.energy=Math.max(0,b.energy-costB);

        Events.emit(EVT.MATE, { aId:a.id, bId:b.id, motherId:mother.id, fatherId:father.id, relatedness:rel });
        Events.emit(EVT.BIRTH,{ id:child.id, stammId:child.stammId, parents:child.parents });
      }
    }
  } else {
    // Fallback (kleine Populationen)
    const n = alive.length;
    for(let i=0;i<n;i++){
      const a = alive[i];
      for(let j=i+1;j<n;j++){
        const b = alive[j];
        if(a.sex === b.sex) continue;
        const dx=a.x-b.x, dy=a.y-b.y;
        const rr=(a.radius+b.radius)*MATE_DISTANCE_FACTOR;
        if(dx*dx+dy*dy > rr*rr) continue;
        if(!eligible(a,t) || !eligible(b,t)) continue;

        const mother = a.sex==='f' ? a : b;
        const father = a.sex==='m' ? a : b;
        const rel   = typeof relatednessFn==='function' ? relatednessFn(a,b) : 0;
        const genes = recombineGenes(mother.genes, father.genes, { mutationRate, inbreeding: rel });

        const px=(a.x+b.x)/2 + (Math.random()*12-6);
        const py=(a.y+b.y)/2 + (Math.random()*12-6);
        const child = spawnFn({ x:px, y:py, genes, stammId:mother.stammId, parents:{motherId:mother.id,fatherId:father.id}, energy:14 });

        const costA=a.derived?.mateEnergyCost ?? 4;
        const costB=b.derived?.mateEnergyCost ?? 4;
        a.lastMateAt=b.lastMateAt=t;
        a.energy=Math.max(0,a.energy-costA);
        b.energy=Math.max(0,b.energy-costB);

        Events.emit(EVT.MATE, { aId:a.id, bId:b.id, motherId:mother.id, fatherId:father.id, relatedness:rel });
        Events.emit(EVT.BIRTH,{ id:child.id, stammId:child.stammId, parents:child.parents });
      }
    }
  }
}