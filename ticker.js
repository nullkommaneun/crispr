import { getEnvState } from "./environment.js";
import { getCells, getFoodItems } from "./entities.js";

let el, perf=false;

export function initTicker(){
  el = document.getElementById("ticker");
  updateSnapshot(); // first paint
  setInterval(updateSnapshot, 5000);
}
export function setPerfMode(on){ perf=!!on; }

let lastFrameTimes = [];
export function pushFrame(dtSim, fps){
  lastFrameTimes.push({ dtSim, fps, t: performance.now() });
  if(lastFrameTimes.length>30) lastFrameTimes.shift();
}

export function updateSnapshot(){
  if(!el) return;
  const cells = getCells().length;
  const food = getFoodItems().length;
  const env = getEnvState();
  const fps = (lastFrameTimes.at(-1)?.fps ?? 0).toFixed(0);
  const avgDt = (lastFrameTimes.reduce((a,b)=>a+b.dtSim,0)/(lastFrameTimes.length||1)).toFixed(3);

  el.innerHTML = `
    <span>FPS: <b>${fps}</b></span>
    <span>Sim‑dt: <b>${avgDt}s</b></span>
    <span>Zellen: <b>${cells}</b></span>
    <span>Food: <b>${food}</b></span>
    <span>Perf: <b>${perf?'On':'Off'}</b></span>
    <span>Umwelt: <b>${Object.entries(env).filter(([k,v])=>v.enabled).map(([k])=>k).join(', ')||'aus'}</b></span>
  `;
}