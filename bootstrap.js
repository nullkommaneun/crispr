// bootstrap.js — robuster Boot-Loader: importiert engine.js, startet Preflight bei Bedarf
const BOOT_FLAG   = "__APP_BOOTED";
const OVERLAY_ID  = "errorOverlay";

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
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button id="errorPref">Diagnose öffnen</button>
          <button id="errorClose">Schließen</button>
        </div>
      </div>
    `;
    el.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.72);display:none;z-index:9000;color:#d1e7ff";
    document.body.appendChild(el);
    el.querySelector("#errorClose").onclick = ()=>{ el.classList.add("hidden"); el.style.display="none"; };
    el.querySelector("#errorPref").onclick  = async ()=> {
      try { const m = await import("./preflight.js"); m.diagnose(); } catch {}
    };
  }
  return el;
}
function showError(msg){
  const el = ensureOverlay();
  el.querySelector("#errorText").textContent = msg;
  el.classList.remove("hidden");
  el.style.display = "block";
}

// kleines Flag, damit Preflight erkennt, dass Bootstrap lief
window.__BOOTSTRAP_OK = true;

// Topbar-Höhe früh setzen (falls engine nicht startet)
function setTopbarHeightVar(){
  try{
    const topbar = document.getElementById("topbar");
    const h = topbar ? (topbar.offsetHeight || 56) : 56;
    document.documentElement.style.setProperty("--topbar-h", h + "px");
  }catch{}
}
document.addEventListener("DOMContentLoaded", setTopbarHeightVar);

(async function boot(){
  // 1) Manuell erzwungene Diagnose (?pf=1 oder #pf) → Preflight sofort
  try{
    const q = new URLSearchParams(location.search);
    if (q.get("pf")==="1" || location.hash==="#pf") {
      const m = await import("./preflight.js");
      m.diagnose();
      // Preflight zeigt eigenes Overlay; Engine darf trotzdem weiter laden
    }
  }catch{}

  // 2) Engine laden
  try{
    await import("./engine.js");
  }catch(e){
    const msg = String(e?.message || e);
    showError(
`Preflight konnte nicht geladen werden: Importing a module script failed.
Engine konnte nicht geladen werden.

Ursache:
${msg}

Tipps:
- Existiert ./engine.js (korrekter Pfad, exakte Groß-/Kleinschreibung)?
- Wurde kürzlich eine Datei neu hochgeladen (Pages-Cache)?
- Syntax in engine.js prüfen (fehlt eine Klammer/Export?).`
    );
    // Fallback: Preflight direkt öffnen, um die eigentliche Ursache zu sehen
    try { const m = await import("./preflight.js"); m.diagnose(); } catch {}
    return;
  }

  // 3) Watchdog: falls engine.js geladen, aber boot() nie ein Boot-Flag setzte
  setTimeout(()=>{
    if (!window[BOOT_FLAG] && !window.__suppressBootGuard) {
      showError(
`Die Anwendung scheint nicht gestartet zu sein (Boot-Flag fehlt).

Mögliche Ursachen:
- engine.boot() wurde nicht aufgerufen (Boot-Guard?),
- ein Fehler in einem Modul verhindert den Start (siehe Preflight).`);
    }
  }, 2500);
})();