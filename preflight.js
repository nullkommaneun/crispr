// preflight.js — Deep-Check + UI-Wiring + Canvas-Probe + MDC-CHK (iOS-freundlich)
// - pausiert die Engine während der Diagnose (Resume beim Schließen)
// - Modulmatrix gestreamt (kein "Freeze")
// - "MDC kopieren" mit Clipboard-Fallback

import { PF_MODULES } from "./modmap.js";

const OK  = "✅ ";
const NO  = "❌ ";
const OPT = "⚠️  ";
const $ = id => document.getElementById(id);
const b64 = s => btoa(unescape(encodeURIComponent(s)));

let __pfPausedEngine = false;

/* ---------------------------- Engine Pause/Resume ---------------------------- */
async function pauseEngine() {
  try {
    const m = await import("./engine.js");
    if (typeof m.pause === "function") { m.pause(); __pfPausedEngine = true; }
  } catch {}
}
async function resumeEngine() {
  try {
    if (__pfPausedEngine) {
      const m = await import("./engine.js");
      if (typeof m.start === "function") m.start();
    }
  } catch {} finally { __pfPausedEngine = false; }
}

/* ------------------------------- Overlay-UI --------------------------------- */
function overlay() {
  let root = $("diag-overlay");
  if (root) return root;

  root = document.createElement("div");
  root.id = "diag-overlay";
  root.style.cssText =
    "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.65);" +
    "display:flex;align-items:flex-start;justify-content:center;padding:20px;";
  root.addEventListener("click", e => { if (e.target === root) hide(); });

  const card = document.createElement("div");
  card.style.cssText =
    "max-width:1100px;width:96%;max-height:86vh;overflow:auto;background:#10161d;" +
    "border:1px solid #2a3b4a;border-radius:12px;color:#d6e1ea;padding:14px;" +
    "box-shadow:0 30px 70px rgba(0,0,0,.45);";

  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;gap:8px;align-items:center;justify-content:space-between;margin-bottom:8px;";
  const h = document.createElement("h3");
  h.textContent = "Start-Diagnose (Deep-Check + UI-Wiring)";
  h.style.margin = "0";

  const btns = document.createElement("div");
  btns.style.cssText = "display:flex;gap:6px;";

  const btnCopy = document.createElement("button");
  btnCopy.id = "btnMdcCopy";
  btnCopy.textContent = "MDC kopieren";

  const btnRerun = document.createElement("button");
  btnRerun.textContent = "Erneut prüfen";
  btnRerun.onclick = () => diagnose();

  const btnClose = document.createElement("button");
  btnClose.textContent = "Schließen";
  btnClose.onclick = hide;

  btns.append(btnCopy, btnRerun, btnClose);
  bar.append(h, btns);

  const pre = document.createElement("pre");
  pre.id = "diag-box";
  pre.style.cssText = "white-space:pre-wrap;margin:0;font:13px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;";

  card.append(bar, pre);
  root.append(card);
  document.body.appendChild(root);

  // Copy-Button verbindet sich auf den aktuellen MDC
  btnCopy.onclick = () => {
    const code = pre.dataset.mdc || "";
    copySafe(code, btnCopy);
  };

  return root;
}
function show(lines) {
  const root = overlay();
  root.style.display = "flex";
  const box = $("diag-box");
  box.textContent = Array.isArray(lines) ? lines.join("\n") : String(lines||"");
}
function append(line) {
  const box = $("diag-box") || overlay().querySelector("#diag-box");
  box.textContent += (box.textContent ? "\n" : "") + line;
}
function setMdc(mdc) {
  const box = $("diag-box");
  if (box) box.dataset.mdc = mdc;
}
async function hide() {
  const root = $("diag-overlay");
  if (root) root.style.display = "none";
  await resumeEngine();
}

