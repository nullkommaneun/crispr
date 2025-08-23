// preflight.js — Start-Diagnose/Overlay + manuelle Anzeige mit ?pf=1

export function showOverlay(text){
  let el = document.getElementById('diag-overlay');
  if (!el){
    el = document.createElement('div');
    el.id = 'diag-overlay';
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.65);display:flex;align-items:flex-start;justify-content:center;padding:48px;';
    const inner = document.createElement('pre');
    inner.id = 'diag-box';
    inner.style.cssText = 'max-width:800px;width:90%;background:#10161d;color:#d6e1ea;border:1px solid #2a3b4a;border-radius:10px;padding:16px;overflow:auto;white-space:pre-wrap;';
    el.appendChild(inner);
    const close = document.createElement('button');
    close.textContent = 'Schließen';
    close.style.cssText = 'position:absolute;top:12px;right:12px;background:#243241;color:#cfe6ff;border:1px solid #47617a;border-radius:8px;padding:6px 10px;';
    close.onclick = ()=> el.remove();
    el.appendChild(close);
    document.body.appendChild(el);
  }
  document.getElementById('diag-box').textContent = text;
}

export async function diagnose(){
  // 1) Runtime-Errors priorisieren
  const errs = Array.isArray(window.__runtimeErrors) ? window.__runtimeErrors.slice(-4) : [];
  if (errs.length){
    const lines = errs.map(e=>`[${new Date(e.ts).toLocaleTimeString()}] ${e.when}\n${e.msg}`).join('\n\n');
    showOverlay('Start-Diagnose\n\nLaufzeitfehler erkannt:\n\n'+lines+'\n\n' +
      'Tipps:\n- Prüfe die zuletzt geänderten Module und lade mit Cache-Buster (z. B. ?ts='+Date.now()+') neu.');
    return;
  }

  // 2) Boot-Flag prüfen (nur Hinweis, keine Blockade mehr)
  if (!window.__bootOK){
    showOverlay('Die Anwendung scheint nicht gestartet zu sein (Boot-Flag fehlt).\n\n' +
      'Mögliche Ursachen:\n- engine.boot() wurde nicht aufgerufen (index.html prüfen)\n' +
      '- ein Modul-Fehler verhindert den Start (siehe Diagnose mit ?pf=1).');
    return;
  }

  // 3) Kurzer OK-Hinweis
  showOverlay('Start-Diagnose\n\nAlle Module geladen, Boot-Flag gesetzt.\n' +
              'Keine Runtime-Fehler im Log.\n\nZeitstempel: '+new Date().toLocaleTimeString());
}

// Dev-Hook: ?pf=1 => Diagnose anzeigen
(function devHook(){
  try{
    const q=new URLSearchParams(location.search);
    if(q.get('pf')==='1') diagnose();
  }catch{}
})();