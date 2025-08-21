// diag.js – Diagnose-Panel: Drives & Genetics + Ökonomie, Paarung, Population
import { on } from "./event.js";
import { getCells, getStammCounts, getFoodItems } from "./entities.js";
import { getDrivesSnapshot } from "./drives.js";
import { getMutationRate } from "./reproduction.js";
import { getEconSnapshot, getMateSnapshot, getPopSnapshot } from "./metrics.js";

const panel = document.getElementById("diagPanel");

/* CRC & Base64 Helfer wie gehabt */
function crc32(str){ let c=~0; for(let i=0;i<str.length;i++){ c ^= str.charCodeAt(i); for(let k=0;k<8;k++) c=(c>>>1)^(0xEDB88320&(-(c&1))); } return (~c>>>0); }
function b64encode(s){ return btoa(unescape(encodeURIComponent(s))); }
function makeCode(prefix,obj){ const json=JSON.stringify(obj); const b64=b64encode(json); const crc=crc32(json).toString(16).padStart(8,"0"); return `${prefix}-${crc}-${b64}`; }

/* Geburten-Puffer wie gehabt (optional für Genetics) */
const births=[]; on("cells:born",(p)=>{ births.push({ t:Date.now(), parents:p?.parents??[], child:{ id:p?.child?.id??null, stammId:p?.child?.stammId??null, genome:p?.child?.genome??null } }); if(births.length>50) births.shift(); });

/* UI helpers wie gehabt (buildHeader, section, row, codeField) */
function buildHeader(title){ const h=document.createElement("div"); h.className="panel-header"; const t=document.createElement("h2"); t.textContent=title; const x=document.createElement("button"); x.className="closeX"; x.innerHTML="&times;"; x.onclick=()=>panel.classList.add("hidden"); h.append(t,x); return h; }
function section(title){ const box=document.createElement("div"); box.style.border="1px solid #22303a"; box.style.borderRadius="8px"; box.style.padding="10px"; box.style.margin="8px 0"; const head=document.createElement("div"); head.style.display="flex"; head.style.justifyContent="space-between"; head.style.alignItems="center"; const h=document.createElement("b"); h.textContent=title; head.append(h); box.append(head); return { box, head }; }
function row(label, valueHTML){ const r=document.createElement("div"); r.className="row"; const l=document.createElement("span"); l.textContent=label; const v=document.createElement("span"); v.innerHTML=valueHTML; r.append(l,v); return r; }
function codeField(value){ const wrap=document.createElement("div"); wrap.style.display="grid"; wrap.style.gridTemplateColumns="1fr auto"; wrap.style.gap="8px"; wrap.style.marginTop="6px"; const ta=document.createElement("textarea"); ta.readOnly=true; ta.value=value; ta.style.width="100%"; ta.style.height="56px"; ta.style.background="#0b1217"; ta.style.border="1px solid #2a3a46"; ta.style.borderRadius="8px"; ta.style.color="#d8f0ff"; ta.style.font="12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"; const btn=document.createElement("button"); btn.textContent="Code kopieren"; btn.onclick=async()=>{ try{ await navigator.clipboard.writeText(ta.value); btn.textContent="Kopiert ✓"; setTimeout(()=>btn.textContent="Code kopieren",1200);}catch{} }; wrap.append(ta,btn); return wrap; }

/* Drives/Genetics wie gehabt — plus drei neue Snapshots */
function drivesCode(){ const snap=getDrivesSnapshot(); const code=makeCode("MDC-DRI",{v:1,kind:"drives",ts:Date.now(),...snap}); return {snap,code}; }

function geneticsSnapshot(){
  const cells=getCells(); const sample=cells.length?cells:births.map(b=>({genome:b.child?.genome})).filter(x=>!!x.genome);
  const stamm=getStammCounts(); const mu=getMutationRate();
  const genes=["TEM","GRÖ","EFF","SCH","MET"]; const agg={}; for(const g of genes) agg[g]={sum:0,sum2:0,n:0};
  for(const c of sample){ for(const g of genes){ const v=c.genome[g]; agg[g].sum+=v; agg[g].sum2+=v*v; agg[g].n++; } }
  const stats={}; for(const g of genes){ const a=agg[g], n=Math.max(1,a.n); const mean=a.sum/n, var_ = Math.max(0, a.sum2/n - mean*mean); stats[g]={mean:round2(mean), sd:round2(Math.sqrt(var_))}; }
  return { v:1, kind:"genetics", ts:Date.now(), counts:{ cells:cells.length, stamm }, mutationRate:mu, stats, lastBirths:births.slice(-15) };
}
function geneticsCode(){ const snap=geneticsSnapshot(); return { snap, code: makeCode("MDC-GEN", snap) }; }

function econCode(){ const snap=getEconSnapshot(); return { snap, code: makeCode("MDC-ECON", snap) }; }
function mateCode(){ const snap=getMateSnapshot(); return { snap, code: makeCode("MDC-MATE", snap) }; }
function popCode(){ const snap=getPopSnapshot(); return { snap, code: makeCode("MDC-POP", snap) }; }

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

  // Ökonomie (Energie)
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

  // Paarungs-Funnel
  {
    const { box } = section("Paarung (Funnel)");
    const { snap, code } = mateCode();
    const k = snap.kpis || {};
    box.append(
      row("Versuche / Erfolg", `<b>${k.attempts||0}</b> · <b>${k.successRate||0}%</b>`),
      row("Ø Dauer / Start→Ende", `${fmt(k.avgDur)} s · ${fmt(k.avgStart)} → ${fmt(k.avgEnd)} px`),
      row("Gründe", `✔︎ ${k.reasons?.success||0} · ⏳ ${k.reasons?.timeout||0} · ↯ ${k.reasons?.no_progress||0} · ⇢ ${k.reasons?.progress_timeout||0}`)
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

  // Footer: Kopiere alle neuen Codes zusammen
  const footer=document.createElement("div");
  footer.style.display="flex"; footer.style.gap="8px"; footer.style.marginTop="8px";
  const btnAll=document.createElement("button");
  btnAll.textContent="Alle Codes kopieren";
  btnAll.onclick=async()=>{
    const dri = drivesCode().code;
    const gen = geneticsCode().code;
    const eco = econCode().code;
    const mate= mateCode().code;
    const pop = popCode().code;
    try{ await navigator.clipboard.writeText(`${dri}\n${gen}\n${eco}\n${mate}\n${pop}`); btnAll.textContent="Kopiert ✓"; setTimeout(()=>btnAll.textContent="Alle Codes kopieren",1200);}catch{}
  };
  body.append(footer); footer.append(btnAll);
}

/* Formatter */
function fmt(v){ return (v==null)? "–" : (Math.abs(v)<1e-9? "0" : (Math.round(v*100)/100)); }
function round2(n){ return Math.abs(n)<1e-9 ? 0 : Math.round(n*100)/100; }