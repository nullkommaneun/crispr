// diag.js – Diagnose-Panel mit Codes für Drives (DRI) & Genetics (GEN)
import { on } from "./event.js";
import { getCells, getStammCounts } from "./entities.js";
import { getDrivesSnapshot } from "./drives.js";
import { getMutationRate } from "./reproduction.js";

const panel = document.getElementById("diagPanel");

/* ------- util: crc32 + base64 ------- */
function crc32(str){
  let c=~0; for(let i=0;i<str.length;i++){ c ^= str.charCodeAt(i);
    for(let k=0;k<8;k++) c = (c>>>1) ^ (0xEDB88320 & (-(c&1))); }
  return (~c>>>0);
}
function b64encode(str){ return btoa(unescape(encodeURIComponent(str))); }

/* ------- births buffer (für Genetics) ------- */
const births = [];
on("cells:born", (payload)=>{
  births.push({
    t: Date.now(),
    parents: payload?.parents ?? [],
    child: {
      id: payload?.child?.id ?? null,
      stammId: payload?.child?.stammId ?? null,
      genome: payload?.child?.genome ?? null
    }
  });
  if(births.length > 50) births.shift();
});

/* ------- UI helpers ------- */
function buildHeader(title){
  const h = document.createElement("div");
  h.className = "panel-header";
  const t = document.createElement("h2"); t.textContent = title;
  const x = document.createElement("button"); x.className="closeX"; x.innerHTML="&times;";
  x.onclick = ()=> panel.classList.add("hidden");
  h.append(t, x);
  return h;
}
function card(title){
  const box = document.createElement("div");
  box.style.border = "1px solid #22303a";
  box.style.borderRadius = "8px";
  box.style.padding = "10px";
  box.style.margin = "8px 0";
  const head = document.createElement("div");
  head.style.display="flex"; head.style.justifyContent="space-between"; head.style.alignItems="center";
  const h = document.createElement("b"); h.textContent = title;
  head.append(h);
  box.append(head);
  return { box, head };
}
function monoField(value){
  const wrap = document.createElement("div");
  wrap.style.display="grid"; wrap.style.gridTemplateColumns="1fr auto"; wrap.style.gap="8px"; wrap.style.marginTop="6px";
  const area = document.createElement("textarea");
  area.value = value; area.readOnly = true;
  area.style.width="100%"; area.style.height="56px";
  area.style.background = "#0b1217";
  area.style.border = "1px solid #2a3a46";
  area.style.borderRadius = "8px";
  area.style.color = "#d8f0ff";
  area.style.font = "12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  const btn = document.createElement("button");
  btn.textContent="Code kopieren";
  btn.onclick = async()=>{ try{ await navigator.clipboard.writeText(area.value); btn.textContent="Kopiert ✓"; setTimeout(()=>btn.textContent="Code kopieren", 1200);}catch{} };
  wrap.append(area, btn);
  return wrap;
}
function kv(label, value){
  const row = document.createElement("div"); row.className = "row";
  const l = document.createElement("span"); l.textContent = label;
  const r = document.createElement("span"); r.innerHTML = value;
  row.append(l, r);
  return row;
}
function makeCode(prefix, obj){
  const json = JSON.stringify(obj);
  const b64  = b64encode(json);
  const crc  = crc32(json).toString(16).padStart(8,"0");
  return `${prefix}-${crc}-${b64}`;
}

/* ------- snapshots ------- */
function geneticsSnapshot(){
  const cells = getCells();
  const stamm = getStammCounts();
  const mu = getMutationRate(); // 0..1

  const genes = ["TEM","GRÖ","EFF","SCH","MET"];
  const agg = {};
  for(const g of genes){ agg[g] = { sum:0, sum2:0, n:0 }; }
  for(const c of cells){
    for(const g of genes){
      const v = c.genome[g];
      agg[g].sum += v; agg[g].sum2 += v*v; agg[g].n++;
    }
  }
  const stats = {};
  for(const g of genes){
    const a = agg[g]; const n = Math.max(1,a.n);
    const mean = a.sum / n;
    const var_ = Math.max(0, a.sum2/n - mean*mean);
    const sd = Math.sqrt(var_);
    stats[g] = { mean: Math.round(mean*100)/100, sd: Math.round(sd*100)/100 };
  }

  const snap = {
    v:1, kind:"genetics", ts: Date.now(),
    counts: { cells: cells.length, stamm },
    mutationRate: mu,      // 0..1
    stats,                 // {TEM:{mean,sd}, ...}
    lastBirths: births.slice(-15) // kompaktes Geburtenfenster
  };
  return snap;
}

