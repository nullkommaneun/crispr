import { getCells } from "./entities.js";
import { setMode, getMode, sortCells } from "./advisor.js";
import { emit, on } from "./event.js";

const panel = document.getElementById("editorPanel");

function traitRow(label, min, max, value, onChange){
  const div = document.createElement("div"); div.className="row";
  const name=document.createElement("span"); name.textContent=label;
  const r = document.createElement("input"); r.type="range"; r.min=min; r.max=max; r.step=1; r.value=value;
  r.oninput = ()=> onChange(parseInt(r.value,10));
  div.append(name,r);
  return div;
}

let selectedId = null;

function render(){
  panel.innerHTML="";
  panel.classList.remove("hidden");
  const head = document.createElement("div");
  head.innerHTML = `<h2>CRISPR‑Editor</h2><div class="muted">Berät Zellen und passt Traits an.</div>`;
  panel.append(head);

  // Advisor Mode
  const advisorRow=document.createElement("div"); advisorRow.className="row";
  advisorRow.innerHTML = `<span>Advisor‑Modus</span>`;
  const select=document.createElement("select");
  for(const m of ["off","heuristic","model"]){
    const o=document.createElement("option"); o.value=m; o.textContent=m;
    if(getMode()===m) o.selected=true;
    select.append(o);
  }
  select.oninput=()=>{ setMode(select.value); render(); };
  advisorRow.append(select);
  panel.append(advisorRow);

  const list = document.createElement("div"); list.className="list";
  const cells = sortCells(getCells());

  for(const c of cells){
    const item=document.createElement("div"); item.className="cellItem";
    item.style.borderLeft = `4px solid ${c.color}`;
    item.innerHTML = `
      <div class="name">${c.name} <span class="badge">${c.sex}</span></div>
      <div class="meta">Stamm ${c.stammId} · E:${c.energy.toFixed(0)} · Alter:${c.age.toFixed(0)}s · Score:${(Math.round(10*window.__score(c))/10).toFixed(1)}</div>
    `;
    item.onclick=()=>{ selectedId=c.id; renderDetails(c); };
    // für Score-Anzeige im Item:
    window.__score = (cell)=> (getMode()==="off"?0: (getMode()==="heuristic"? (cell.genome.EFF + .6*cell.genome.TEM) : (cell.genome.EFF + cell.genome.TEM)));
    list.append(item);
  }
  panel.append(list);

  if(selectedId){
    const sel = cells.find(x=>x.id===selectedId);
    if(sel) renderDetails(sel);
  }

  const close=document.createElement("button");
  close.textContent="Schließen";
  close.onclick=()=>panel.classList.add("hidden");
  panel.append(close);
}

function renderDetails(cell){
  const box=document.createElement("div");
  box.style.marginTop="8px"; box.style.padding="8px"; box.style.border="1px solid #2a3a46"; box.style.borderRadius="8px";
  box.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
    <b>Bearbeite: ${cell.name}</b>
    <span class="badge">Stamm ${cell.stammId}</span>
  </div>`;
  const g = cell.genome;

  box.append(
    traitRow("TEM",1,10,g.TEM, v=>{ g.TEM=v; emit("cell:edited",{id:cell.id}); }),
    traitRow("GRÖ",1,10,g.GRÖ, v=>{ g.GRÖ=v; }),
    traitRow("EFF",1,10,g.EFF, v=>{ g.EFF=v; }),
    traitRow("SCH",1,10,g.SCH, v=>{ g.SCH=v; }),
    traitRow("MET",1,10,g.MET, v=>{ g.MET=v; }),
  );
  panel.append(box);
}

export function openEditor(){ render(); }
export function closeEditor(){ panel.classList.add("hidden"); }
export function setAdvisorMode(mode){ setMode(mode); }
export function getAdvisorMode(){ return getMode(); }

// refresh list on events
on("cells:born", ()=>{ if(!panel.classList.contains("hidden")) render(); });
on("cells:died", ()=>{ if(!panel.classList.contains("hidden")) render(); });