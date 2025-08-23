// preflight.js — Deep-Check + UI-Wiring + Canvas-Probe + MDC-CHK
const $  = (id)=>document.getElementById(id);
const OK = "✅ ", NO = "❌ ", OPT = "⚠️  ";
const b64 = (s)=> btoa(unescape(encodeURIComponent(s)));

async function pauseEngine() {
  try { const m = await import("./engine.js"); m.pause?.(); } catch {}
}
async function resumeEngine() {
  try {
    const m = await import("./engine.js");
    if (!window.__bootOK) await m.boot?.();
    m.start?.();
  } catch {}
}

// -------- Overlay ------------------------------------------------------------
function ensureOverlay(){
  let ov = $("pf-overlay");
  if (ov) return ov;

  ov = document.createElement("div");
  ov.id = "pf-overlay";
  ov.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:flex;align-items:flex-start;justify-content:center;padding:22px;";

  const card = document.createElement("div");
  card.id = "pf-card";
  card.style.cssText = "max-width:1100px;width:96%;max-height:86vh;overflow:auto;background:#0f1620;color:#d6e1ea;border:1px solid #2a3b4a;border-radius:12px;box-shadow:0 30px 70px rgba(0,0,0,.45);";

  const head = document.createElement("div");
  head.style.cssText = "display:flex;gap:8px;align-items:center;justify-content:flex-end;padding:10px;border-bottom:1px solid #22303a;background:#0b1217";
  const lbl  = document.createElement("div");
  lbl.id = "pf-state";
  lbl.style.cssText = "margin-right:auto;color:#9bb7c9;font-weight:600";
  lbl.textContent = "Engine angehalten (Preflight kann ruckeln)";

  const btnRun   = document.createElement("button"); btnRun.textContent="Weiterlaufen";
  const btnCopy  = document.createElement("button"); btnCopy.textContent="MDC kopieren";
  const btnAgain = document.createElement("button"); btnAgain.textContent="Erneut prüfen";
  const btnClose = document.createElement("button"); btnClose.textContent="Schließen";
  for (const b of [btnRun,btnCopy,btnAgain,btnClose]){
    b.style.cssText="background:#1b2733;color:#cfe6ff;border:1px solid #2e4154;border-radius:8px;padding:6px 10px;cursor:pointer";
  }
  head.append(lbl, btnRun, btnCopy, btnAgain, btnClose);

  const pre = document.createElement("pre");
  pre.id = "pf-pre";
  pre.style.cssText = "white-space:pre-wrap;margin:0;padding:14px;font:13px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;";

  card.append(head, pre);
  ov.append(card);
  document.body.appendChild(ov);

  // Events
  btnClose.onclick = ()=> ov.remove();
  btnRun.onclick   = async()=>{ await resumeEngine(); ov.remove(); };
  btnAgain.onclick = ()=> diagnose(); // re-run
  btnCopy.onclick  = ()=> {
    try {
      const mdc = pre.getAttribute("data-mdc") || "";
      navigator.clipboard.writeText(mdc);
      btnCopy.textContent = "Kopiert ✓"; setTimeout(()=>btnCopy.textContent="MDC kopieren", 1200);
    } catch {}
  };

  return ov;
}

// -------- Module-Matrix ------------------------------------------------------
async function checkModule(path, wants=[], optional=false){
  try {
    const m = await import(path);
    const miss = wants.filter(k => !(k in m));
    if (miss.length) return { ok:false, line:(optional?OPT:NO)+`${path} · fehlt: ${miss.join(", ")}${optional?" (optional)":""}` };
    return { ok:true, line: OK+path+" OK" };
  } catch(e){
    const msg = String(e?.message||e);
    return { ok:false, line:(optional?OPT:NO)+`${path} · Import/Parse fehlgeschlagen → ${msg}${optional?" (optional)":""}` };
  }
}

