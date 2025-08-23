// bootstrap.js — robuster Booter + UI-Wiring + Fehleroverlay + SW-Schutz + PF-First
const BOOT_FLAG = "__APP_BOOTED";
const OVERLAY_ID = "errorOverlay";

function ensureOverlay(){
  let el = document.getElementById(OVERLAY_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = OVERLAY_ID;
    el.className = "hidden";
    el.innerHTML = `
      <div class="errorCard">
        <h3>Fehler</h3>
        <pre id="errorText" style="white-space:pre-wrap"></pre>
        <button id="errorClose">Schließen</button>
      </div>
    `;
    el.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.72);display:none;z-index:9000;color:#d1e7ff";
    document.body.appendChild(el);
    el.querySelector("#errorClose").onclick = ()=>{ el.classList.add("hidden"); el.style.display="none"; };
  }
  return el;
}
function showError(msg){
  const el = ensureOverlay();
  el.querySelector("#errorText").textContent = msg;
  el.classList.remove("hidden");
  el.style.display = "block";
}

// ---- PF-First: sofortige Diagnose, falls ?pf=1 (oder #pf) ----
(function preflightFirst(){
  try{
    const q = new URLSearchParams(location.search);
    const force = q.get('pf') === '1' || location.hash === '#pf';
    if (force) {
      // Boot-Guard stummschalten, damit kein rotes Overlay die PF überlagert
      window.__suppressBootGuard = true;
      import('./preflight.js?v=' + Date.now())
        .then(m => m.diagnose && m.diagnose())
        .catch(e => { try{console.error('[PF hook]', e);}catch{} });
    }
  }catch{}
})();

// Topbar-Höhe -> CSS-Var (falls Engine nicht sofort läuft)
(function setTopbarHeightVar(){
  try{
    const topbar = document.getElementById("topbar");
    const h = topbar ? (topbar.offsetHeight || 56) : 56;
    document.documentElement.style.setProperty("--topbar-h", h + "px");
  }catch{}
})();

// Service Worker vorsorglich updaten (stale-while-revalidate)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations?.().then(regs=>{
    regs.forEach(r=>{ try{ r.update(); }catch{} });
  }).catch(()=>{});
}

// ---------- UI wiring (einmalig) ----------
const $ = id => document.getElementById(id);
const qsAll = (sel,root=document) => Array.from(root.querySelectorAll(sel));

function wireUI(){
  // Engine-APIs lazy importieren
  $('btnStart').onclick = async ()=> { try{ (await import('./engine.js')).start(); }catch(e){ showError(String(e)); } };
  $('btnPause').onclick = async ()=> { try{ (await import('./engine.js')).pause(); }catch(e){ showError(String(e)); } };
  $('btnReset').onclick = async ()=> { try{ (await import('./engine.js')).reset(); }catch(e){ showError(String(e)); } };

  qsAll('[data-ts]').forEach(b=>{
    b.onclick = async ()=> { try{ (await import('./engine.js')).setTimescale(+b.dataset.ts||1); }catch(e){ showError(String(e)); } };
  });

  $('chkPerf').onchange = async (e)=> { try{ (await import('./engine.js')).setPerfMode(!!e.target.checked); }catch{} };

  const sm = $('sliderMutation'), om = $('outMutation');
  const sf = $('sliderFood'),     of = $('outFood');

  const syncM = async ()=>{
    if (om) om.textContent = `${sm.value} %`;
    try{ (await import('./reproduction.js')).setMutationRate(+sm.value|0); }catch{}
  };
  const syncF = async ()=>{
    if (of) of.textContent = `${(+sf.value).toFixed(1)}/s`.replace('.0','');
    try{ (await import('./food.js')).setSpawnRate(+sf.value||0); }catch{}
  };
  if (sm) ['input','change'].forEach(ev=> sm.addEventListener(ev, syncM, {passive:true}));
  if (sf) ['input','change'].forEach(ev=> sf.addEventListener(ev, syncF, {passive:true}));

  // Tools
  $('btnEditor').onclick = async ()=> { try{ (await import('./editor.js')).openEditor(); }catch(e){ showError(String(e)); } };
  $('btnEnv').onclick    = async ()=> { try{ (await import('./environment.js')).openEnvPanel(); }catch(e){ showError(String(e)); } };
  $('btnAppOps').onclick = async ()=> { try{ (await import('./appops_panel.js')).openAppOps(); }catch(e){ showError(String(e)); } };
  $('btnDiag').onclick   = async ()=> { try{ (await import('./preflight.js?v='+Date.now())).diagnose(); }catch(e){ showError(String(e)); } };

  // Startwerte in die Sim schieben (falls vorhanden)
  if (sm) syncM();
  if (sf) syncF();
}

// ---------- Engine booten + Fallback-Preflight ----------
(async function boot(){
  try{
    wireUI();
    const m = await import("./engine.js");
    await m.boot();

    // Boot-Guard (falls engine.js geladen, aber boot nicht markiert)
    setTimeout(()=>{
      const forceAuto = new URLSearchParams(location.search).get('pf') === 'auto';
      if (!window[BOOT_FLAG] && !window.__suppressBootGuard) {
        // Wenn gewünscht: automatisch Preflight öffnen statt rotem Guard
        if (forceAuto) {
          window.__suppressBootGuard = true;
          import('./preflight.js?v='+Date.now()).then(mm=>mm.diagnose&&mm.diagnose());
          return;
        }
        showError(
`Die Anwendung scheint nicht gestartet zu sein (Boot-Flag fehlt).

Mögliche Ursachen:
- engine.boot() wurde nicht aufgerufen,
- ein Modul-Fehler verhindert den Start (siehe Diagnose / Preflight).`);
      }
    }, 2500);
  }catch(e){
    showError(
`Engine konnte nicht geladen werden.

Ursache:
${String(e?.message||e)}

Tipps:
- Existiert ./engine.js (Pfad/Case)?
- Pages-Cache? Neu laden mit ?ts=${Date.now()}
- Syntaxfehler in engine.js?`);
  }
})();