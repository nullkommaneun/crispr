// preflight.js — manuelle Start-Diagnose (kein Auto-Guard mehr)
//
// Nutzung:
//  - Manuell: URL mit ?pf=1 öffnen → diagnose() wird angezeigt
//  - Optional: window.startPreflightGuard(delayMs?) aufrufen, um den Guard bewusst zu aktivieren

export function showOverlay(text){
  let el = document.getElementById('diag-overlay');
  if (!el){
    el = document.createElement('div');
    el.id = 'diag-overlay';
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.65);display:flex;align-items:flex-start;justify-content:center;padding:48px;';
    const box = document.createElement('pre');
    box.id = 'diag-box';
    box.style.cssText = 'max-width:880px;width:90%;background:#10161d;color:#d6e1ea;border:1px solid #2a3b4a;border-radius:10px;padding:16px;overflow:auto;white-space:pre-wrap;';
    el.appendChild(box);
    const close = document.createElement('button');
    close.textContent = 'Schließen';
    close.style.cssText = 'position:absolute;top:12px;right:12px;background:#243241;color:#cfe6ff;border:1px solid #47617a;border-radius:8px;padding:6px 10px;';
    close.onclick = ()=> el.remove();
    el.appendChild(close);
    document.body.appendChild(el);
  }
  document.getElementById('diag-box').textContent = text;
}

function formatRuntimeErrors(max=4){
  const errs = Array.isArray(window.__runtimeErrors) ? window.__runtimeErrors.slice(-max) : [];
  if (!errs.length) return '';
  return errs.map(e => `[${new Date(e.ts).toLocaleTimeString()}] ${e.where||e.when}\n${String(e.msg||'')}`).join('\n\n');
}

export async function diagnose(){
  const errText = formatRuntimeErrors(4);
  if (errText){
    showOverlay('Start-Diagnose\n\nLaufzeitfehler erkannt:\n\n' + errText +
      '\n\nTipp: Fehler beheben und Seite mit Cache-Buster neu laden (z. B. ?ts=' + Date.now() + ').');
    return;
  }

  // Boot-Flag nur noch als Info – kein Blocking mehr
  const boot = !!window.__bootOK;
  showOverlay('Start-Diagnose\n\n' +
              'Boot-Flag: ' + (boot ? 'gesetzt' : 'fehlt') + '\n' +
              'Runtime-Fehler: keine im Log\n\n' +
              'Zeitstempel: ' + new Date().toLocaleTimeString());
}

// --- Manueller Guard (nur auf Wunsch) ---
let guardTimer = null;
export function startPreflightGuard(delayMs = 2500){
  stopPreflightGuard();
  guardTimer = setTimeout(()=>{
    const errText = formatRuntimeErrors(4);
    if (errText){
      showOverlay('Start-Diagnose (Auto-Guard)\n\nLaufzeitfehler:\n\n' + errText);
      return;
    }
    if (!window.__bootOK){
      showOverlay('Start-Diagnose (Auto-Guard)\n\nDie Anwendung scheint nicht gestartet zu sein (Boot-Flag fehlt).\n\n' +
                  'Mögliche Ursachen:\n- engine.boot() wurde nicht aufgerufen (index.html)\n- Modulfehler beim Laden (für Details ?pf=1 verwenden).');
    }
  }, Math.max(500, +delayMs||2500));
}
export function stopPreflightGuard(){ if (guardTimer) { clearTimeout(guardTimer); guardTimer = null; } }

// Dev-Hook: nur bei ?pf=1 automatisch anzeigen
(function devHook(){
  try{
    const q = new URLSearchParams(location.search);
    if (q.get('pf') === '1'){
      window.addEventListener('load', ()=> diagnose());
    }
  }catch{}
})();