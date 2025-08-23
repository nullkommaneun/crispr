// appops.js — Telemetrie & Smart-OPS (mit Timings-EMA, Modul-Matrix)

import { on } from "./event.js";
import { PF_MODULES } from "./preflight.js";   // selbe Modulliste wie Preflight

const state = {
  started:false,
  perf:{ raf:{ last:0, samples:[], jankCount:0, jankSumMs:0 }, longTasks:{ count:0, totalMs:0 } },
  engine:{ frames:0, cappedFrames:0, backlogRatio:0 },
  layout:{ reflowCount:0, lastHeights:[] },
  resources:{ scannedAt:0, total:0, largest:[] },
  modules:{ lastReport:null },
  timings:{ ent:0, repro:0, food:0, draw:0, alpha:0.2 }
};

// RAF
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
// Long Tasks
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
// Engine Backlog
on("appops:frame",(e)=>{
  state.engine.frames++;
  if((e?.desired??0)>(e?.max??0)) state.engine.cappedFrames++;
  const f=state.engine.frames||1; state.engine.backlogRatio=state.engine.cappedFrames/f;
});
// Timings-EMA
on("appops:timings",t=>{
  const a=state.timings.alpha;
  state.timings.ent   = state.timings.ent  *(1-a) + (t.ent  ||0)*a;
  state.timings.repro = state.timings.repro*(1-a) + (t.repro||0)*a;
  state.timings.food  = state.timings.food *(1-a) + (t.food ||0)*a;
  state.timings.draw  = state.timings.draw *(1-a) + (t.draw ||0)*a;
});

// Topbar Reflows
function startTopbarObserver(){
  const el=document.getElementById("topbar"); if(!el) return;
  try{
    const ro=new ResizeObserver(()=>{
      state.layout.reflowCount++;
      const h=el.offsetHeight||0, arr=state.layout.lastHeights;
      if(!arr.length || arr[arr.length-1]!==h){ arr.push(h); if(arr.length>10) arr.shift(); }
    });
    ro.observe(el);
  }catch{}
}

// Ressourcen
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

// Modulmatrix (selbe Liste wie Preflight)
async function checkModule(path, wants){
  try{
    const m=await import(path+`?v=${Date.now()}`);
    if(!wants?.length) return `✅ ${path}`;
    const miss=wants.filter(x=>!(x in m));
    return miss.length? `❌ ${path}: fehlt Export ${miss.join(", ")}` : `✅ ${path}`;
  }catch(e){
    let msg=String(e?.message||e); if(/failed to fetch|404/i.test(msg)) msg+=" (Pfad/Case?)";
    return `❌ ${path}: Import/Parse fehlgeschlagen → ${msg}`;
  }
}
export async function runModuleMatrix(){
  const out=[];
  for(const spec of PF_MODULES) out.push(await checkModule(spec.p, spec.want));
  state.modules.lastReport = out.join("\n");
  return state.modules.lastReport;
}

// Start
export function startCollectors(){
  if(state.started) return; state.started=true;
  startRafSampler(); startLongTaskObserver(); startTopbarObserver(); scanResources();
  setInterval(scanResources, 15000);
}

// Snapshot
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

// OPS (unverändert minimal)
export function generateOps(){
  const s=getAppOpsSnapshot();
  const ops={ v:1, title:"Auto-OPS Vorschläge", goals:[], changes:[], accept:[] };

  // pf-Hook (Baseline)
  ops.changes.push({ file:"preflight.js", op:"append",
    code:"// Dev-Hook: manuelle Preflight-Anzeige (?pf=1)\n(function PF_HOOK(){try{var q=new URLSearchParams(location.search);if(q.get('pf')==='1') import('./preflight.js').then(m=>m.diagnose());}catch{}})();\n" });
  ops.goals.push("Preflight jederzeit manuell abrufbar (?pf=1)");
  ops.accept.push("OPS einspielen, neu laden; Phasen-EMA sollten sinken (wo zutreffend).");
  return JSON.stringify(ops,null,2);
}