// diag.js – Diagnose-Panel: Drives & Genetics + Ökonomie, Paarung, Population, Gen-Drift
import { on } from "./event.js";
import { getCells, getStammCounts, getFoodItems } from "./entities.js";
import { getDrivesSnapshot } from "./drives.js";
import { getMutationRate } from "./reproduction.js";
import { getEconSnapshot, getMateSnapshot, getPopSnapshot, getDriftSnapshot } from "./metrics.js";

const panel = document.getElementById("diagPanel");

/* CRC & Base64 */
function crc32(str){ let c=~0; for(let i=0;i<str.length;i++){ c ^= str.charCodeAt(i); for(let k=0;k<8;k++) c=(c>>>1)^(0xEDB88320&(-(c&1))); } return (~c>>>0); }
function b64(s){ return btoa(unescape(encodeURIComponent(s))); }
function makeCode(prefix,obj){ const json=JSON.stringify(obj); const hash=crc32(json).toString(16).padStart(8,"0"); return `${prefix}-${hash}-${b64(json)}`; }

/* UI helpers */
function buildHeader(title){ const h=document.createElement("div"); h.className="panel-header"; const t=document.createElement("h2"); t.textContent=title; const x=document.createElement("button"); x.className="closeX"; x.innerHTML="&times;"; x.onclick=()=>panel.classList.add("hidden"); h.append(t,x); return h; }
function section(title){ const box=document.createElement("div"); box.style.border="1px solid #22303a"; box.style.borderRadius="8px"; box.style.padding="10px"; box.style.margin="8px 0"; const head=document.createElement("div"); head.style.display="flex"; head.style.justifyContent="space-between"; head.style.alignItems="center"; const h=document.createElement("b"); h.textContent=title; head.append(h); box.append(head); return { box, head }; }
function row(label, valueHTML){ const r=document.createElement("div"); r.className="row"; const l=document.createElement("span"); l.textContent=label; const v=document.createElement("span"); v.innerHTML=valueHTML; r.append(l,v); return r; }
function codeField(value){ const wrap=document.createElement("div"); wrap.style.display="grid"; wrap.style.gridTemplateColumns="1fr auto"; wrap.style.gap="8px"; wrap.style.marginTop="6px"; const ta=document.createElement("textarea"); ta.readOnly=true; ta.value=value; ta.style.width="100%"; ta.style.height="56px"; ta.style.background="#0b1217"; ta.style.border="1px solid #2a3a46"; ta.style.borderRadius="8px"; ta.style.color="#d8f0ff"; ta.style.font="12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"; const btn=document.createElement("button"); btn.textContent="Code kopieren"; btn.onclick=async()=>{ try{ await navigator.clipboard.writeText(ta.value); btn.textContent="Kopiert ✓"; setTimeout(()=>btn.textContent="Code kopieren",1200);}catch{} }; wrap.append(ta,btn); return wrap; }

/* Snapshots */
function drivesCode(){ const snap=getDrivesSnapshot(); return { snap, code: makeCode("MDC-DRI",{v:1,kind:"drives",ts:Date.now(),...snap}) }; }
function geneticsSnapshot(){
  const cells=getCells(); const sample=cells.length?cells:[]; const stamm=getStammCounts(); const mu=getMutationRate();
  const genes=["TEM","GRÖ","EFF","SCH","MET"]; const agg={}; for(const g of genes) agg[g]={sum:0,sum2:0,n:0};
  for(const c of sample){ for(const g of genes){ const v=c.genome[g]; agg[g].sum+=v; agg[g].sum2+=v*v; agg[g].n++; } }
  const stats={}; for(const g of genes){ const a=agg[g], n=Math.max(1,a.n); const mean=a.sum/n, var_ = Math.max(0, a.sum2/n - mean*mean); stats[g]={mean:r2(mean), sd:r2(Math.sqrt(var_))}; }
  return { v:1, kind:"genetics", ts:Date.now(), counts:{ cells:cells.length, stamm }, mutationRate:mu, stats, lastBirths:[] };
}
function geneticsCode(){ const snap=geneticsSnapshot(); return { snap, code: makeCode("MDC-GEN", snap) }; }
function econCode(){ const snap=getEconSnapshot(); return { snap, code: makeCode("MDC-ECON", snap) }; }
function mateCode(){ const snap=getMateSnapshot(); return { snap, code: makeCode("MDC-MATE", snap) }; }
function popCode(){ const snap=getPopSnapshot(); return { snap, code: makeCode("MDC-POP", snap) }; }
function driftCode(){ const snap=getDriftSnapshot(); return { snap, code: makeCode("MDC-DRFT", snap) }; }