async function runModuleMatrix(){
  const MODS = [
    {p:"./event.js",        want:["on","emit"]},
    {p:"./config.js",       want:[], optional:true},
    {p:"./errorManager.js", want:["initErrorManager","report"]},
    {p:"./engine.js",       want:["boot","start","pause","reset","setTimescale","setPerfMode"]},
    {p:"./entities.js",     want:["setWorldSize","createAdamAndEve","step","getCells","getFoodItems","applyEnvironment"]},
    {p:"./reproduction.js", want:["step","setMutationRate"]},
    {p:"./food.js",         want:["step","setSpawnRate"]},
    {p:"./renderer.js",     want:["draw","setPerfMode"]},
    {p:"./metrics.js",      want:["getPhases","getEconSnapshot","getPopSnapshot","getDriftSnapshot","getMateSnapshot"]},
    {p:"./drives.js",       want:["getDrivesSnapshot","getTraceText"], optional:true},
    // Tools
    {p:"./editor.js",       want:["openEditor"], optional:true},
    {p:"./environment.js",  want:["openEnvPanel"], optional:true},
    {p:"./appops_panel.js", want:["openAppOps"], optional:true},
    {p:"./appops.js",       want:["generateOps"], optional:true},
    {p:"./advisor.js",      want:["setMode","getMode","scoreCell","sortCells"], optional:true},
    {p:"./grid.js",         want:["createGrid"], optional:true},
    {p:"./bootstrap.js",    want:[], optional:true},
    {p:"./sw.js",           want:[], optional:true},
    {p:"./diag.js",         want:["openDiagPanel"], optional:true},
  ];
  const out=[];
  for(const spec of MODS){ out.push((await checkModule(spec.p, spec.want, !!spec.optional)).line); }
  return out.join("\n");
}

// -------- UI & Runtime Checks -----------------------------------------------
async function uiCheck(){
  const q = (id)=> !!$(id);
  const ui = {
    btnStart:q("btnStart"), btnPause:q("btnPause"), btnReset:q("btnReset"),
    chkPerf:q("chkPerf"),
    btnEditor:q("btnEditor"), btnEnv:q("btnEnv"), btnAppOps:q("btnAppOps"), btnDiag:q("btnDiag"),
    sliderMutation:q("sliderMutation"), sliderFood:q("sliderFood"),
    canvas:q("scene")
  };
  const fn = {};
  try{ const m = await import("./engine.js");
       fn.start=typeof m.start==="function";
       fn.pause=typeof m.pause==="function";
       fn.reset=typeof m.reset==="function";
       fn.setTS=typeof m.setTimescale==="function";
       fn.setPerf=typeof m.setPerfMode==="function";
  }catch(e){ fn._engineErr = String(e); }
  try{ const m = await import("./reproduction.js"); fn.setMutation=typeof m.setMutationRate==="function"; }catch{}
  try{ const m = await import("./food.js");         fn.setFood    =typeof m.setSpawnRate   ==="function"; }catch{}
  try{ const m = await import("./editor.js");       fn.openEditor =typeof m.openEditor     ==="function"; }catch{}
  try{ const m = await import("./environment.js");  fn.openEnv    =typeof m.openEnvPanel   ==="function"; }catch{}
  try{ const m = await import("./appops_panel.js"); fn.openOps    =typeof m.openAppOps     ==="function"; }catch{}
  // Canvas-Probe
  let canvas2D=false; try{ const c=$("scene"); canvas2D=!!(c&&c.getContext&&c.getContext("2d")); }catch{}
  return {ui,fn,canvas2D};
}

function runtime(){
  const boot = !!window.__bootOK;
  const fc   = window.__frameCount|0;
  const fps  = window.__fpsEMA? Math.round(window.__fpsEMA) : 0;
  const cells= window.__cellsN|0, food=window.__foodN|0;
  const last = window.__lastStepAt? new Date(window.__lastStepAt).toLocaleTimeString() : "–";
  const errs = (Array.isArray(window.__runtimeErrors)? window.__runtimeErrors.length:0)|0;
  return {boot,fc,fps,cells,food,last,errs};
}

