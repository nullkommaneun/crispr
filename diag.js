// diag.js – Diagnose-Panel: Drives & Genetics Codes + Metriken
import { on } from "./event.js";
import { getCells, getStammCounts } from "./entities.js";
import { getDrivesSnapshot } from "./drives.js";
import { getMutationRate } from "./reproduction.js";

const panel = document.getElementById("diagPanel");

/* === Utility: CRC32 + Base64 === */
function crc32(str){
  let c=~0; for(let i=0;i<str.length;i++){ c ^= str.charCodeAt(i);
    for(let k=0;k<8;k++) c = (c>>>1) ^ (0xEDB88320 & (-(c&1))); }
  return (~c>>>0);
}
function b64encode(str){ return btoa(unescape(encodeURIComponent(str))); }
function makeCode(prefix, obj){
  const json = JSON.stringify(obj);
  const b64  = b64encode(json);
  const crc  = crc32(json).toString(16).padStart(8,"0");
  return `${prefix}-${crc}-${b64}`;
}

/* === Geburten-Puffer für Genetics === */
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

/* === UI Helpers === */
function buildHeader(title){
  const h = document.createElement("div");
  h.className = "panel-header";
  const t = document.createElement("h2"); t.textContent = title;
  const x = document.createElement("button"); x.className="closeX"; x.innerHTML="&times;";
  x.onclick = ()=> panel.classList.add("hidden");
  h.append(t, x); return h;
}
function section(title){
  const box = document.createElement("div");
  box.style.border = "1px solid #22303a";
  box.style.borderRadius = "8px";
  box.style.padding = "10px";
  box.style.margin = "8px 0";
  const head = document.createElement("div");
  head.style.display="flex"; head.style.justifyContent="space-between"; head.style.alignItems="center";
  const h = document.createElement("b"); h.textContent = title;
  head.append(h); box.append(head);
  return { box, head };
}
function row(label, valueHTML){
  const r = document.createElement("div"); r.className="row";
  const l = document.createElement("span"); l.textContent = label;
  const v = document.createElement("span"); v.innerHTML = valueHTML;
  r.append(l,v); return r;
}
function codeField(value){
  const wrap = document.createElement("div");
  wrap.style.display="grid";
  wrap.style.gridTemplateColumns="1fr auto";
  wrap.style.gap="8px"; wrap.style.marginTop="6px";
  const ta = document.createElement("textarea");
  ta.readOnly = true; ta.value = value;
  ta.style.width="100%"; ta.style.height="56px";
  ta.style.background="#0b1217"; ta.style.border="1px solid #2a3a46";
  ta.style.borderRadius="8px"; ta.style.color="#d8f0ff";
  ta.style.font="12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  const btn = document.createElement("button");
  btn.textContent="Code kopieren";
  btn.onclick = async()=>{ try{ await navigator.clipboard.writeText(ta.value); btn.textContent="Kopiert ✓"; setTimeout(()=>btn.textContent="Code kopieren", 1200);}catch{} };
  wrap.append(ta, btn);
  return wrap;
}

/* === Snapshots === */
function drivesCode(){
  const snap = getDrivesSnapshot(); // {misc,w,bStamm,cfg,recent}
  const code = makeCode("MDC-DRI", { v:1, kind:"drives", ts:Date.now(), ...snap });
  return { snap, code };
}
function geneticsSnapshot(){
  const cells = getCells();
  const sample = cells.length ? cells : births.map(b=> ({ genome:b.child?.genome })).filter(x=>!!x.genome);
  const stamm = getStammCounts();
  const mu = getMutationRate(); // 0..1

  const genes = ["TEM","GRÖ","EFF","SCH","MET"];
  const agg = {}; for(const g of genes) agg[g]={sum:0,sum2:0,n:0};

  for(const c of sample){
    for(const g of genes){
      const v = c.genome[g]; agg[g].sum+=v; agg[g].sum2+=v*v; agg[g].n++;
    }
  }
  const stats={};
  for(const g of genes){
    const a=agg[g]; const n=Math.max(1,a.n);
    const mean=a.sum/n; const var_=Math.max(0, a.sum2/n - mean*mean);
    stats[g]={ mean:Math.round(mean*100)/100, sd:Math.round(Math.sqrt(var_)*100)/100 };
  }
  return {
    v:1, kind:"genetics", ts:Date.now(),
    counts:{ cells: cells.length, stamm },
    mutationRate: mu,
    stats,
    lastBirths: births.slice(-15)
  };
}
function geneticsCode(){
  const snap = geneticsSnapshot();
  return { snap, code: makeCode("MDC-GEN", snap) };
}

