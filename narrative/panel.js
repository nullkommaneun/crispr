// narrative/panel.js
// Boulevard-Schlagzeilen im Zeitungsstil, abhängig von Ereignissen.

import { Events, EVT } from '../event.js';
import * as Entities from '../entities.js';
import { survivalScore } from '../genetics.js';

let panel;
let loveShown = false;
const extinctShown = new Set();

function addHeadline(html){
  if(!panel) return;
  const div = document.createElement('div');
  div.className = 'headline';
  div.innerHTML = `<b>${html}</b>`;
  panel.prepend(div);
  // Panel scrollbar am Anfang lassen
}

export function initNarrativePanel(){
  panel = document.getElementById('narrativePanel');
  if(!panel) return;

  // Paarung mit naher Verwandtschaft
  Events.on(EVT.MATE, (d)=>{
    if(!d) return;
    if(d.relatedness >= 0.25){
      addHeadline('📰 Skandal! Zellen paarten sich mit enger Verwandtschaft – Experten warnen.');
    }
  });

  // Geburt → evtl. Mutation-Alarm
  Events.on(EVT.BIRTH, (d)=>{
    if(!d?.id) return;
    const child = Entities.cells.find(c=>c.id===d.id);
    if(!child) return;
    const mom = d.parents?.motherId ? Entities.cells.find(c=>c.id===d.parents.motherId) : null;
    const dad = d.parents?.fatherId ? Entities.cells.find(c=>c.id===d.parents.fatherId) : null;
    if(mom && dad){
      const p = Math.round((survivalScore(mom.genes)+survivalScore(dad.genes))/2);
      const c = survivalScore(child.genes);
      if(c >= p + 12){
        addHeadline('🧪 Mutation‑Alarm! Neue Zelle zeigt ungeahnte Stärke.');
      }
    }
    // Gründerliebe einmalig
    const fs = Entities.getFoundersState?.();
    if(fs?.adam && fs?.eva && !loveShown){
      const kidsOfEva = Entities.cells.filter(x=>x.parents?.motherId === fs.eva);
      if(kidsOfEva.some(k=>k.parents?.fatherId === fs.adam)){
        addHeadline('❤️ Liebesgeschichte! Adam und Eva noch immer vereint.');
        loveShown = true;
      }
    }
  });

  // Tod → Aussterben eines Stamms melden
  Events.on(EVT.DEATH, (d)=>{
    if(!d?.stammId) return;
    const cnt = Entities.getStammCounts?.()[d.stammId] || 0;
    if(cnt === 0 && !extinctShown.has(d.stammId)){
      extinctShown.add(d.stammId);
      addHeadline(`⚰️ Drama! Stamm ${d.stammId} stirbt komplett aus.`);
    }
  });

  Events.on(EVT.HUNGER_CRISIS, (d)=>{
    addHeadline('🔥 Hungersnot! Mehr als 10 Zellen sterben in einer Minute.');
  });

  Events.on(EVT.OVERPOP, ()=>{
    addHeadline('🐝 Überbevölkerung! Das Labor platzt aus allen Nähten.');
  });
}