// ui_controls.js — kompakte Topbar-Bindings für Slider + Anzeige
import * as reproduction from "./reproduction.js";
import * as food from "./food.js";

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

export function initSliders(){
  const sm = document.getElementById("sliderMutation");
  const om = document.getElementById("valMutation");
  const sf = document.getElementById("sliderFood");
  const of = document.getElementById("valFood");

  if (!sm || !sf) return;

  // Mutation (%)
  const applyMutation = () => {
    const v = clamp(+sm.value || 0, 0, 100);
    reproduction.setMutationRate(v);
    if (om) om.textContent = `${v} %`;
  };

  // Nahrung (/s)
  const applyFood = () => {
    const v = clamp(+sf.value || 0, 0, 30);
    food.setSpawnRate(v);
    if (of) of.textContent = `${v} /s`;
  };

  // Bindings (touch-freundlich, kein Scroll/Zoom)
  sm.addEventListener("input",  applyMutation, { passive: true });
  sm.addEventListener("change", applyMutation);
  sf.addEventListener("input",  applyFood, { passive: true });
  sf.addEventListener("change", applyFood);

  // iOS: Sliden ohne Seitenscroll/-zoom
  for (const s of [sm, sf]) {
    s.style.touchAction = "none";
    s.addEventListener("touchstart", e => e.stopPropagation(), { passive: true });
  }

  // Initial aus aktuellen Slider-Positionen
  applyMutation();
  applyFood();
}