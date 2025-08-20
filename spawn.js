// spawn.js – Adam & Eva + 8 Startkinder im Sekundentakt (wechselweise)
// Start-Setup: Gründer sehr dicht beieinander, zentral im Feld.

import {
  createCell,
  createFood,
  newStammId,
  schedule,
  setFounders,
} from './entities.js';
import { createGenome } from './genetics.js';
import { Events, EVT } from './event.js';

export function seedWorld(w, h){
  // Zentrale Startposition (leicht links/rechts versetzt)
  const cx = w * 0.50;
  const cy = h * 0.50;
  const sep = Math.max(18, Math.min(32, Math.min(w, h) * 0.03)); // 18..32 px Abstand

  // Adam (m), links der Mitte
  const stammAdam = newStammId();
  const adam = createCell({
    name: 'Adam',
    sex: 'm',
    stammId: stammAdam,
    x: cx - sep,
    y: cy,
    genes: createGenome({ TEM: 6, GRO: 5, EFF: 5, SCH: 5 }),
    energy: 36
  });

  // Eva (w), rechts der Mitte
  const stammEva = newStammId();
  const eva = createCell({
    name: 'Eva',
    sex: 'f',
    stammId: stammEva,
    x: cx + sep,
    y: cy,
    genes: createGenome({ TEM: 5, GRO: 6, EFF: 5, SCH: 6 }),
    energy: 36
  });

  // Gründer registrieren (für Narrative)
  setFounders(adam.id, eva.id);

  // Hilfsfunktion: Kind (Gene ≈ Mittelwert + leichter Jitter), Stammlinie = Mutter
  function makeChild(mother, father){
    const mg = mother.genes, dg = father.genes;
    const g = createGenome({
      TEM: (mg.TEM + dg.TEM)/2 + (Math.random()*2 - 1),
      GRO: (mg.GRO + dg.GRO)/2 + (Math.random()*2 - 1),
      EFF: (mg.EFF + dg.EFF)/2 + (Math.random()*2 - 1),
      SCH: (mg.SCH + dg.SCH)/2 + (Math.random()*2 - 1),
    });
    const jitter = 30; // Kinder leicht um die Mutter herum verteilen
    const c = createCell({
      x: mother.x + (Math.random()*2 - 1) * jitter,
      y: mother.y + (Math.random()*2 - 1) * jitter,
      genes: g,
      stammId: mother.stammId,
      parents: { motherId: mother.id, fatherId: father.id },
      energy: 22,
      noSplit: true
    });
    Events.emit(EVT.BIRTH, { id: c.id, stammId: c.stammId, parents: c.parents });
  }

  // 8 Startkinder im Sekundentakt, alternierend Eva/Adam als Mutter
  for(let k=1; k<=8; k++){
    schedule(() => {
      const mother = (k % 2 === 1) ? eva : adam;
      const father = (mother === eva) ? adam : eva;
      makeChild(mother, father);
      Events.emit(EVT.TIP, {
        label: 'Tipp',
        text: `Neues Start-Kind #${k+2} geboren (Stamm ${mother.stammId}).`
      });
    }, k * 1.0);
  }

  // Startnahrung (bleibt wie gehabt breit gestreut; Cluster spawnen weiter)
  for(let i=0; i<140; i++) createFood();
}