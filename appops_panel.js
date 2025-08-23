// appops_panel.js — App-Ops (Optimierer) Panel, robust, mit Preflight-Delegation & MDC-Codes

function buildHeader(title, onClose){
  const wrap = document.createElement("div");
  wrap.className = "panel-header";
  wrap.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <h2 style="margin:0">${title}</h2>
      <button class="closeX" aria-label="Schließen">&times;</button>
    </div>`;
  wrap.querySelector(".closeX").onclick = onClose;
  return wrap;
}
function section(title, rightEl){
  const box=document.createElement("div");
  Object.assign(box.style,{border:"1px solid #22303a",borderRadius:"8px",padding:"10px",margin:"8px 0"});
  const head=document.createElement("div");
  Object.assign(head.style,{display:"flex",justifyContent:"space-between",alignItems:"center",gap:"8px"});
  const h=document.createElement("b"); h.textContent=title;
  head.append(h); if(rightEl) head.append(rightEl); box.append(head);
  return {box,head};
}
function row(label, html){ const r=document.createElement("div"); r.className="row"; const l=document.createElement("span"); l.textContent=label; const v=document.createElement("span"); v.innerHTML=html; r.append(l,v); return r; }
function codeField(value){
  const wrap=document.createElement("div");
  Object.assign(wrap.style,{display:"grid",gridTemplateColumns:"1fr auto",gap:"8px",marginTop:"6px"});
  const ta=document.createElement("textarea");
  Object.assign(ta.style,{width:"100%",height:"120px",background:"#0b1217",border:"1px solid #2a3a46",borderRadius:"8px",color:"#d8f0ff",font:"12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"});
  ta.readOnly=true; ta.value=value ?? "";
  const btn=document.createElement("button"); btn.textContent="OPS kopieren";
  btn.onclick=async()=>{ try{ await navigator.clipboard.writeText(ta.value); btn.textContent="Kopiert ✓"; setTimeout(()=>btn.textContent="OPS kopieren",1200);}catch{} };
  wrap.append(ta,btn); return wrap;
}
const fmt = v => (v!=null && v===v) ? (typeof v==='number'? v.toFixed(1): String(v)) : "–";
function mdc(prefix, obj){ return `MDC-OPS-${prefix}-${Math.random().toString(16).slice(2,6)}-${btoa(unescape(encodeURIComponent(JSON.stringify(obj))) )}`; }
function smallCopyBtn(label, code){ const b=document.createElement('button'); b.textContent=label||'Code';
  Object.assign(b.style,{border:"1px solid #3a5166",background:"#243241",color:"#cfe6ff",borderRadius:"8px",padding:"4px 8px"});
  b.onclick=()=>navigator.clipboard.writeText(code).catch(()=>alert(code)); return b; }

/* Host */
function ensurePanelHost(){
  let host = document.getElementById("diagPanel");
  if (host) return { host, isOverlay:false, close:()=>host.classList.add("hidden") };
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,.55);display:flex;align-items:flex-start;justify-content:center;padding:24px;";
  overlay.addEventListener("click", e=>{ if (e.target===overlay) overlay.remove(); });
  const panel = document.createElement("div");
  panel.style.cssText = "max-width:1100px;width:94%;max-height:86vh;overflow:auto;background:#10161d;border:1px solid #2a3b4a;border-radius:12px;color:#d6e1ea;padding:14px;box-shadow:0 30px 70px rgba(0,0,0,.45);";
  overlay.appendChild(panel); document.body.appendChild(overlay);
  return { host:panel, isOverlay:true, close:()=>overlay.remove() };
}

/* App-Ops APIs dynamisch (mit Fallbacks) */
async function loadAppOps(){
  try{
    const m = await import("./appops.js?v="+Date.now());
    return {
      startCollectors: (typeof m.startCollectors==='function'? m.startCollectors : ()=>{}),
      getAppOpsSnapshot: (typeof m.getAppOpsSnapshot==='function'? m.getAppOpsSnapshot : ()=>({
        perf:{fpsNow:"–",fpsAvg:"–",jank:0,jankMs:0,longTasks:{count:0,totalMs:0}},
        engine:{capRatio:0}, timings:{ent:0,repro:0,food:0,draw:0},
        layout:{reflows:0,heights:[]}, resources:{largest:[]}
      })),
      runModuleMatrix: (typeof m.runModuleMatrix==='function'? m.runModuleMatrix : async()=> "// Modul-Matrix: Funktion nicht verfügbar.\n"),
      generateOps: (typeof m.generateOps==='function'? m.generateOps : ()=>'// appops.generateOps() nicht vorhanden')
    };
  }catch{
    return {
      startCollectors: ()=>{},
      getAppOpsSnapshot: ()=>({
        perf:{fpsNow:"–",fpsAvg:"–",jank:0,jankMs:0,longTasks:{count:0,totalMs:0}},
        engine:{capRatio:0}, timings:{ent:0,repro:0,food:0,draw:0},
        layout:{reflows:0,heights:[]}, resources:{largest:[]}
      }),
      runModuleMatrix: async()=> "// Modul-Matrix: appops.js fehlt.\n",
      generateOps: ()=>'// OPS: appops.js fehlt.'
    };
  }
}

/* öffentlich */
export async function openAppOps(){
  const { host, isOverlay, close } = ensurePanelHost();
  host.innerHTML = ""; if (!isOverlay) host.classList.remove("hidden");
  host.append(buildHeader("App-Ops (Optimierer) — Smart Mode", close));
  const body = document.createElement("div"); body.className = "panel-body"; host.append(body);

  const { startCollectors, getAppOpsSnapshot, runModuleMatrix, generateOps } = await loadAppOps();
  try{ startCollectors(); }catch{}

  const snap = getAppOpsSnapshot();
  const perfCode = mdc('PERF', { v:1, ts:Date.now(), perf:snap.perf, cap:snap.engine?.capRatio||0 });
  const timCode  = mdc('TIM',  { v:1, ts:Date.now(), timings:snap.timings });
  const layCode  = mdc('LAY',  { v:1, ts:Date.now(), layout:snap.layout });
  const resCode  = mdc('RES',  { v:1, ts:Date.now(), resources:snap.resources?.largest||[] });
  const allCode  = mdc('ALL',  { v:1, ts:Date.now(), snapshot:snap });

  // Performance
  {
    const { box, head } = section("Performance", smallCopyBtn("Code", perfCode));
    const s = snap;
    box.append(
      row("FPS (aktuell / Ø)", `<b>${fmt(s.perf.fpsNow)}</b> / <b>${fmt(s.perf.fpsAvg)}</b>`),
      row("Jank (Frames >50ms)", `${fmt(s.perf.jank)} · Summe ~${fmt(s.perf.jankMs)}ms`),
      row("Long Tasks", `${fmt(s.perf.longTasks?.count)} · gesamt ~${fmt(s.perf.longTasks?.totalMs)}ms`),
      row("Engine-Backlog-Quote", `${Math.round((s.engine?.capRatio||0)*100)}%`)
    );
    body.append(box);
  }

  // Timings
  {
    const { box } = section("Timings (pro Frame, ms – EMA)", smallCopyBtn("Code", timCode));
    const t = snap.timings || {};
    const table=document.createElement("div");
    table.innerHTML = `
      <div class="row"><span>Entities</span><span><b>${fmt(t.ent)}</b> ms</span></div>
      <div class="row"><span>Reproduction</span><span><b>${fmt(t.repro)}</b> ms</span></div>
      <div class="row"><span>Food</span><span><b>${fmt(t.food)}</b> ms</span></div>
      <div class="row"><span>Draw</span><span><b>${fmt(t.draw)}</b> ms</span></div>`;
    box.append(table);
    body.append(box);
  }

  // Layout
  {
    const { box } = section("Layout / Topbar", smallCopyBtn("Code", layCode));
    const s = snap;
    box.append(
      row("Reflow-Zähler", `${fmt(s.layout?.reflows)}`),
      row("Höhenverlauf", `${(s.layout?.heights||[]).join(" → ") || "–"}`)
    );
    body.append(box);
  }

  // Ressourcen
  {
    const { box } = section("Ressourcen (größte Assets)", smallCopyBtn("Code", resCode));
    const s = snap;
    const list=document.createElement("div");
    for(const r of (s.resources?.largest||[])){
      const line=document.createElement("div"); line.className="row";
      line.innerHTML=`<span>${r.name} <span class="badge">${r.type}</span></span><span>${r.sizeKB} KB · ${r.duration} ms</span>`;
      list.append(line);
    }
    if(!list.children.length) list.textContent="–";
    box.append(list);
    body.append(box);
  }

  // Module — **Preflight-Check**
  {
    const { box } = section("Module / Exporte (Preflight)");
    const btnRun=document.createElement("button"); btnRun.textContent="Module prüfen";
    const pre=document.createElement("pre"); pre.style.whiteSpace="pre-wrap"; pre.style.marginTop="8px";
    btnRun.onclick=async()=>{ pre.textContent="prüfe …"; pre.textContent = await runModuleMatrix(); };
    box.append(btnRun, pre);
    body.append(box);
  }

  // OPS + Gesamt-Snapshot-Code
  {
    const { box } = section("Vorschläge (MDC-OPS)");
    const opsJSON = generateOps();
    box.append(codeField(opsJSON));
    box.append(codeField(allCode)); // kompletter Snapshot als MDC-OPS
    body.append(box);
  }

  // Refresh
  const footer=document.createElement("div");
  Object.assign(footer.style,{display:"flex",gap:"8px",marginTop:"8px"});
  const btnRefresh=document.createElement("button"); btnRefresh.textContent="Aktualisieren";
  btnRefresh.onclick=()=> openAppOps();
  footer.append(btnRefresh);
  body.append(footer);
}