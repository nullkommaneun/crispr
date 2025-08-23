// preflight.js — Deep-Check + UI-Wiring + Engine-Guard + MDC-CHK
// - Kein externes modmap.js nötig
// - ?pf=1 hält Engine an; "Weiterlaufen" startet sauber weiter

/* ───────────── kleine Hilfen ───────────── */
const $ = (id) => document.getElementById(id);
const OK = "✅ ", NO = "❌ ", OPT = "⚠️  ";
const b64 = (obj) => btoa(unescape(encodeURIComponent(
  typeof obj === "string" ? obj : JSON.stringify(obj)
)));

/* ───────────── Overlay UI ───────────── */
function ensureOverlay() {
  let ov = $("diag-overlay");
  if (ov) return ov;

  ov = document.createElement("div");
  ov.id = "diag-overlay";
  ov.style.cssText = `
    position:fixed; inset:0; z-index:99999;
    background:rgba(0,0,0,.60); display:flex; align-items:flex-start;
    justify-content:center; padding:20px;
  `;

  const card = document.createElement("div");
  card.id = "diag-card";
  card.style.cssText = `
    width:min(1100px,96vw); max-height:90vh; overflow:auto;
    background:#0f151c; color:#d6e1ea; border:1px solid #2a3b4a;
    border-radius:12px; box-shadow:0 30px 60px rgba(0,0,0,.45);
    font:14px/1.5 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  `;

  const head = document.createElement("div");
  head.style.cssText = `
    display:flex; gap:8px; align-items:center; justify-content:flex-end;
    position:sticky; top:0; background:#0f151c; padding:10px; border-bottom:1px solid #22303a;
  `;

  const btnRun   = mkBtn("Erneut prüfen");
  const btnCopy  = mkBtn("MDC kopieren");
  const btnGo    = mkBtn("Weiterlaufen");
  const btnClose = mkBtn("Schließen");

  btnRun.id   = "pf-run";
  btnCopy.id  = "pf-copy";
  btnGo.id    = "pf-go";
  btnClose.id = "pf-close";

  head.append(btnGo, btnCopy, btnRun, btnClose);

  const pre = document.createElement("pre");
  pre.id = "diag-box";
  pre.style.cssText = `
    margin:0; padding:16px; white-space:pre-wrap;
  `;

  card.append(head, pre);
  ov.append(card);
  document.body.appendChild(ov);

  // Buttons verdrahten
  btnRun.onclick   = () => diagnose(true);
  btnCopy.onclick  = () => copyMDC();
  btnGo.onclick    = () => resumeEngine();
  btnClose.onclick = () => closeOverlay();

  return ov;
}

function mkBtn(label){
  const b = document.createElement("button");
  b.textContent = label;
  b.style.cssText = `
    padding:8px 10px; border:1px solid #3a5064; border-radius:8px;
    background:#1a2531; color:#cfe7ff; cursor:pointer;
  `;
  return b;
}

function show(text){
  ensureOverlay();
  $("diag-box").textContent = text;
}
function closeOverlay(){
  const o = $("diag-overlay");
  if (o) o.remove();
}

/* ───────────── Runtime / Engine Control ───────────── */
function runtime(){
  const boot  = !!window.__bootOK;
  const fc    = window.__frameCount|0;
  const fps   = window.__fpsEMA ? Math.round(window.__fpsEMA) : 0;
  const cells = window.__cellsN|0;
  const food  = window.__foodN|0;
  const last  = window.__lastStepAt ? new Date(window.__lastStepAt).toLocaleTimeString() : "–";
  const errs  = (Array.isArray(window.__runtimeErrors) ? window.__runtimeErrors.length : 0) | 0;
  return { boot, fc, fps, cells, food, last, errs };
}

async function pauseEngineSoft(){
  try{ const m = await import("./engine.js"); m.pause?.(); }catch{}
}
async function resumeEngine(){
  try{
    const m = await import("./engine.js");
    window.__NO_BOOT = false;
    if (!window.__APP_BOOTED) {
      // noch nie gebootet → jetzt boot()
      await m.boot?.();
    } else {
      // bereits gebootet → nur weiterlaufen
      m.start?.();
    }
  }catch(e){
    console.warn("[preflight] resumeEngine:", e);
  }finally{
    closeOverlay();
  }
}

