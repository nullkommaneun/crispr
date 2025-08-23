// appops.js — Smart-Mode v1 (regelbasiert, konservativ)

import * as metrics from "./metrics.js";
import { getDrivesSnapshot } from "./drives.js";

export function generateOps(){
  const ph = metrics.getPhases();
  const drv = safe(()=> getDrivesSnapshot(), { duels:0, wins:0, winRate:0, pools:0 });

  const ops = { v:1, title:"Auto-OPS Vorschläge", goals:[], changes:[], accept:[] };
  const notes = [];

  // 1) Preflight manuell abrufbar (Baseline-Hook)
  ops.goals.push("Preflight jederzeit manuell abrufbar (?pf=1)");
  ops.changes.push({
    file: "preflight.js", op: "append",
    code:
`// Dev-Hook: manuelle Preflight-Anzeige (?pf=1)
(function PF_HOOK(){try{var q=new URLSearchParams(location.search);if(q.get('pf')==='1') import('./preflight.js').then(m=>m.diagnose());}catch{}})();
`
  });
  notes.push("Baseline-Hook hinzugefügt.");

  // 2) Draw teuer? → Culling-Pad im Perf-Mode verkleinern
  if ((ph.draw||0) > 10){
    ops.goals.push("Draw-Kosten senken (Culling-Pad im Perf-Mode reduzieren)");
    ops.changes.push({
      file:"renderer.js", op:"patch",
      find:"const pad = 24;",
      replace:"const pad = (window.__perfMode? 12 : 24);"
    });
    notes.push(`Draw≈${fmt(ph.draw)}ms → Pad=12 bei Perf-Mode`);
  }

  // 3) Engine-Load hoch? (entities > 8ms) → Grid feiner
  if ((ph.entities||0) > 8){
    ops.goals.push("Search-Grid feiner (10% kleinere Buckets)");
    ops.changes.push({
      file:"entities.js", op:"patch",
      find:"const desired = Math.max(80, Math.round(baseSense * sMin));",
      replace:"const desired = Math.max(80, Math.round(baseSense * sMin * 0.9));"
    });
    notes.push(`Entities≈${fmt(ph.entities)}ms → Grid -10%`);
  }

  // 4) Mobile/low-FPS → Perf-Mode initial aktivieren
  const fps = estFPS(ph);
  if (isFinite(fps) && fps>0 && fps < 30){
    ops.goals.push("Mobile/low-FPS: Perf-Mode initial aktivieren");
    ops.changes.push({
      file:"engine.js", op:"patch",
      find:"renderer.setPerfMode(perfMode);",
      replace:"renderer.setPerfMode(perfMode); window.__perfMode = perfMode;"
    });
    notes.push(`FPS≈${fps} → Perf-Mode-Flag setzen`);
  }

  ops.accept.push("OPS einspielen, neu laden; Phasen-EMA sollten sinken (wo zutreffend).");
  if (notes.length) ops.notes = notes.join(" | ");
  return JSON.stringify(ops, null, 2);
}

function estFPS(ph){
  const total = (ph.entities||0)+(ph.reproduction||0)+(ph.food||0)+(ph.draw||0);
  if (total <= 0) return NaN;
  return Math.round(1000/total);
}
function fmt(v){ return (v>0) ? v.toFixed(1) : "0.0"; }
function safe(f, d){ try{ return f(); }catch{ return d; } }