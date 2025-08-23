// ui_controls.js — Topbar: kompakt (Tempo-Cycle), echte Slider-Werte, robuste Tool-Buttons

import * as engine from "./engine.js";
import * as reproduction from "./reproduction.js";
import * as food from "./food.js";

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* --------------------------- Slider (Mutation / Food) --------------------------- */

function bindSliders() {
  const sm = $("sliderMutation"), om = $("valMutation");
  const sf = $("sliderFood"),     of = $("valFood");

  if (sm) {
    const apply = () => {
      const v = clamp(+sm.value || 0, 0, 100);
      try { reproduction.setMutationRate(v); } catch {}
      if (om) om.textContent = `${v} %`;
    };
    sm.style.touchAction = "none";
    sm.addEventListener("input",  apply, { passive: true });
    sm.addEventListener("change", apply);
    apply();
  }

  if (sf) {
    const apply = () => {
      const v = clamp(+sf.value || 0, 0, 30);
      try { food.setSpawnRate(v); } catch {}
      if (of) of.textContent = `${v} /s`;
    };
    sf.style.touchAction = "none";
    sf.addEventListener("input",  apply, { passive: true });
    sf.addEventListener("change", apply);
    apply();
  }
}

/* ----------------------------- Tempo (Cycle-Button) ---------------------------- */

function bindTempoAndPerf() {
  // Tempo wechselnd: ×1 → ×5 → ×10 → ×50 → …
  const speeds = [1, 5, 10, 50];
  const btn = $("btnTempo");
  if (btn) {
    const initIdx = clamp(+btn.dataset.idx || 0, 0, speeds.length - 1);
    btn.dataset.idx = String(initIdx);
    const apply = (idx) => {
      const ts = speeds[idx];
      btn.textContent = `×${ts}`;
      try { engine.setTimescale(ts); } catch {}
    };
    apply(initIdx);
    btn.addEventListener("click", () => {
      const next = ( (+btn.dataset.idx || 0) + 1 ) % speeds.length;
      btn.dataset.idx = String(next);
      apply(next);
    });
  }

  // Perf-Checkbox
  const perf = $("chkPerf");
  if (perf) {
    const applyPerf = () => { try { engine.setPerfMode(!!perf.checked); } catch {} };
    perf.addEventListener("change", applyPerf);
    applyPerf();
  }
}

/* -------------------------------- Grund-Buttons -------------------------------- */

function bindCoreButtons() {
  $("btnStart")?.addEventListener("click", () => { try { engine.start(); } catch {} });
  $("btnPause")?.addEventListener("click", () => { try { engine.pause(); } catch {} });
  $("btnReset")?.addEventListener("click", () => { try { engine.reset(); } catch {} });
}

/* -------------------------------- Tool-Buttons --------------------------------- */

function bindToolButtons() {
  $("btnEditor")?.addEventListener("click", async () => {
    try { (await import("./editor.js")).openEditor(); } catch (e) { console.warn("editor open failed", e); }
  });
  $("btnEnv")?.addEventListener("click", async () => {
    try { (await import("./environment.js")).openEnvPanel(); } catch (e) { console.warn("env open failed", e); }
  });
  $("btnAppOps")?.addEventListener("click", async () => {
    try { (await import("./appops_panel.js")).openAppOps(); }
    catch (e) {
      console.warn("app-ops open failed", e);
      // Falls doch mal ein Ladefehler: Diagnose anbieten
      try { (await import("./preflight.js")).diagnose(); } catch {}
    }
  });
  $("btnDiag")?.addEventListener("click", async () => {
    try { (await import("./preflight.js")).diagnose(); } catch (e) { console.warn("preflight failed", e); }
  });
}

/* ----------------------------------- Public ------------------------------------ */

export function initUI() {
  bindSliders();
  bindTempoAndPerf();
  bindCoreButtons();
  bindToolButtons();
}