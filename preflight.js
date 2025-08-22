// … bestehender Kopf bleibt …
async function diagnose(){
  const lines = [];
  const missingDom = ["topbar","world","ticker","editorPanel","envPanel","dummyPanel","diagPanel","errorOverlay"]
    .filter(id=>!document.getElementById(id));
  if(missingDom.length) lines.push(`⚠️ Fehlende DOM-IDs: ${missingDom.join(", ")}`); else lines.push("✅ DOM-Struktur OK");

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
    // NEU:
    ["./genealogy.js",     ["getNode","getParents","getChildren","getSubtree","searchByNameOrId","exportJSON","getStats"]],
    ["./genea.js",         ["openGenealogyPanel"]],
    ["./metrics.js",       [
      "beginTick","sampleEnergy","commitTick","addSpawn",
      "getEconSnapshot","getMateSnapshot","mateStart","mateEnd","getPopSnapshot","getDriftSnapshot"
    ]],
    ["./drives.js",        ["initDrives","getTraceText","getAction","afterStep","getDrivesSnapshot","setTracing"]],
    ["./diag.js",          ["openDiagPanel"]],
    ["./genealogy.js", ["getNode","getParents","getChildren","getSubtree","searchByNameOrId","exportJSON","getStats","getAll"]],
["./genea.js", ["openGenealogyPanel"]],
  ];

  for(const [path, expects] of checks){
    try{
      const m = await import(path);
      const miss = expects.filter(x=> !(x in m));
      lines.push(miss.length? `❌ ${path}: fehlt Export ${miss.join(", ")}` : `✅ ${path}`);
    }catch(e){
      let msg=String(e?.message||e);
      if(/failed to fetch|404/i.test(msg)) msg+=" (Pfad/Dateiname? Case-sensitiv)";
      lines.push(`❌ ${path}: Import/Parse fehlgeschlagen → ${msg}`);
    }
  }

  // … Rest (runtimeErrors/Hinweise) wie in deiner letzten Version …
  if(runtimeErrors.length){
    lines.push("\nLaufzeitfehler:");
    for(const r of runtimeErrors) lines.push(`• ${r}`);
  }
  lines.push("\nHinweise:","- Prüfe Groß/Kleinschreibung von Dateien.","- Seite mit Querystring neu laden (Cache-Buster).");
  return lines.join("\n");
}
// … Rest des Files unverändert …

// === Dev-Hook: manuelle Preflight-Anzeige mit ?pf=1 ===
(function devHook(){
  try{
    const q = new URLSearchParams(location.search);
    if (q.get("pf") === "1") {
      diagnose().then(report => {
        showOverlay("Manuelle Diagnose (pf=1):\n\n" + report);
      });
    }
  }catch{}
})();