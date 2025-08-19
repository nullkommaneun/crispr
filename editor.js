// editor.js
// CRISPR-Editor: rechts lebende Zellen + Prognose; Klick übernimmt Traits links.
// "Übernehmen" erzeugt sofort eine neue Zelle mit neuem Stamm.
// Advisor-Steuerung wurde hierher verlegt (Modus: Aus • Heuristik • Modell).

import { createCell, newStammId, cells } from './entities.js';
import { TRAITS, createGenome } from './genetics.js';
import { Events, EVT } from './events.js';
import { predictProbability, getStatusLabel, cycleAdvisorMode, loadModelFromUrl, setEnabled, setUseModel } from './advisor.js';

const current = { TEM:5, GRO:5, EFF:5, SCH:5 }; // aktuell editierte Absolutwerte
let selectedId = null;

function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

export function initEditor(){
  const dlg = document.getElementById('editorModal');
  const form = document.getElementById('editorForm');
  const closeBtn = document.getElementById('editorClose');
  const list = document.getElementById('editorCellList');
  const advisorLbl = document.getElementById('editorAdvisorStatus');
  const btnToggle = document.getElementById('editorAdvisorToggle');
  const modelUrl = document.getElementById('editorModelUrl');
  const btnLoad = document.getElementById('editorModelLoad');

  // Stepper-Buttons: ändern Absolute (1..9)
  for(const row of document.querySelectorAll('.traitRow')){
    const trait = row.dataset.trait;
    const out = row.querySelector('.val');
    out.textContent = String(current[trait]);
    row.querySelector('.dec').addEventListener('click', ()=>{
      current[trait] = clamp(current[trait]-1, 1, 9);
      out.textContent = String(current[trait]);
    });
    row.querySelector('.inc').addEventListener('click', ()=>{
      current[trait] = clamp(current[trait]+1, 1, 9);
      out.textContent = String(current[trait]);
    });
  }

  function setFromGenome(g){
    for(const t of TRAITS){ current[t] = clamp(Math.round(g[t]||5),1,9); }
    for(const row of document.querySelectorAll('.traitRow')){
      const trait = row.dataset.trait;
      row.querySelector('.val').textContent = String(current[trait]);
    }
  }

  function refreshAdvisorUI(){
    advisorLbl.textContent = getStatusLabel().replace('Berater: ','');
  }

  function refreshList(){
    refreshAdvisorUI();
    list.innerHTML = '';
    const alive = cells.filter(c=>!c.dead);
    for(const c of alive){
      const p = Math.round(predictProbability(c.genes)*100);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'cellCard selectable' + (selectedId===c.id?' active':'');
      const name = c.name;
      card.innerHTML = `
        <span class="id">${name} <small class="mono">• Stamm ${c.stammId}</small></span>
        <span class="score">${p}<small>%</small></span>`;
      card.addEventListener('click', ()=>{
        selectedId = c.id;
        setFromGenome(c.genes);
        for(const el of list.querySelectorAll('.cellCard')) el.classList.remove('active');
        card.classList.add('active');
      });
      list.appendChild(card);
    }
  }
  refreshList();

  Events.on(EVT.BIRTH, refreshList);
  Events.on(EVT.DEATH, refreshList);
  Events.on(EVT.STATUS, refreshAdvisorUI);

  // Formular-Submit => neue Zelle erzeugen (neuer Stamm), Dialog bleibt offen
  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const genome = createGenome({...current});
    const stamm = newStammId();
    const c = createCell({
      x: Math.random()*800, y: Math.random()*520,
      genes: genome,
      stammId: stamm,
      energy: 22
    });
    Events.emit(EVT.TIP, { label:'Editor', text:`Neue Zelle #${c.id} als neuer Stamm ${stamm} erzeugt.` });
    refreshList();
  });

  // Advisor-Modus umschalten (Off → Heuristik → Modell → Heuristik …)
  btnToggle.addEventListener('click', async ()=>{
    const mode = await cycleAdvisorMode(modelUrl.value.trim() || undefined);
    // Falls nach dem Laden eines Modells weiter heuristisch gewünscht:
    // – hier nichts weiter, Toggle regelt die Reihenfolge.
    refreshAdvisorUI();
    refreshList();
  });

  // Modell aus URL laden (erzwingt „Modell aktiv“)
  btnLoad.addEventListener('click', async ()=>{
    const url = modelUrl.value.trim();
    if(!url) return;
    try{
      await loadModelFromUrl(url);
      setEnabled(true);
      setUseModel(true);
      refreshAdvisorUI();
      refreshList();
      Events.emit(EVT.STATUS, { source:'editor', text:'KI‑Modell geladen' });
    }catch(err){
      Events.emit(EVT.TIP, { label:'Advisor', text:'Modell konnte nicht geladen werden.' });
      console.error('[CRISPR] Modell laden fehlgeschlagen', err);
    }
  });

  // Close
  closeBtn.addEventListener('click', ()=>{
    if (dlg && dlg.close) dlg.close('cancel'); else if (dlg) dlg.removeAttribute('open');
  });
}

export function openEditor(){
  const dlg = document.getElementById('editorModal');
  if (!dlg) return;
  if (dlg.showModal) dlg.showModal();
  else dlg.setAttribute('open','');
}