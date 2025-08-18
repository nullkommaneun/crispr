// errorManager.js
// Anzeige eines roten Fehler-Overlays + Sammeln von Laufzeitinfos.

let _ctxGetter = null;

export function initErrorManager(){
  const overlay = document.getElementById('errorOverlay');
  if(!overlay) throw new Error('Fehler-Overlay nicht gefunden (errorOverlay).');
  // Globale Fehlerfänger
  window.addEventListener('error', (e)=>{
    showError('Unbehandelter Fehler: ' + (e.message || 'Unbekannt'), e.error);
  });
  window.addEventListener('unhandledrejection', (e)=>{
    showError('Unbehandelte Promise-Ablehnung', e.reason);
  });
}

export function setContextGetter(fn){
  _ctxGetter = fn;
}

export function assertModule(name, value){
  if(value === undefined || value === null){
    showError(`Modul „${name}“ fehlt – Start abgebrochen.`);
    throw new Error(`Modul fehlt: ${name}`);
  }
}

export function showError(message, err){
  const overlay = document.getElementById('errorOverlay');
  if(!overlay) return;
  const extra = [];
  if(err){
    extra.push(String(err));
    if(err.stack) extra.push(err.stack.slice(0, 400));
  }
  if(_ctxGetter){
    try{
      const {tick, fps, canvasW, canvasH, lastActions=[]} = _ctxGetter() || {};
      extra.push(`Tick:${tick} • FPS:${fps?.toFixed?.(1) ?? '--'} • Canvas:${canvasW}×${canvasH}`);
      if(lastActions.length){
        extra.push('Letzte Aktionen: ' + lastActions.slice(-5).join(' | '));
      }
    }catch(e){}
  }
  overlay.textContent = `⚠️ Fehler: ${message}${extra.length? ' — ' + extra.join(' / ') : ''}`;
  overlay.classList.add('show');
  console.error('[ErrorOverlay]', message, err);
}