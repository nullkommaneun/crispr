// errorManager.js — einfacher Fehler-Handler + Runtime-Log für Preflight

export function initErrorManager(){
  try{
    if (!window.__runtimeErrors){
      window.__runtimeErrors = [];
      window.addEventListener('error', e=>{
        const msg = String(e?.error?.stack || e?.message || e);
        window.__runtimeErrors.push({ when:'error', ts: Date.now(), msg });
      });
      window.addEventListener('unhandledrejection', e=>{
        const msg = String(e?.reason?.stack || e?.reason || e);
        window.__runtimeErrors.push({ when:'promise', ts: Date.now(), msg });
      });
    }
  }catch{}
}

export function report(err, ctx){
  try{
    const msg = (err && err.stack) ? err.stack : String(err);
    window.__runtimeErrors?.push({ when:(ctx?.where||'unknown'), ts: Date.now(), msg });
    // optional: Console
    console.error('[report]', ctx, err);
  }catch{}
}