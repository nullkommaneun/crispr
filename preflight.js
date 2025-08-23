// preflight.js — Deep-Check + UI-Wiring + Canvas-Probe + MDC-CHK
// eigenständig (kein modmap.js), mit Play/Pause & sanftem Engine-Modus

const OK  = '✅ ';
const NO  = '❌ ';
const OPT = '⚠️  ';
const $   = id => document.getElementById(id);
const b64 = s  => btoa(unescape(encodeURIComponent(s)));

const PF_MODULES = [
  { path:'./event.js',         wants:['on','emit'] },
  { path:'./config.js',        wants:[], optional:true },
  { path:'./errorManager.js',  wants:['initErrorManager','report'] },
  { path:'./engine.js',        wants:['boot','start','pause','reset','setTimescale','setPerfMode'] },
  { path:'./entities.js',      wants:['setWorldSize','createAdamAndEve','step','getCells','getFoodItems','applyEnvironment'] },
  { path:'./reproduction.js',  wants:['step','setMutationRate'] },
  { path:'./food.js',          wants:['step','setSpawnRate'] },
  { path:'./renderer.js',      wants:['draw','setPerfMode'] },
  { path:'./metrics.js',       wants:['getPhases','getEconSnapshot','getPopSnapshot','getDriftSnapshot','getMateSnapshot'] },
  { path:'./drives.js',        wants:['getDrivesSnapshot'], optional:true },
  // Tools (optional)
  { path:'./editor.js',        wants:['openEditor'], optional:true },
  { path:'./environment.js',   wants:['openEnvPanel'], optional:true },
  { path:'./appops_panel.js',  wants:['openAppOps'], optional:true },
  { path:'./appops.js',        wants:['generateOps'], optional:true },
  { path:'./advisor.js',       wants:['setMode','getMode','scoreCell','sortCells'], optional:true },
  { path:'./grid.js',          wants:['createGrid'], optional:true },
  { path:'./bootstrap.js',     wants:[], optional:true },
  { path:'./sw.js',            wants:[], optional:true },
  { path:'./diag.js',          wants:['openDiagPanel'], optional:true },
];

// ---------- helpers ----------
async function checkOne({ path, wants=[], optional=false }){
  try{
    const m = await import(path);
    const miss = wants.filter(k => !(k in m));
    if (miss.length) return { ok:false, line:(optional?OPT:NO)+`${path} · fehlt: ${miss.join(', ')} ${optional?'(optional)':''}` };
    return { ok:true, line:OK+path+' OK' };
  }catch(e){
    const msg = String(e?.message || e);
    return { ok:false, line:(optional?OPT:NO)+`${path} · Import/Parse fehlgeschlagen → ${msg} ${optional?'(optional)':''}` };
  }
}

async function runModuleMatrix(){
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
  try{ const m = await import('./engine.js');
       fn.start=typeof m.start==='function';
       fn.pause=typeof m.pause==='function';
       fn.reset=typeof m.reset==='function';
       fn.setTS=typeof m.setTimescale==='function';
       fn.setPerf=typeof m.setPerfMode==='function';
  }catch(e){ fn._engineErr=String(e); }
  try{ const m=await import('./reproduction.js'); fn.setMutation=typeof m.setMutationRate==='function'; }catch{}
  try{ const m=await import('./food.js');          fn.setFood=typeof m.setSpawnRate==='function'; }catch{}
  try{ const m=await import('./editor.js');        fn.openEditor=typeof m.openEditor==='function'; }catch{}
  try{ const m=await import('./environment.js');   fn.openEnv=typeof m.openEnvPanel==='function'; }catch{}
  try{ const m=await import('./appops_panel.js');  fn.openOps=typeof m.openAppOps==='function'; }catch{}
  let canvas2D=false; try{ const c=$('scene'); canvas2D=!!(c&&c.getContext&&c.getContext('2d')); }catch{}
  ui.canvas2D=canvas2D; return { ui, fn };
}

