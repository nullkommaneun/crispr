// genetics.js – Gene, Rekombination, Heuristik-Score

export const TRAITS = ['TEM','GRO','EFF','SCH'];

const clamp01to9 = v => Math.max(1, Math.min(9, Math.round(v)));

export function createGenome(seed={}){
  const g = {};
  for(const t of TRAITS) g[t] = clamp01to9(seed[t] ?? 5);
  return g;
}

export function recombineGenes(mom, dad, { mutationRate=0.1, inbreeding=0 }={}){
  const child = {};
  for(const t of TRAITS){
    const avg = (mom[t] + dad[t]) / 2;
    let val = avg + (Math.random()*2-1); // kleine Variation
    // Mutation
    if(Math.random() < mutationRate){
      val += (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random()*1.2);
    }
    // Inzucht-Malus (leichte Drift zu Extremen)
    if(inbreeding >= 0.25){
      const dir = Math.random()<0.5 ? -1 : 1;
      val += dir * (inbreeding*2);
    }
    child[t] = clamp01to9(val);
  }
  return child;
}

// Heuristik: 0..100
export function survivalScore(g){
  const n = x => (x-5)/4;
  const wTEM=0.35, wGRO=0.15, wEFF=0.35, wSCH=0.15;
  let s = 50
    + 50*wTEM*n(g.TEM)
    + 50*wGRO*n(g.GRO)
    + 60*wEFF*n(g.EFF)
    + 45*wSCH*n(g.SCH);
  return Math.max(0, Math.min(100, Math.round(s)));
}