import { getEnvState } from "./environment.js";
import { getCells, getFoodItems } from "./entities.js";
import { getDrivesSnapshot } from "./drives.js";

let el, perf=false, speedLabel=1;
let updateMs = 7000;
let intervalId = null;

export function initTicker(){
  el = document.getElementById("ticker");
  updateSnapshot();
  setUpdateInterval(updateMs); // startet Intervall
}
export function setPerfMode(on){ perf=!!on; }

export function setUpdateInterval(ms){
  updateMs = Math.max(1000, ms|0);
  if (intervalId) clearInterval(intervalId);
  intervalId = setInterval(updateSnapshot, updateMs);
}
export function getUpdateInterval(){ return updateMs; }

let lastFrameTimes = [];
export function pushFrame(dtSim, fps){
  lastFrameTimes.push({ dtSim, fps, t: performance.now() });
  if(lastFrameTimes.length>30) lastFrameTimes.shift();
}

export function updateSnapshot(){
  if(!el) return;

  const cells = getCells().length;
  const food  = getFoodItems().length;

  const fps   = (lastFrameTimes.at(-1)?.fps ?? 0).toFixed(0);
  const avgDt = (lastFrameTimes.reduce((a,b)=>a+b.dtSim,0)/(lastFrameTimes.length||1)).toFixed(3);

  const dri = safeDrives();
  const wr  = dri.misc.duels ? Math.round(100*dri.misc.wins/dri.misc.duels) : 0;
  const du  = fmtK(dri.misc.duels);
  const kdist = (dri.cfg?.K_DIST ?? "-");
  const rpair = (dri.cfg?.R_PAIR ?? "-");
  const eps   = (dri.cfg?.EPS    ?? "-");

  const sc = worldScaleInfo();

  el.innerHTML = `
    <span>Tempo: <b>×${speedLabel}</b></span>
    <span>FPS: <b>${fps}</b></span>
    <span>Sim-dt: <b>${avgDt}</b></span>
    <span>Zellen: <b>${cells}</b></span>
    <span>Food: <b>${food}</b></span>
    <span>Perf: <b>${perf?'An':'Aus'}</b></span>
    <span>Scale: <b>s=${sc.sMin}</b>, <b>A=${sc.area}</b></span>
    <span>Drives: <b>${du}</b> / <b>${wr}%</b> (K=${kdist}, RP=${rpair}, E=${eps})</span>
  `;
}

export function setSpeedIndicator(x){ speedLabel = x; updateSnapshot(); }
function fmtK(n){ if(n==null) return "-"; if(n<1000) return String(n); const k=(n/1000).toFixed(1); return k.replace(/\.0$/,"")+"k"; }
function safeDrives(){ try{ return getDrivesSnapshot() || { misc:{duels:0,wins:0}, cfg:{} }; } catch{ return { misc:{duels:0,wins:0}, cfg:{} }; } }
function worldScaleInfo(){
  const w = document.getElementById("world");
  const W = w?.width||1024, H = w?.height||640;
  const sMin = (Math.min(W,H)/640).toFixed(2);
  const area = (W*H/(1024*640)).toFixed(2);
  return { sMin, area };
}