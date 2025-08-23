// appops.js — Telemetrie & MDC-OPS; Micro-Profiler (EMA) + zentraler Modul-Check
import { on } from "./event.js";
import { PF_MODULES } from "./modmap.js";

const state = {
  started:false,
  perf:{ raf:{ last:0, samples:[], jankCount:0, jankSumMs:0 }, longTasks:{ count:0, totalMs:0 } },
  engine:{ frames:0, cappedFrames:0, backlogRatio:0 },
  layout:{ reflowCount:0, lastHeights:[] },
  resources:{ scannedAt:0, total:0, largest:[] },
  modules:{ lastReport:null },
  timings:{ ent:0, repro:0, food:0, draw:0, alpha:0.2 }
};

/* ---- Sammler ---- */
function startRafSampler(){
  const r=state.perf.raf;
  function loop(t){
    if(r.last){
      const dt=t-r.last, fps=1000/Math.max(1,dt);
      r.samples.push({t:performance.now(), fps});
      if(dt>50){ state.perf.raf.jankCount++; state.perf.raf.jankSumMs+=(dt-16.7); }
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
    }); po.observe({ entryTypes:["longtask"] });
  }catch{}
}
on("appops:frame",(e)=>{
  state.engine.frames++;
  if((e?.desired??0)>(e?.max??0)) state.engine.cappedFrames++;
  const f=state.engine.frames||1; state.engine.backlogRatio=state.engine.cappedFrames/f;
});
on("appops:timings", (t)=>{
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

/* ---- identischer Modul-Check wie Preflight ---- */
async function checkOne(path, wants){
  try{
    const m=await import(path+`?v=${Date.now()}`);
    if(!wants?.length) return `✅ ${path}`;
    const miss=wants.filter(x=> !(x in m));
    return miss.length? `❌ ${path}: fehlt Export ${miss.join(", ")}` : `✅ ${path}`;
  }catch(e){
    let msg=String(e?.message||e); if(/failed to fetch|404/i.test(msg)) msg+=" (Pfad/Case?)";
    return `❌ ${path}: Import/Parse fehlgeschlagen → ${msg}`;
  }
}
export async function runModuleMatrix(){
  const lines=[];
  for(const spec of PF_MODULES){ lines.push(await checkOne(spec.path, spec.wants)); }
  state.modules.lastReport=lines.join("\n");
  return state.modules.lastReport;
}

/* ---- Start/Snapshot ---- */
export function startCollectors(){
  if(state.started) return; state.started=true;
  startRafSampler(); startLongTaskObserver(); startTopbarObserver(); scanResources();
  setInterval(scanResources, 15000);
}
export function getAppOpsSnapshot(){
  const s=state.perf.raf.samples;
  const fpsNow=s.length? s[s.length-1].fps : 0;
  const fpsAvg=s.length? (s.reduce((a,b)=>a+b.fps,0)/s.length) : 0;
  return {
    v:1, kind:"appops",
    perf:{ fpsNow:Math.round(fpsNow), fpsAvg:Math.round(fpsAvg), jank:state.perf.raf.jankCount, jankMs:Math.round(state.perf.raf.jankSumMs),
      longTasks:{ count:state.perf.longTasks.count, totalMs:Math.round(state.perf.longTasks.totalMs) } },
    engine:{ frames:state.engine.frames||1, capRatio:Math.round((state.engine.backlogRatio||0)*100)/100 },
    layout:{ reflows:state.layout.reflowCount, heights:[...state.layout.lastHeights] },
    resources:{ scannedAt:state.resources.scannedAt, totalKB:state.resources.total, largest:state.resources.largest },
    modules:{ last:state.modules.lastReport },
    timings:{ ent:Math.round(state.timings.ent), repro:Math.round(state.timings.repro), food:Math.round(state.timings.food), draw:Math.round(state.timings.draw) }
  };
}

/* ---- MDC-OPS & Vorschläge ---- */
const tag = (name,obj)=>`MDC-OPS-${name}-${btoa(unescape(encodeURIComponent(JSON.stringify({v:1,ts:Date.now(),snapshot:obj}))))}`;
export function getMdcCodes(){
  const s=getAppOpsSnapshot();
  return { all:tag('ALL',s), perf:tag('PERF',s.perf), timings:tag('TIMINGS',s.timings), layout:tag('LAYOUT',s.layout), res:tag('RES',s.resources) };
}
export function generateOps(){
  const s = getAppOpsSnapshot();
  const ops = { v: 1, title: "Auto-OPS Vorschläge", goals: [], changes: [], accept: [] };

  ops.changes.push({
    file:"preflight.js", op:"append",
    code:"// Dev-Hook: manuelle Preflight-Anzeige (?pf=1)\n(function PF_HOOK(){try{var q=new URLSearchParams(location.search);if(q.get('pf')==='1') import('./preflight.js').then(m=>m.diagnose());}catch{}})();\n"
  });
  ops.goals.push("Preflight jederzeit manuell abrufbar (?pf=1)");

  if (s.perf.jank > 5 || s.layout.reflows > 5) {
    ops.changes.push(
      { file:"ticker.js", op:"patch", find:"setInterval\\(updateSnapshot, 5000\\);", replace:"setInterval(updateSnapshot, 7000);" },
      { file:"style.css", op:"append", code:"/* Ticker kompakter */\n#ticker{ row-gap:0 !important; } #ticker span{ line-height:1.15; }\n" }
    );
    ops.goals.push("Ticker ruhiger/kompakter zur Reflow-Reduktion");
  }

  if ((s.engine.capRatio||0) > 0.15) {
    ops.changes.push(
      { file:"grid.js", op:"replace", code:
"// Uniform-Grid Scaffold\nexport function createGrid(cellSize, width, height){\n  const cols = Math.max(1, Math.ceil(width / cellSize));\n  const rows = Math.max(1, Math.ceil(height/ cellSize));\n  const buckets = new Map();\n  function key(ix,iy){ return ix+\",\"+iy; }\n  function clear(){ buckets.clear(); }\n  function insert(x,y,p){ const ix=Math.floor(x/cellSize), iy=Math.floor(y/cellSize); const k=key(ix,iy); if(!buckets.has(k)) buckets.set(k,[]); buckets.get(k).push(p); }\n  function queryCircle(x,y,r){ const minX=Math.floor((x-r)/cellSize), maxX=Math.floor((x+r)/cellSize); const minY=Math.floor((y-r)/cellSize), maxY=Math.floor((y+r)/cellSize); const out=[]; for(let iy=minY; iy<=maxY; iy++){ for(let ix=minX; ix<=maxX; ix++){ const k=key(ix,iy); const arr=buckets.get(k); if(arr) out.push(...arr); } } return out; }\n  return { cellSize, cols, rows, clear, insert, queryCircle };\n}\n" },
      { file:"entities.js", op:"patch", find:"export function step(dt, _env, _t){", replace:"export function step(dt, _env, _t){ /* grid scaffold: befüllt im nächsten Schritt produktiv */" }
    );
    ops.goals.push("Spatial Hash Scaffold vorbereitet");
  }

  ops.accept.push("OPS einspielen → Jank/Backlog/Draw-Zeit sinken (wo zutreffend).");
  return JSON.stringify(ops, null, 2);
}