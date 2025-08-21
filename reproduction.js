// reproduction.js – Paarung & Mutation (mit Diagnose-Export getMutationRate)
// Elternqualitäts-abhängige Mutation: gute Eltern (EFF↑, MET↓) → geringere Mutationsamplitude

import { getCells, createCell } from "./entities.js";
import { emit } from "./event.js";
import { CONFIG } from "./config.js";

let mutationRate = 0.05; // Prozent/100 (0..1)

export function setMutationRate(pct){
  const p = Math.max(0, Number(pct) || 0) / 100;
  mutationRate = p;
}
export function getMutationRate(){  // für Diagnose-Panel
  return mutationRate;
}

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

// Elternqualität 0..1: gute EFF (hoch), MET (niedrig)
function parentQuality(A,B){
  const qEff = (A.genome.EFF + B.genome.EFF) / 20;       // ~0..1
  const qMet = 1 - (A.genome.MET + B.genome.MET) / 20;   // ~0..1
  return clamp(0.5*qEff + 0.5*qMet, 0, 1);
}

// mutiert Genwert um ±(3 * localRate)
function mixGene(a, b, A, B){
  const base = (a + b) / 2;
  const q = parentQuality(A,B);               // 0..1
  const localRate = mutationRate * (1 - 0.4*q); // bis −40% bei guten Eltern
  const mut = (Math.random() * 2 - 1) * 3 * localRate;
  return Math.max(1, Math.min(10, Math.round(base + mut)));
}

let nextId = 2000;

export function step(dt){
  const cells = getCells();
  for (let i = 0; i < cells.length; i++){
    const A = cells[i];
    if (A.energy < CONFIG.cell.energyCostPair || A.cooldown > 0) continue;

    for (let j = i + 1; j < cells.length; j++){
      const B = cells[j];
      if (B.energy < CONFIG.cell.energyCostPair || B.cooldown > 0) continue;
      if (A.sex === B.sex) continue;

      const dx = A.pos.x - B.pos.x, dy = A.pos.y - B.pos.y;
      if (dx*dx + dy*dy <= CONFIG.cell.pairDistance * CONFIG.cell.pairDistance){
        const g = {
          TEM: mixGene(A.genome.TEM, B.genome.TEM, A, B),
          GRÖ: mixGene(A.genome.GRÖ, B.genome.GRÖ, A, B),
          EFF: mixGene(A.genome.EFF, B.genome.EFF, A, B),
          SCH: mixGene(A.genome.SCH, B.genome.SCH, A, B),
          MET: mixGene(A.genome.MET, B.genome.MET, A, B),
        };

        const child = createCell({
          name: `C${nextId++}`,
          sex: Math.random() < 0.5 ? "M" : "F",
          stammId: Math.random() < 0.15 ? A.stammId : B.stammId,
          pos: { x: (A.pos.x + B.pos.x) / 2, y: (A.pos.y + B.pos.y) / 2 },
          genome: g,
          energy: Math.min(A.energy, B.energy) * 0.5
        });

        A.energy -= CONFIG.cell.energyCostPair;
        B.energy -= CONFIG.cell.energyCostPair;
        A.cooldown = Math.max(1, CONFIG.cell.cooldown * (11 - A.genome.MET) / 10);
        B.cooldown = Math.max(1, CONFIG.cell.cooldown * (11 - B.genome.MET) / 10);

        emit("cells:born", { child, parents: [A.id, B.id] });
      }
    }
  }
}