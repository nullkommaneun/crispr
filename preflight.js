// preflight.js — Deep-Check der Module + Runtime-Status (manuell; kein Auto-Guard)

function el(id){ return document.getElementById(id); }

export function showOverlay(text){
  let wrap = el('diag-overlay');
  if (!wrap){
    wrap = document.createElement('div');
    wrap.id = 'diag-overlay';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.65);display:flex;align-items:flex-start;justify-content:center;padding:48px;';
    const box = document.createElement('pre');
    box.id = 'diag-box';
    box.style.cssText = 'max-width:1000px;width:92%;background:#10161d;color:#d6e1ea;border:1px solid #2a3b4a;border-radius:10px;padding:16px;overflow:auto;white-space:pre-wrap;';
    wrap.appendChild(box);
    const close = document.createElement('button');
    close.textContent = 'Schließen';
    close.style.cssText = 'position:absolute;top:12px;right:12px;background:#243241;color:#cfe6ff;border:1px solid #47617a;border-radius:8px;padding:6px 10px;';
    close.onclick = ()=> wrap.remove();
    wrap.appendChild(close);
    document.body.appendChild(wrap);
  }
  el('diag-box').textContent = text;
}

// ---- Deep-Import-Check ----
const MODS = [
  {path:'./event.js',        want:['on','emit']},
  {path:'./config.js',       want:[], optional:true},
  {path:'./errorManager.js', want:['initErrorManager','report']},
  {path:'./entities.js',     want:['setWorldSize','createAdamAndEve','step','getCells','getFoodItems','applyEnvironment']},
  {path:'./reproduction.js', want:['step','setMutationRate']},
  {path:'./food.js',         want:['step','setSpawnRate']},
  {path:'./renderer.js',     want:['draw','setPerfMode']},
  {path:'./editor.js',       want:['openEditor'], optional:true},
  {path:'./environment.js',  want:['openEnvPanel'], optional:true},
  {path:'./ticker.js',       want:[], optional:true},
  {path:'./genealogy.js',    want:[], optional:true},
  {path:'./genea.js',        want:[], optional:true},
  {path:'./metrics.js',      want:['getPhases','getEconSnapshot','getPopSnapshot','getDriftSnapshot','getMateSnapshot']},
  {path:'./drives.js',       want:['getDrivesSnapshot']},
  {path:'./diag.js',         want:[], optional:true}
];

async function checkModule(path, want=[], optional=false){
  try{
    const m = await import(/* @vite-ignore */ path + '?v=' + Date.now());
    const miss = (want||[]).filter(k => !(k in m));
    return { ok: miss.length===0, optional, path, miss, err:null };
  }catch(err){
    return { ok:false, optional, path, miss:want||[], err:String(err&&err.message||err) };
  }
}

function fmtRow(ok, txt){
  return (ok? '✅ ' : '❌ ') + txt;
}

function runtimeSummary(){
  const boot = !!window.__bootOK;
  const fc   = window.__frameCount|0;
  const fps  = window.__fpsEMA ? window.__fpsEMA.toFixed(0) : '–';
  const cells= (()=>{ try{ return (window?.entities && 'getCells' in window.entities) ? window.entities.getCells().length : (window.__cellsN|0); } catch { return window.__cellsN|0; }})();
  const food = window.__foodN|0;
  const last = window.__lastStepAt ? new Date(window.__lastStepAt).toLocaleTimeString() : '–';
  const errs = Array.isArray(window.__runtimeErrors) ? window.__runtimeErrors.length : 0;
  return [
    `Boot-Flag: ${boot?'gesetzt':'fehlt'}`,
    `Frames: ${fc} · FPS≈ ${fps}`,
    `Zellen: ${cells} · Food: ${food}`,
    `Letzter Step: ${last}`,
    `Runtime-Fehler im Log: ${errs}`
  ].join('\n');
}

export async function diagnose(){
  const lines = [];
  lines.push('Start-Diagnose (Deep-Check)\n');

  // 1) Runtime kurz vorab
  lines.push(runtimeSummary(), '');

  // 2) Module prüfen
  lines.push('Module/Exporte:');
  for (const spec of MODS){
    const r = await checkModule(spec.path, spec.want, spec.optional);
    if (r.ok){
      lines.push(fmtRow(true,  `${spec.path} OK`));
    }else{
      if (r.optional){
        lines.push(fmtRow(false, `${spec.path} (optional) – fehlt/Fehler` + (r.err?`: ${r.err}`:'')));
      }else{
        const miss = r.miss && r.miss.length ? ` | fehlende Exporte: ${r.miss.join(', ')}` : '';
        const err  = r.err ? ` | Fehler: ${r.err}` : '';
        lines.push(fmtRow(false, `${spec.path}${miss}${err}`));
      }
    }
  }

  // 3) Laufzeit-Fehler (letzte 4)
  const errs = Array.isArray(window.__runtimeErrors) ? window.__runtimeErrors.slice(-4) : [];
  if (errs.length){
    lines.push('', 'Laufzeitfehler:', '');
    for (const e of errs){
      lines.push(`[${new Date(e.ts).toLocaleTimeString()}] ${e.where||e.when}\n${String(e.msg||'')}`, '');
    }
  }

  lines.push('\nHinweis: Seite ggf. mit Cache-Buster neu laden (z. B. ?ts=' + Date.now() + ').');
  showOverlay(lines.join('\n'));
}

// Manuell via ?pf=1
(function PF_HOOK(){
  try{
    const q = new URLSearchParams(location.search);
    if (q.get('pf') === '1'){
      window.addEventListener('load', ()=> diagnose());
    }
  }catch{}
})();