function runtime(){
  const boot = !!window.__bootOK;
  const fc   = window.__frameCount|0;
  const fps  = window.__fpsEMA? Math.round(window.__fpsEMA) : 0;
  const cells= window.__cellsN|0, food=window.__foodN|0;
  const last = window.__lastStepAt? new Date(window.__lastStepAt).toLocaleTimeString():'–';
  const errs = (Array.isArray(window.__runtimeErrors)?window.__runtimeErrors.length:0)|0;
  return { boot, fc, fps, cells, food, last, errs };
}

// ---------- overlay ----------
let __pfNode = null;
let __pfRunningBefore = null;

function openOverlay(){
  if (__pfNode) return __pfNode;
  window.__pfOpen = true;

  const wrap = document.createElement('div');
  wrap.id='pf-overlay';
  wrap.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:flex;align-items:flex-start;justify-content:center;padding:24px;';
  wrap.addEventListener('click', e=>{ if(e.target===wrap) hide(); });

  const box = document.createElement('div');
  box.style.cssText='max-width:1100px;width:96%;max-height:86vh;overflow:auto;background:#10161d;color:#d6e1ea;border:1px solid #2a3b4a;border-radius:12px;padding:14px;box-shadow:0 30px 70px rgba(0,0,0,.45);';
  wrap.appendChild(box);

  const bar = document.createElement('div');
  bar.style.cssText='display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-bottom:8px;';
  const hint = document.createElement('span'); hint.textContent='Engine läuft (Preflight kann ruckeln)'; hint.style.cssText='margin-right:auto;opacity:.75';
  const bPause = document.createElement('button'); bPause.textContent='Anhalten';
  const bCopy  = document.createElement('button'); bCopy.textContent='MDC kopieren';
  const bRerun = document.createElement('button'); bRerun.textContent='Erneut prüfen';
  const bClose = document.createElement('button'); bClose.textContent='Schließen';
  [bPause,bCopy,bRerun,bClose].forEach(b=>{ b.style.cssText='background:#243241;color:#cfe6ff;border:1px solid #47617a;border-radius:8px;padding:6px 10px;'; });
  bar.append(hint,bPause,bCopy,bRerun,bClose);

  const pre = document.createElement('pre');
  pre.id='pf-output';
  pre.style.cssText='white-space:pre-wrap;margin:0;font:13px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';

  box.append(bar, pre);
  document.body.appendChild(wrap);

  __pfNode = { wrap, pre, bPause, bCopy, bRerun, bClose, hint };
  return __pfNode;
}

async function hide(){
  try{
    window.__pfOpen = false;
    window.__NO_BOOT = false;
    if (__pfRunningBefore === true) {
      try { const m = await import('./engine.js'); m.start?.(); } catch {}
    }
  } finally {
    __pfRunningBefore = null;
    __pfNode?.wrap?.remove(); __pfNode=null;
  }
}

