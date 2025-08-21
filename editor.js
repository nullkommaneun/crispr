// editor.js — CRISPR-Editor: Links mit ±1-Buttons, Prognose-Score (TF.js oder Heuristik)
import { getCells } from "./entities.js";
import { emit, on } from "./event.js";
// Advisor bleibt für Sortierung/Score in der Liste (falls vorhanden)
import { setMode as setAdvisorMode, getMode as getAdvisorMode, scoreCell, sortCells } from "./advisor.js";

const panel = document.getElementById("editorPanel");

// ==== TF-Model Laden (global 'tf') ====
let modelPromise = null;
async function ensureModel(){
  if (window.__tfModel) return window.__tfModel;
  if (typeof tf === "undefined" || !tf?.loadLayersModel) return null;
  if (!modelPromise){
    // Pfad für GitHub Pages: ./models/model.json
    modelPromise = tf.loadLayersModel("./models/model.json")
      .then(m => (window.__tfModel = m))
      .catch(e => { console.warn("TF model load failed:", e); return null; });
  }
  return await modelPromise;
}
function z(v){ return (v - 5) / 5; }
async function predictStability(genome){
  try{
    const m = await ensureModel();
    if (m){
      const x = tf.tensor2d([[z(genome.TEM), z(genome["GRÖ"]), z(genome.EFF), z(genome.SCH), z(genome.MET)]]);
      const y = m.predict(x);
      const p = (Array.isArray(y)? y[0] : y).dataSync()[0];
      x.dispose(); Array.isArray(y)? y.forEach(t=>t.dispose()) : y.dispose();
      // clamp in 0..1
      return { p: Math.max(0, Math.min(1, p)), src: "Modell" };
    }
  }catch(e){ console.warn("predictStability error:", e); }
  // Heuristik-Fallback (logistische Funktion)
  const s = 0.40*z(genome.EFF) + 0.28*z(genome.SCH) + 0.18*z(genome.TEM) - 0.42*z(genome.MET) + 0.06*z(genome["GRÖ"]);
  const p = 1/(1+Math.exp(-1.75*s));
  return { p, src: "Heuristik" };
}

// ==== UI Helpers ====
function buildHeader(title){
  const header=document.createElement("div");
  header.className="panel-header";
  const h2=document.createElement("h2"); h2.textContent=title;
  const close=document.createElement("button"); close.className="closeX"; close.innerHTML="&times;";
  close.onclick=()=>panel.classList.add("hidden");
  header.append(h2, close);
  return header;
}
function rowLeft(label){
  const div = document.createElement("div");
  div.className = "row";
  const l = document.createElement("span"); l.textContent = label;
  div.append(l);
  return {div, l};
}
function mkSpinControl(value, onChange){
  const wrap = document.createElement("div");
  wrap.style.display="flex"; wrap.style.alignItems="center"; wrap.style.gap="6px";

  const btnMinus = document.createElement("button"); btnMinus.textContent="–";
  btnMinus.style.minWidth="28px"; btnMinus.title="−1";
  const val = document.createElement("span"); val.className="badge"; val.textContent=String(value);
  const btnPlus  = document.createElement("button"); btnPlus.textContent="+";
  btnPlus.style.minWidth="28px"; btnPlus.title="+1";

  btnMinus.onclick = ()=> { onChange(-1); };
  btnPlus.onclick  = ()=> { onChange(+1); };

  wrap.append(btnMinus, val, btnPlus);
  return {wrap, val};
}
function clampGene(v){ return Math.max(1, Math.min(10, v|0)); }

// ==== Render ====
let selectedId = null;

export function openEditor(){
  render();
  // Modell im Hintergrund schon mal laden (zeigt schneller Werte)
  ensureModel();
}
export function closeEditor(){ panel.classList.add("hidden"); }
export function setAdvisorMode(mode){ try{ setAdvisorMode(mode); }catch{} }
export function getAdvisorMode(){ try{ return getAdvisorMode(); }catch{ return "off"; } }

function render(){
  const cells = getCells();
  if (!cells.length) return;
  if(!selectedId || !cells.some(c=>c.id===selectedId)) selectedId = cells[0].id;

  panel.innerHTML=""; panel.classList.remove("hidden");
  panel.append(buildHeader("CRISPR-Editor"));

  const body = document.createElement("div");
  body.className = "panel-body editor-body";
  panel.append(body);

  const detailCol = document.createElement("div");
  detailCol.className = "editor-detail";
  const listCol = document.createElement("div");
  listCol.className = "editor-list";
  body.append(detailCol, listCol);

  renderDetails(detailCol, cells.find(c=>c.id===selectedId));
  renderList(listCol);

  on("cells:born", softRefresh);
  on("cells:died", softRefresh);
  on("cell:edited", softRefresh);
}

function softRefresh(){
  if(panel.classList.contains("hidden")) return;
  const body = panel.querySelector(".editor-body"); if(!body) return;
  const [detailCol, listCol] = body.children;
  renderDetails(detailCol, getCells().find(c=>c.id===selectedId) || getCells()[0]);
  renderList(listCol);
}

