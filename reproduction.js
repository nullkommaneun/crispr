// reproduction.js
import { getCells, createCell } from "./entities.js";
import { emit } from "./event.js";
import { CONFIG } from "./config.js";

let mutationRate = 0.05; // 5% (Slider gibt 0..30 -> wir teilen durch 100)

export function setMutationRate(pct){
  const p = Math.max(0, Number(pct) || 0) / 100;
  mutationRate = p;
}

function mixGene(a, b){
  const base = (a + b) / 2;
  // Mutation im Bereich ~±3 bei 100% Slider
  const mut = (Math.random() * 2 - 1) * 3 * mutationRate;
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
          TEM: mixGene(A.genome.TEM, B.genome.TEM),
          GRÖ: mixGene(A.genome.GRÖ, B.genome.GRÖ),
          EFF: mixGene(A.genome.EFF, B.genome.EFF),
          SCH: mixGene(A.genome.SCH, B.genome.SCH),
          MET: mixGene(A.genome.MET, B.genome.MET),
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

        // Eltern-IDs für Drives-Lernen mitgeben
        emit("cells:born", { child, parents: [A.id, B.id] });
      }
    }
  }
}