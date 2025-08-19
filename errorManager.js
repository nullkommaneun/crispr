// errorManager.js – frühes Fehler-Overlay + Utilities

let overlayEl = null;
let contextGetter = null;

function getOverlay(){
  if(!overlayEl) overlayEl = document.getElementById('errorOverlay');
  return overlayEl;
}

export function initErrorManager(){
  const el = getOverlay();
  // globale Handler
  window.addEventListener('error', (e)=>{
    showError('Laufzeitfehler', e?.error || e?.message || e);
  });
  window.addEventListener('unhandledrejection', (e)=>{
    showError('Unhandled Promise', e?.reason || e);
  });
  if(el){ el.classList.add('hidden'); el.textContent=''; }
}

export function setContextGetter(fn){ contextGetter = fn; }

export function showError(title, err){
  const el = getOverlay(); if(!el) return;
  const msg = `${title}: ${err?.message || String(err)}`;
  el.textContent = `⚠️ ${msg}`;
  el.classList.remove('hidden');
  el.classList.add('show');
  console.error('[CRISPR ERROR]', msg, { context: contextGetter?.() });
}

export function assertModule(name, mod){
  if(!mod) showError(`Modul ${name} fehlt`, new Error('undefined'));
}