function renderDetails(detailCol, cell){
  detailCol.innerHTML = "";
  if(!cell){
    const p=document.createElement("div");
    p.className="muted"; p.textContent="Keine Zelle ausgewählt.";
    detailCol.append(p); return;
  }

  // Kopfzeile
  {
    const head=document.createElement("div");
    head.style.display="flex"; head.style.justifyContent="space-between"; head.style.alignItems="center";
    head.innerHTML = `<b>${cell.name}</b> <span class="badge">Stamm ${cell.stammId}</span>`;
    detailCol.append(head);
  }

  // Gen-Kontrollen (±1)
  const genes = [
    ["TEM","TEM"], ["GRÖ","GRÖ"], ["EFF","EFF"], ["SCH","SCH"], ["MET","MET"]
  ];
  for (const [label, key] of genes){
    const {div} = rowLeft(label);
    const {wrap, val} = mkSpinControl(cell.genome[key], delta=>{
      cell.genome[key] = clampGene(cell.genome[key] + delta);
      val.textContent = String(cell.genome[key]);
      emit("cell:edited",{id:cell.id, field:key, value:cell.genome[key]});
      // Prognose neu rechnen
      updatePrognose();
    });
    div.append(wrap);
    detailCol.append(div);
  }

  // Prognose-Bereich
  const progWrap = document.createElement("div");
  progWrap.style.marginTop="10px";
  const progLine = document.createElement("div");
  progLine.className = "muted";
  progLine.textContent = "Prognose-Score: —";
  progWrap.append(progLine);

  // kleine Fortschrittsleiste
  const bar = document.createElement("div");
  bar.style.height="6px"; bar.style.border="1px solid #2a3a46"; bar.style.borderRadius="6px"; bar.style.marginTop="6px";
  const fill = document.createElement("div");
  fill.style.height="100%"; fill.style.width="0%"; fill.style.borderRadius="6px";
  fill.style.background = "linear-gradient(90deg, #2ee56a, #27c7ff)";
  bar.append(fill);
  progWrap.append(bar);

  detailCol.append(progWrap);

  async function updatePrognose(){
    const { p, src } = await predictStability(cell.genome);
    const pct = Math.round(p*100);
    progLine.textContent = `Prognose-Score: ${pct}% (${src})`;
    fill.style.width = `${pct}%`;
  }
  updatePrognose();
}

function renderList(listCol){
  listCol.innerHTML = "";
  // Suche
  const searchWrap=document.createElement("div");
  searchWrap.style.position="sticky"; searchWrap.style.top="0"; searchWrap.style.background="var(--panel)";
  searchWrap.style.padding="6px 6px 8px 6px"; searchWrap.style.borderBottom="1px solid #22303a";
  const inp=document.createElement("input");
  inp.type="text"; inp.placeholder="Suche Name/ID...";
  inp.style.width="100%"; inp.style.background="#0d1419"; inp.style.border="1px solid #2a3a46";
  inp.style.borderRadius="6px"; inp.style.color="var(--ink)"; inp.style.padding="6px 8px";
  searchWrap.append(inp);
  listCol.append(searchWrap);

  const cont=document.createElement("div"); cont.className="list"; listCol.append(cont);

  let cells = getCells();
  try { cells = sortCells(cells) || cells; } catch {}
  const q = (inp.value||"").trim().toLowerCase();

  for(const c of cells){
    if(q && !(`${c.name}`.toLowerCase().includes(q) || String(c.id).includes(q))) continue;

    const item=document.createElement("div");
    item.className="cellItem editor-item";
    if(c.id===selectedId) item.classList.add("active");
    // farbiger linker Balken -> nach Geschlecht (Zellenfarbe)
    item.style.borderLeft = `4px solid ${c.color || '#27c7ff'}`;

    // Advisor/Score (falls aktiv)
    let scText = "–";
    try{
      const mode = getAdvisorMode();
      if(mode!=="off"){
        const sc = scoreCell(c);
        if (sc!=null) scText = (Math.round(sc*10)/10).toFixed(1);
      }
    }catch{}

    item.innerHTML=`
      <div class="name">${c.name} ${c.sex?`<span class="badge">${c.sex}</span>`:""}</div>
      <div class="meta">Stamm ${c.stammId} · E:${c.energy.toFixed(0)} · Alter:${c.age.toFixed(0)}s · Score:${scText}</div>
    `;
    item.onclick=()=>{
      selectedId = c.id;
      const body = panel.querySelector(".editor-body");
      const [detailCol] = body.children;
      renderDetails(detailCol, c);
      body.querySelectorAll(".editor-item").forEach(n=>n.classList.remove("active"));
      item.classList.add("active");
    };
    cont.append(item);
  }

  inp.oninput=()=>renderList(listCol);
}

// Auto-Refresh
on("cells:born", ()=>{ if(!panel.classList.contains("hidden")) softRefresh(); });
on("cells:died", ()=>{ if(!panel.classList.contains("hidden")) softRefresh(); });
on("cell:edited", ()=>{ if(!panel.classList.contains("hidden")) softRefresh(); });