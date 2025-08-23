// ui_controls.js — Topbar-Logik: Start/Pause/Reset, Tempo-Cycle, Slider-Labels

const TEMPI = [1,5,10,50];
let tempiIdx = 0;

const $ = (id)=>document.getElementById(id);
const fmtPct = v => `${v|0} %`;
const fmtRate = v => `${v|0} /s`;

export function initUI(){
  // --- Buttons ---
  $("btnStart")?.addEventListener("click", async()=>{
    (await import("./engine.js")).start();
  });
  $("btnPause")?.addEventListener("click", async()=>{
    (await import("./engine.js")).pause();
  });
  $("btnReset")?.addEventListener("click", async()=>{
    (await import("./engine.js")).reset();
  });

  // Tempo-Cycle
  $("tempoCycle")?.addEventListener("click", async()=>{
    tempiIdx = (tempiIdx+1) % TEMPI.length;
    const ts = TEMPI[tempiIdx];
    try{ (await import("./engine.js")).setTimescale(ts); }catch{}
    $("tempoCycle").textContent = `×${ts}`;
  });
  // Initial label
  $("tempoCycle") && ($("tempoCycle").textContent = `×${TEMPI[tempiIdx]}`);

  // Perf-Mode
  $("chkPerf")?.addEventListener("change", async(e)=>{
    try{ (await import("./engine.js")).setPerfMode(!!e.target.checked); }catch{}
  });

  // --- Slider Mutation ---
  const sM = $("sliderMutation"), lM = $("lblMutation");
  sM?.addEventListener("input", async(e)=>{
    const v = e.target.value|0;
    lM && (lM.textContent = fmtPct(v));
    try{ (await import("./reproduction.js")).setMutationRate(v); }catch{}
  });
  // Init Label
  if (sM && lM){ lM.textContent = fmtPct(sM.value); }

  // --- Slider Food ---
  const sF = $("sliderFood"), lF = $("lblFood");
  sF?.addEventListener("input", async(e)=>{
    const v = e.target.value|0;
    lF && (lF.textContent = fmtRate(v));
    try{ (await import("./food.js")).setSpawnRate(v); }catch{}
  });
  // Init Label
  if (sF && lF){ lF.textContent = fmtRate(sF.value); }

  // --- Tools ---
  $("btnAppOps")?.addEventListener("click", async()=>{
    try{ (await import("./appops_panel.js")).openAppOps(); }
    catch{ try{ (await import("./preflight.js")).diagnose(); }catch{} }
  });
  $("btnDiag")?.addEventListener("click", async()=>{
    try{ (await import("./preflight.js")).diagnose(); }catch{}
  });
  $("btnEditor")?.addEventListener("click", async()=>{
    try{ (await import("./editor.js")).openEditor(); }catch{}
  });
  $("btnEnv")?.addEventListener("click", async()=>{
    try{ (await import("./environment.js")).openEnvPanel(); }catch{}
  });
}