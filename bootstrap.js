// bootstrap.js — robuster Boot-Loader + Failsafe-Preflight
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
  const el = ensureOverlay();
  el.querySelector("#errorText").textContent = msg;
  el.classList.remove("hidden");
  el.style.display = "block";
}

window.__BOOTSTRAP_OK = true;

(async function boot(){
  try {
    await import("./engine.js");
  } catch (e) {
    showError(`Engine konnte nicht geladen werden.\n\n${String(e?.message||e)}`);
    // Sofortige Diagnose
    try { const m = await import("./preflight.js"); m.diagnose(); } catch {}
    return;
  }

  // Failsafe: wenn Boot-Flag nicht gesetzt → Diagnose öffnen
  setTimeout(async ()=>{
    if (!window[BOOT_FLAG]) {
      showError("Die Anwendung scheint nicht gestartet zu sein (Boot-Flag fehlt).");
      try { const m = await import("./preflight.js"); m.diagnose(); } catch {}
    }
  }, 2000);
})();