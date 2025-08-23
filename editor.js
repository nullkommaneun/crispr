// editor.js — robuster CRISPR-Editor (Liste + Detail, advisor optional)

import { getCells } from './entities.js';

let overlay = null;
let advisorMod = null;

// interner UI-Status
const ui = {
  open: false,
  selectedId: null,
  advisorMode: 'off' // 'off' | 'heuristic' | 'model' (wenn dein advisor das unterstützt)
};

// advisor on-demand laden (optional)
async function ensureAdvisor(){
  if (advisorMod) return advisorMod;
  try { advisorMod = await import('./advisor.js'); }
  catch { advisorMod = null; }
  return advisorMod;
}

/* ===================== Public API ===================== */

export async function openEditor(){
  if (ui.open) { try{ render(); }catch{} return; }
  ui.open = true;

  overlay = document.createElement('div');
  overlay.id = 'editor-overlay';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,.55);' +
    'display:flex;align-items:flex-start;justify-content:center;padding:24px;';
  overlay.addEventListener('click', (e)=>{ if (e.target===overlay) closeEditor(); });

  const panel = document.createElement('div');
  panel.id = 'editor-panel';
  panel.style.cssText =
    'max-width:1100px;width:94%;background:#10161d;border:1px solid #2a3b4a;border-radius:12px;' +
    'color:#d6e1ea;padding:14px;box-shadow:0 30px 70px rgba(0,0,0,.45);display:grid;' +
    'grid-template-columns: 1fr 380px; gap:12px; max-height: 86vh; overflow:hidden;';
  overlay.appendChild(panel);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Schließen';
  closeBtn.style.cssText =
    'position:absolute;top:10px;right:10px;background:#243241;color:#cfe6ff;border:1px solid #47617a;' +
    'border-radius:8px;padding:6px 10px;';
  closeBtn.onclick = closeEditor;
  overlay.appendChild(closeBtn);

  document.body.appendChild(overlay);
  await ensureAdvisor();
  render();
}

export function closeEditor(){
  ui.open = false;
  overlay?.remove();
  overlay = null;
}

export async function setAdvisorMode(mode){
  ui.advisorMode = mode || 'off';
  const adv = await ensureAdvisor();
  try { adv?.setMode?.(ui.advisorMode); } catch {}
  render();
}

export function getAdvisorMode(){ return ui.advisorMode; }

/* ===================== Render ===================== */

function el(id){ return document.getElementById(id); }
function ce(tag, html, css){ const n=document.createElement(tag); if (html!=null) n.innerHTML=html; if (css) n.style.cssText=css; return n; }

function traitRow(name, key, val, onChange){
  const wrap = ce('div','', 'margin:8px 0; display:grid; grid-template-columns: 46px 1fr 38px; gap:8px; align-items:center;');
  const lbl  = ce('div', name);
  const rng  = ce('input');
  rng.type='range'; rng.min='1'; rng.max='10'; rng.step='1'; rng.value = String(val|0);
  const out  = ce('div', String(val|0), 'text-align:right; opacity:.85;');
  rng.addEventListener('input', (e)=>{ const v=+e.target.value|0; out.textContent=String(v); onChange(v); });
  wrap.append(lbl); wrap.append(rng); wrap.append(out);
  return wrap;
}

function safeScore(cell){
  try{
    if (!advisorMod) return null;
    if (advisorMod.scoreCell) return advisorMod.scoreCell(cell);
    if (advisorMod.sortCells) return null; // nur Liste
  }catch{}
  return null;
}

function sortForList(cells){
  try{
    if (advisorMod?.sortCells) return advisorMod.sortCells(cells.slice());
  }catch{}
  // Fallback: nach Energie absteigend
  return cells.slice().sort((a,b)=>(b.energy|0)-(a.energy|0));
}

function selectFirstIfNeeded(cells){
  if (!cells || cells.length===0){ ui.selectedId = null; return; }
  if (ui.selectedId==null || !cells.some(c=>c.id===ui.selectedId)){
    ui.selectedId = cells[0].id;
  }
}

