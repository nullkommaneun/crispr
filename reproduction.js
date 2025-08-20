import { getCells, createCell } from "./entities.js";
import { emit } from "./event.js";
import { CONFIG } from "./config.js";

let mutationRate = 0.05; // 5% default
export function setMutationRate(pct){ mutationRate = Math.max(0, pct)/100; }

function mix(a,b){
  // simple average + mutation in [-1,1] scaled
  const base = (a+b)/2;
  const mut = (Math.random()*2 - 1) * 3 * mutationRate * 10/10; // up to ~±3 at 100%
  return Math.max(1, Math.min(10, Math.round(base + mut)));
}

let nextId = 1000;

export function step(dt){
  const cells = getCells();
  // bruteforce proximity check (small N)
  for(let i=0;i<cells.length;i++){
    const A = cells[i]; if(A.energy < CONFIG.cell.energyCostPair || A.cooldown>0) continue;
    for(let j=i+1;j<cells.length;j++){
      const B = cells[j]; if(B.energy < CONFIG.cell.energyCostPair || B.cooldown>0) continue;
      if(A.sex===B.sex) continue;
      const dx=A.pos.x-B.pos.x, dy=A.pos.y-B.pos.y;
      const d2=dx*dx+dy*dy;
      if(d2 < (CONFIG.cell.pairDistance*CONFIG.cell.pairDistance)){
        // Pairing
        const childGenome = {
          TEM: mix(A.genome.TEM, B.genome.TEM),
          GRÖ: mix(A.genome.GRÖ, B.genome.GRÖ),
          EFF: mix(A.genome.EFF, B.genome.EFF),
          SCH: mix(A.genome.SCH, B.genome.SCH),
          MET: mix(A.genome.MET, B.genome.MET),
        };
        const child = createCell({
          name: `C${nextId++}`,
          sex: Math.random()<0.5 ? "M" : "F",
          stammId: Math.random()<0.15 ? (A.stammId) : (B.stammId), // leicht kreuzweise
          pos: { x:(A.pos.x+B.pos.x)/2, y:(A.pos.y+B.pos.y)/2 },
          genome: childGenome,
          energy: Math.min(A.energy, B.energy) * 0.5
        });
        A.energy -= CONFIG.cell.energyCostPair; B.energy -= CONFIG.cell.energyCostPair;
        A.cooldown = Math.max(1, CONFIG.cell.cooldown * (11 - A.genome.MET)/10);
        B.cooldown = Math.max(1, CONFIG.cell.cooldown * (11 - B.genome.MET)/10);
        emit("cells:born", child);
      }
    }
  }
}