/* ───────────── Modul-Matrix (ohne modmap.js) ───────────── */
const MODS = [
  { p:"./event.js",        want:["on","emit"] },
  { p:"./config.js",       want:[], optional:true },
  { p:"./errorManager.js", want:["initErrorManager","report"] },
  { p:"./engine.js",       want:["boot","start","pause","reset","setTimescale","setPerfMode"] },
  { p:"./entities.js",     want:["setWorldSize","createAdamAndEve","step","getCells","getFoodItems","applyEnvironment"] },
  { p:"./reproduction.js", want:["step","setMutationRate"] },
  { p:"./food.js",         want:["step","setSpawnRate"] },
  { p:"./renderer.js",     want:["draw","setPerfMode"] },
  { p:"./metrics.js",      want:["beginTick","phaseStart","phaseEnd","readEnergyAndReset","getPhases"] },
  { p:"./drives.js",       want:["getDrivesSnapshot"], optional:true },

  // Tools/Extras (optional)
  { p:"./editor.js",       want:["openEditor"], optional:true },
  { p:"./environment.js",  want:["openEnvPanel"], optional:true },
  { p:"./appops_panel.js", want:["openAppOps"], optional:true },
  { p:"./appops.js",       want:["generateOps"], optional:true },
  { p:"./advisor.js",      want:["setMode","getMode","scoreCell","sortCells"], optional:true },
  { p:"./grid.js",         want:["createGrid"], optional:true },
  { p:"./bootstrap.js",    want:[], optional:true },
  { p:"./sw.js",           want:[], optional:true },
  { p:"./diag.js",         want:["openDiagPanel"], optional:true },
];

async function chkOne({p,want=[],optional=false}){
  try{
    const m = await import(p);
    const miss = want.filter(k => !(k in m));
    if (miss.length) {
      return { ok:false, line:(optional?OPT:NO) + `${p} · fehlt Export ${miss.join(", ")}${optional?" (optional)":""}` };
    }
    return { ok:true, line:OK + p + " OK" };
  }catch(e){
    const msg = String(e?.message || e);
    return { ok:false, line:(optional?OPT:NO) + `${p} · Import/Parse fehlgeschlagen → ${msg}${optional?" (optional)":""}` };
  }
}

async function runModuleMatrix(){
  const lines = [];
  for (const spec of MODS){
    lines.push( (await chkOne(spec)).line );
  }
  return lines.join("\n");
}

/* ───────────── UI-Wiring ───────────── */
async function uiCheck(){
  const ui = {
    btnStart: !!$("btnStart"), btnPause: !!$("btnPause"), btnReset: !!$("btnReset"),
    chkPerf:  !!$("chkPerf"),
    btnEditor:!!$("btnEditor"), btnEnv: !!$("btnEnv"),
    btnAppOps:!!$("btnAppOps"), btnDiag:!!$("btnDiag"),
    sliderMutation: !!$("sliderMutation"), sliderFood: !!$("sliderFood"),
    canvas: !!$("scene")
  };
  const fn = {};
  try{
    const m = await import("./engine.js");
    fn.start   = typeof m.start        === "function";
    fn.pause   = typeof m.pause        === "function";
    fn.reset   = typeof m.reset        === "function";
    fn.setTS   = typeof m.setTimescale === "function";
    fn.setPerf = typeof m.setPerfMode  === "function";
  }catch(e){ fn._engineErr = String(e); }

  try{ const m = await import("./reproduction.js"); fn.setMutation = typeof m.setMutationRate === "function"; }catch{}
  try{ const m = await import("./food.js");         fn.setFood     = typeof m.setSpawnRate    === "function"; }catch{}
  try{ const m = await import("./editor.js");       fn.openEditor  = typeof m.openEditor      === "function"; }catch{}
  try{ const m = await import("./environment.js");  fn.openEnv     = typeof m.openEnvPanel    === "function"; }catch{}
  try{ const m = await import("./appops_panel.js"); fn.openOps     = typeof m.openAppOps      === "function"; }catch{}

  // Canvas 2D Probe
  let canvas2D=false; try{ const c=$("scene"); canvas2D=!!(c&&c.getContext&&c.getContext("2d")); }catch{}
  return { ui: { ...ui, canvas2D }, fn };
}

/* ───────────── Diagnose / Ausgabe ───────────── */
let lastMdc = "";