function render(){
  try{
    const panel = overlay?.querySelector('#editor-panel');
    if (!panel){ return; }

    const cells = getCells() || [];
    selectFirstIfNeeded(cells);

    // linke Seite: Detail
    const left = ce('div','', 'overflow:auto; padding-right:6px;');
    const sel = cells.find(c=>c.id===ui.selectedId) || null;

    if (!sel){
      left.append(ce('div','<b>Keine Zelle gefunden.</b><br>Die Simulation scheint noch nicht erzeugt zu haben.',
        'opacity:.9;padding:8px;'));
    }else{
      const score = safeScore(sel);
      left.append(ce('h3', `${sel.name||('C'+sel.id)} <span style="opacity:.7;font-weight:400;">${sel.sex||'-'}</span>`));
      left.append(ce('div', `Stamm ${sel.stammId??'–'} · E:${sel.energy|0} · Alter:${(sel.age||0)|0}s · Score:${score!=null?score.toFixed(2):'–'}`,
        'opacity:.85;margin:-4px 0 8px;'));

      // Traits editieren
      left.append(traitRow('TEM','TEM', sel.genome.TEM, (v)=>{ sel.genome.TEM=v|0; }));
      left.append(traitRow('GRÖ','GRÖ', sel.genome['GRÖ'], (v)=>{ sel.genome['GRÖ']=v|0; }));
      left.append(traitRow('EFF','EFF', sel.genome.EFF, (v)=>{ sel.genome.EFF=v|0; }));
      left.append(traitRow('SCH','SCH', sel.genome.SCH, (v)=>{ sel.genome.SCH=v|0; }));
      left.append(traitRow('MET','MET', sel.genome.MET, (v)=>{ sel.genome.MET=v|0; }));

      left.append(ce('div','<div style="height:6px;"></div>'));
      // Advisor-Modus Umschalter (falls genutzt)
      const advWrap = ce('div','', 'display:flex; gap:8px; align-items:center;');
      const m = ui.advisorMode;
      ['off','heuristic','model'].forEach(md=>{
        const b = ce('button', md, 'background:#243241;border:1px solid #3a5166;border-radius:10px;padding:6px 10px;cursor:pointer;'
          + (m===md?'filter:brightness(1.2);':''));
        b.addEventListener('click', ()=> setAdvisorMode(md));
        advWrap.append(b);
      });
      left.append(ce('div','Advisor-Modus', 'opacity:.8;margin:8px 0 2px;'));
      left.append(advWrap);
    }

    // rechte Seite: Liste + Suche
    const right = ce('div','', 'overflow:auto;border-left:1px solid rgba(70,96,120,.25);padding-left:10px;');
    right.append(ce('div','<b>Zellen</b>', 'margin-bottom:6px;'));
    const list = ce('div','', 'display:flex;flex-direction:column;gap:6px;');

    const sorted = sortForList(cells);
    sorted.forEach(c=>{
      const row = ce('div','', 'border:1px solid #354b60;border-radius:10px;padding:8px;cursor:pointer;'
        + (c.id===ui.selectedId?'outline:2px solid #5fa8ff;':''));
      row.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:8px;">
          <div><b>${c.name||('C'+c.id)}</b> <span style="opacity:.75;">${c.sex||'-'}</span></div>
          <div style="opacity:.75;">E:${c.energy|0} · Alter:${(c.age||0)|0}s</div>
        </div>
        <div style="opacity:.7;margin-top:2px;">Stamm ${c.stammId??'–'} · TEM:${c.genome.TEM} · GRÖ:${c.genome['GRÖ']} · EFF:${c.genome.EFF} · SCH:${c.genome.SCH} · MET:${c.genome.MET}</div>
      `;
      row.addEventListener('click', ()=>{ ui.selectedId=c.id; render(); });
      list.append(row);
    });

    if (sorted.length===0){
      list.append(ce('div','Keine Zellen vorhanden.', 'opacity:.8;'));
    }
    right.append(list);

    // Panel-Grid befüllen
    panel.innerHTML = '';
    const head = ce('div', '<b>CRISPR-Editor</b>', 'grid-column:1 / -1;margin-bottom:4px;');
    panel.append(head);
    panel.append(left);
    panel.append(right);
  }catch(err){
    // robust: zeige Fehlbox, aber crashe nicht
    console.error('[editor] render failed', err);
    const panel = overlay?.querySelector('#editor-panel');
    if (panel){
      panel.innerHTML = `<pre style="white-space:pre-wrap;color:#ffb3b3;background:#1a0f10;border:1px solid #5a2b30;border-radius:10px;padding:10px;">
[Editor-Fehler]
${String(err && err.stack || err)}
</pre>`;
    }
  }
}