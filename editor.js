// editor.js
// CRISPR-Editor Modal: Traits mit -1/0/+1, rechts lebende Zellen mit Survival-Score.

import { createCell, newStammId, cells } from './entities.js';
import { TRAITS, createGenome, survivalScore } from './genetics.js';
import { Events, EVT } from './events.js';

const offsets = { TEM:0, GRO:0, EFF:0, SCH:0 };

export function initEditor(){
  const dlg = document.getElementById('editorModal');
  const form = document.getElementById('editorForm');
  const closeBtn = document.getElementById('editorClose');
  const list = document.getElementById('editorCellList');

  // Stepper-Buttons
  for(const row of document.querySelectorAll('.traitRow')){
    const trait = row.dataset.trait;
    const out = row.querySelector('.val');
    const dec = row.querySelector('.dec');
    const inc = row.querySelector('.inc');
    dec.addEventListener('click', ()=>{ offsets[trait] = Math.max(-3, offsets[trait]-1); out.textContent = String(offsets[trait]); });
    inc.addEventListener('click', ()=>{ offsets[trait] = Math.min(+3, offsets[trait]+1); out.textContent = String(offsets[trait]); });
  }

  // Anzeigen
  function refreshList(){
    list.innerHTML = '';
    const alive = cells.filter(c=>!c.dead);
    for(const c of alive){
      const score = survivalScore(c.genes);
      const card = document.createElement('div');
      card.className = 'cellCard';
      card.innerHTML = `<span class="id">${c.name} <small class="mono">#${c.id} • Stamm ${c.stammId}</small></span>
                        <span class="score">${score}</span>`;
      list.appendChild(card);
    }
  }
  refreshList();

  Events.on(EVT.BIRTH, refreshList);
  Events.on(EVT.DEATH, refreshList);

  // Formular-Submit => neue Zelle erzeugen (neuer Stamm)
  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const base = { TEM:5, GRO:5, EFF:5, SCH:5 };
    const genome = createGenome({
      TEM: base.TEM + offsets.TEM,
      GRO: base.GRO + offsets.GRO,
      EFF: base.EFF + offsets.EFF,
      SCH: base.SCH + offsets.SCH,
    });
    const stamm = newStammId();
    const spawnX = Math.random()*800, spawnY = Math.random()*520;
    const c = createCell({
      x: spawnX, y: spawnY,
      genes: genome,
      stammId: stamm,
      energy: 22
    });
    Events.emit(EVT.TIP, { label:'Editor', text:`Neue Zelle #${c.id} als neuer Stamm ${stamm} erzeugt.` });
    dlg.close('ok');
  });

  // Close
  closeBtn.addEventListener('click', ()=> dlg.close('cancel'));
}

export function openEditor(){ document.getElementById('editorModal').showModal(); }
