// editor.js – CRISPR-Editor: rechts lebende Zellen + Prognose; Klick übernimmt Traits links.

import { createCell, newStammId, cells } from './entities.js';
import { TRAITS, createGenome } from './genetics.js';
import { Events, EVT } from './event.js';
import {
  predictProbability, getStatusLabel, cycleAdvisorMode,
  loadModelFromUrl, setEnabled, setUseModel, isEnabled, isModelLoaded
} from './advisor.js';

const current = { TEM:5, GRO:5, EFF:5, SCH:5 };
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

  // Default-Pfad für das Modell
  if(modelUrl) modelUrl.value = 'models/model.json';

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

  function formatScore(p){
    if(p == null) return '–';
    const pct = Math.round(p*100);
    return `${pct}<small>%</small>`;
  }

  function refreshList(){
    refreshAdvisorUI();
    list.innerHTML = '';
    const alive = cells.filter(c=>!c.dead);
    for(const c of alive){
      const p = predictProbability(c.genes); // null, 0..1
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'cellCard selectable' + (selectedId===c.id?' active':'');
      card.innerHTML = `
        <span class="id">${c.name} <small class="mono">• Stamm ${c.stammId}</small></span>
        <span class="score">${formatScore(p)}</span>`;
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

  btnToggle.addEventListener('click', async ()=>{
    const next = await cycleAdvisorMode(modelUrl.value.trim() || 'models/model.json');
    refreshAdvisorUI(); refreshList();
  });

  btnLoad.addEventListener('click', async ()=>{
    const url = modelUrl.value.trim() || 'models/model.json';
    try{
      await loadModelFromUrl(url);
      setEnabled(true); setUseModel(true);
      refreshAdvisorUI(); refreshList();
      Events.emit(EVT.STATUS, { source:'editor', text:'KI‑Modell geladen' });
    }catch(err){
      Events.emit(EVT.TIP, { label:'Advisor', text:'Modell konnte nicht geladen werden.' });
      console.error('[CRISPR] Modell laden fehlgeschlagen', err);
    }
  });

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