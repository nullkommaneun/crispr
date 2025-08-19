// spawn.js
// Seed: Adam & Eva + 10 Kinder => Startpopulation 12.

import { createCell, createFood, setFounders, newStammId } from './entities.js';
import { createGenome } from './genetics.js';

export function seedWorld(areaW, areaH){
  // Adam
  const stammAdam = newStammId();
  const adam = createCell({
    name:'Adam', sex:'m', stammId: stammAdam,
    x: areaW*0.3, y: areaH*0.5,
    genes: createGenome({TEM:6, GRO:5, EFF:5, SCH:5}),
    energy: 30
  });
  // Eva
  const stammEva = newStammId();
  const eva = createCell({
    name:'Eva', sex:'f', stammId: stammEva,
    x: areaW*0.7, y: areaH*0.5,
    genes: createGenome({TEM:5, GRO:6, EFF:5, SCH:6}),
    energy: 30
  });
  setFounders(adam.id, eva.id);

  // 10 Kinder (Mutterstamm = Eva)
  for(let i=0;i<10;i++){
    const jitterX = (Math.random()*40-20);
    const jitterY = (Math.random()*40-20);
    const momGenes = eva.genes, dadGenes = adam.genes;
    const childGenes = {
      TEM: Math.max(1, Math.min(9, Math.round((momGenes.TEM + dadGenes.TEM)/2 + (Math.random()*2-1)))),
      GRO: Math.max(1, Math.min(9, Math.round((momGenes.GRO + dadGenes.GRO)/2 + (Math.random()*2-1)))),
      EFF: Math.max(1, Math.min(9, Math.round((momGenes.EFF + dadGenes.EFF)/2 + (Math.random()*2-1)))),
      SCH: Math.max(1, Math.min(9, Math.round((momGenes.SCH + dadGenes.SCH)/2 + (Math.random()*2-1)))),
    };
    createCell({
      x: eva.x + jitterX,
      y: eva.y + jitterY,
      genes: childGenes,
      stammId: eva.stammId,
      parents: {motherId: eva.id, fatherId: adam.id},
      energy: 18
    });
  }

  // Startnahrung – gut sichtbar
  for(let i=0;i<120;i++) createFood();
}