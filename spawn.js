// spawn.js
// Startpopulation: Adam & Eva + je 4 Startkinder (insgesamt 8).
// IDs laufen automatisch: Adam (#1), Eva (#2), Kinder ab #3 aufwärts.

import { createCell, createFood, setFounders, newStammId } from './entities.js';
import { createGenome } from './genetics.js';

export function seedWorld(areaW, areaH){
  // Adam (Stamm 1)
  const stammAdam = newStammId();
  const adam = createCell({
    name:'Adam',
    sex:'m',
    stammId: stammAdam,
    x: areaW*0.30,
    y: areaH*0.50,
    genes: createGenome({TEM:6, GRO:5, EFF:5, SCH:5}),
    energy: 30
  });

  // Eva (Stamm 2)
  const stammEva = newStammId();
  const eva = createCell({
    name:'Eva',
    sex:'f',
    stammId: stammEva,
    x: areaW*0.70,
    y: areaH*0.50,
    genes: createGenome({TEM:5, GRO:6, EFF:5, SCH:6}),
    energy: 30
  });

  setFounders(adam.id, eva.id);

  // Hilfsfunktion: „Kind“ aus Adam+Eva erzeugen, Stammlinie wählbar
  function makeChild(assignToStammId){
    const momGenes = eva.genes, dadGenes = adam.genes;
    // einfache Mittelung + kleiner Jitter, clamp auf 1..9
    const clamp9 = v => Math.max(1, Math.min(9, Math.round(v)));
    const g = {
      TEM: clamp9((momGenes.TEM + dadGenes.TEM)/2 + (Math.random()*2-1)),
      GRO: clamp9((momGenes.GRO + dadGenes.GRO)/2 + (Math.random()*2-1)),
      EFF: clamp9((momGenes.EFF + dadGenes.EFF)/2 + (Math.random()*2-1)),
      SCH: clamp9((momGenes.SCH + dadGenes.SCH)/2 + (Math.random()*2-1)),
    };
    return createCell({
      x: (eva.x + adam.x)/2 + (Math.random()*40-20),
      y: (eva.y + adam.y)/2 + (Math.random()*40-20),
      genes: g,
      stammId: assignToStammId,                               // Stammfarbe gemäß Wunsch
      parents: { motherId: eva.id, fatherId: adam.id },       // echte Eltern
      energy: 18
    });
  }

  // Vier Kinder in Evas Stammlinie (#3..#6)
  for(let i=0;i<4;i++) makeChild(eva.stammId);
  // Vier Kinder in Adams Stammlinie (#7..#10)
  for(let i=0;i<4;i++) makeChild(adam.stammId);

  // Startnahrung satt
  for(let i=0;i<140;i++) createFood();
}