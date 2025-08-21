// bootstrap.js — robuster Boot-Loader mit direkter Fehleranzeige
// Ziel: Wenn Engine/Module nicht laden, sofort ein Overlay mit echter Ursache zeigen.

const BOOT_FLAG = "__APP_BOOTED";
const START_TIMEOUT_MS = 2500;

// ---- kleines Overlay (unabhängig von preflight/errorManager)
function ensureOverlay(){
  let el = document.getElementById("errorOverlay");
  if(!el){
    el = document.createElement("div");
    el.id = "errorOverlay";
    el.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.72);display:none;z-index:9000;color:#d1e7ff";
    el.innerHTML = `
      <div class="errorCard" style="max-width:840px;margin:8vh auto;background:#1a232b;border:1px solid #33414c;border-radius:12px;padding:16px;box-shadow:0 12px 30px rgba(0,0,0,.4)">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
          <h3 style="margin:0;font-size:18px">Start-Diagnose</h3>
          <button id="errorClose" style="background:#23313b;border:1px solid #3a4c5a;color:#d8f0ff;border-radius:8px;padding:6px 10px;cursor:pointer">Schließen</button>
        </div>
        <pre id="errorText" style="white-space:pre-wrap;margin-top:8px"></pre>
      </div>`;
    document.body.appendChild(el);
    const btn = document.getElementById("errorClose");
    btn.onclick = ()=>{ el.classList.add("hidden"); el.style.display="none"; };
  }
  return el;
}
function showError(msg){
  const el = ensureOverlay();
  const txt = document.getElementById("errorText");
  txt.textContent = msg;
  el.classList.remove("hidden");
  el.style.display = "block";
}

// ---- Mini-Polyfills (ältere Browser)
(function polyfills(){
  if(!Array.prototype.at){
    Object.defineProperty(Array.prototype, "at", {
      value: function at(n){ n = Math.trunc(n) || 0; if(n<0) n += this.length; if(n<0 || n>=this.length) return undefined; return this[n]; },
      configurable: true
    });
  }
})();

// ---- Preflight zusätzlich laden (für modulare Tiefendiagnose, nicht kritisch)
async function tryLoadPreflight(){
  try { await import("./preflight.js"); } catch(e){ /* ignorieren, Bootstraper zeigt ohnehin Fehler */ }
}

// ---- Engine laden
(async function boot(){
  // Preflight „armieren“ (optional)
  tryLoadPreflight();

  // Canvas/Topbar-Height im CSS verankern (UI sieht sonst „tot“ aus)
  document.addEventListener("DOMContentLoaded", ()=>{
    const topbar = document.getElementById("topbar");
    if (topbar) {
      const h = topbar.offsetHeight || 56;
      document.documentElement.style.setProperty("--topbar-h", h + "px");
    }
  });

  // Versuch: Engine importieren
  try{
    await import("./engine.js");
  }catch(e){
    const msg = String(e && e.message || e);
    showError(
`Engine konnte nicht geladen werden.

Ursache:
${msg}

Tipps:
- Existiert ./engine.js (korrekter Pfad, exakte Groß-/Kleinschreibung)?
- Wurde kürzlich eine neue Datei eingefügt (z. B. metrics.js/diag.js) und noch nicht hochgeladen?
- Älterer Browser? (Aktualisieren; optional chaining '?.'/'??' wird teils nicht unterstützt)`
    );
    return;
  }

  // Watchdog: Falls Engine importiert, aber boot() nie gesetzt hat (__APP_BOOTED)
  setTimeout(()=>{
    if(!window[BOOT_FLAG]){
      showError(
`Die Anwendung scheint nicht gestartet zu sein (Boot-Flag fehlt nach ${START_TIMEOUT_MS}ms).

Mögliche Ursachen:
- Ein Modul wirft beim Import/Start einen Fehler (z. B. diag.js/metrics.js/ticker.js).
- Ein Syntax-Feature wird vom Browser nicht unterstützt (optional chaining '?.', nullish '??').

Hinweis:
- Das separat geladene 'preflight.js' zeigt weitere Modul-Checks, wenn es geladen werden konnte.`
      );
    }
  }, START_TIMEOUT_MS);
})();