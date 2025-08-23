// appops_panel.js — App-Ops (Optimierer) Panel, robust mit Fallbacks

function buildHeader(title, onClose){
  const wrap = document.createElement("div");
  wrap.className = "panel-header";
  wrap.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <h2 style="margin:0">${title}</h2>
      <div style="display:flex;gap:6px;">
        <button id="btnPref" class="ghost">Preflight</button>
        <button class="closeX" aria-label="Schließen">&times;</button>
      </div>
    </div>`;
  wrap.querySelector(".closeX").onclick = onClose;
  return wrap;
}
function section(title){
  const box=document.createElement("div");
  Object.assign(box.style,{border:"1px solid #22303a",borderRadius:"8px",padding:"10px",margin:"8px 0"});
  const head=document.createElement("div");
  Object.assign(head.style,{display:"flex",justifyContent:"space-between",alignItems:"center",gap:"8px"});
  const h=document.createElement("b"); h.textContent=title;
  const copy=document.createElement("button"); copy.className="ghost"; copy.textContent="Code kopieren"; copy.style.visibility="hidden";
  head.append(h,copy); box.append(head);
  return {box,head,copyBtn:copy};
}
function row(label, html){
  const r=document.createElement("div"); r.className="row";
  const l=document.createElement("span"); l.textContent=label;
  const v=document.createElement("span"); v.innerHTML=html;
  r.append(l,v); return r;
}
function codeField(value){
  const wrap=document.createElement("div");
  Object.assign(wrap.style,{display:"grid",gridTemplateColumns:"1fr auto",gap:"8px",marginTop:"6px"});
  const ta=document.createElement("textarea");
  Object.assign(ta.style,{
    width:"100%",height:"120px",background:"#0b1217",border:"1px solid #2a3a46",
    borderRadius:"8px",color:"#d8f0ff",font:"12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
  });
  ta.readOnly=true; ta.value=value ?? "";
  const btn=document.createElement("button"); btn.textContent="OPS kopieren";
  btn.onclick=async()=>{ try{ await navigator.clipboard.writeText(ta.value); btn.textContent="Kopiert ✓"; setTimeout(()=>btn.textContent="OPS kopieren",1200);}catch{} };
  wrap.append(ta,btn); return wrap;
}
const fmt = v => (v!=null && v===v) ? (typeof v==='number'? v.toFixed(1): String(v)) : "–";

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

async function loadAppOps(){
  try{
    const m = await import("./appops.js?v="+Date.now());
    return {
      startCollectors: (typeof m.startCollectors==='function'? m.startCollectors : ()=>{}),
      getAppOpsSnapshot: (typeof m.getAppOpsSnapshot==='function'? m.getAppOpsSnapshot : ()=>({perf:{},engine:{},layout:{},resources:{largest:[]},timings:{}})),
      runModuleMatrix: (typeof m.runModuleMatrix==='function'? m.runModuleMatrix : async()=> "// Modul-Matrix: Funktion nicht verfügbar."),
      generateOps: (typeof m.generateOps==='function'? m.generateOps : ()=>'// appops.generateOps() nicht vorhanden'),
      getMdcCodes: (typeof m.getMdcCodes==='function'? m.getMdcCodes : ()=>({all:"",perf:"",timings:"",layout:"",res:""}))
    };
  }catch{
    return {
      startCollectors: ()=>{},
      getAppOpsSnapshot: ()=>({perf:{},engine:{},layout:{},resources:{largest:[]},timings:{}}),
      runModuleMatrix: async()=> "// Modul-Matrix: appops.js fehlt.",
      generateOps: ()=>'// OPS: appops.js fehlt.',
      getMdcCodes: ()=>({all:"",perf:"",timings:"",layout:"",res:""})
    };
  }
}

/* ---------- öffentlich ---------- */
export async function openAppOps(){
  const { host, isOverlay, close } = ensurePanelHost();
  host.innerHTML = ""; if (!isOverlay) host.classList.remove("hidden");

  const head = buildHeader("App-Ops (Optimierer) — Smart Mode", close);
  host.append(head);

  // Preflight direkt aus Smart-Ops öffnen
  head.querySelector("#btnPref").onclick = async()=>{
    try{ const m = await import("./preflight.js?v="+Date.now()); m.diagnose(); }catch{}
  };

  const body = document.createElement("div"); body.className = "panel-body"; host.append(body);

  const { startCollectors, getAppOpsSnapshot, runModuleMatrix, generateOps, getMdcCodes } = await loadAppOps();
  try{ startCollectors(); }catch{}

  // Performance
  {
    const { box, copyBtn } = section("Performance");
    const s = getAppOpsSnapshot(); const codes = getMdcCodes();
    copyBtn.style.visibility="visible";
    copyBtn.onclick = async()=>{ try{ await navigator.clipboard.writeText(codes.perf); copyBtn.textContent="Kopiert ✓"; setTimeout(()=>copyBtn.textContent="Code kopieren",1200);}catch{} };
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
    const { box, copyBtn } = section("Timings (pro Frame, ms – EMA)");
    const t = (getAppOpsSnapshot()?.timings) || {}; const codes = getMdcCodes();
    copyBtn.style.visibility="visible";
    copyBtn.onclick = async()=>{ try{ await navigator.clipboard.writeText(codes.timings); copyBtn.textContent="Kopiert ✓"; setTimeout(()=>copyBtn.textContent="Code kopieren",1200);}catch{} };
    const table=document.createElement("div");
    table.innerHTML = `
      <div class="row"><span>Entities</span><span><b>${fmt(t.ent)}</b> ms</span></div>
      <div class="row"><span>Reproduction</span><span><b>${fmt(t.repro)}</b> ms</span></div>
      <div class="row"><span>Food</span><span><b>${fmt(t.food)}</b> ms</span></div>
      <div class="row"><span>Draw</span><span><b>${fmt(t.draw)}</b> ms</span></div>`;
    box.append(table); body.append(box);
  }

  // Layout
  {
    const { box, copyBtn } = section("Layout / Topbar");
    const s = getAppOpsSnapshot(); const codes = getMdcCodes();
    copyBtn.style.visibility="visible";
    copyBtn.onclick = async()=>{ try{ await navigator.clipboard.writeText(codes.layout); copyBtn.textContent="Kopiert ✓"; setTimeout(()=>copyBtn.textContent="Code kopieren",1200);}catch{} };
    box.append(
      row("Reflow-Zähler", `${fmt(s.layout?.reflows)}`),
      row("Höhenverlauf", `${(s.layout?.heights||[]).join(" → ") || "–"}`)
    );
    body.append(box);
  }

  // Ressourcen
  {
    const { box, copyBtn } = section("Ressourcen (größte Assets)");
    const s = getAppOpsSnapshot(); const codes = getMdcCodes();
    copyBtn.style.visibility="visible";
    copyBtn.onclick = async()=>{ try{ await navigator.clipboard.writeText(codes.res); copyBtn.textContent="Kopiert ✓"; setTimeout(()=>copyBtn.textContent="Code kopieren",1200);}catch{} };
    const list=document.createElement("div");
    for(const r of (s.resources?.largest||[])){
      const line=document.createElement("div"); line.className="row";
      line.innerHTML=`<span>${r.name} <span class="badge">${r.type}</span></span><span>${r.sizeKB} KB · ${r.duration} ms</span>`;
      list.append(line);
    }
    if(!list.children.length) list.textContent="–";
    box.append(list); body.append(box);
  }

  // Module (Preflight-äquivalent)
  {
    const { box } = section("Module / Exporte");
    const btnRun=document.createElement("button"); btnRun.textContent="Module prüfen (Preflight)";
    const pre=document.createElement("pre"); pre.style.whiteSpace="pre-wrap"; pre.style.marginTop="8px";
    btnRun.onclick=async()=>{ pre.textContent=await runModuleMatrix(); };
    box.append(btnRun, pre); body.append(box);
  }

  // OPS + Gesamtmaschine
  {
    const { box } = section("Vorschläge (MDC-OPS)");
    const opsJSON = generateOps();
    box.append(codeField(opsJSON));
    const codes = document.createElement("div"); codes.style.marginTop="8px";
    try{
      const all = (await import("./appops.js?v="+Date.now())).getMdcCodes?.() || {};
      codes.append(codeField(all.all||""));
    }catch{ codes.append(codeField("// getMdcCodes() nicht verfügbar")); }
    box.append(codes);
    body.append(box);
  }

  const footer=document.createElement("div");
  Object.assign(footer.style,{display:"flex",gap:"8px",marginTop:"8px"});
  const btnRefresh=document.createElement("button"); btnRefresh.textContent="Aktualisieren";
  btnRefresh.onclick=()=> openAppOps();
  footer.append(btnRefresh); body.append(footer);
}