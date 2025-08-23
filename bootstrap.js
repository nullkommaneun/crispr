// bootstrap.js — UI verkabeln + robust booten (+ pf=1 respektieren)
import * as eng from "./engine.js";

const $ = (id) => document.getElementById(id);

function wireUI(){
  // Grundbedienung
  $("#btnStart")?.addEventListener("click", ()=>eng.start());
  $("#btnPause")?.addEventListener("click", ()=>eng.pause());
  $("#btnReset")?.addEventListener("click", ()=>eng.reset());

  // Tempo (optional)
  $("#t1")?.addEventListener("click", ()=>eng.setTimescale(1));
  $("#t5")?.addEventListener("click", ()=>eng.setTimescale(5));
  $("#t10")?.addEventListener("click", ()=>eng.setTimescale(10));
  $("#t50")?.addEventListener("click", ()=>eng.setTimescale(50));

  // Perf-Modus
  $("#chkPerf")?.addEventListener("change", (e)=>eng.setPerfMode(!!e.target.checked));

  // Slider → Module
  $("#sliderMutation")?.addEventListener("input", async (e)=>{
    try{ const m = await import("./reproduction.js"); m.setMutationRate?.(+e.target.value|0); }catch{}
  });
  $("#sliderFood")?.addEventListener("input", async (e)=>{
    try{ const m = await import("./food.js"); m.setSpawnRate?.(+e.target.value||0); }catch{}
  });

  // Tools
  $("#btnEditor")?.addEventListener("click", async ()=>{
    try{ const m = await import("./editor.js"); m.openEditor?.(); }catch{}
  });
  $("#btnEnv")?.addEventListener("click", async ()=>{
    try{ const m = await import("./environment.js"); m.openEnvPanel?.(); }catch{}
  });
  $("#btnAppOps")?.addEventListener("click", async ()=>{
    try{ const m = await import("./appops_panel.js"); m.openAppOps?.(); }catch{}
  });
  $("#btnDiag")?.addEventListener("click", async ()=>{
    try{ const m = await import("./preflight.js"); m.diagnose?.(); }catch{}
  });
}

function canvasReady(){
  const c = $("#scene"); if(!c) return false;
  // Falls Styles noch nicht gesetzt sind → Mindestgrößen vergeben
  if (!c.width  || c.width  < 2) c.width  = Math.max(2, c.clientWidth  || 1280);
  if (!c.height || c.height < 2) c.height = Math.max(2, c.clientHeight || 720);
  return true;
}

async function bootIfAllowed(){
  const q = new URLSearchParams(location.search);
  if (q.get("pf")==="1") return; // Preflight kontrolliert den Boot

  if (canvasReady()) {
    try { await eng.boot(); } catch(e){ console.error("[bootstrap] boot:", e); }
  } else {
    // Canvas ist noch 0×0 → kurz später probieren
    setTimeout(bootIfAllowed, 40);
  }
}

window.addEventListener("DOMContentLoaded", ()=>{
  try{ wireUI(); }catch{}
  bootIfAllowed();
});