/* ------------------------------ Clipboard-Fallback --------------------------- */
async function copySafe(text, btn) {
  try {
    await navigator.clipboard.writeText(text || "");
    if (btn) { const t = btn.textContent; btn.textContent = "Kopiert ✓"; setTimeout(()=>btn.textContent=t, 900); }
    return;
  } catch {}
  // Fallback für iOS/Safari
  try {
    const ta = document.createElement("textarea");
    ta.value = text || "";
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    if (btn) { const t = btn.textContent; btn.textContent = "Kopiert ✓"; setTimeout(()=>btn.textContent=t, 900); }
  } catch {}
}

/* --------------------------------- RUNTIME ---------------------------------- */
function rtSnapshot(){
  const boot = !!window.__bootOK;
  const fc   = window.__frameCount|0;
  const fps  = window.__fpsEMA ? Math.round(window.__fpsEMA) : 0;
  const cells= window.__cellsN|0, food= window.__foodN|0;
  const last = window.__lastStepAt ? new Date(window.__lastStepAt).toLocaleTimeString() : "–";
  const errs = (Array.isArray(window.__runtimeErrors) ? window.__runtimeErrors.length : 0) | 0;
  return { boot, fc, fps, cells, food, last, errs };
}

async function uiCheck(){
  const ui = {
    btnStart:!!$("btnStart"), btnPause:!!$("btnPause"), btnReset:!!$("btnReset"),
    chkPerf:!!$("chkPerf"),
    btnEditor:!!$("btnEditor"), btnEnv:!!$("btnEnv"),
    btnAppOps:!!$("btnAppOps"), btnDiag:!!$("btnDiag"),
    sliderMutation:!!$("sliderMutation"), sliderFood:!!$("sliderFood"),
    canvas:!!$("scene")
  };
  const fn = {};
  try{ const m=await import("./engine.js");       fn.start=typeof m.start==='function'; fn.pause=typeof m.pause==='function'; fn.reset=typeof m.reset==='function'; fn.setTS=typeof m.setTimescale==='function'; fn.setPerf=typeof m.setPerfMode==='function'; }catch(e){ fn._engineErr=String(e); }
  try{ const m=await import("./reproduction.js"); fn.setMutation=typeof m.setMutationRate==='function'; }catch(e){}
  try{ const m=await import("./food.js");         fn.setFood=typeof m.setSpawnRate==='function'; }catch(e){}
  try{ const m=await import("./editor.js");       fn.openEditor=typeof m.openEditor==='function'; }catch(e){}
  try{ const m=await import("./environment.js");  fn.openEnv=typeof m.openEnvPanel==='function'; }catch(e){}
  try{ const m=await import("./appops_panel.js"); fn.openOps=typeof m.openAppOps==='function'; }catch(e){}
  // Canvas-Probe
  let canvas2D=false; try{ const c=$("scene"); canvas2D=!!(c&&c.getContext&&c.getContext("2d")); }catch{}
  ui.canvas2D=canvas2D; return {ui,fn};
}

/* -------------------------------- Modulmatrix ------------------------------- */
async function checkModule({path, wants=[], optional=false}) {
  try{
    const m = await import(path);
    const miss = wants.filter(k => !(k in m));
    if (miss.length) return (optional?OPT:NO) + `${path} · fehlt: ${miss.join(", ")} ${optional?"(optional)":""}`;
    return OK + path + " OK";
  }catch(e){
    const msg = String(e?.message || e);
    return (optional?OPT:NO) + `${path} · Import/Parse fehlgeschlagen → ${msg} ${optional?"(optional)":""}`;
  }
}
async function runModuleMatrixStreaming() {
  for (let i=0;i<PF_MODULES.length;i++){
    const line = await checkModule(PF_MODULES[i]);
    append(line);
    // UI freigeben (wichtig für iOS Safari)
    await new Promise(r => setTimeout(r, 0));
  }
}

