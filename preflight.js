// preflight.js — Deep-Check + UI-Wiring + Canvas-Probe + MDC-CHK
import { PF_MODULES } from "./modmap.js";

const OK='✅ ', NO='❌ ', OPT='⚠️  ';
const b64 = s => btoa(unescape(encodeURIComponent(s)));
const $  = id => document.getElementById(id);

function show(text){
  let w = $('diag-overlay');
  if(!w){
    w = document.createElement('div'); w.id='diag-overlay';
    w.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.65);display:flex;align-items:flex-start;justify-content:center;padding:48px;';
    const p=document.createElement('pre'); p.id='diag-box';
    p.style.cssText='max-width:1100px;width:92%;background:#10161d;color:#d6e1ea;border:1px solid #2a3b4a;border-radius:10px;padding:16px;overflow:auto;white-space:pre-wrap;';
    const x=document.createElement('button'); x.textContent='Schließen';
    x.style.cssText='position:absolute;top:12px;right:12px;background:#243241;color:#cfe6ff;border:1px solid #47617a;border-radius:8px;padding:6px 10px;';
    x.onclick=()=>w.remove();
    w.append(p,x); document.body.appendChild(w);
  }
  $('diag-box').textContent = text;
}

async function checkOne({path,wants=[],optional=false}){
  try{
    const m = await import(path+'?v='+Date.now());
    const miss = wants.filter(k => !(k in m));
    if (miss.length) return { ok:false, line: (optional?OPT:NO)+`${path} · fehlt: ${miss.join(', ')} ${optional?'(optional)':''}` };
    return { ok:true, line: OK+path+' OK' };
  }catch(e){
    const msg = String(e?.message || e);
    return { ok:false, line: (optional?OPT:NO)+`${path} · Import/Parse fehlgeschlagen → ${msg} ${optional?'(optional)':''}` };
  }
}

export async function runModuleMatrix(){
  const out = [];
  for (const spec of PF_MODULES){
    const r = await checkOne(spec);
    out.push(r.line);
  }
  return out.join('\n');
}

async function uiCheck(){
  const ui = {
    btnStart:!!$('btnStart'), btnPause:!!$('btnPause'), btnReset:!!$('btnReset'),
    chkPerf:!!$('chkPerf'),
    btnEditor:!!$('btnEditor'), btnEnv:!!$('btnEnv'),
    btnAppOps:!!$('btnAppOps'), btnDiag:!!$('btnDiag'),
    sliderMutation:!!$('sliderMutation'), sliderFood:!!$('sliderFood'),
    canvas:!!$('scene')
  };
  const fn = {};
  try{ const m=await import('./engine.js?v='+Date.now());
       fn.start=typeof m.start==='function'; fn.pause=typeof m.pause==='function';
       fn.reset=typeof m.reset==='function'; fn.setTS=typeof m.setTimescale==='function';
       fn.setPerf=typeof m.setPerfMode==='function'; }catch(e){ fn._engineErr=String(e); }
  try{ const m=await import('./reproduction.js?v='+Date.now()); fn.setMutation=typeof m.setMutationRate==='function'; }catch(e){}
  try{ const m=await import('./food.js?v='+Date.now()); fn.setFood=typeof m.setSpawnRate==='function'; }catch(e){}
  try{ const m=await import('./editor.js?v='+Date.now()); fn.openEditor=typeof m.openEditor==='function'; }catch(e){}
  try{ const m=await import('./environment.js?v='+Date.now()); fn.openEnv=typeof m.openEnvPanel==='function'; }catch(e){}
  try{ const m=await import('./appops_panel.js?v='+Date.now()); fn.openOps=typeof m.openAppOps==='function'; }catch(e){}
  // Canvas 2D Probe
  let canvas2D=false; try{ const c=$('scene'); canvas2D=!!(c&&c.getContext&&c.getContext('2d')); }catch{}
  ui.canvas2D=canvas2D; return {ui,fn};
}

function runtime(){
  const boot=!!window.__bootOK;
  const fc  = window.__frameCount|0;
  const fps = window.__fpsEMA? Math.round(window.__fpsEMA) : 0;
  const cells = window.__cellsN|0, food = window.__foodN|0;
  const last  = window.__lastStepAt? new Date(window.__lastStepAt).toLocaleTimeString():'–';
  const errs  = (Array.isArray(window.__runtimeErrors)?window.__runtimeErrors.length:0)|0;
  return {boot,fc,fps,cells,food,last,errs};
}