// -------- Diagnose (Hauptfunktion) ------------------------------------------
export async function diagnose(){
  await pauseEngine();                         // Engine pausieren (friert UI nicht mehr ein)
  ensureOverlay();
  const pre = $("pf-pre"), lbl = $("pf-state");
  if (lbl) lbl.textContent = "Engine angehalten (Preflight kann ruckeln)";

  const rt = runtime();

  const W = [];
  const mark = (ok,label,hint="") => W.push((ok?OK:NO)+label+(hint?(" — "+hint):""));
  const wiring = await uiCheck();

  mark(wiring.ui.btnStart && wiring.fn.start, "Start-Button → engine.start()",  wiring.ui.btnStart? (wiring.fn.start?"":"API fehlt") : "Button fehlt");
  mark(wiring.ui.btnPause && wiring.fn.pause, "Pause-Button → engine.pause()",  wiring.ui.btnPause? (wiring.fn.pause?"":"API fehlt") : "Button fehlt");
  mark(wiring.ui.btnReset && wiring.fn.reset, "Reset-Button → engine.reset()",  wiring.ui.btnReset? (wiring.fn.reset?"":"API fehlt") : "Button fehlt");
  mark(wiring.ui.chkPerf  && wiring.fn.setPerf,"Perf-Checkbox → engine.setPerfMode()", wiring.ui.chkPerf? (wiring.fn.setPerf?"":"API fehlt") : "Checkbox fehlt");
  mark(wiring.ui.sliderMutation && wiring.fn.setMutation,"Slider Mutation% → reproduction.setMutationRate()", wiring.ui.sliderMutation? (wiring.fn.setMutation?"":"API fehlt") : "Slider fehlt");
  mark(wiring.ui.sliderFood && wiring.fn.setFood,"Slider Nahrung/s → food.setSpawnRate()", wiring.ui.sliderFood? (wiring.fn.setFood?"":"API fehlt") : "Slider fehlt");
  mark(wiring.ui.btnEditor && wiring.fn.openEditor,"CRISPR-Editor → editor.openEditor()", wiring.ui.btnEditor? (wiring.fn.openEditor?"":"API fehlt") : "Button fehlt");
  mark(wiring.ui.btnEnv && wiring.fn.openEnv,"Umwelt-Panel → environment.openEnvPanel()", wiring.ui.btnEnv? (wiring.fn.openEnv?"":"API fehlt") : "Button fehlt");
  mark(wiring.ui.btnAppOps && wiring.fn.openOps,"App-Ops → appops_panel.openAppOps()", wiring.ui.btnAppOps? (wiring.fn.openOps?"":"API fehlt") : "Button fehlt");
  W.push((wiring.ui.canvas?OK:NO)+"Canvas #scene vorhanden");
  W.push((wiring.canvas2D?OK:NO)+"2D-Context erzeugbar");

  const modText = await runModuleMatrix();

  const lines = [];
  lines.push("Start-Diagnose (Deep-Check + UI-Wiring)\n");
  lines.push(`Boot-Flag: ${rt.boot?"gesetzt":"fehlt"}`);
  lines.push(`Frames: ${rt.fc}  ·  FPS≈ ${rt.fps}`);
  lines.push(`Zellen: ${rt.cells}  ·  Food: ${rt.food}`);
  lines.push(`Letzter Step: ${rt.last}`);
  lines.push(`Runtime-Fehler im Log: ${rt.errs}\n`);
  lines.push("UI/Wiring:"); lines.push(...W,"");
  lines.push("Module/Exporte:"); lines.push(modText,"");

  // MDC bauen
  const payload = { v:1, kind:"ui-diagnose", ts:Date.now(), runtime:rt, wiring, modules:modText };
  const mdc = `MDC-CHK-${Math.random().toString(16).slice(2,6)}-${b64(JSON.stringify(payload))}`;
  pre.setAttribute("data-mdc", mdc);

  lines.push("Maschinencode:", mdc, "");
  $("pf-pre").textContent = lines.join("\n");
}

// Auto-Hook: ?pf=1  → sofort öffnen
(function(){
  try{
    const q = new URLSearchParams(location.search);
    if (q.get("pf")==="1") window.addEventListener("load", ()=>diagnose());
  }catch{}
})();