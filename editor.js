import { getCells } from "./entities.js";
import { setMode, getMode, sortCells, scoreCell } from "./advisor.js";
import { emit, on } from "./event.js";

const panel = document.getElementById("editorPanel");

let selectedId = null;

/* UI helpers */
function traitRow(label, min, max, value, onChange){
  const div = document.createElement("div");
  div.className = "row";
  const name = document.createElement("span");
  name.textContent = label;

  const val = document.createElement("span");
  val.className = "badge";
  val.textContent = value;

  const r = document.createElement("input");
  r.type = "range"; r.min = min; r.max = max; r.step = 1; r.value = value;
  r.oninput = () => { val.textContent = r.value; onChange(parseInt(r.value,10)); };

  div.append(name, r, val);
  return div;
}

function render(){
  panel.innerHTML = "";
  panel.classList.remove("hidden");

  const head = document.createElement("div");
  head.innerHTML = `<h2>CRISPR-Editor</h2><div class="muted">Berät Zellen und passt Traits an.</div>`;
  panel.append(head);

  // Advisor Mode selector
  const advisorRow = document.createElement("div"); advisorRow.className = "row";
  const lab = document.createElement("span"); lab.textContent = "Advisor-Modus";
  const select = document.createElement("select");
  for(const m of ["off","heuristic","model"]){
    const o = document.createElement("option"); o.value = m; o.textContent = m;
    if(getMode() === m) o.selected = true;
    select.append(o);
  }
  select.oninput = () => { setMode(select.value); render(); };
  advisorRow.append(lab, select);
  panel.append(advisorRow);

  // Ranked list
  const list = document.createElement("div"); list.className = "list";
  const cells = sortCells(getCells());
  const mode = getMode();

  for(const c of cells){
    const item = document.createElement("div"); item.className = "cellItem";
    item.style.borderLeft = `4px solid ${c.color}`;

    const sc = (mode === "off") ? null : scoreCell(c);
    const scText = (sc == null) ? "–" : (Math.round(sc*10)/10).toFixed(1);

    item.innerHTML = `
      <div class="name">${c.name} <span class="badge">${c.sex}</span></div>
      <div class="meta">Stamm ${c.stammId} · E:${c.energy.toFixed(0)} · Alter:${c.age.toFixed(0)}s · Score:${scText}</div>
    `;
    item.onclick = () => { selectedId = c.id; renderDetails(c); };
    list.append(item);
  }
  panel.append(list);

  if(selectedId){
    const sel = cells.find(x => x.id === selectedId);
    if(sel) renderDetails(sel);
  }

  const close = document.createElement("button");
  close.textContent = "Schließen";
  close.onclick = () => panel.classList.add("hidden");
  panel.append(close);
}

function renderDetails(cell){
  // remove old details (if any)
  const old = panel.querySelector(".cellDetailsBox");
  if(old) old.remove();

  const box = document.createElement("div");
  box.className = "cellDetailsBox";
  box.style.marginTop = "8px";
  box.style.padding = "8px";
  box.style.border = "1px solid #2a3a46";
  box.style.borderRadius = "8px";

  box.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
    <b>Bearbeite: ${cell.name}</b>
    <span class="badge">Stamm ${cell.stammId}</span>
  </div>`;

  const g = cell.genome;
  const emitEdit = () => emit("cell:edited", { id: cell.id });

  box.append(
    traitRow("TEM", 1, 10, g.TEM, v => { g.TEM = v; emitEdit(); }),
    traitRow("GRÖ", 1, 10, g.GRÖ, v => { g.GRÖ = v; emitEdit(); }),
    traitRow("EFF", 1, 10, g.EFF, v => { g.EFF = v; emitEdit(); }),
    traitRow("SCH", 1, 10, g.SCH, v => { g.SCH = v; emitEdit(); }),
    traitRow("MET", 1, 10, g.MET, v => { g.MET = v; emitEdit(); }),
  );

  // What-if Score (live)
  const scoreLine = document.createElement("div");
  scoreLine.className = "muted";
  const updScore = () => {
    const sc = (getMode()==="off") ? null : scoreCell(cell);
    scoreLine.textContent = `Prognose-Score: ${sc==null ? "–" : (Math.round(sc*10)/10).toFixed(1)}`;
  };
  updScore();
  box.append(scoreLine);

  panel.append(box);
}

/* Public API */
export function openEditor(){ render(); }
export function closeEditor(){ panel.classList.add("hidden"); }
export function setAdvisorMode(mode){ setMode(mode); }
export function getAdvisorMode(){ return getMode(); }

/* Auto-refresh on changes */
on("cells:born", () => { if(!panel.classList.contains("hidden")) render(); });
on("cells:died", () => { if(!panel.classList.contains("hidden")) render(); });
on("cell:edited", () => { if(!panel.classList.contains("hidden")) render(); });