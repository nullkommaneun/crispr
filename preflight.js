// preflight.js — Deep-Check (manuell per Button oder ?pf=1)

function el(id){return document.getElementById(id);}
export function showOverlay(text){
  let w=el('diag-overlay'); if(!w){ w=document.createElement('div'); w.id='diag-overlay';
    w.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.65);display:flex;align-items:flex-start;justify-content:center;padding:48px;';
    const p=document.createElement('pre'); p.id='diag-box';
    p.style.cssText='max-width:1000px;width:92%;background:#10161d;color:#d6e1ea;border:1px solid #2a3b4a;border-radius:10px;padding:16px;overflow:auto;white-space:pre-wrap;';
    const x=document.createElement('button'); x.textContent='Schließen';
    x.style.cssText='position:absolute;top:12px;right:12px;background:#243241;color:#cfe6ff;border:1px solid #47617a;border-radius:8px;padding:6px 10px;';
    x.onclick=()=>w.remove(); w.appendChild(p); w.appendChild(x); document.body.appendChild(w); }
  el('diag-box').textContent=text;
}

const MODS=[
  {p:'./event.js',want:['on','emit']},
  {p:'./errorManager.js',want:['initErrorManager','report']},
  {p:'./entities.js',want:['setWorldSize','createAdamAndEve','step','getCells','getFoodItems','applyEnvironment']},
  {p:'./reproduction.js',want:['step','setMutationRate']},
  {p:'./food.js',want:['step','setSpawnRate']},
  {p:'./renderer.js',want:['draw','setPerfMode']},
  {p:'./metrics.js',want:['getPhases','getEconSnapshot','getPopSnapshot','getDriftSnapshot','getMateSnapshot']},
  {p:'./drives.js',want:['getDrivesSnapshot']},
  {p:'./editor.js',want:['openEditor'],optional:true},
  {p:'./environment.js',want:['openEnvPanel'],optional:true},
  {p:'./diag.js',want:[],optional:true}
];

async function chk(m){try{const r=await import(m.p+'?v='+Date.now());const miss=(m.want||[]).filter(k=>!(k in r));
  return {ok:miss.length===0,p:m.p,miss,err:null,opt:!!m.optional};}
  catch(e){return {ok:false,p:m.p,miss:m.want||[],err:String(e),opt:!!m.optional};}}

function rt(){
  const boot=!!window.__bootOK, fc=window.__frameCount|0;
  const fps=window.__fpsEMA? window.__fpsEMA.toFixed(0):'–';
  const cells=window.__cellsN|0, food=window.__foodN|0;
  const last=window.__lastStepAt? new Date(window.__lastStepAt).toLocaleTimeString():'–';
  const errs=(Array.isArray(window.__runtimeErrors)?window.__runtimeErrors.length:0)|0;
  return `Boot-Flag: ${boot?'gesetzt':'fehlt'}
Frames: ${fc}  ·  FPS≈ ${fps}
Zellen: ${cells}  ·  Food: ${food}
Letzter Step: ${last}
Runtime-Fehler im Log: ${errs}`;
}

export async function diagnose(){
  const out=[ 'Start-Diagnose (Deep-Check)','', rt(), '', 'Module/Exporte:' ];
  for (const m of MODS){
    const r=await chk(m);
    if (r.ok) out.push('✅ '+r.p+' OK');
    else out.push('❌ '+r.p+(r.miss.length?(' · fehlt: '+r.miss.join(', ')):'')+(r.err?(' · '+r.err):'')+(r.opt?' (optional)':''));
  }
  const errs = Array.isArray(window.__runtimeErrors)? window.__runtimeErrors.slice(-4):[];
  if (errs.length){ out.push('', 'Laufzeitfehler:',''); errs.forEach(e=>out.push(`[${new Date(e.ts).toLocaleTimeString()}] ${e.where||e.when}\n${String(e.msg||'')}`)); }
  out.push('', 'Hinweis: Cache-Buster: ?ts='+Date.now());
  showOverlay(out.join('\n'));
}

(function hook(){ try{ const q=new URLSearchParams(location.search); if(q.get('pf')==='1') window.addEventListener('load', ()=>diagnose()); }catch{} })();