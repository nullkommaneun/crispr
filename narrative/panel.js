// narrative/panel.js
// Dramatische Schlagzeilen im Zeitungsstil, getriggert durch Ereignisse.

import { Events, EVT } from '../events.js';
import { getFoundersState } from '../entities.js';

export function initNarrativePanel(){
  const panel = document.getElementById('narrativePanel');
  if(!panel) throw new Error('Narrative-Panel fehlt.');

  function addHeadline(text, source='CRISPR News'){
    const time = new Date().toLocaleTimeString();
    const el = document.createElement('div');
    el.className = 'headline';
    el.innerHTML = `<span>🧬 <strong>${escapeHtml(text)}</strong></span> <span class="src">— ${source}, ${time}</span>`;
    panel.prepend(el);
    // Panel nach oben scrollbar lassen, aber neue Headlines oben anfügen
  }

  Events.on(EVT.MATE, (d)=>{
    const rel = d.relatedness || 0;
    const degree = kinLabel(rel);
    if(degree === 'Cousine/Cousin'){
      addHeadline(`📰 Skandal! Zelle #${d.aId} paart sich mit Cousine – Experten warnen.`);
    } else {
      addHeadline(`⚡ Paarung! Zelle #${d.aId} und #${d.bId} zeugen Nachwuchs #${d.childId}.`);
    }
    const founders = getFoundersState();
    if(founders.foundersEverMated){
      addHeadline('❤️ Liebesgeschichte! Adam und Eva noch immer vereint.', 'DNA Daily');
    }
  });

  Events.on(EVT.MUTATION, (m)=>{
    if(m.negative){
      addHeadline('🧪 Mutation-Alarm! Neue Zelle zeigt unerwartete Schwäche.');
    }else{
      addHeadline('🧪 Mutation-Alarm! Neue Zelle zeigt ungeahnte Stärke.');
    }
  });

  Events.on(EVT.DEATH, (d)=>{
    addHeadline(`⚰️ Drama! Zelle #${d.id} verendet.`, 'DNA Daily');
  });

  Events.on(EVT.OVERPOP, ()=>{
    addHeadline('🐝 Überbevölkerung! Das Labor platzt aus allen Nähten.');
  });

  Events.on(EVT.HUNGER_CRISIS, ()=>{
    addHeadline('🔥 Hungersnot! Mehr als 10 Zellen sterben in einer Minute.');
  });
}

function kinLabel(r){
  // grobe Zuordnung
  if(r >= 0.5) return 'Elternteil/Geschwister';
  if(r >= 0.25) return 'Halbgeschwister';
  if(r >= 0.125) return 'Cousine/Cousin';
  return 'fern';
}
function escapeHtml(s){ return String(s).replace(/[<>&"]/g, m => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[m])); }