/* Public */
export function openDiagPanel(){
  panel.innerHTML=""; panel.classList.remove("hidden");
  panel.append(buildHeader("Diagnose"));

  const body=document.createElement("div");
  body.className="panel-body";
  panel.append(body);

  // Drives
  {
    const { box } = section("Drives (Entscheidungslogik)");
    const { snap, code } = drivesCode();
    const wr = snap.misc.duels ? Math.round(100*snap.misc.wins/snap.misc.duels) : 0;
    const pools = Object.keys(snap.bStamm||{}).length;
    const cfg = snap.cfg || {};
    box.append(
      row("Duels / Win-Rate", `<b>${snap.misc.duels}</b> · <b>${wr}%</b>`),
      row("Pools (Stämme)", `${pools}`),
      row("Params", `K_DIST=${cfg.K_DIST ?? "–"} · R_PAIR=${cfg.R_PAIR ?? "–"} · WIN=[${cfg.WIN_MIN ?? "–"}, ${cfg.WIN_MAX ?? "–"}]`)
    );
    box.append(codeField(code));
    body.append(box);
  }

  // Ökonomie
  {
    const { box } = section("Ökonomie (Energie/Balance)");
    const { snap, code } = econCode();
    const last = snap.last.at(-1) || {};
    box.append(
      row("Intake/Base/Move/Env", `<b>${fmt(last.intake)}</b> / ${fmt(last.base)} / ${fmt(last.move)} / ${fmt(last.env)} (net ${fmt(last.net)})`),
      row("Eating-Quote", `${Math.round(100*(last.eatingFrac||0))}%  · Sample=${last.sample||0}`),
      row("Spawn (Items/Energy)", `${last.spawnedItems||0} / ${fmt(last.spawnedEnergy)}`),
      row("Inventory (Items)", `${(last.inventory ?? getFoodItems().length)}`)
    );
    box.append(codeField(code));
    body.append(box);
  }

  // Population
  {
    const { box } = section("Population (Dynamik)");
    const { snap, code } = popCode();
    box.append(
      row("Geburten/min · Tode/min", `<b>${snap.bpm}</b> · <b>${snap.dpm}</b>`),
      row("Ø Alter (letzte Tode)", `${fmt(snap.meanDeathAge)} s`)
    );
    box.append(codeField(code));
    body.append(box);
  }

  // Gen-Drift (Zeitreihe)
  {
    const { box } = section("Gen-Drift (Zeitreihe)");
    const { snap, code } = driftCode();

    // Canvas-Diagramm
    const canvas = document.createElement("canvas");
    canvas.width = 520; canvas.height = 160;
    canvas.style.width="100%"; canvas.style.maxWidth="520px";
    canvas.style.border="1px solid #22303a"; canvas.style.borderRadius="6px"; canvas.style.background="#0b1217";
    box.append(canvas);

    drawDriftChart(canvas, snap.last || []);

    // Legende + Code
    const legend = document.createElement("div");
    legend.className = "muted";
    legend.style.marginTop="6px";
    legend.innerHTML = `Farben: <span style="color:#4ea3ff">TEM</span> · <span style="color:#b0b7c3">GRÖ</span> · <span style="color:#2ee56a">EFF</span> · <span style="color:#27c7ff">SCH</span> · <span style="color:#ff6b6b">MET</span>`;
    box.append(legend);

    box.append(codeField(code));
    body.append(box);
  }

  // Footer: Sammel-Kopieren
  const footer=document.createElement("div");
  footer.style.display="flex"; footer.style.gap="8px"; footer.style.marginTop="8px";
  const btnAll=document.createElement("button");
  btnAll.textContent="Alle Codes kopieren";
  btnAll.onclick=async()=>{
    const dri = drivesCode().code, gen = geneticsCode().code, eco = econCode().code;
    const pop = popCode().code, drf = driftCode().code;
    try{ await navigator.clipboard.writeText(`${dri}\n${gen}\n${eco}\n${pop}\n${drf}`); btnAll.textContent="Kopiert ✓"; setTimeout(()=>btnAll.textContent="Alle Codes kopieren",1200);}catch{}
  };
  body.append(footer); footer.append(btnAll);
}

/* Zeichnen: Gen-Drift (Sparklines) */
function drawDriftChart(cv, data){
  const ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  ctx.clearRect(0,0,W,H);

  // Achsenbereich
  const padL=34, padR=8, padT=8, padB=18;
  const w = W - padL - padR, h = H - padT - padB;

  // Y-Skala (Gene 1..10, Fokus 3..8 ist meist interessanter)
  const yMin = 3, yMax = 8;

  // Gitter
  ctx.strokeStyle = "rgba(180,200,220,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for(let y=3; y<=8; y+=1){
    const yy = padT + (1 - (y - yMin)/(yMax - yMin)) * h;
    ctx.moveTo(padL, yy); ctx.lineTo(W-padR, yy);
  }
  ctx.stroke();

  // Y-Labels
  ctx.fillStyle="#9fb6c9"; ctx.font="11px system-ui";
  for(let y=3; y<=8; y+=1){
    const yy = padT + (1 - (y - yMin)/(yMax - yMin)) * h;
    ctx.fillText(String(y), 4, yy+4);
  }

  const series = data.slice(-Math.floor(w/4)); // ~ein Punkt je 4px
  const n = Math.max(1, series.length);

  const colors = { TEM:"#4ea3ff", "GRÖ":"#b0b7c3", EFF:"#2ee56a", SCH:"#27c7ff", MET:"#ff6b6b" };
  const keys = ["TEM","GRÖ","EFF","SCH","MET"];

  function yMap(v){ return padT + (1 - ((v - yMin)/(yMax - yMin))) * h; }

  for(const key of keys){
    ctx.beginPath();
    for(let i=0;i<series.length;i++){
      const sx = padL + (i/(n-1)) * w;
      const sy = yMap( series[i][key] ?? 0 );
      if(i===0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.strokeStyle = colors[key];
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function fmt(v){ return (v==null)? "–" : (Math.abs(v)<1e-9? "0" : (Math.round(v*100)/100)); }
function r2(n){ return Math.abs(n)<1e-9 ? 0 : Math.round(n*100)/100; }