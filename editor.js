// editor.js – CRISPR-Editor (robust, keine Null-Zugriffe)
import * as Entities from './entities.js';
import { showError } from './errorManager.js';
import * as Advisor from './advisor.js'; // optional; defensive checks

let dlg, listEl;
const TRAITS = ['TEM','GRO','EFF','SCH','MET']; // 5. Trait: Metabolismus
let current = { TEM:5, GRO:5, EFF:5, SCH:5, MET:5 };

function q(sel){ return dlg?.querySelector(sel) || null; }

function writeTraitOut(t){
  const out = q(`[data-out="${t}"]`);
  if (out) out.textContent = String(current[t]);
}
function clamp(v,min=1,max=9){ return Math.max(min, Math.min(max, v|0)); }

function readCellsSnapshot(){
  // Fallbacks – wir greifen nur lesend zu
  const snap = (Entities.getLivingSnapshot?.() ||
                Entities.getCellsSnapshot?.() ||
                []).map(c=>({
                  id: c.id,
                  name: c.name || `Zelle #${c.id}`,
                  stammId: c.stammId ?? c.stamm ?? 0,
                  genes: c.genes || c,
                  score: c.prediction || null
                }));
  return snap;
}

function populateList(){
  if (!listEl) return;
  listEl.innerHTML = '';
  const cells = readCellsSnapshot();
  for (const c of cells){
    const li = document.createElement('li');
    li.className = 'row';
    li.innerHTML = `
      <button class="cellBtn" data-id="${c.id}">
        <span class="label">${c.name} • Stamm ${c.stammId}</span>
        <span class="score">${c.score!=null ? Math.round(c.score*100) : '–'}%</span>
      </button>`;
    listEl.appendChild(li);
  }
  listEl.querySelectorAll('.cellBtn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = Number(btn.getAttribute('data-id'));
      const sel = readCellsSnapshot().find(x=>x.id===id);
      if (sel?.genes){
        for (const t of TRAITS){
          current[t] = clamp(sel.genes[t] ?? current[t]);
          writeTraitOut(t);
        }
      }
    });
  });
}

function bindSteppers(){
  TRAITS.forEach(t=>{
    q(`[data-dec="${t}"]`)?.addEventListener('click', ()=>{ current[t]=clamp(current[t]-1); writeTraitOut(t); });
    q(`[data-inc="${t}"]`)?.addEventListener('click', ()=>{ current[t]=clamp(current[t]+1); writeTraitOut(t); });
    writeTraitOut(t);
  });
}

function applySpawn(){
  try{
    const genes = {...current};
    // „immer neuer Stamm“ – wir geben ein Flag mit, Entities soll neuen Stamm vergeben
    const spawn = Entities.spawnFromEditor
               || Entities.createCellFromEditor
               || ((g)=>Entities.createCell?.({ name:'Editor', genes:g, newStamm:true }));

    if (typeof spawn !== 'function') throw new Error('Spawn-API nicht verfügbar (Entities).');
    spawn(genes);
    // leichte Rückmeldung
    q('#editorNotice')?.classList.add('flash');
    setTimeout(()=>q('#editorNotice')?.classList.remove('flash'), 350);
    populateList();
  }catch(err){
    showError('Editor: Erzeugen fehlgeschlagen', err);
  }
}

function initAdvisorBox(){
  const box = q('#advisorBox');
  if (!box) return;

  const label = q('#advisorStatus');
  function updateLabel(mode){
    const txt = mode==='model' ? 'Modell (TensorFlow.js)' :
                mode==='heuristic' ? 'Heuristik' : 'Aus';
    if (label) label.textContent = txt;
  }
  const getMode = Advisor.getAdvisorMode || Advisor.getMode;
  const setMode = Advisor.setAdvisorMode || Advisor.setMode;
  updateLabel(getMode?.() || 'off');

  q('#advToggle')?.addEventListener('click', ()=>{
    const cur = getMode?.() || 'off';
    const next = cur==='off' ? 'heuristic' : cur==='heuristic' ? 'model' : 'off';
    setMode?.(next);
    updateLabel(next);
  });

  q('#advLoad')?.addEventListener('click', async ()=>{
    try{
      const path = (q('#advPath')?.value || '').trim();
      if (!path) return;
      if (Advisor.tryLoadTF) await Advisor.tryLoadTF(path);
      else if (Advisor.loadModelFromPath) await Advisor.loadModelFromPath(path);
      updateLabel('model');
    }catch(e){ showError('KI-Modell konnte nicht geladen werden', e); }
  });
}

export function initEditor(){
  dlg = document.getElementById('editorModal');
  if (!dlg) return; // falls HTML das Modal (noch) nicht enthält

  listEl = dlg.querySelector('#editorCellList');

  bindSteppers();
  populateList();
  initAdvisorBox();

  // Buttons
  q('#editorApply')?.addEventListener('click', applySpawn);
  q('#editorClose')?.addEventListener('click', ()=>{ if(dlg.close) dlg.close('cancel'); else dlg.removeAttribute('open'); });

  // Öffnen per Toolbar
  document.getElementById('btnEditor')?.addEventListener('click', openEditor);
}

export function openEditor(){
  if (!dlg) { showError('Editor-Dialog fehlt in index.html'); return; }
  populateList();
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open','');
}