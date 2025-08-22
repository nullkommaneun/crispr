// appops.js — Smart-Ops v2 + Lazy-Assets-Hinweis
// Telemetrie, Feature-Scan, Hints mit Begründung (ohne Runtime-Preview)

import { on } from "./event.js";

/* ====================== STATE ====================== */
const state = {
  started:false,
  perf:{ raf:{ last:0, samples:[], jankCount:0, jankSumMs:0 }, longTasks:{ count:0, totalMs:0 } },
  engine:{ frames:0, cappedFrames:0, backlogRatio:0 },
  layout:{ reflowCount:0, lastHeights:[] },
  resources:{ scannedAt:0, total:0, largest:[] },
  modules:{ lastReport:null },
  timings:{ ent:0, repro:0, food:0, draw:0, alpha:0.2 },
  features:{ preflightHook:false, tfInline:false, swActive:false, mobile:false }
};

const LS_LAST   = "smartops.lastSession";
const LS_LEARN  = "smartops.learn";
const LS_PROFILE= "smartops.profile";

const clamp = (x,min=0,max=1)=> Math.max(min, Math.min(max, x));
const isMobileUA = ()=> /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent||"");

/* ====================== SAMPLERS ====================== */
function startRafSampler(){
  const r=state.perf.raf;
  function loop(t){
    if(r.last){
      const dt=t-r.last, fps=1000/Math.max(1,dt);
      r.samples.push({t:performance.now(), fps});
      if(dt>50){ r.jankCount++; r.jankSumMs+=(dt-16.7); }
      if(r.samples.length>240) r.samples.shift();
    }
    r.last=t; requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
function startLongTaskObserver(){
  try{
    const po=new PerformanceObserver(list=>{
      list.getEntries().forEach(e=>{
        if(e.entryType==="longtask"){ state.perf.longTasks.count++; state.perf.longTasks.totalMs += e.duration||0; }
      });
    });
    po.observe({ entryTypes:["longtask"] });
  }catch{}
}
on("appops:frame",(e)=>{
  state.engine.frames++;
  if((e?.desired??0)>(e?.max??0)) state.engine.cappedFrames++;
  const f=state.engine.frames||1;
  state.engine.backlogRatio = state.engine.cappedFrames / f;
});
on("appops:timings",(t)=>{
  const a=state.timings.alpha;
  state.timings.ent   = state.timings.ent  *(1-a) + (t.ent  ||0)*a;
  state.timings.repro = state.timings.repro*(1-a) + (t.repro||0)*a;
  state.timings.food  = state.timings.food *(1-a) + (t.food ||0)*a;
  state.timings.draw  = state.timings.draw *(1-a) + (t.draw ||0)*a;
});
function startTopbarObserver(){
  const el=document.getElementById("topbar"); if(!el) return;
  try{
    const ro=new ResizeObserver(()=>{
      state.layout.reflowCount++;
      const h=el.offsetHeight||0;
      const arr=state.layout.lastHeights;
      if(!arr.length || arr[arr.length-1]!==h){ arr.push(h); if(arr.length>10) arr.shift(); }
    });
    ro.observe(el);
  }catch{}
}
function scanResources(){
  try{
    const entries=performance.getEntriesByType("resource");
    const list=[]; let total=0;
    for(const e of entries){
      const size=e.transferSize||e.encodedBodySize||0;
      const sizeKB=Math.round(size/1024); total+=sizeKB;
      list.push({ name:(e.name||"").split("/").slice(-2).join("/"), sizeKB, type:e.initiatorType||"res", duration:Math.round(e.duration||0) });
    }
    list.sort((a,b)=>b.sizeKB-a.sizeKB);
    state.resources={ scannedAt:Date.now(), total, largest:list.slice(0,12) };
  }catch{}
}

/* ====================== FEATURE-/ASSET-SCAN ====================== */
async function scanFeatures(){
  try{
    const res = await fetch("./preflight.js", { cache:"no-store" });
    state.features.preflightHook = /Manuelle Diagnose \(pf=1\)|devHook\(\)/.test(await res.text());
  }catch{ state.features.preflightHook = false; }
  state.features.tfInline = !!document.querySelector('script[src*="@tensorflow/tfjs"]');
  state.features.swActive = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
  state.features.mobile   = isMobileUA() || (window.matchMedia && window.matchMedia("(max-width: 768px)").matches);
}
function heavyAssets(){
  const res = performance.getEntriesByType('resource')||[];
  return res
    .filter(e=> (e.transferSize||e.encodedBodySize||0) > 200*1024)
    .map(e=>({ name:(e.name||"").split('/').slice(-2).join('/'), sizeKB:Math.round((e.transferSize||e.encodedBodySize)/1024) }))
    .sort((a,b)=> b.sizeKB - a.sizeKB);
}

/* ====================== MODULE MATRIX ====================== */
async function checkModule(path, expects){
  try{
    const m=await import(path+`?v=${Date.now()}`);
    if(!expects?.length) return `✅ ${path}`;
    const miss=expects.filter(x=> !(x in m));
    return miss.length? `❌ ${path}: fehlt Export ${miss.join(", ")}` : `✅ ${path}`;
  }catch(e){
    let msg=String(e?.message||e);
    if(/failed to fetch|404/i.test(msg)) msg+=" (Pfad/Case?)";
    return `❌ ${path}: Import/Parse fehlgeschlagen → ${msg}`;
  }
}
export async function runModuleMatrix(){
  const lines=[];
  const checks=[
    ["./event.js",["on","off","emit"]],
    ["./config.js",["CONFIG"]],
    ["./errorManager.js",["initErrorManager","report"]],
    ["./entities.js",["step","createAdamAndEve","setWorldSize","applyEnvironment","getCells","getFoodItems","getGridCellSize","getGridScaleFactor"]],
    ["./reproduction.js",["step","setMutationRate","getMutationRate"]],
    ["./food.js",["step","setSpawnRate","spawnClusters"]],
    ["./renderer.js",["draw","setPerfMode","getPadOverride"]],
    ["./editor.js",["openEditor","closeEditor","setAdvisorMode","getAdvisorMode"]],
    ["./environment.js",["getEnvState","setEnvState","openEnvPanel"]],
    ["./ticker.js",["initTicker","setPerfMode","pushFrame","setUpdateInterval","getUpdateInterval"]],
    ["./genealogy.js",["getNode","getParents","getChildren","getSubtree","searchByNameOrId","exportJSON","getStats","getAll"]],
    ["./genea.js",["openGenealogyPanel"]],
    ["./metrics.js",["beginTick","sampleEnergy","commitTick","addSpawn","getEconSnapshot","getMateSnapshot","mateStart","mateEnd","getPopSnapshot","getDriftSnapshot"]],
    ["./drives.js",["initDrives","getTraceText","getAction","afterStep","getDrivesSnapshot","setTracing"]],
    ["./diag.js",["openDiagPanel"]]
  ];
  for(const [p, exp] of checks){ lines.push(await checkModule(p, exp)); }
  state.modules.lastReport = lines.join("\n");
  return state.modules.lastReport;
}

/* ====================== START ====================== */
export function startCollectors(){
  if(state.started) return; state.started=true;
  startRafSampler(); startLongTaskObserver(); startTopbarObserver(); scanResources(); scanFeatures();
  setInterval(scanResources, 15000);
  setInterval(scanFeatures, 20000);
}

/* ==== Fingerprint/Cost ==== */
function currentKnobs(){
  const pm = !!document.getElementById("perfmode")?.checked;
  return Promise.all([
    import("./ticker.js").then(m=> m.getUpdateInterval?.() ?? 7000),
    import("./renderer.js").then(m=> m.getPadOverride?.() ?? null),
    import("./entities.js").then(m=> ({ size: m.getGridCellSize?.() ?? null, scale: m.getGridScaleFactor?.() ?? 1.0 }))
  ]).then(([tickerMs, padOverride, grid])=>({
    perfModeInit: pm,
    tickerMs,
    padOverride,
    gridCellSize: grid.size,
    gridScale: grid.scale,
    tfInline: !!document.querySelector('script[src*="@tensorflow/tfjs"]')
  }));
}
function currentCost(){
  const s = getAppOpsSnapshot();
  const cap = clamp(s.engine.capRatio, 0, 1);
  const draw = clamp((s.timings.draw||0)/16, 0, 2);
  const ent  = clamp((s.timings.ent ||0)/16, 0, 2);
  const jank = clamp((s.perf.jank||0)/12, 0, 2);
  const flow = clamp((s.layout.reflows||0)/12, 0, 2);
  return +(0.35*cap + 0.25*draw + 0.20*ent + 0.15*jank + 0.05*flow).toFixed(4);
}

/* ====================== SNAPSHOT ====================== */
export function getAppOpsSnapshot(){
  const s=state.perf.raf.samples;
  const fpsNow=s.length? s[s.length-1].fps : 0;
  const fpsAvg=s.length? (s.reduce((a,b)=>a+b.fps,0)/s.length) : 0;
  return {
    v:1, kind:"appops",
    perf:{ fpsNow:Math.round(fpsNow), fpsAvg:Math.round(fpsAvg), jank:state.perf.raf.jankCount, jankMs:Math.round(state.perf.raf.jankSumMs),
      longTasks:{ count:state.perf.longTasks.count, totalMs:Math.round(state.perf.longTasks.totalMs) } }, // ← hier korrigiert
    engine:{ frames:state.engine.frames||1, capRatio:Math.round((state.engine.backlogRatio||0)*100)/100 },
    layout:{ reflows:state.layout.reflowCount, heights:[...state.layout.lastHeights] },
    resources:{ scannedAt:state.resources.scannedAt, totalKB:state.resources.total, largest:state.resources.largest },
    modules:{ lastReport:state.modules.lastReport },
    timings:{ ent:Math.round(state.timings.ent), repro:Math.round(state.timings.repro), food:Math.round(state.timings.food), draw:Math.round(state.timings.draw) },
    features:{ ...state.features }
  };
}

/* ====================== SMART HINTS ====================== */
export function getSmartHints(){
  const s = getAppOpsSnapshot();
  const H = [];

  const jank = s.perf.jank || 0;
  const reflows = s.layout.reflows || 0;
  const cap = s.engine.capRatio || 0;
  const t = s.timings || { ent:0, repro:0, food:0, draw:0 };
  const fpsAvg = s.perf.fpsAvg || 0;

  if (!s.features.preflightHook) {
    H.push({
      id:"preflight",
      title:"Preflight-Hook (?pf=1)",
      confidence: 85,
      reason:"Schneller manueller Diagnosezugriff; aktuell nicht im preflight.js gefunden.",
      changes:[{ file:"preflight.js", op:"append",
        code:"// === Dev-Hook: manuelle Preflight-Anzeige mit ?pf=1 ===\n(function devHook(){\n  try{\n    const q=new URLSearchParams(location.search);\n    if(q.get('pf')==='1') diagnose().then(r=>showOverlay('Manuelle Diagnose (pf=1):\\n\\n'+r));\n  }catch{}\n})();\n"}]
    });
  }

  if (jank > 5 || reflows > 5) {
    const jankScore = clamp((jank-5)/10), reflowScore = clamp((reflows-5)/10);
    const conf = Math.round(100*clamp(0.6*jankScore + 0.4*reflowScore));
    H.push({
      id:"ticker",
      title:"Ticker throttle & kompakter",
      confidence: conf,
      reason:`UI-Detektor: jank=${jank}, reflows=${reflows}. Weniger Reflow durch selteneres Update & dichtere Zeilen.`,
      changes:[
        { file:"ticker.js", op:"patch", find:"setInterval\\(updateSnapshot, 5000\\);", replace:"setInterval(updateSnapshot, 7000);" },
        { file:"style.css", op:"append", code:"/* Ticker kompakter (Smart-Ops) */\n#ticker{ row-gap:0 !important; }\n#ticker span{ line-height:1.15; }\n" }
      ]
    });
  }

  if ((t.draw||0) > 8) {
    const conf = Math.round(100*clamp((t.draw-8)/8));
    H.push({
      id:"drawpad",
      title:"Renderer: Culling-Pad im Perf-Mode senken",
      confidence: conf,
      reason:`Draw-Detektor: draw≈${t.draw}ms. Kleinerer Puffer im Perf-Mode reduziert Overdraw.`,
      changes:[{ file:"renderer.js", op:"patch", find:"const pad = 24;", replace:"const pad = perfMode ? 12 : 24;" }]
    });
  }

  if ((cap||0) > 0.15 || (t.ent||0) > 8) {
    const capScore = clamp((cap-0.15)/0.25), entScore = clamp((t.ent-8)/8);
    const conf = Math.round(100*clamp(0.6*capScore + 0.4*entScore));
    H.push({
      id:"gridfine",
      title:"Spatial-Grid: 10% kleinere Buckets",
      confidence: conf,
      reason:`Engine-Detektor: Backlog=${Math.round(cap*100)}%, entities≈${t.ent}ms. Dichteres Grid reduziert Kandidaten pro Query.`,
      changes:[
        { file:"entities.js", op:"patch",
          find:"const desired = Math.max(80, Math.round(baseSense * sMin));",
          replace:"const desired = Math.max(80, Math.round(baseSense * sMin * 0.9));"
        }
      ]
    });
  }

  if (s.features.tfInline) {
    H.push({
      id:"lazyTF",
      title:"Editor: TF.js lazy laden (Initial-Load entlasten)",
      confidence: 70,
      reason:"TF.js wird beim Seitenstart geladen. Besser: nur bei Bedarf im Editor importieren.",
      changes:[
        { file:"index.html", op:"patch",
          find:'<script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.16.0/dist/tf.min.js"></script>',
          replace:'<!-- TF.js lazy via editor.js -->'
        },
        { file:"editor.js", op:"patch",
          find:"async function ensureModel(){",
          replace:
"async function ensureModel(){\n  if (typeof tf === 'undefined'){\n    try{ await import('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.16.0/dist/tf.min.js'); }\n    catch(e){ console.warn('TF import failed', e); return null; }\n  }\n  if (!window.__tfModel){\n    try{ window.__tfModel = await tf.loadLayersModel('./models/model.json'); }\n    catch(e){ console.warn('TF model load failed:', e); return null; }\n  }\n  return window.__tfModel;\n}\n"
        }
      ]
    });
  }

  const heavy = heavyAssets();
  if (heavy.length){
    const top = heavy.slice(0,3);
    const list = top.map(a=>`${a.name} (~${a.sizeKB}KB)`).join(', ');
    H.push({
      id:"lazyAssets",
      title:"Große Assets lazy laden",
      confidence: 65,
      reason:`Gefundene große Ressourcen: ${list}. Prüfe, ob Lazy-Import möglich ist (Panel/Modell nur bei Bedarf).`,
      changes: []
    });
  }

  // Auto-Perf (nutzt die oben definierte Variable fpsAvg)
  if ((s.features.mobile && fpsAvg < 50) || fpsAvg < 40) {
    const base = s.features.mobile ? 0.7 : 0.5;
    const conf = Math.round(100*clamp(base + clamp((50 - fpsAvg)/30)));
    H.push({
      id:"autoPerf",
      title:"Auto-PerfMode auf Mobile/niedriger FPS",
      confidence: conf,
      reason:`Heuristik: mobile=${s.features.mobile}, fpsAvg≈${Math.round(fpsAvg)}. Initial Perf-Mode reduziert Draw/Overhead.`,
      changes:[{ file:"engine.js", op:"patch",
        find:"setPerfMode(pm.checked);",
        replace:
"// Auto-PerfMode: Mobile oder niedrige FPS → initial aktivieren\n  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent||'');\n  setPerfMode(isMobile ? true : pm.checked);"
      }]
    });
  }

  return H;
}

/* ====================== OPS JSON ====================== */
export function generateOps(){
  const hints = getSmartHints();
  const ops = { v: 1, title: "Auto-OPS Vorschläge", goals: [], changes: [], accept: [] };
  const notes = [];
  for(const h of hints){
    ops.goals.push(h.title);
    notes.push(`${h.title} — Confidence ${h.confidence}% — ${h.reason}`);
    for(const ch of (h.changes||[])) ops.changes.push(ch);
  }
  ops.accept.push("Nach Einspielen sollten Jank/Backlog/Draw sinken (wo zutreffend).");
  if (notes.length) ops.notes = notes.join(" | ");
  return JSON.stringify(ops, null, 2);
}