function drivesCode(){
  const dri = getDrivesSnapshot(); // {misc,w,bStamm,cfg,recent}
  return {
    code: makeCode("MDC-DRI", {
      v:1, kind:"drives", ts: Date.now(),
      misc: dri.misc, w: dri.w, bStamm: dri.bStamm, cfg: dri.cfg,
      recent: dri.recent
    }),
    snap: dri
  };
}
function geneticsCode(){
  const gen = geneticsSnapshot();
  return {
    code: makeCode("MDC-GEN", gen),
    snap: gen
  };
}

/* ------- Public ------- */
export function openDiagPanel(){
  panel.innerHTML = "";
  panel.classList.remove("hidden");
  panel.append(buildHeader("Diagnose"));

  const body = document.createElement("div");
  body.className = "panel-body";
  panel.append(body);

  // Drives
  {
    const { box } = card("Drives (Entscheidungslogik)");
    const dri = drivesCode();
    const wr = (dri.snap.misc.duels ? Math.round(100 * dri.snap.misc.wins / dri.snap.misc.duels) : 0);
    const pools = Object.keys(dri.snap.bStamm||{}).length;

    box.append(
      kv("Duels / Win-Rate", `<b>${dri.snap.misc.duels}</b> · <b>${wr}%</b>`),
      kv("Pools (Stämme)", `${pools}`),
      kv("Top-Bias", topBiasHTML(dri.snap.bStamm))
    );
    box.append(monoField(dri.code));
    body.append(box);
  }

  // Genetics
  {
    const { box } = card("Genetics (Population / Vererbung)");
    const gen = geneticsCode();
    const genes = gen.snap.stats;
    box.append(
      kv("Zellen / Stämme", `<b>${gen.snap.counts.cells}</b> · ${Object.keys(gen.snap.counts.stamm).length}`),
      kv("Mutation", `${Math.round(gen.snap.mutationRate*100)}%`),
      miniGeneTable(genes)
    );
    box.append(monoField(gen.code));
    body.append(box);
  }

  // Actions
  const footer = document.createElement("div");
  footer.style.display="flex"; footer.style.gap="8px"; footer.style.marginTop="8px";
  const copyAll = document.createElement("button");
  copyAll.textContent="Beide Codes kopieren";
  copyAll.onclick = async()=>{
    const dri = drivesCode().code;
    const gen = geneticsCode().code;
    try{ await navigator.clipboard.writeText(`${dri}\n${gen}`); copyAll.textContent="Kopiert ✓"; setTimeout(()=>copyAll.textContent="Beide Codes kopieren", 1200);}catch{}
  };
  footer.append(copyAll);
  body.append(footer);
}

/* ------- small formatters ------- */
function topBiasHTML(biasMap){
  if(!biasMap) return "–";
  const arr = Object.entries(biasMap).map(([st,v])=>({st: Number(st), v}));
  arr.sort((a,b)=>Math.abs(b.v)-Math.abs(a.v));
  const top = arr.slice(0,4).map(x=>`S${x.st}:${x.v>0?"+":""}${(Math.round(x.v*100)/100)}`).join(" · ");
  return top || "–";
}
function miniGeneTable(stats){
  const wrap=document.createElement("div");
  wrap.style.borderTop="1px solid #22303a"; wrap.style.marginTop="6px"; wrap.style.paddingTop="6px";
  const tbl=document.createElement("div"); tbl.style.display="grid"; tbl.style.gridTemplateColumns="auto auto auto auto auto"; tbl.style.gap="6px";
  for(const g of ["TEM","GRÖ","EFF","SCH","MET"]){
    const cell=document.createElement("div");
    cell.innerHTML=`<span class="badge">${g}</span><div class="muted">μ ${stats[g].mean} · σ ${stats[g].sd}</div>`;
    tbl.append(cell);
  }
  wrap.append(tbl); return wrap;
}