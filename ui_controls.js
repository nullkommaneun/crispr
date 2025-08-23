// ui_controls.js — robuste Topbar-Bedienung für beide UI-Varianten
// erkennt: (A) 4 Tempo-Buttons  (B) Ein-Knopf-Zyklus
// verdrahtet: Start/Pause/Reset, Perf-Mode, Mutation% + Nahrung/s (mit Labeln),
// App-Ops (Fallback auf Preflight), Editor, Umwelt.

const $ = (id)=>document.getElementById(id);
const on = (el, ev, fn)=> el && el.addEventListener(ev, fn);
const fmtPct  = v => `${v|0} %`;
const fmtRate = v => `${v|0} /s`;

function ensureLabel(id, parentId){
  let el = $(id);
  if (!el && parentId && $(parentId)){
    el = document.createElement("span");
    el.id = id;
    el.className = "value chip";
    $(parentId).appendChild(el);
  }
  return el;
}

async function call(mod, fn, ...args){
  try{
    const m = await import(mod);
    if (typeof m[fn]==="function") return m[fn](...args);
  }catch{}
}

function wireStartPauseReset(){
  on($("btnStart"), "click", ()=> call("./engine.js","start"));
  on($("btnPause"), "click", ()=> call("./engine.js","pause"));
  on($("btnReset"), "click", ()=> call("./engine.js","reset"));
}

function wirePerfMode(){
  on($("chkPerf"), "change", (e)=> call("./engine.js","setPerfMode", !!e.target.checked));
}

/* ---------------- Tempo ---------------- */
function markActiveTempo(id){
  // Variante (A): vier Buttons
  const ids = ["btnTs1","btnTs5","btnTs10","btnTs50"];
  ids.forEach(k=>{ const x=$(k); if(x){ x.classList.toggle("active", k===id); } });
}
function wireTempo(){
  const ts1  = $("btnTs1");
  const ts5  = $("btnTs5");
  const ts10 = $("btnTs10");
  const ts50 = $("btnTs50");
  const cyc  = $("tempoCycle");

  if (cyc){ // Variante (B): Single-Button-Zyklus
    const TEMPI=[1,5,10,50]; let i=0;
    cyc.textContent = `×${TEMPI[i]}`;
    on(cyc,"click", async()=>{
      i=(i+1)%TEMPI.length;
      cyc.textContent = `×${TEMPI[i]}`;
      await call("./engine.js","setTimescale", TEMPI[i]);
    });
    return;
  }

  // Variante (A): vier Buttons
  on(ts1, "click", ()=>{ call("./engine.js","setTimescale",1);  markActiveTempo("btnTs1");  });
  on(ts5, "click", ()=>{ call("./engine.js","setTimescale",5);  markActiveTempo("btnTs5");  });
  on(ts10,"click", ()=>{ call("./engine.js","setTimescale",10); markActiveTempo("btnTs10"); });
  on(ts50,"click", ()=>{ call("./engine.js","setTimescale",50); markActiveTempo("btnTs50"); });
}

/* ---------------- Slider Mutation % ---------------- */
function wireMutation(){
  const s = $("sliderMutation");
  const lbl = $("lblMutation") || ensureLabel("lblMutation","mutationBox"); // fallback
  if (!s) return;

  // init label
  if (lbl) lbl.textContent = fmtPct(s.value);
  on(s,"input", (e)=>{
    const v = e.target.value|0;
    if (lbl) lbl.textContent = fmtPct(v);
    call("./reproduction.js","setMutationRate", v);
  });
}

/* ---------------- Slider Nahrung/s ---------------- */
function wireFood(){
  const s = $("sliderFood");
  const lbl = $("lblFood") || ensureLabel("lblFood","foodBox"); // fallback
  if (!s) return;

  if (lbl) lbl.textContent = fmtRate(s.value);
  on(s,"input",(e)=>{
    const v = e.target.value|0;
    if (lbl) lbl.textContent = fmtRate(v);
    call("./food.js","setSpawnRate", v);
  });
}

/* ---------------- Tools ---------------- */
function wireTools(){
  on($("btnAppOps"), "click", async()=>{
    // App-Ops, fallback auf Preflight
    try{
      const p = await import("./appops_panel.js");
      await p.openAppOps();
    }catch{
      try{ (await import("./preflight.js")).diagnose(); }catch{}
    }
  });
  on($("btnDiag"), "click", ()=> call("./preflight.js","diagnose"));
  on($("btnEditor"), "click", ()=> call("./editor.js","openEditor"));
  on($("btnEnv"), "click", ()=> call("./environment.js","openEnvPanel"));
}

export function initUI(){
  wireStartPauseReset();
  wirePerfMode();
  wireTempo();
  wireMutation();
  wireFood();
  wireTools();
}

// Auto-Init, wenn Modul direkt eingebunden ist
if (document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", initUI, { once:true });
}else{
  initUI();
}