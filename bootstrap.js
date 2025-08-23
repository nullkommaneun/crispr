// bootstrap.js — robuster Boot-Loader: importiert engine.js, zeigt Fehler transparent

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
        <pre id="errorText"></pre>
        <button id="errorClose">Schließen</button>
      </div>`;
    el.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.72);display:none;z-index:9000;color:#d1e7ff";
    document.body.appendChild(el);
    el.querySelector("#errorClose").onclick = ()=>{ el.classList.add("hidden"); el.style.display="none"; };
  }
  return el;
}
function showError(msg){
  // Preflight offen? → NICHT stören
  if (document.getElementById("diag-overlay") || window.__pfOpen || window.__suppressBootGuard) return;
  const el = ensureOverlay();
  el.querySelector("#errorText").textContent = msg;
  el.classList.remove("hidden");
  el.style.display = "block";
}

// kleines Flag, damit Preflight erkennen kann, ob Bootstrap überhaupt lief
window.__BOOTSTRAP_OK = true;

// Topbar-Höhe einmal setzen (falls engine nicht startet)
document.addEventListener("DOMContentLoaded", ()=>{
  try{
    const topbar = document.getElementById("topbar");
    const h = topbar ? (topbar.offsetHeight || 56) : 56;
    document.documentElement.style.setProperty("--topbar-h", h + "px");
  }catch{}
});

(async function boot(){
  try{
    await import("./engine.js");
  }catch(e){
    const msg = String(e?.message || e);
    showError(
`Engine konnte nicht geladen werden.

Ursache:
${msg}

Tipps:
- Existiert ./engine.js (korrekter Pfad, exakte Groß-/Kleinschreibung)?
- Wurde kürzlich eine Datei neu hochgeladen (Pages-Cache)? (Neu laden mit ?ts=${Date.now()})
- Syntax in engine.js prüfen (fehlt eine Klammer/Export?).`);
    return;
  }

  // Watchdog nach 2.5s – aber nur, wenn wirklich kein Boot-Flag
  setTimeout(()=>{
    // akzeptiere beide Varianten, die Engine setzen kann
    const booted = !!(window.__APP_BOOTED || window.__bootOK);
    if (booted) return;
    showError(
`Die Anwendung scheint nicht gestartet zu sein (Boot-Flag fehlt).

Mögliche Ursachen:
- engine.boot() wurde nicht aufgerufen (Boot-Guard?),
- ein Fehler in einem Modul verhindert den Start (siehe Preflight mit ?pf=1).`);
  }, 2500);
})();