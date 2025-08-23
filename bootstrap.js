// bootstrap.js — robuster Boot-Loader: Engine starten, Fehler transparent zeigen

const OVERLAY_ID = "errorOverlay";

// kleines Flag, damit Preflight/Guard wissen, dass Bootstrap lief
window.__BOOTSTRAP_OK = true;

function ensureOverlay() {
  let el = document.getElementById(OVERLAY_ID);
  if (el) return el;

  el = document.createElement("div");
  el.id = OVERLAY_ID;
  el.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.72);display:none;z-index:9000;color:#d1e7ff";

  const card = document.createElement("div");
  card.className = "errorCard";
  card.style.cssText = "max-width:900px;width:92%;margin:48px auto;background:#10161d;border:1px solid #2a3b4a;border-radius:12px;padding:16px";

  const h3 = document.createElement("h3");
  h3.textContent = "Fehler";
  h3.style.marginTop = "0";

  const pre = document.createElement("pre");
  pre.id = "errorText";
  pre.style.whiteSpace = "pre-wrap";

  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:8px;justify-content:flex-end";

  const btnDiag = document.createElement("button");
  btnDiag.textContent = "Diagnose öffnen";
  btnDiag.onclick = async () => {
    try { const m = await import("./preflight.js"); m.diagnose(); } catch {}
  };

  const btnClose = document.createElement("button");
  btnClose.textContent = "Schließen";
  btnClose.onclick = () => { el.style.display = "none"; };

  row.append(btnDiag, btnClose);
  card.append(h3, pre, row);
  el.append(card);
  document.body.appendChild(el);
  return el;
}

function showError(msg) {
  const el = ensureOverlay();
  const pre = el.querySelector("#errorText");
  pre.textContent = msg;
  el.style.display = "block";
}

// Topbar-Höhe einmal setzen (falls Engine nicht startet)
function setTopbarHeightVar() {
  try {
    const topbar = document.getElementById("topbar");
    const h = topbar ? (topbar.offsetHeight || 56) : 56;
    document.documentElement.style.setProperty("--topbar-h", h + "px");
  } catch {}
}
document.addEventListener("DOMContentLoaded", setTopbarHeightVar);

// --------- Boot ----------
(async function boot() {
  try {
    // 1) Engine laden
    const eng = await import("./engine.js");

    // 2) Engine starten (entscheidend!)
    if (typeof eng.boot === "function") {
      try {
        await eng.boot();
      } catch (err) {
        showError(
`Engine konnte nicht gestartet werden.

Ursache:
${String(err && err.stack || err)}

Tipps:
- Syntaxfehler in engine/Entities?
- Module kürzlich geändert (Pages-Caching)?`
        );
        return;
      }
    } else {
      showError("Engine geladen, aber 'boot()' fehlt.");
      return;
    }

  } catch (e) {
    // Importfehler
    const msg = String(e && e.message || e);
    showError(
`Engine konnte nicht geladen werden.

Ursache:
${msg}

Tipps:
- Existiert ./engine.js (korrekter Pfad, Groß/Klein)?
- Neu deployt? Seite mit Cache-Buster neu laden.`
    );
    return;
  }

  // 3) Boot-Guard: falls boot() nicht sauber markiert
  setTimeout(() => {
    if (!window.__APP_BOOTED && !window.__suppressBootGuard) {
      showError(
`Die Anwendung scheint nicht gestartet zu sein (Boot-Flag fehlt).

Mögliche Ursachen:
- engine.boot() wurde nicht aufgerufen (Boot-Guard?),
- ein Fehler in einem Modul verhindert den Start (siehe Preflight).`
      );
    }
  }, 2200);
})();