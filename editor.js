// editor.js
import { getCells, createCell, createGenome } from './entities.js';
import { scoreCells, getAdvisorMode, setAdvisorMode, loadModel, isModelLoaded } from './advisor.js';

let $overlay=null;

function h(html){ const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstChild; }

function traitRow(key,label,val){
  return `
    <div class="row" data-trait="${key}">
      <span class="lbl">${label}</span>
      <button data-delta="-1">-1</button>
      <span class="val">${val}</span>
      <button data-delta="+1">+1</button>
      <span class="hint" title="Abhängigkeiten werden automatisch berücksichtigt">?</span>
    </div>`;
}

function tplEditor(){
  const g = {TEM:5,GRO:5,EFF:5,SCH:5,MET:5};
  return `
  <div class="modal editor-modal">
    <div class="panel">
      <div class="hd">
        <strong>CRISPR‑Editor</strong>
        <button class="close">×</button>
      </div>
      <div class="body">
        <div class="left">
          <h4>Traits anpassen</h4>
          ${traitRow('TEM','TEM – Tempo',g.TEM)}
          ${traitRow('GRO','GRO – Größe',g.GRO)}
          ${traitRow('EFF','EFF – Effizienz',g.EFF)}
          ${traitRow('SCH','SCH – Schutz',g.SCH)}
          ${traitRow('MET','MET – Metabolismus',g.MET)}
          <button class="apply primary">Übernehmen</button>
          <p class="hint">Neue Zellen aus dem Editor starten immer als <em>neuer Stamm</em>.</p>
        </div>
        <div class="right">
          <h4>Lebende Zellen • Prognose</h4>
          <div class="cells list"></div>
          <div class="advisor">
            <div class="row">
              <span>KI‑Advisor:</span>
              <span class="state">Aus</span>
            </div>
            <div class="row">
              <button class="mode">Modus: Umschalten</button>
              <input class="modelUrl" value="models/model.json" />
              <button class="loadModel">Modell laden</button>
            </div>
            <div class="row small">Modi: Aus • Heuristik • Modell (TensorFlow.js)</div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function readTraits($root){
  const vals={};
  $root.querySelectorAll('.left .row[data-trait]').forEach(r=>{
    const k=r.dataset.trait;
    const v=parseInt(r.querySelector('.val').textContent,10);
    vals[k]=v;
  });
  return vals;
}

function bindTraitButtons($root){
  $root.querySelectorAll('.left .row[data-trait]').forEach(r=>{
    r.addEventListener('click', (ev)=>{
      const btn = ev.target.closest('button[data-delta]');
      if (!btn) return;
      const valEl = r.querySelector('.val');
      let v = parseInt(valEl.textContent,10)||5;
      v += (btn.dataset.delta==='+1'?+1:-1);
      v = Math.max(1, Math.min(9, v));
      valEl.textContent = v;
    });
  });
}

async function refreshList($root){
  const list = $root.querySelector('.list');
  const cells = getCells();
  const scored = await scoreCells(cells);
  // „bewertet zuerst, dann rest“ + absteigend
  scored.sort((a,b)=>{
    if (a.score==null && b.score!=null) return 1;
    if (b.score==null && a.score!=null) return -1;
    return (b.score??-1) - (a.score??-1);
  });
  list.innerHTML = scored.map(s=>{
    const c = cells.find(x=>x.id===s.id);
    const badge = (s.score==null?'—':`${s.score}%`);
    return `<button class="item" data-id="${c.id}">
      <span class="nm">${c.name}</span>
      <span class="st">Stamm ${c.stammId}</span>
      <span class="sc">${badge}</span>
    </button>`;
  }).join('') || '<div class="empty">Keine Zellen vorhanden.</div>';

  list.querySelectorAll('.item').forEach(el=>{
    el.addEventListener('click', ()=>{
      const id = parseInt(el.dataset.id,10);
      const c = cells.find(x=>x.id===id);
      if (!c) return;
      // Traits links übernehmen
      for (const k of ['TEM','GRO','EFF','SCH','MET']) {
        const row = $root.querySelector(`.left .row[data-trait="${k}"] .val`);
        if (row) row.textContent = c.genes[k];
      }
    });
  });

  // Advisor Status
  const state = $root.querySelector('.advisor .state');
  const m = getAdvisorMode();
  state.textContent = (m==='off' ? 'Aus' : (m==='heuristic' ? 'Heuristik' : (isModelLoaded()?'Modell':'Modell (nicht geladen)')));
}

function bindAdvisorControls($root){
  $root.querySelector('.mode').addEventListener('click', async ()=>{
    const curr = getAdvisorMode();
    const next = (curr==='off'?'heuristic':(curr==='heuristic'?'model':'off'));
    setAdvisorMode(next);
    await refreshList($root);
  });
  $root.querySelector('.loadModel').addEventListener('click', async ()=>{
    const url = $root.querySelector('.modelUrl').value.trim();
    const ok = await loadModel(url);
    setAdvisorMode(ok?'model':'heuristic');
    await refreshList($root);
  });
}

export async function openEditor() {
  if ($overlay) return;
  $overlay = h(tplEditor());
  document.body.appendChild($overlay);

  // Close
  $overlay.querySelector('.close').addEventListener('click', closeEditor);

  // Traits
  bindTraitButtons($overlay);

  // Apply => neue Zelle als neuer Stamm
  $overlay.querySelector('.apply').addEventListener('click', async ()=>{
    const g = readTraits($overlay);
    createCell({ genes:g, name:`Zelle #neu`, energy:70, stammId:undefined }); // stammId -> neu
    await refreshList($overlay);
  });

  bindAdvisorControls($overlay);
  await refreshList($overlay);
}

export function closeEditor(){
  if ($overlay) { $overlay.remove(); $overlay=null; }
}