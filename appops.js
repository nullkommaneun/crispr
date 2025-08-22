// appops.js — sammelt App-Telemetrie & generiert MDC-OPS Vorschläge
// Läuft nur im Browser; keine Server-Abhängigkeiten.

import { on } from "./event.js";

// ---------- interner State ----------
const state = {
  started: false,
  perf: {
    raf: { last: 0, frames: 0, jankCount: 0, jankSumMs: 0, samples: [] }, // {t, fps}
    longTasks: { count: 0, totalMs: 0 }
  },
  engine: {
    frames: 0,
    cappedFrames: 0,      // desiredSteps > maxSteps?
    backlogRatio: 0       // gleitender Anteil cappedFrames
  },
  layout: {
    reflowCount: 0,
    lastHeights: []
  },
  resources: {
    scannedAt: 0,
    total: 0,
    largest: []           // [{name,sizeKB,type,duration}]
  },
  modules: {
    lastReport: null      // String-Liste der Modul-Checks (wie Preflight)
  }
};

// ---------- FPS & Jank via RAF ----------
function startRafSampler(){
  const raf = state.perf.raf;
  function loop(t){
    if(raf.last){
      const dt = t - raf.last;
      const fps = 1000 / Math.max(1, dt);
      raf.samples.push({ t: performance.now(), fps });
      if (dt > 50) { raf.jankCount++; raf.jankSumMs += (dt-16.7); }
      if (raf.samples.length > 240) raf.samples.shift();
    }
    raf.last = t; raf.frames++;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

// ---------- Long Tasks ----------
function startLongTaskObserver(){
  try{
    const po = new PerformanceObserver((list)=>{
      list.getEntries().forEach(e=>{
        if (e.entryType === "longtask") {
          state.perf.longTasks.count++;
          state.perf.longTasks.totalMs += e.duration || 0;
        }
      });
    });
    po.observe({ entryTypes: ["longtask"] });
  }catch{}
}

// ---------- Engine Backlog (aus engine.js via Event) ----------
on("appops:frame", (e)=>{
  // e: { desired, max, steps, delta, timescale }
  state.engine.frames++;
  if ((e?.desired ?? 0) > (e?.max ?? 0)) state.engine.cappedFrames++;
  const f = state.engine.frames || 1;
  state.engine.backlogRatio = state.engine.cappedFrames / f;
});

// ---------- Topbar Reflows ----------
function startTopbarObserver(){
  const el = document.getElementById("topbar");
  if(!el) return;
  try{
    const ro = new ResizeObserver(()=>{
      state.layout.reflowCount++;
      const h = el.offsetHeight || 0;
      const arr = state.layout.lastHeights;
      if(!arr.length || arr[arr.length-1] !== h){
        arr.push(h);
        if(arr.length > 10) arr.shift();
      }
    });
    ro.observe(el);
  }catch{}
}

// ---------- Resource Audit ----------
function scanResources(){
  try{
    const entries = performance.getEntriesByType("resource");
    const list = [];
    let total = 0;
    for(const e of entries){
      const size = e.transferSize || e.encodedBodySize || 0;
      const sizeKB = Math.round(size/1024);
      total += sizeKB;
      list.push({
        name: (e.name||"").split("/").slice(-2).join("/"),
        sizeKB,
        type: e.initiatorType || "res",
        duration: Math.round((e.duration||0))
      });
    }
    list.sort((a,b)=> b.sizeKB - a.sizeKB);
    state.resources.largest = list.slice(0,12);
    state.resources.total = total;
    state.resources.scannedAt = Date.now();
  }catch{}
}

// ---------- Modul-Check (wie Preflight, aber on-demand) ----------
async function checkModule(path, expects){
  try{
    const m = await import(path + `?v=${Date.now()}`); // Cache-Buster
    if(!expects?.length) return `✅ ${path}`;
    const miss = expects.filter(x=> !(x in m));
    return miss.length ? `❌ ${path}: fehlt Export ${miss.join(", ")}` : `✅ ${path}`;
  }catch(e){
    let msg = String(e?.message || e);
    if(/failed to fetch|404/i.test(msg)) msg += " (Pfad/Case?)";
    return `❌ ${path}: Import/Parse fehlgeschlagen → ${msg}`;
  }
}

export async function runModuleMatrix(){
  const lines = [];
  const checks = [
    ["./event.js",         ["on","off","emit"]],
    ["./config.js",        ["CONFIG"]],
    ["./errorManager.js",  ["initErrorManager","report"]],
    ["./entities.js",      ["step","createAdamAndEve","setWorldSize","applyEnvironment","getCells","getFoodItems"]],
    ["./reproduction.js",  ["step","setMutationRate","getMutationRate"]],
    ["./food.js",          ["step","setSpawnRate","spawnClusters"]],
    ["./renderer.js",      ["draw","setPerfMode"]],
    ["./editor.js",        ["openEditor","closeEditor","setAdvisorMode","getAdvisorMode"]],
    ["./environment.js",   ["getEnvState","setEnvState","openEnvPanel"]],
    ["./ticker.js",        ["initTicker","setPerfMode","pushFrame"]],
    ["./genealogy.js",     ["getNode","getParents","getChildren","getSubtree","searchByNameOrId","exportJSON","getStats","getAll"]],
    ["./genea.js",         ["openGenealogyPanel"]],
    ["./metrics.js",       [
      "beginTick","sampleEnergy","commitTick","addSpawn",
      "getEconSnapshot","getMateSnapshot","mateStart","mateEnd","getPopSnapshot","getDriftSnapshot"
    ]],
    ["./drives.js",        ["initDrives","getTraceText","getAction","afterStep","getDrivesSnapshot","setTracing"]],
    ["./diag.js",          ["openDiagPanel"]]
  ];
  for(const [p, exp] of checks){
    lines.push(await checkModule(p, exp));
  }
  state.modules.lastReport = lines.join("\n");
  return state.modules.lastReport;
}

// ---------- Start Collector ----------
export function startCollectors(){
  if(state.started) return;
  state.started = true;
  startRafSampler();
  startLongTaskObserver();
  startTopbarObserver();
  scanResources();
  setInterval(scanResources, 15000);
}

// ---------- Snapshots ----------
export function getAppOpsSnapshot(){
  const s = state.perf.raf.samples;
  const fpsNow = s.length ? s[s.length-1].fps : 0;
  const fpsAvg = s.length ? (s.reduce((a,b)=>a+b.fps,0)/s.length) : 0;
  const jank = state.perf.raf.jankCount;
  const jankMs = Math.round(state.perf.raf.jankSumMs);

  const frames = state.engine.frames || 1;
  const capRatio = state.engine.backlogRatio || 0;

  const reflows = state.layout.reflowCount;
  const heights = [...state.layout.lastHeights];

  const res = state.resources;

  return {
    v: 1, kind: "appops",
    perf: { fpsNow: Math.round(fpsNow), fpsAvg: Math.round(fpsAvg), jank, jankMs,
      longTasks: { count: state.perf.longTasks.count, totalMs: Math.round(state.perf.longTasks.totalMs) } },
    engine: { frames, capRatio: Math.round(capRatio*100)/100 },
    layout: { reflows, heights },
    resources: { scannedAt: res.scannedAt, totalKB: res.total, largest: res.largest },
    modules: { last: state.modules.lastReport }
  };
}

// ---------- OPS-Vorschläge (heuristisch) ----------
export function generateOps(){
  const s = getAppOpsSnapshot();
  const ops = { v: 1, title: "Auto-OPS Vorschläge", goals: [], changes: [], accept: [] };

  // Vorschlag 1: Preflight manuell (?pf=1)
  ops.changes.push({
    file: "preflight.js",
    op: "append",
    code:
"// === Dev-Hook: manuelle Preflight-Anzeige mit ?pf=1 ===\n(function devHook(){\n  try{\n    const q=new URLSearchParams(location.search);\n    if(q.get('pf')==='1') diagnose().then(r=>showOverlay('Manuelle Diagnose (pf=1):\\n\\n'+r));\n  }catch{}\n})();\n"
  });
  ops.goals.push("Preflight jederzeit manuell abrufbar (?pf=1)");

  // Vorschlag 2: Ticker throttle & kompakter (bei Jank/Reflow)
  if (s.perf.jank > 5 || s.layout.reflows > 5) {
    ops.changes.push(
      { file: "ticker.js", op: "patch", find: "setInterval\\(updateSnapshot, 5000\\);", replace: "setInterval(updateSnapshot, 7000);" },
      { file: "style.css", op: "append", code: "/* Ticker kompakter */\n#ticker{ row-gap:0px !important; }\n#ticker span{ line-height: 1.15; }\n" }
    );
    ops.goals.push("Ticker ruhiger/kompakter zur Reflow-Reduktion");
  }

  // Vorschlag 3: Spatial-Hash Scaffold, wenn Backlog > 15%
  if ((s.engine.capRatio||0) > 0.15) {
    ops.changes.push(
      { file: "grid.js", op: "replace", code:
"// Uniform-Grid Scaffold – wird im nächsten Schritt produktiv genutzt\nexport function createGrid(cellSize, width, height){\n  const cols = Math.max(1, Math.ceil(width / cellSize));\n  const rows = Math.max(1, Math.ceil(height/ cellSize));\n  const buckets = new Map();\n  function key(ix,iy){ return ix+\",\"+iy; }\n  function clear(){ buckets.clear(); }\n  function insert(x,y, payload){ const ix=Math.floor(x/cellSize), iy=Math.floor(y/cellSize); const k=key(ix,iy); if(!buckets.has(k)) buckets.set(k,[]); buckets.get(k).push(payload); }\n  function queryCircle(x,y,r){ const minX=Math.floor((x-r)/cellSize), maxX=Math.floor((x+r)/cellSize); const minY=Math.floor((y-r)/cellSize), maxY=Math.floor((y+r)/cellSize); const out=[]; for(let iy=minY; iy<=maxY; iy++){ for(let ix=minX; ix<=maxX; ix++){ const k=key(ix,iy); const arr=buckets.get(k); if(arr) out.push(...arr); } } return out; }\n  return { cellSize, cols, rows, clear, insert, queryCircle };\n}\n" },
      { file: "entities.js", op: "patch", find: "export function step(dt, _env, _t){", replace: "export function step(dt, _env, _t){ /* grid scaffold: befüllt im nächsten Schritt produktiv */" }
    );
    ops.goals.push("Vorbereitung schneller Nachbarn-/Food-Lookups (Spatial Hash Scaffold)");
  }

  ops.accept.push("App-Ops Panel erzeugt gültige OPS; Backlog/Jank/Reflows sinken nach Anwendung der Vorschläge (wo zutreffend).");
  return JSON.stringify(ops, null, 2);
}

// (zusätzliche Absicherung – benannte Exporte sicherstellen)
export default {};
export { startCollectors, getAppOpsSnapshot, runModuleMatrix, generateOps };