export async function diagnose(){
  window.__suppressBootGuard = true; // kein rotes Boot-Overlay während PF

  const rt = runtime();
  const W = [];
  const mark=(ok,label,hint='')=>W.push((ok?OK:NO)+label+(hint?(' — '+hint):''));
  const wiring = await uiCheck();

  mark(wiring.ui.btnStart && wiring.fn.start,'Start-Button → engine.start()', !wiring.ui.btnStart?'Button fehlt':(!wiring.fn.start?'API fehlt':'' ));
  mark(wiring.ui.btnPause && wiring.fn.pause,'Pause-Button → engine.pause()', !wiring.ui.btnPause?'Button fehlt':(!wiring.fn.pause?'API fehlt':'' ));
  mark(wiring.ui.btnReset && wiring.fn.reset,'Reset-Button → engine.reset()', !wiring.ui.btnReset?'Button fehlt':(!wiring.fn.reset?'API fehlt':'' ));
  mark(wiring.ui.chkPerf  && wiring.fn.setPerf,'Perf-Checkbox → engine.setPerfMode()', !wiring.ui.chkPerf?'Checkbox fehlt':(!wiring.fn.setPerf?'API fehlt':'' ));
  mark(wiring.ui.sliderMutation && wiring.fn.setMutation,'Slider Mutation% → reproduction.setMutationRate()', !wiring.ui.sliderMutation?'Slider fehlt':(!wiring.fn.setMutation?'API fehlt':'' ));
  mark(wiring.ui.sliderFood && wiring.fn.setFood,'Slider Nahrung/s → food.setSpawnRate()', !wiring.ui.sliderFood?'Slider fehlt':(!wiring.fn.setFood?'API fehlt':'' ));
  mark(wiring.ui.btnEditor && wiring.fn.openEditor,'CRISPR-Editor → editor.openEditor()', !wiring.ui.btnEditor?'Button fehlt':(!wiring.fn.openEditor?'API fehlt':'' ));
  mark(wiring.ui.btnEnv && wiring.fn.openEnv,'Umwelt-Panel → environment.openEnvPanel()', !wiring.ui.btnEnv?'Button fehlt':(!wiring.fn.openEnv?'API fehlt':'' ));
  mark(wiring.ui.btnAppOps && wiring.fn.openOps,'App-Ops → appops_panel.openAppOps()', !wiring.ui.btnAppOps?'Button fehlt':(!wiring.fn.openOps?'API fehlt':'' ));
  W.push((wiring.ui.canvas?OK:NO)+'Canvas #scene vorhanden');
  W.push((wiring.ui.canvas2D?OK:NO)+'2D-Context erzeugbar');

  const modText = await runModuleMatrix();
  const payload={v:1,kind:'ui-diagnose',ts:Date.now(),runtime:rt,wiring,modules:modText};
  const mdc=`MDC-CHK-${(Math.random().toString(16).slice(2,6))}-${b64(JSON.stringify(payload))}`;

  const lines=[];
  lines.push('Start-Diagnose (Deep-Check + UI-Wiring)\n');
  lines.push(`Boot-Flag: ${rt.boot?'gesetzt':'fehlt'}`);
  lines.push(`Frames: ${rt.fc}  ·  FPS≈ ${rt.fps}`);
  lines.push(`Zellen: ${rt.cells}  ·  Food: ${rt.food}`);
  lines.push(`Letzter Step: ${rt.last}`);
  lines.push(`Runtime-Fehler im Log: ${rt.errs}\n`);
  lines.push('UI/Wiring:'); lines.push(...W,'');
  lines.push('Module/Exporte:'); lines.push(modText,'');
  const errs=Array.isArray(window.__runtimeErrors)?window.__runtimeErrors.slice(-4):[];
  if(errs.length){ lines.push('Laufzeitfehler (letzte 4):',''); errs.forEach(e=>lines.push(`[${new Date(e.ts).toLocaleTimeString()}] ${e.where||e.when}\n${String(e.msg||'')}`,'')); }
  lines.push('Maschinencode:', mdc,'');
  lines.push('Hinweis: Cache-Buster: ?ts='+Date.now());
  show(lines.join('\n'));
}

// manueller Hook via ?pf=1
(function(){
  try{
    const q=new URLSearchParams(location.search);
    if(q.get('pf')==='1' || location.hash==="#pf") window.addEventListener('load', ()=>diagnose());
  }catch{}
})();