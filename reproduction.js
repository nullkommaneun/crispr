// reproduction.js
// Paarungsverhalten mit leicht kooperativem Tuning:
// - größere effektive Reichweite
// - niedrigere Energie-Schwelle, kürzerer Cooldown
// - geringere Paarungskosten
// - Score-basierte Partnerwahl (Distanz, Fitness, Kompatibilität, anderer Stamm)

import { on, off, emit, once, EVT } from './event.js';
import { recombineGenes, survivalScore } from './genetics.js';

const MATE_DISTANCE_FACTOR = 1.35;   // vorher 1.2 – erleichtert Kontakte
const ENERGY_THR_MULT      = 0.85;   // ~15% geringere Schwelle
const COOLDOWN_MULT        = 0.85;   // ~15% kürzerer Cooldown
const COST_OFFSET          = -1;     // Energie-Kosten je Elternteil -1 (min 1)

/** Zeit in Sekunden */
const now = () => performance.now() / 1000;

/** Eligibility mit abgesenkter Schwelle & Cooldown */
function eligible(c, tNow){
  if (c.dead) return false;
  const baseThr = c.derived?.mateEnergyThreshold ?? 14;
  const baseCd  = c.derived?.mateCooldown ?? 6;

  const thr = Math.max(6, baseThr * ENERGY_THR_MULT);
  const cd  = Math.max(1.5, baseCd  * COOLDOWN_MULT);

  if ((tNow - (c.lastMateAt || 0)) < cd) return false;
  if (c.energy < thr) return false;
  return true;
}

/** Paarungs-Score (größer = besser) */
function mateScore(a, b, dist){
  // Distanznähe (0..1): sehr nah bevorzugt
  const prox = 1 / (dist + 8);

  // Fitness (0..1): mittlere Fitness beider Eltern
  const fitA = survivalScore(a.genes) / 100;
  const fitB = survivalScore(b.genes) / 100;
  const fit  = (fitA + fitB) * 0.5;

  // Verwandtschaft (0..1): geringe Verwandtschaft ist gut
  const rel = typeof a._relatednessFn === 'function'
    ? a._relatednessFn(a, b)
    : 0;
  const compat = Math.max(0.2, 1 - 0.8 * rel); // Inzest bremst, aber nie 0

  // Bonus anderer Stamm
  const cross = (a.stammId !== b.stammId) ? 1.15 : 1.0;

  // Gewichte: Distanz 0.45, Fitness 0.35, Kompatibilität 0.20
  const base = (0.45 * prox) + (0.35 * fit) + (0.20 * compat);
  return base * cross;
}

/**
 * evaluateMatingPairs
 * @param {Array} aliveCells   – lebende Zellen
 * @param {Function} spawnFn   – (params)=>cell  (wird von entities.createCell gereicht)
 * @param {Object} opts        – { mutationRate, relatednessFn, neighborQuery? }
 */
export function evaluateMatingPairs(aliveCells, spawnFn, opts = {}){
  const { mutationRate = 0.10, relatednessFn, neighborQuery } = opts;
  const tNow = now();

  // Flag, damit eine Zelle pro Tick höchstens einmal paart
  const paired = new Set();

  // Hilfsfunktion: bestes Gegenüber aus Nachbarschaft für a finden
  function bestPartnerFor(a){
    let best = null, bestScore = -Infinity;

    const candidates = neighborQuery
      ? Array.from(neighborQuery(a))
      : aliveCells; // Fallback ohne Grid

    const rr = (radA) => (radA) * MATE_DISTANCE_FACTOR; // wird mit b addiert

    for (const b of candidates){
      if (b === a || paired.has(b.id) || b.dead) continue;
      if (b.sex === a.sex) continue;

      // Reichweite (symmetrisch)
      const dx = a.x - b.x, dy = a.y - b.y;
      const dist = Math.hypot(dx, dy);
      const range = rr(a.radius + b.radius);
      if (dist > range) continue;

      // Status & Energie
      if (!eligible(a, tNow) || !eligible(b, tNow)) continue;

      // Score
      a._relatednessFn = relatednessFn; // für score()
      const s = mateScore(a, b, dist);
      if (s > bestScore){
        bestScore = s; best = { b, dist, score: s };
      }
    }

    return best;
  }

  // Pro Zelle (in zufälliger Reihenfolge) Partner wählen
  // – Shuffle leichte Varianz
  const order = aliveCells.slice();
  for (let i=order.length-1; i>0; i--){
    const j = (Math.random()*(i+1))|0; const tmp = order[i]; order[i]=order[j]; order[j]=tmp;
  }

  for (const a of order){
    if (paired.has(a.id) || a.dead) continue;

    const pick = bestPartnerFor(a);
    if (!pick) continue;

    const { b } = pick;
    if (paired.has(b.id)) continue;

    // Gene des Kindes
    const rel = typeof relatednessFn === 'function' ? relatednessFn(a, b) : 0;
    const genes = recombineGenes(
      (a.sex === 'f' ? a : b).genes,
      (a.sex === 'm' ? a : b).genes,
      { mutationRate, inbreeding: rel }
    );

    const px = (a.x + b.x)/2 + (Math.random()*12-6);
    const py = (a.y + b.y)/2 + (Math.random()*12-6);

    // Mutter/Vater bestimmen
    const mother = a.sex === 'f' ? a : b;
    const father = a.sex === 'm' ? a : b;

    // Kind erzeugen (gleiche Stammlinie wie die Mutter)
    const child = spawnFn({
      x: px, y: py,
      genes,
      stammId: mother.stammId,
      parents: { motherId: mother.id, fatherId: father.id },
      energy: 14
    });

    // Energie-Kosten leicht reduziert
    const costA = Math.max(1, (a.derived?.mateEnergyCost ?? 4) + COST_OFFSET);
    const costB = Math.max(1, (b.derived?.mateEnergyCost ?? 4) + COST_OFFSET);
    a.lastMateAt = b.lastMateAt = tNow;
    a.energy = Math.max(0, a.energy - costA);
    b.energy = Math.max(0, b.energy - costB);

    paired.add(a.id); paired.add(b.id);

    // Events
    emit(EVT.MATE,  { aId:a.id, bId:b.id, motherId:mother.id, fatherId:father.id, relatedness: rel });
    emit(EVT.BIRTH, { id: child.id, stammId: child.stammId, parents: child.parents });
  }
}