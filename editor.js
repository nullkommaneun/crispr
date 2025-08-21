import { getCells } from "./entities.js";
import { setMode, getMode, sortCells, scoreCell } from "./advisor.js";
import { emit, on } from "./event.js";

const panel = document.getElementById("editorPanel");

// State
let selectedId = null;

/* ---------- UI helpers ---------- */
function badge(txt){ const s=document.createElement("span"); s.className="badge"; s.textContent=txt; return s; }
function row(label, right){
  const div = document.createElement("div");
  div.className = "row";
  const l = document.createElement("span"); l.textContent = label;
  div.append(l, right);
  return div;
}
function slider(min,max,step,value,on){
  const wrap=document.createElement("div");
  wrap.style.display="flex"; wrap.style.alignItems="center"; wrap.style.gap="8px";
  const val = badge(value);
  const r = document.createElement("input");
  r.type="range"; r.min=min; r.max=max; r.step=step; r.value=value;
  r.oninput = ()=>{ val.textContent=r.value; on(parseInt(r.value,10)); };
  wrap.append(r, val);
  return wrap;
}
function buildHeader(title){
  const header=document.createElement("div");
  header.className="panel-header";
  const h2=document.createElement("h2"); h2.textContent=title;
  const close=document.createElement("button"); close.className="closeX"; close.innerHTML="&times;";
  close.onclick=()=>panel.classList.add("hidden");
  header.append(h2, close);
  return header;
}

/* ---------- Render ---------- */
export function openEditor(){ render(); }
export function closeEditor(){ panel.classList.add("hidden"); }
export function setAdvisorMode(mode){ setMode(mode); }
export function getAdvisorMode(){ return getMode(); }

function render(){
  const cells = getCells();
  if (!cells.length) return;

  // Fallback-Auswahl
  if(!selectedId || !cells.some(c=>c.id===selectedId)) selectedId = cells[0].id;

  // Panel-Grundgerüst
  panel.innerHTML = "";
  panel.classList.remove("hidden");
  panel.append(buildHeader("CRISPR-Editor"));

  const body = document.createElement("div");
  body.className = "panel-body editor-body";
  panel.append(body);

  // Spalten
  const detailCol = document.createElement("div");
  detailCol.className = "editor-detail";
  const listCol = document.createElement("div");
  listCol.className = "editor-list";
  body.append(detailCol, listCol);

  // Links: Advisor + Details
  buildAdvisorBar(detailCol);
  renderDetails(detailCol, cells.find(c=>c.id===selectedId));

  // Rechts: Liste
  renderList(listCol);

  // Events: bei Änderungen neu zeichnen
  on("cells:born", softRefresh);
  on("cells:died", softRefresh);
  on("cell:edited", softRefresh);
}

function softRefresh(){
  if(panel.classList.contains("hidden")) return;
  // Re-render nur Inhalt, Header bleibt
  const body = panel.querySelector(".editor-body");
  if(!body) return;
  const [detailCol, listCol] = body.children;
  renderDetails(detailCol, getCells().find(c=>c.id===selectedId) || getCells()[0]);
  renderList(listCol);
}

function buildAdvisorBar(container){
  const bar=document.createElement("div");
  bar.style.marginBottom="8px";
  const rowDiv=document.createElement("div"); rowDiv.className="row";
  const label=document.createElement("span"); label.textContent="Advisor-Modus";

  const sel=document.createElement("select");
  for(const m of ["off","heuristic","model"]){
    const o=document.createElement("option");
    o.value=m; o.textContent=m;
    if(getMode()===m) o.selected=true;
    sel.append(o);
  }
  sel.oninput=()=>{ setMode(sel.value); softRefresh(); };

  rowDiv.append(label, sel);
  bar.append(rowDiv);
  container.append(bar);
}

