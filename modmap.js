// modmap.js — Preflight Modulmatrix (zentrale Liste)
export const PF_MODULES = [
  { path: "./event.js",        wants:["on","emit"] },
  { path: "./config.js",       wants:[],                 optional:true },
  { path: "./errorManager.js", wants:["initErrorManager","report"] },

  { path: "./engine.js",       wants:["boot","start","pause","reset","setTimescale","setPerfMode"] },
  { path: "./entities.js",     wants:["setWorldSize","createAdamAndEve","step","getCells","getFoodItems","applyEnvironment"] },
  { path: "./reproduction.js", wants:["step","setMutationRate"] },
  { path: "./food.js",         wants:["step","setSpawnRate"] },
  { path: "./renderer.js",     wants:["draw","setPerfMode"] },
  { path: "./metrics.js",      wants:["getPhases","getEconSnapshot","getPopSnapshot","getDriftSnapshot","getMateSnapshot"] },
  { path: "./drives.js",       wants:["getDrivesSnapshot","getTraceText"], optional:true },

  // Tools/Extras — optional
  { path: "./editor.js",       wants:["openEditor"],     optional:true },
  { path: "./environment.js",  wants:["openEnvPanel"],   optional:true },
  { path: "./appops_panel.js", wants:["openAppOps"],     optional:true },
  { path: "./appops.js",       wants:["generateOps"],    optional:true },
  { path: "./advisor.js",      wants:["setMode","getMode","scoreCell","sortCells"], optional:true },
  { path: "./grid.js",         wants:["createGrid"],     optional:true },
  { path: "./bootstrap.js",    wants:[],                 optional:true },
  { path: "./sw.js",           wants:[],                 optional:true },
  { path: "./diag.js",         wants:["openDiagPanel"],  optional:true },
];