/* -------------------------------- Diagnose --------------------------------- */
export async function diagnose(){
  // Engine bremsen, bevor viel UI gebaut wird
  await pauseEngine();

  const rt = rtSnapshot();
  const head = [
    "Start-Diagnose (Deep-Check + UI-Wiring)\n",
    `Boot-Flag: ${rt.boot ? "gesetzt" : "fehlt"}`,
    `Frames: ${rt.fc}  ·  FPS≈ ${rt.fps}`,
    `Zellen: ${rt.cells}  ·  Food: ${rt.food}`,
    `Letzter Step: ${rt.last}`,
    `Runtime-Fehler im Log: ${rt.errs}\n`,
    "UI/Wiring:"
  ];
  show(head);

  const {ui, fn} = await uiCheck();
  const mark = (ok, label, hint="") =>
    append((ok?OK:NO) + label + (hint?(" — "+hint):""));

  mark(ui.btnStart  && fn.start,  "Start-Button → engine.start()",  !ui.btnStart?"Button fehlt":(!fn.start?"API fehlt":""));
  mark(ui.btnPause  && fn.pause,  "Pause-Button → engine.pause()",  !ui.btnPause?"Button fehlt":(!fn.pause?"API fehlt":""));
  mark(ui.btnReset  && fn.reset,  "Reset-Button → engine.reset()",  !ui.btnReset?"Button fehlt":(!fn.reset?"API fehlt":""));
  mark(ui.chkPerf   && fn.setPerf,"Perf-Checkbox → engine.setPerfMode()", !ui.chkPerf?"Checkbox fehlt":(!fn.setPerf?"API fehlt":""));
  mark(ui.sliderMutation && fn.setMutation,"Slider Mutation% → reproduction.setMutationRate()", !ui.sliderMutation?"Slider fehlt":(!fn.setMutation?"API fehlt":""));
  mark(ui.sliderFood && fn.setFood,"Slider Nahrung/s → food.setSpawnRate()", !ui.sliderFood?"Slider fehlt":(!fn.setFood?"API fehlt":""));
  mark(ui.btnEditor && fn.openEditor,"CRISPR-Editor → editor.openEditor()", !ui.btnEditor?"Button fehlt":(!fn.openEditor?"API fehlt":""));
  mark(ui.btnEnv    && fn.openEnv,  "Umwelt-Panel → environment.openEnvPanel()", !ui.btnEnv?"Button fehlt":(!fn.openEnv?"API fehlt":""));
  mark(ui.btnAppOps && fn.openOps,  "App-Ops → appops_panel.openAppOps()", !ui.btnAppOps?"Button fehlt":(!fn.openOps?"API fehlt":""));
  append((ui.canvas?OK:NO) + "Canvas #scene vorhanden");
  append((ui.canvas2D?OK:NO)+ "2D-Context erzeugbar");
  append(""); append("Module/Exporte:");

  // Modulmatrix — gestreamt
  await runModuleMatrixStreaming();

  // Fehler-Log
  const errs = Array.isArray(window.__runtimeErrors) ? window.__runtimeErrors.slice(-4) : [];
  if (errs.length){
    append(""); append("Laufzeitfehler (letzte 4):"); append("");
    for (const e of errs){
      append(`[${new Date(e.ts).toLocaleTimeString()}] ${e.where||e.when}\n${String(e.msg||"")}`);
    }
  }

  // MDC
  const payload = { v:1, kind:"ui-diagnose", ts:Date.now(), runtime: rtSnapshot() };
  const mdc = `MDC-CHK-${Math.random().toString(16).slice(2,6)}-${b64(JSON.stringify(payload))}`;
  append(""); append("Maschinencode:"); append(mdc);
  setMdc(mdc);
}

/* -------------------------------- Auto-Hook -------------------------------- */
// sanft: kleine Wartezeit, damit engine.boot() das Flag setzen kann
(function(){
  try{
    const q = new URLSearchParams(location.search);
    if (q.get("pf")==="1" || location.hash==="#pf") {
      window.addEventListener("load", () => setTimeout(diagnose, 300));
    }
  }catch{}
})();