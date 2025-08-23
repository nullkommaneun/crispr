// appops.js — Safe-Mode (robuste Minimal-Variante)
// Ziel: Modul lädt *immer*, liefert Snapshots/OPS & Modul-Matrix-Stubs,
// so dass appops_panel.js voll bedienbar ist.

// ---------- interner Zustand (einfach & robust) ----------
const state = {
  started: false,
  perf: { fpsNow: 0, fpsAvg: 0, jank: 0, jankMs: 0, longTasks: { count: 0, totalMs: 0 } },
  engine: { frames: 0, capRatio: 0 },
  layout: { reflows: 0, heights: [] },
  resources: { scannedAt: 0, totalKB: 0, largest: [] },
  modules: { lastReport: "" },
  timings: { ent: 0, repro: 0, food: 0, draw: 0 }
};

// ---------- Sammler (konservativ, ohne Abhängigkeiten) ----------
function startRafSampler() {
  try {
    let last = 0;
    const samples = [];
    function loop(t) {
      if (last) {
        const dt = t - last;
        const fps = 1000 / Math.max(1, dt);
        samples.push(fps);
        if (samples.length > 240) samples.shift();
        state.perf.fpsNow = Math.round(fps);
        state.perf.fpsAvg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
        if (dt > 50) { state.perf.jank++; state.perf.jankMs += Math.round(dt - 16.7); }
      }
      last = t;
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  } catch {}
}
function startTopbarObserver() {
  try {
    const el = document.getElementById("topbar");
    if (!el || !("ResizeObserver" in window)) return;
    const ro = new ResizeObserver(() => {
      state.layout.reflowCount = (state.layout.reflowCount || 0) + 1;
      const h = el.offsetHeight || 0;
      const arr = state.layout.heights;
      if (!arr.length || arr[arr.length - 1] !== h) { arr.push(h); if (arr.length > 10) arr.shift(); }
    });
    ro.observe(el);
  } catch {}
}
function scanResources() {
  try {
    const entries = performance.getEntriesByType("resource") || [];
    const list = [];
    let total = 0;
    for (const e of entries) {
      const size = e.transferSize || e.encodedBodySize || 0;
      const sizeKB = Math.round(size / 1024);
      total += sizeKB;
      list.push({
        name: (e.name || "").split("/").slice(-2).join("/"),
        sizeKB, type: e.initiatorType || "res", duration: Math.round(e.duration || 0)
      });
    }
    list.sort((a, b) => b.sizeKB - a.sizeKB);
    state.resources.scannedAt = Date.now();
    state.resources.totalKB = total;
    state.resources.largest = list.slice(0, 12);
  } catch {}
}

// ---------- öffentliche API ----------
export function startCollectors() {
  if (state.started) return; state.started = true;
  startRafSampler();
  startTopbarObserver();
  scanResources();
  try { setInterval(scanResources, 15000); } catch {}
}

export function getAppOpsSnapshot() {
  return {
    v: 1, kind: "appops",
    perf: {
      fpsNow: state.perf.fpsNow, fpsAvg: state.perf.fpsAvg,
      jank: state.perf.jank, jankMs: state.perf.jankMs,
      longTasks: { count: state.perf.longTasks.count, totalMs: state.perf.longTasks.totalMs }
    },
    engine: { frames: state.engine.frames || 1, capRatio: state.engine.capRatio || 0 },
    layout: { reflows: state.layout.reflowCount || 0, heights: [...state.layout.heights] },
    resources: { scannedAt: state.resources.scannedAt, totalKB: state.resources.totalKB, largest: state.resources.largest },
    modules: { last: state.modules.lastReport || "" },
    timings: { ent: state.timings.ent, repro: state.timings.repro, food: state.timings.food, draw: state.timings.draw }
  };
}

// Modul-Matrix (Preflight-äquivalent, schlank)
async function checkModule(path, expects) {
  try {
    const m = await import(path);
    if (!expects?.length) return `✅ ${path}`;
    const miss = expects.filter((k) => !(k in m));
    return miss.length ? `❌ ${path}: fehlt Export ${miss.join(", ")}` : `✅ ${path}`;
  } catch (e) {
    let msg = String(e?.message || e);
    try {
      const r = await fetch(path, { cache: "no-store" });
      msg += ` | http ${r.status} ${r.statusText || ""}`;
      const ct = r.headers.get("content-type"); if (ct) msg += ` | ct=${ct}`;
    } catch {}
    return `❌ ${path}: Import/Parse fehlgeschlagen → ${msg}`;
  }
}
export async function runModuleMatrix() {
  const checks = [
    ["./event.js", ["on", "emit"]],
    ["./config.js", []],
    ["./errorManager.js", ["initErrorManager", "report"]],
    ["./engine.js", ["boot", "start", "pause", "reset", "setTimescale", "setPerfMode"]],
    ["./entities.js", ["setWorldSize", "createAdamAndEve", "step", "getCells", "getFoodItems", "applyEnvironment"]],
    ["./reproduction.js", ["step", "setMutationRate"]],
    ["./food.js", ["step", "setSpawnRate"]],
    ["./renderer.js", ["draw", "setPerfMode"]],
    ["./metrics.js", ["getPhases", "getEconSnapshot", "getPopSnapshot", "getDriftSnapshot", "getMateSnapshot"]],
    ["./drives.js", ["getDrivesSnapshot", "getTraceText"]],
    ["./editor.js", ["openEditor"]],
    ["./environment.js", ["openEnvPanel"]],
    ["./appops_panel.js", ["openAppOps"]],
    ["./appops.js", ["generateOps"]],         // Selbsttest
    ["./diag.js", ["openDiagPanel"]],
    ["./grid.js", ["createGrid"]],
    ["./bootstrap.js", []],
    ["./sw.js", []]
  ];
  const lines = [];
  for (const [p, exp] of checks) lines.push(await checkModule(p, exp));
  state.modules.lastReport = lines.join("\n");
  return state.modules.lastReport;
}

// MDC-Codes (Snapshots)
const toB64 = (obj) => btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
export function getMdcCodes() {
  const s = getAppOpsSnapshot();
  return {
    all: `MDC-OPS-ALL-${toB64({ v: 1, ts: Date.now(), snapshot: s })}`,
    perf: `MDC-OPS-PERF-${toB64({ v: 1, ts: Date.now(), snapshot: s.perf })}`,
    timings: `MDC-OPS-TIMINGS-${toB64({ v: 1, ts: Date.now(), snapshot: s.timings })}`,
    layout: `MDC-OPS-LAYOUT-${toB64({ v: 1, ts: Date.now(), snapshot: s.layout })}`,
    res: `MDC-OPS-RES-${toB64({ v: 1, ts: Date.now(), snapshot: s.resources })}`
  };
}

// OPS (konservativ & gültig)
export function generateOps() {
  const ops = { v: 1, title: "Auto-OPS Vorschläge", goals: [], changes: [], accept: [] };
  // Preflight-Hook (manuell)
  ops.changes.push({
    file: "preflight.js", op: "append",
    code: "// === Dev-Hook: manuelle Preflight-Anzeige mit ?pf=1 ===\n" +
          "(function devHook(){try{const q=new URLSearchParams(location.search);" +
          "if(q.get('pf')==='1') import('./preflight.js').then(m=>m.diagnose());}catch{}})();\n"
  });
  ops.goals.push("Preflight jederzeit manuell abrufbar (?pf=1)");
  ops.accept.push("App-Ops Panel erzeugt gültige OPS; Panel funktionsfähig (Safe-Mode).");
  return JSON.stringify(ops, null, 2);
}