// bootstrap.js — schlanker Boot-Loader + Fehler-Overlay + Slider-Init
import * as engine from "./engine.js";
import { initSliders } from "./ui_controls.js";

const OVERLAY_ID = "errorOverlay";

function ensureOverlay(){
  let el = document.getElementById(OVERLAY_ID);
  if (el) return el;
  el = document.createElement("div");
  el.id = OVERLAY_ID;
  el.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.72);display:none;z-index:9000;color:#d1e7ff";
  el.innerHTML = `
    <div style="max-width:900px;margin:8vh auto;background:#10161d;border:1px solid #2a3b4a;border-radius:12px;padding:14px">
      <h3 style="margin:.2rem 0 1rem 0">Fehler</h3>
      <pre id="errorText" style="white-space:pre-wrap"></pre>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button id="errorOpenPF" style="background:#17334d;border:1px solid #355a78;color:#cfe6ff;border-radius:8px;padding:6px 10px">Diagnose öffnen</button>
        <button id="errorClose" style="background:#243241;border:1px solid #47617a;color:#cfe6ff;border-radius:8px;padding:6px 10px">Schließen</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.querySelector("#errorClose").onclick = ()=>{ el.style.display="none"; };
  el.querySelector("#errorOpenPF").onclick = ()=>{ try{ import("./preflight.js").then(m=>m.diagnose()); }catch{} };
  return el;
}
function showError(msg){
  const el = ensureOverlay();
  el.querySelector("#errorText").textContent = msg;
  el.style.display = "block";
}

function setTopbarHeightVar(){
  try{
    const topbar = document.getElementById("topbar");
    const h = topbar ? (topbar.offsetHeight || 56) : 56;
    document.documentElement.style.setProperty("--topbar-h", h + "px");
  }catch{}
}
document.addEventListener("DOMContentLoaded", setTopbarHeightVar);

window.addEventListener("load", async ()=>{
  try {
    // Sliders zuerst initialisieren (setzt Startwerte live in die Engine-Module)
    try { initSliders(); } catch(e){ console.warn("[ui_controls] initSliders", e); }

    // Engine booten
    try { engine.boot(); }
    catch(e){
      showError(
`Engine konnte nicht gestartet werden.

Ursache:
${String(e?.message || e)}

Tipps:
- Syntax in engine.js prüfen (fehlt eine Klammer/Export?).
- Neu laden mit Cache-Buster (z. B. ?ts=${Date.now()}).`);
      return;
    }

    // Watchdog (falls boot() lief, aber kein Boot-Flag gesetzt wurde)
    setTimeout(()=>{
      if (!window.__bootOK) {
        showError(
`Die Anwendung scheint nicht gestartet zu sein (Boot-Flag fehlt).

Mögliche Ursachen:
- engine.boot() wurde nicht aufgerufen,
- ein Fehler in einem Modul verhindert den Start (siehe Preflight).`);
      }
    }, 2000);
  } catch (e) {
    showError(String(e?.message || e));
  }
});

// freiwillig: Preflight beim Laden, falls ?pf=1
try{
  if (new URLSearchParams(location.search).get("pf")==="1"){
    import("./preflight.js").then(m=>m.diagnose()).catch(()=>{});
  }
}catch{}