/* === Public === */
export function openDiagPanel(){
  panel.innerHTML=""; panel.classList.remove("hidden");
  panel.append(buildHeader("Diagnose"));

  const body = document.createElement("div");
  body.className = "panel-body";
  panel.append(body);

  // Drives
  {
    const { box } = section("Drives (Entscheidungslogik)");
    const { snap, code } = drivesCode();
    const wr = snap.misc.duels ? Math.round(100*snap.misc.wins/snap.misc.duels) : 0;
    const pools = Object.keys(snap.bStamm||{}).length;

    box.append(
      row("Duels / Win-Rate", `<b>${snap.misc.duels}</b> · <b>${wr}%</b>`),
      row("Pools (Stämme)", `${pools}`),
      row("Top-Bias", topBiasHTML(snap.bStamm))
    );
    box.append(codeField(code));
    body.append(box);
  }

  // Genetics
  {
    const { box } = section("Genetics (Population / Vererbung)");
    const { snap, code } = geneticsCode();
    const kStämme = Object.keys(snap.counts.stamm||{}).length;

    box.append(
      row("Zellen / Stämme", `<b>${snap.counts.cells}</b> · ${kStämme}`),
      row("Mutation", `${Math.round(snap.mutationRate*100)}%`),
      miniGeneStats(snap.stats)
    );
    box.append(codeField(code));
    body.append(box);
  }

  // Footer
  const footer = document.createElement("div");
  footer.style.display="flex"; footer.style.gap="8px"; footer.style.marginTop="8px";
  const btnAll = document.createElement("button");
  btnAll.textContent = "Beide Codes kopieren";
  btnAll.onclick = async()=>{
    const dri = drivesCode().code;
    const gen = geneticsCode().code;
    try{ await navigator.clipboard.writeText(`${dri}\n${gen}`); btnAll.textContent="Kopiert ✓"; setTimeout(()=>btnAll.textContent="Beide Codes kopieren",1200);}catch{}
  };
  footer.append(btnAll);
  body.append(footer);
}

/* === Formatierer === */
function topBiasHTML(map){
  if(!map) return "–";
  const arr = Object.entries(map).map(([st,v])=>({st:Number(st),v}));
  arr.sort((a,b)=>Math.abs(b.v)-Math.abs(a.v));
  return (arr.slice(0,4).map(x=>`S${x.st}:${x.v>0?"+":""}${(Math.round(x.v*100)/100)}`).join(" · ")) || "–";
}
function miniGeneStats(stats){
  const wrap=document.createElement("div");
  wrap.style.borderTop="1px solid #22303a"; wrap.style.marginTop="6px"; wrap.style.paddingTop="6px";
  const grid=document.createElement("div");
  grid.style.display="grid"; grid.style.gridTemplateColumns="repeat(5, minmax(80px, 1fr))"; grid.style.gap="6px";
  for(const g of ["TEM","GRÖ","EFF","SCH","MET"]){
    const c=document.createElement("div");
    c.innerHTML = `<span class="badge">${g}</span><div class="muted">μ ${stats[g].mean} · σ ${stats[g].sd}</div>`;
    grid.append(c);
  }
  wrap.append(grid); return wrap;
}