// spawn.js – Adam & Eva + 8 Startkinder im Sekundentakt (wechselweise)
// Robuster Namespace-Import aus entities.js (kein Name-Mismatch mehr)

import * as Entities from './entities.js';
import { createGenome } from './genetics.js';
import { Events, EVT } from './event.js';

export function seedWorld(w, h){
  // Adam
  const stammAdam = Entities.newStammId();
  const adam = Entities.createCell({
    name:'Adam',
    sex:'m',
    stammId: stammAdam,
    x: w*0.30,
    y: h*0.50,
    genes: createGenome({TEM:6, GRO:5, EFF:5, SCH:5}),
    energy: 36
  });

  // Eva
  const stammEva = Entities.newStammId();
  const eva = Entities.createCell({
    name:'Eva',
    sex:'f',
    stammId: stammEva,
    x: w*0.70,
    y: h*0.50,
    genes: createGenome({TEM:5, GRO:6, EFF:5, SCH:6}),
    energy: 36
  });

  // Gründer registrieren (für Narrative)
  if (typeof Entities.setFounders === 'function') {
    Entities.setFounders(adam.id, eva.id);
  }

  // Hilfsfunktion: Kind (Gene ≈ Mittelwert + Jitter), Stammlinie = Mutter
  function makeChild(mother, father){
    const mg = mother.genes, dg = father.genes;
    const g = createGenome({
      TEM: (mg.TEM + dg.TEM)/2 + (Math.random()*2-1),
      GRO: (mg.GRO + dg.GRO)/2 + (Math.random()*2-1),
      EFF: (mg.EFF + dg.EFF)/2 + (Math.random()*2-1),
      SCH: (mg.SCH + dg.SCH)/2 + (Math.random()*2-1),
    });
    const c = Entities.createCell({
      x: mother.x + (Math.random()*60-30),
      y: mother.y + (Math.random()*60-30),
      genes: g,
      stammId: mother.stammId,
      parents: {motherId: mother.id, fatherId: father.id},
      energy: 22,
      noSplit: true
    });
    Events.emit(EVT.BIRTH, { id:c.id, stammId:c.stammId, parents:c.parents });
  }

  // 8 Startkinder im Sekundentakt, alternierend Eva/Adam als Mutter
  for(let k=1;k<=8;k++){
    Entities.schedule(()=> {
      const mother = (k % 2 === 1) ? eva : adam;
      const father = (mother===eva) ? adam : eva;
      makeChild(mother, father);
      Events.emit(EVT.TIP, { label:'Tipp', text:`Neues Start-Kind #${k+2} geboren (Stamm ${mother.stammId}).` });
    }, k * 1.0);
  }

  // Start-Nahrung (Cluster spawnen zwar weiter, aber etwas „Futter im Haus“ hilft)
  for(let i=0;i<140;i++) Entities.createFood();
}