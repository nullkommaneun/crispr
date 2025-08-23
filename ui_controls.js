// ui_controls.js — robuste Topbar-Bedienung
// - Tempo: erkennt 4-Button-Variante ODER Ein-Knopf-Zyklus
// - Food-Slider: echte Werte + Label
// - Mutation-Slider: konsequent ausblenden (falls noch im DOM)
// - Start/Pause/Reset, Perf-Mode, App-Ops/Preflight, Editor, Umwelt

const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const on = (el, ev, fn) => el && el.addEventListener(ev, fn, { passive:true });

// --------- Helfer ---------
async function call(mod, fn, ...args){
  try{
    const m = await import(mod);
    if (typeof m[fn] === "function") return m[fn](...args);
  }catch(e){
    // soft-fail
  }
}
function setText(el, txt){ if(el) el.textContent = txt; }
function hide(el){ if(el){ el.style.display = "none"; el.setAttribute("aria-hidden","true"); } }
function ensureSiblingValueLabel(sliderEl, id, formatter, containerId=null){
  // 1) bevorzugt vorhandenes Label
  let lbl = document.getElementById(id);
  if (lbl) return lbl;

  // 2) falls Container existiert, Label darin erzeugen …
  if (containerId){
    const box = document.getElementById(containerId);
    if (box){
      lbl = document.createElement("span");
      lbl.id = id;
      lbl.className = "value chip";
      box.appendChild(lbl);
      return lbl;
    }
  }
  // 3) … sonst direkt neben den Slider hängen
  lbl = document.createElement("span");
  lbl.id = id;
  lbl.className = "value chip";
  sliderEl && sliderEl.parentNode && sliderEl.parentNode.insertBefore(lbl, sliderEl.nextSibling);
  return lbl;
}

// ---------------- Start/Pause/Reset ----------------
function wireStartPauseReset(){
  on($("#btnStart"), "click", ()=> call("./engine.js","start"));
  on($("#btnPause"), "click", ()=> call("./engine.js","pause"));
  on($("#btnReset"), "click", ()=> call("./engine.js","reset"));
}

// ---------------- Perf Mode ----------------
function wirePerfMode(){
  const chk = $("#chkPerf");
  on(chk, "change", e => call("./engine.js","setPerfMode", !!e.target.checked));
}

// ---------------- Tempo ----------------
// Variante A: vier Schalter (btnTs1/5/10/50)
// Variante B: Ein-Knopf-Zyklus (tempoCycle oder data-tempo-cycle)
function markTempoActive(activeId){
  ["btnTs1","btnTs5","btnTs10","btnTs50"].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.classList.toggle("active", id === activeId);
  });
}
function parseSpeedFromId(id){
  // btnTs10 -> 10
  const m = String(id||"").match(/(\d+)$/);
  return m ? parseInt(m[1],10) : NaN;
}
function wireTempo(){
  const four = ["btnTs1","btnTs5","btnTs10","btnTs50"].map(id=>document.getElementById(id)).filter(Boolean);
  const cycle = $("#tempoCycle") || $("[data-tempo-cycle]") || $("#btnTempo") || $("#btnTs") || $(".tempo");

  if (four.length){ // 4-Button-Variante
    four.forEach(btn=>{
      on(btn,"click", async()=>{
        const v = parseSpeedFromId(btn.id);
        if (!isNaN(v)) await call("./engine.js","setTimescale", v);
        markTempoActive(btn.id);
      });
    });
    // initial markieren (falls einer bereits aktiv gestylt war), sonst ×1
    const already = four.find(b=>b.classList.contains("active"));
    if (already){
      const v = parseSpeedFromId(already.id);
      if (!isNaN(v)) call("./engine.js","setTimescale", v);
    }else{
      markTempoActive("btnTs1");
      call("./engine.js","setTimescale", 1);
    }
    return;
  }

  if (cycle){ // Ein-Knopf-Zyklus
    const TEMPI = [1,5,10,50];
    let i = 0;
    setText(cycle, `×${TEMPI[i]}`);
    on(cycle,"click", async()=>{
      i = (i+1) % TEMPI.length;
      setText(cycle, `×${TEMPI[i]}`);
      await call("./engine.js","setTimescale", TEMPI[i]);
    });
    // initial ×1 anwenden
    call("./engine.js","setTimescale", TEMPI[0]);
  }
}

// ---------------- Food-Slider ----------------
function findFoodSlider(){
  // robuste Suche nach Food-Slider
  return $("#sliderFood")
      || $("input[type=range][id*='food' i]")
      || $("input[type=range][name*='food' i]");
}
function wireFood(){
  const s = findFoodSlider();
  if (!s) return;

  const fmtRate = v => `${(v|0)} /s`;
  const lbl = ensureSiblingValueLabel(s, "lblFood", fmtRate, "foodBox");

  const apply = v=>{
    const n = v|0;
    setText(lbl, fmtRate(n));
    call("./food.js","setSpawnRate", n);
  };

  // Anfangswert
  apply(s.value);

  on(s, "input",  e => apply(e.target.value));
  on(s, "change", e => apply(e.target.value));
}

// ---------------- Mutation-Slider (ausblenden) ----------------
function hideMutationControls(){
  const s  = $("#sliderMutation") || $("input[type=range][id*='mutat' i]");
  const bx = $("#mutationBox");
  const lbl= $("#lblMutation");
  hide(lbl); hide(s); hide(bx);
}

// ---------------- Tools ----------------
function wireTools(){
  on($("#btnAppOps"), "click", async()=>{
    try{
      const p = await import("./appops_panel.js");
      await p.openAppOps();
    }catch{
      try{ (await import("./preflight.js")).diagnose(); }catch{}
    }
  });
  on($("#btnDiag"),   "click", ()=> call("./preflight.js","diagnose"));
  on($("#btnEditor"), "click", ()=> call("./editor.js","openEditor"));
  on($("#btnEnv"),    "click", ()=> call("./environment.js","openEnvPanel"));
}

// ---------------- Init ----------------
export function initUI(){
  wireStartPauseReset();
  wirePerfMode();
  wireTempo();
  wireFood();
  hideMutationControls();
  wireTools();
}

// Auto-Init
if (document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", initUI, { once:true });
}else{
  initUI();
}