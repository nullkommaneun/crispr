import { CONFIG } from "./config.js";
import { emit } from "./event.js";

let env = structuredClone(CONFIG.envDefaults);
let panelOpener = null;

export function getEnvState(){ return env; }
export function setEnvState(next){
  env = JSON.parse(JSON.stringify(next));
  emit("env:changed", env);
}
export function onEnvChange(cb){ /* consumer uses event bus */ }

export function openEnvPanel(){
  if(!panelOpener){ import("./environment/panel.js").then(m=>{ panelOpener=m; m.openEnvPanel(); }); }
  else panelOpener.openEnvPanel();
}