export async function diagnose(skipPause=false){
  ensureOverlay();

  // Engine pausieren, außer wenn explizit übersprungen
  if (!skipPause) { await pauseEngineSoft(); }

  const rt = runtime();

  const W = [];
  const mark = (ok, label, hint="") => {
    W.push((ok?OK:NO) + label + (hint ? ` — ${hint}` : ""));
  };

  const wiring = await uiCheck();
  mark(wiring.ui.btnStart && wiring.fn.start, "Start-Button → engine.start()",  !wiring.ui.btnStart?"Button fehlt":(!wiring.fn.start?"API fehlt":""));
  mark(wiring.ui.btnPause && wiring.fn.pause, "Pause-Button → engine.pause()",  !wiring.ui.btnPause?"Button fehlt":(!wiring.fn.pause?"API fehlt":""));
  mark(wiring.ui.btnReset && wiring.fn.reset, "Reset-Button → engine.reset()",  !wiring.ui.btnReset?"Button fehlt":(!wiring.fn.reset?"API fehlt":""));
  mark(wiring.ui.chkPerf  && wiring.fn.setPerf, "Perf-Checkbox → engine.setPerfMode()", !wiring.ui.chkPerf?"Checkbox fehlt":(!wiring.fn.setPerf?"API fehlt":""));
  mark(wiring.ui.sliderMutation && wiring.fn.setMutation, "Slider Mutation% → reproduction.setMutationRate()", !wiring.ui.sliderMutation?"Slider fehlt":(!wiring.fn.setMutation?"API fehlt":""));
  mark(wiring.ui.sliderFood && wiring.fn.setFood, "Slider Nahrung/s → food.setSpawnRate()", !wiring.ui.sliderFood?"Slider fehlt":(!wiring.fn.setFood?"API fehlt":""));
  mark(wiring.ui.btnEditor && wiring.fn.openEditor, "CRISPR-Editor → editor.openEditor()", !wiring.ui.btnEditor?"Button fehlt":(!wiring.fn.openEditor?"API fehlt":""));
  mark(wiring.ui.btnEnv && wiring.fn.openEnv, "Umwelt-Panel → environment.openEnvPanel()", !wiring.ui.btnEnv?"Button fehlt":(!wiring.fn.openEnv?"API fehlt":""));
  mark(wiring.ui.btnAppOps && wiring.fn.openOps, "App-Ops → appops_panel.openAppOps()", !wiring.ui.btnAppOps?"Button fehlt":(!wiring.fn.openOps?"API fehlt":""));
  W.push((wiring.ui.canvas?OK:NO) + "Canvas #scene vorhanden");
  W.push((wiring.ui.canvas2D?OK:NO) + "2D-Context erzeugbar");

  const modText = await runModuleMatrix();

  const payload = {
    v:1, kind:"ui-diagnose", ts:Date.now(),
    runtime: rt, wiring, modules: modText
  };
  lastMdc = `MDC-CHK-${Math.random().toString(16).slice(2,6)}-${b64(payload)}`;

  const lines = [];
  lines.push("Start-Diagnose (Deep-Check + UI-Wiring)\n");
  lines.push(`Boot-Flag: ${rt.boot?"gesetzt":"fehlt"}`);
  lines.push(`Frames: ${rt.fc}  ·  FPS≈ ${rt.fps}`);
  lines.push(`Zellen: ${rt.cells}  ·  Food: ${rt.food}`);
  lines.push(`Letzter Step: ${rt.last}`);
  lines.push(`Runtime-Fehler im Log: ${rt.errs}\n`);
  lines.push("UI/Wiring:"); lines.push(...W, "");
  lines.push("Module/Exporte:"); lines.push(modText, "");
  lines.push("Maschinencode:", lastMdc);

  show(lines.join("\n"));
}

async function copyMDC(){
  try{
    if (!lastMdc) return;
    await navigator.clipboard.writeText(lastMdc);
    // kleines visuelles Feedback
    const b = $("pf-copy");
    if (b){ b.textContent = "Kopiert ✓"; setTimeout(()=> b.textContent="MDC kopieren", 1200); }
  }catch{}
}

/* ───────────── Auto-Hook: ?pf=1 ───────────── */
(function(){
  try{
    const q = new URLSearchParams(location.search);
    if (q.get("pf") === "1") {
      // Engine temporär nicht booten
      window.__NO_BOOT = true;
      // Diagnose nach Load
      window.addEventListener("load", () => diagnose(false));
    }
  }catch{}
})();