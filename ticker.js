import { getEnvState } from "./environment.js";
import { getCells, getFoodItems } from "./entities.js";

let el, perf = false, speedLabel = 1;

export function initTicker(){
  el = document.getElementById("ticker");
  updateSnapshot();
  setInterval(updateSnapshot, 5000);
}
export function setPerfMode(on){ perf = !!on; }

let lastFrameTimes = [];
export function pushFrame(dtSim, fps){
  lastFrameTimes.push({ dtSim, fps, t: performance.now() });
  if(lastFrameTimes.length > 30) lastFrameTimes.shift();
}

export function setSpeedIndicator(x){
  speedLabel = x;
  updateSnapshot();
}

export function updateSnapshot(){
  if(!el) return;
  const cells = getCells().length;
  const food  = getFoodItems().length;
  const env   = getEnvState();
  const activeEnv = Object.entries(env).filter(([_,v])=>v.enabled).map(([k])=>k).join(", ") || "aus";

  const fps   = (lastFrameTimes.at(-1)?.fps ?? 0).toFixed(0);
  const avgDt = (lastFrameTimes.reduce((a,b)=>a+b.dtSim,0)/(lastFrameTimes.length||1)).toFixed(3);

  el.innerHTML = `
    <span>Tempo: <b>×${speedLabel}</b></span>
    <span>FPS (Bildrate): <b>${fps}</b></span>
    <span>Sim-Schritt (s): <b>${avgDt}</b></span>
    <span>Zellen: <b>${cells}</b></span>
    <span>Food: <b>${food}</b></span>
    <span>Perf-Modus: <b>${perf ? "An" : "Aus"}</b></span>
    <span>Umwelt: <b>${activeEnv}</b></span>
  `;
}