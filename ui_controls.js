// ui_controls.js — Topbar: Slider + Tempo + Perf + Buttons (robust & kompakt)

import * as engine from "./engine.js";
import * as reproduction from "./reproduction.js";
import * as food from "./food.js";

// kleine Helfer
const $ = (id) => document.getElementById(id);
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

/* --------------------------- Slider (Mutation / Food) --------------------------- */

function bindSliders(){
  const sm = $("sliderMutation"), om = $("valMutation");
  const sf = $("sliderFood"),     of = $("valFood");

  if (sm){
    const apply = () => {
      const v = clamp(+sm.value||0, 0, 100);
      reproduction.setMutationRate(v);
      if (om) om.textContent = `${v} %`;
    };
    sm.style.touchAction = "none";
    sm.addEventListener("input",  apply, {passive:true});
    sm.addEventListener("change", apply);
    apply(); // initial
  }

  if (sf){
    const apply = () => {
      const v = clamp(+sf.value||0, 0, 30);
      food.setSpawnRate(v);
      if (of) of.textContent = `${v} /s`;
    };
    sf.style.touchAction = "none";
    sf.addEventListener("input",  apply, {passive:true});
    sf.addEventListener("change", apply);
    apply(); // initial
  }
}

/* ----------------------------- Tempo & Perf-Modus ------------------------------ */

function bindTempoAndPerf(){
  // Tempo-Buttons: <button data-ts="1|5|10|50">
  const btns = Array.from(document.querySelectorAll('button[data-ts]'));
  const setActive = (btn) => {
    btns.forEach(b=>b.classList.remove("active"));
    if (btn) btn.classList.add("active");
  };
  btns.forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const ts = +btn.dataset.ts || 1;
      try { engine.setTimescale(ts); } catch {}
      setActive(btn);
    });
  });

  // Perf-Checkbox
  const perf = $("chkPerf");
  if (perf){
    const apply = ()=> { try { engine.setPerfMode(!!perf.checked); } catch {} };
    perf.addEventListener("change", apply);
    apply(); // initial
  }
}

/* -------------------------------- Grund-Buttons -------------------------------- */

function bindCoreButtons(){
  $("btnStart")?.addEventListener("click", ()=> { try{ engine.start(); }catch{} });
  $("btnPause")?.addEventListener("click", ()=> { try{ engine.pause(); }catch{} });
  $("btnReset")?.addEventListener("click", ()=> { try{ engine.reset(); }catch{} });
}

/* -------------------------------- Tool-Buttons --------------------------------- */

function bindToolButtons(){
  $("btnEditor")?.addEventListener("click", async ()=>{
    try{ (await import("./editor.js")).openEditor(); }catch{}
  });
  $("btnEnv")?.addEventListener("click", async ()=>{
    try{ (await import("./environment.js")).openEnvPanel(); }catch{}
  });
  $("btnAppOps")?.addEventListener("click", async ()=>{
    try{ (await import("./appops_panel.js")).openAppOps(); }catch{}
  });
  $("btnDiag")?.addEventListener("click", async ()=>{
    try{ (await import("./preflight.js")).diagnose(); }catch{}
  });
}

/* ----------------------------------- Public ------------------------------------ */

export function initUI(){
  bindSliders();
  bindTempoAndPerf();
  bindCoreButtons();
  bindToolButtons();
}