/* ---------- Liste rechts ---------- */
function renderList(listCol){
  listCol.innerHTML = "";

  // Such/Filter (optional – klein & leicht)
  const searchWrap=document.createElement("div");
  searchWrap.style.position="sticky"; searchWrap.style.top="0"; searchWrap.style.background="var(--panel)";
  searchWrap.style.padding="6px 6px 8px 6px"; searchWrap.style.borderBottom="1px solid #22303a";
  const inp=document.createElement("input");
  inp.type="text"; inp.placeholder="Suche Name/ID…";
  inp.style.width="100%"; inp.style.background="#0d1419"; inp.style.border="1px solid #2a3a46";
  inp.style.borderRadius="6px"; inp.style.color="var(--ink)"; inp.style.padding="6px 8px";
  searchWrap.append(inp);
  listCol.append(searchWrap);

  const cont=document.createElement("div");
  cont.className="list";
  listCol.append(cont);

  const cells = sortCells(getCells());
  const q = (inp.value||"").trim().toLowerCase();

  for(const c of cells){
    if(q && !(`${c.name}`.toLowerCase().includes(q) || String(c.id).includes(q))) continue;

    const item=document.createElement("div");
    item.className="cellItem editor-item";
    if(c.id===selectedId) item.classList.add("active");
    item.style.borderLeft = `4px solid ${c.color}`;

    const mode = getMode();
    const sc = (mode==="off") ? null : scoreCell(c);
    const scText = (sc==null) ? "–" : (Math.round(sc*10)/10).toFixed(1);

    item.innerHTML=`
      <div class="name">${c.name} ${c.sex?`<span class="badge">${c.sex}</span>`:""}</div>
      <div class="meta">Stamm ${c.stammId} · E:${c.energy.toFixed(0)} · Alter:${c.age.toFixed(0)}s · Score:${scText}</div>
    `;
    item.onclick=()=>{
      selectedId = c.id;
      // Detailspalte aktualisieren, aktive Klasse setzen
      const body = panel.querySelector(".editor-body");
      const [detailCol] = body.children;
      renderDetails(detailCol, c);
      body.querySelectorAll(".editor-item").forEach(n=>n.classList.remove("active"));
      item.classList.add("active");
    };
    cont.append(item);
  }

  // Suche live
  inp.oninput = ()=> renderList(listCol);
}

/* ---------- Details links ---------- */
function renderDetails(detailCol, cell){
  detailCol.innerHTML = "";
  if(!cell){
    const p=document.createElement("div");
    p.className="muted";
    p.textContent="Keine Zelle ausgewählt.";
    detailCol.append(p); return;
  }

  const head=document.createElement("div");
  head.style.display="flex"; head.style.justifyContent="space-between"; head.style.alignItems="center";
  head.innerHTML = `<b>${cell.name}</b> <span class="badge">Stamm ${cell.stammId}</span>`;
  detailCol.append(head);

  const g = cell.genome;
  const emitEdit = ()=>emit("cell:edited",{id:cell.id});

  detailCol.append(
    row("TEM", slider(1,10,1,g.TEM, v=>{ g.TEM=v; emitEdit(); })),
    row("GRÖ", slider(1,10,1,g.GRÖ, v=>{ g.GRÖ=v; emitEdit(); })),
    row("EFF", slider(1,10,1,g.EFF, v=>{ g.EFF=v; emitEdit(); })),
    row("SCH", slider(1,10,1,g.SCH, v=>{ g.SCH=v; emitEdit(); })),
    row("MET", slider(1,10,1,g.MET, v=>{ g.MET=v; emitEdit(); })),
  );

  // Live-Score (wenn Advisor aktiv)
  const mode=getMode();
  const scoreLine=document.createElement("div");
  scoreLine.className="muted";
  const upd=()=>{
    const sc = (mode==="off") ? null : scoreCell(cell);
    scoreLine.textContent = `Prognose-Score: ${sc==null?"–":(Math.round(sc*10)/10).toFixed(1)}`;
  };
  upd();
  detailCol.append(scoreLine);
}

/* ---------- Auto-Refresh ---------- */
on("cells:born", ()=>{ if(!panel.classList.contains("hidden")) softRefresh(); });
on("cells:died", ()=>{ if(!panel.classList.contains("hidden")) softRefresh(); });
on("cell:edited", ()=>{ if(!panel.classList.contains("hidden")) softRefresh(); });