// preflight.js — Deep-Check + UI-Wiring + Canvas-Probe + MDC-CHK

const OK='✅ ', NO='❌ ', OPT='⚠️  ';
const $ = id => document.getElementById(id);
const b64 = s => btoa(unescape(encodeURIComponent(s)));

function ensureOverlay() {
  let w = $('diag-overlay');
  if (w) return w;
  w = document.createElement('div'); w.id='diag-overlay';
  w.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.65);display:flex;align-items:flex-start;justify-content:center;padding:48px;';
  const card = document.createElement('div');
  card.style.cssText='max-width:1100px;width:92%;background:#10161d;color:#d6e1ea;border:1px solid #2a3b4a;border-radius:10px;padding:16px;overflow:auto;';
  const pre = document.createElement('pre'); pre.id='diag-box'; pre.style.whiteSpace='pre-wrap';
  const row = document.createElement('div'); row.style.cssText='display:flex;gap:8px;margin-top:8px;';
  const btnCopy = document.createElement('button'); btnCopy.textContent='MDC kopieren';
  btnCopy.onclick = async()=>{ try{ await navigator.clipboard.writeText(window.__MDC_LAST||""); btnCopy.textContent='Kopiert ✓'; setTimeout(()=>btnCopy.textContent='MDC kopieren',1200);}catch{} };
  const btnClose = document.createElement('button'); btnClose.textContent='Schließen';
  btnClose.onclick=()=> w.remove();
  row.append(btnCopy, btnClose);
  card.append(pre, row); w.append(card); document.body.appendChild(w);
  return w;
}
function show(text, mdc){
  ensureOverlay();
  $('diag-box').textContent = text;
  window.__MDC_LAST = mdc || "";
}

// -------- Modulmatrix (ohne Dummy/Genealogy) ----------
async function checkOne(path, wants=[], optional=false){
  try{
    const m = await import(path);
    const miss = wants.filter(k => !(k in m));
    if (miss.length) return (optional?OPT:NO)+`${path} · fehlt: ${miss.join(', ')}${optional?' (optional)':''}`;
    return OK+path+' OK';
  }catch(e){
    let msg = String(e?.message || e);
    // Zusatz: http-Headerhilfe
    try {
      const r = await fetch(path, { cache:'no-store' });
      msg += ` | http ${r.status} ${r.statusText||''}`;
      const ct = r.headers.get('content-type'); if (ct) msg += ` | ct=${ct}`;
    } catch {}
    return (optional?OPT:NO)+`${path} · Import/Parse fehlgeschlagen → ${msg}${optional?' (optional)':''}`;
  }
}
async function runModuleMatrix(){
  const rows = [];
  const MODS = [
    ['./event.js',['on','emit']],
    ['./config.js',[],true],
    ['./errorManager.js',['initErrorManager','report']],
    ['./engine.js',['boot','start','pause','reset','setTimescale','setPerfMode']],
    ['./entities.js',['setWorldSize','createAdamAndEve','step','getCells','getFoodItems','applyEnvironment']],
    ['./reproduction.js',['step','setMutationRate']],
    ['./food.js',['step','setSpawnRate']],
    ['./renderer.js',['draw','setPerfMode']],
    ['./metrics.js',['getPhases','getEconSnapshot','getPopSnapshot','getDriftSnapshot','getMateSnapshot']],
    ['./drives.js',['getDrivesSnapshot','getTraceText'],true],
    ['./editor.js',['openEditor'],true],
    ['./environment.js',['openEnvPanel'],true],
    ['./appops_panel.js',['openAppOps'],true],
    ['./appops.js',['generateOps'],true],
    ['./advisor.js',[],true],
    ['./grid.js',['createGrid'],true],
    ['./bootstrap.js',[],true],
    ['./sw.js',[],true],
    ['./diag.js',['openDiagPanel'],true]
  ];
  for (const [p, w, opt] of MODS) rows.push(await checkOne(p, w, !!opt));
  return rows.join('\n');
}

// -------- UI/Wiring ----------
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
  try{ const m=await import('./engine.js');
       fn.start=typeof m.start==='function'; fn.pause=typeof m.pause==='function';
       fn.reset=typeof m.reset==='function'; fn.setTS=typeof m.setTimescale==='function';
       fn.setPerf=typeof m.setPerfMode==='function'; }catch(e){ fn._engineErr=String(e); }
  try{ const m=await import('./reproduction.js'); fn.setMutation=typeof m.setMutationRate==='function'; }catch{}
  try{ const m=await import('./food.js'); fn.setFood=typeof m.setSpawnRate==='function'; }catch{}
  try{ const m=await import('./editor.js'); fn.openEditor=typeof m.openEditor==='function'; }catch{}
  try{ const m=await import('./environment.js'); fn.openEnv=typeof m.openEnvPanel==='function'; }catch{}
  try{ const m=await import('./appops_panel.js'); fn.openOps=typeof m.openAppOps==='function'; }catch{}

  // Canvas 2D Probe
  let canvas2D=false; try{ const c=$('scene'); canvas2D=!!(c&&c.getContext&&c.getContext('2d')); }catch{}
  ui.canvas2D=canvas2D;
  return {ui,fn};
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

// -------- Diagnose ----------
export async function diagnose(){
  window.__suppressBootGuard = true;

  const rt = runtime();
  const W = [];
  const mark=(ok,label,hint='')=>W.push((ok?OK:NO)+label+(hint?(' — '+hint):''));
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
  lines.push('Maschinencode:', mdc,'');
  show(lines.join('\n'), mdc);
}

// manueller Hook via ?pf=1 und #pf
(function(){
  try{
    const q=new URLSearchParams(location.search);
    if(q.get('pf')==='1' || location.hash==="#pf")
      window.addEventListener('load', ()=>diagnose());
  }catch{}
})();