// ---------- api ----------
export async function diagnose(){
  // verhindert, dass Engine in dieser Session neu bootet
  window.__NO_BOOT = true;

  const ui = openOverlay();

  // best effort pausieren
  try{
    const m = await import('./engine.js');
    if (m && typeof m.pause==='function'){ __pfRunningBefore = true; m.pause(); ui.bPause.textContent='Weiterlaufen'; ui.hint.textContent='Engine angehalten'; }
  }catch{}

  // Buttons
  ui.bPause.onclick = async ()=>{
    try{
      const m = await import('./engine.js');
      if (!m || typeof m.pause!=='function' || typeof m.start!=='function') return;
      if (ui.bPause.textContent==='Anhalten'){ __pfRunningBefore = true;  m.pause(); ui.bPause.textContent='Weiterlaufen'; ui.hint.textContent='Engine angehalten'; }
      else                                   { __pfRunningBefore = false; m.start(); ui.bPause.textContent='Anhalten';      ui.hint.textContent='Engine läuft (Preflight kann ruckeln)'; }
    }catch{}
  };
  ui.bRerun.onclick = ()=> diagnose();
  ui.bClose.onclick = ()=> hide();
  ui.bCopy.onclick  = async ()=>{
    const out = ui.pre.textContent || '';
    const last = out.split('\n').filter(x=>x.startsWith('MDC-')).slice(-1)[0] || '';
    try{ await navigator.clipboard.writeText(last); ui.bCopy.textContent='Kopiert ✓'; setTimeout(()=>ui.bCopy.textContent='MDC kopieren',1200);}catch{}
  };

  // ---------- Diagnosedaten ----------
  const rt = runtime();
  const W = [];
  function mark(ok,label,hint=''){ W.push((ok?OK:NO)+label+(hint?(' — '+hint):'')); }
  const wiring = await uiCheck();

  mark(wiring.ui.btnStart && wiring.fn.start,'Start-Button → engine.start()', !wiring.ui.btnStart?'Button fehlt':(!wiring.fn.start?'API fehlt':''));
  mark(wiring.ui.btnPause && wiring.fn.pause,'Pause-Button → engine.pause()', !wiring.ui.btnPause?'Button fehlt':(!wiring.fn.pause?'API fehlt':''));
  mark(wiring.ui.btnReset && wiring.fn.reset,'Reset-Button → engine.reset()', !wiring.ui.btnReset?'Button fehlt':(!wiring.fn.reset?'API fehlt':''));
  mark(wiring.ui.chkPerf  && wiring.fn.setPerf,'Perf-Checkbox → engine.setPerfMode()', !wiring.ui.chkPerf?'Checkbox fehlt':(!wiring.fn.setPerf?'API fehlt':''));
  mark(wiring.ui.sliderMutation && wiring.fn.setMutation,'Slider Mutation% → reproduction.setMutationRate()', !wiring.ui.sliderMutation?'Slider fehlt':(!wiring.fn.setMutation?'API fehlt':''));
  mark(wiring.ui.sliderFood && wiring.fn.setFood,'Slider Nahrung/s → food.setSpawnRate()', !wiring.ui.sliderFood?'Slider fehlt':(!wiring.fn.setFood?'API fehlt':''));
  mark(wiring.ui.btnEditor && wiring.fn.openEditor,'CRISPR-Editor → editor.openEditor()', !wiring.ui.btnEditor?'Button fehlt':(!wiring.fn.openEditor?'API fehlt':''));
  mark(wiring.ui.btnEnv && wiring.fn.openEnv,'Umwelt-Panel → environment.openEnvPanel()', !wiring.ui.btnEnv?'Button fehlt':(!wiring.fn.openEnv?'API fehlt':''));
  mark(wiring.ui.btnAppOps && wiring.fn.openOps,'App-Ops → appops_panel.openAppOps()', !wiring.ui.btnAppOps?'Button fehlt':(!wiring.fn.openOps?'API fehlt':''));

  const modText = await runModuleMatrix();

  const payload = { v:1, kind:'ui-diagnose', ts:Date.now(), runtime:rt, wiring, modules:modText };
  const mdc = `MDC-CHK-${Math.random().toString(16).slice(2,6)}-${b64(JSON.stringify(payload))}`;

  const lines = [];
  lines.push('Start-Diagnose (Deep-Check + UI-Wiring)\n');
  lines.push(`Boot-Flag: ${rt.boot?'gesetzt':'fehlt'}`);
  lines.push(`Frames: ${rt.fc}  ·  FPS≈ ${rt.fps}`);
  lines.push(`Zellen: ${rt.cells}  ·  Food: ${rt.food}`);
  lines.push(`Letzter Step: ${rt.last}`);
  lines.push(`Runtime-Fehler im Log: ${rt.errs}\n`);
  lines.push('UI/Wiring:'); lines.push(...W,'');
  lines.push('Module/Exporte:'); lines.push(modText,'');
  lines.push('Maschinencode:', mdc);
  ui.pre.textContent = lines.join('\n');
}

// manueller Hook via ?pf=1 oder #pf
(function(){
  try{
    const q = new URLSearchParams(location.search);
    if (q.get('pf') === '1' || location.hash === '#pf'){
      window.addEventListener('load', ()=> diagnose());
    }
  }catch{}
})();