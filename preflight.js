// preflight.js — Start-Diagnose (robust) + manueller Trigger ?pf=1

const BOOT_FLAG  = "__APP_BOOTED";
const OVERLAY_ID = "preflightOverlay";
const TIMEOUT_MS = 2200;

if (!window.__pfRuntimeErrors) window.__pfRuntimeErrors = [];
const runtimeErrors = window.__pfRuntimeErrors;

window.addEventListener("error", (e) => {
  try { runtimeErrors.push(`window.error: ${e?.message || e}`); } catch {}
});
window.addEventListener("unhandledrejection", (e) => {
  try { runtimeErrors.push(`unhandledrejection: ${e?.reason || e}`); } catch {}
});

function ensureOverlay(){
  let el = document.getElementById(OVERLAY_ID);
  if (el) return el;
  el = document.createElement("div");
  el.id = OVERLAY_ID;
  el.style.cssText = `
    position:fixed; inset:0; z-index:9000; display:none;
    background:rgba(0,0,0,.72); color:#d1e7ff;
    font:14px/1.45 system-ui, Segoe UI, Roboto, Helvetica, Arial;
  `;
  el.innerHTML = `
    <div style="max-width:840px;margin:8vh auto;background:#1a232b;border:1px solid #33414c;border-radius:12px;padding:16px;box-shadow:0 12px 30px rgba(0,0,0,.4)">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <h3 style="margin:0;font-size:18px">Start-Diagnose</h3>
        <button id="pfClose" style="background:#23313b;border:1px solid #3a4c5a;color:#d8f0ff;border-radius:8px;padding:6px 10px;cursor:pointer">Schließen</button>
      </div>
      <div id="pfBody" style="margin-top:8px;white-space:pre-wrap"></div>
    </div>
  `;
  document.body.appendChild(el);
  document.getElementById("pfClose").onclick = ()=> { el.style.display = "none"; };
  return el;
}
function showOverlay(text){
  const el = ensureOverlay();
  const body = el.querySelector("#pfBody");
  body.textContent = (text || "").trim();
  el.style.display = "block";
}

function listMissingDom(){
  const need = ["topbar","world","ticker","editorPanel","envPanel","dummyPanel","diagPanel","errorOverlay"];
  return need.filter(id => !document.getElementById(id));
}

async function checkModule(path, expects){
  try{
    const m = await import(path);
    if(!expects || expects.length===0) return `✅ ${path}`;
    const miss = expects.filter(x=> !(x in m));
    return miss.length ? `❌ ${path}: fehlt Export ${miss.join(", ")}` : `✅ ${path}`;
  }catch(e){
    let msg = String(e && e.message || e);
    if(/failed to fetch|404/i.test(msg)) msg += " (Pfad/Dateiname? Case-sensitiv)";
    return `❌ ${path}: Import/Parse fehlgeschlagen → ${msg}`;
  }
}

async function diagnose(){
  const lines = [];

  // Bootstrap-Status sichtbar machen
  lines.push(`Bootstrap: ${window.__BOOTSTRAP_OK ? "OK" : "NICHT ausgeführt"}`);

  const missingDom = listMissingDom();
  if(missingDom.length) lines.push(`⚠️ Fehlende DOM-IDs: ${missingDom.join(", ")}`);
  else lines.push("✅ DOM-Struktur OK");

  const checks = [
    ["./event.js",         ["on","off","emit"]],
    ["./config.js",        ["CONFIG"]],
    ["./errorManager.js",  ["initErrorManager","report"]],
    ["./entities.js",      ["step","createAdamAndEve","setWorldSize","applyEnvironment","getCells","getFoodItems"]],
    ["./reproduction.js",  ["step","setMutationRate","getMutationRate"]],
    ["./food.js",          ["step","setSpawnRate","spawnClusters"]],
    ["./renderer.js",      ["draw","setPerfMode"]],
    ["./editor.js",        ["openEditor","closeEditor","setAdvisorMode","getAdvisorMode"]],
    ["./environment.js",   ["getEnvState","setEnvState","openEnvPanel"]],
    ["./ticker.js",        ["initTicker","setPerfMode","pushFrame"]],
    ["./genealogy.js",     ["getNode","getParents","getChildren","getSubtree","searchByNameOrId","exportJSON","getStats","getAll"]],
    ["./genea.js",         ["openGenealogyPanel"]],
    ["./metrics.js",       [
      "beginTick","sampleEnergy","commitTick","addSpawn",
      "getEconSnapshot","getMateSnapshot","mateStart","mateEnd","getPopSnapshot","getDriftSnapshot"
    ]],
    ["./drives.js",        ["initDrives","getTraceText","getAction","afterStep","getDrivesSnapshot","setTracing"]],
    ["./diag.js",          ["openDiagPanel"]]
  ];

  for(const [path, expects] of checks){
    lines.push(await checkModule(path, expects));
  }

  const errs = Array.isArray(window.__pfRuntimeErrors) ? window.__pfRuntimeErrors : [];
  if(errs.length){
    lines.push("\nLaufzeitfehler:");
    for(const r of errs) lines.push(`• ${r}`);
  }

  lines.push(
    "\nHinweise:",
    "- Prüfe Groß/Kleinschreibung von Dateinamen.",
    "- Seite mit Cache-Buster neu laden (z. B. ?ts=" + Date.now() + ")."
  );

  return lines.join("\n");
}

function armWatchdog(){
  setTimeout(async ()=>{
    if(!window[BOOT_FLAG]){
      const report = await diagnose();
      showOverlay(
`Die Anwendung ist nicht gestartet (Boot-Flag fehlt nach ${TIMEOUT_MS}ms).

Wahrscheinliche Ursache: Ein ES-Modul konnte nicht geladen werden
(fehlende Datei, falscher Export, Groß/Kleinschreibung, veraltete Datei).

Diagnose:
${report}`
      );
    }
  }, TIMEOUT_MS);
}
document.addEventListener("DOMContentLoaded", armWatchdog);

// manueller Trigger
(function devHook(){
  try{
    const q = new URLSearchParams(location.search);
    if (q.get("pf") === "1") {
      diagnose().then(r => showOverlay("Manuelle Diagnose (pf=1):\n\n" + r));
    }
  }catch{}
})();