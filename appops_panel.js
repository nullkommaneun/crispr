// appops_panel.js — App-Optimierer-Panel (Performance, Layout, Module, OPS-Generator)
import { startCollectors, getAppOpsSnapshot, runModuleMatrix, generateOps } from "./appops.js";

const panel = document.getElementById("diagPanel");

// kleine UI-Helfer
function buildHeader(title){
  const h=document.createElement("div"); h.className="panel-header";
  const t=document.createElement("h2"); t.textContent=title;
  const x=document.createElement("button"); x.className="closeX"; x.innerHTML="&times;"; x.onclick=()=>panel.classList.add("hidden");
  h.append(t,x); return h;
}
function section(title){
  const box=document.createElement("div");
  box.style.border="1px solid #22303a"; box.style.borderRadius="8px";
  box.style.padding="10px"; box.style.margin="8px 0";
  const head=document.createElement("div");
  head.style.display="flex"; head.style.justifyContent="space-between"; head.style.alignItems="center";
  const h=document.createElement("b"); h.textContent = title;
  head.append(h); box.append(head);
  return { box, head };
}
function row(label, valueHTML){
  const r=document.createElement("div"); r.className="row";
  const l=document.createElement("span"); l.textContent = label;
  const v=document.createElement("span"); v.innerHTML  = valueHTML;
  r.append(l,v); return r;
}
function codeField(value){
  const wrap=document.createElement("div");
  wrap.style.display="grid"; wrap.style.gridTemplateColumns="1fr auto"; wrap.style.gap="8px"; wrap.style.marginTop="6px";
  const ta=document.createElement("textarea"); ta.readOnly=true; ta.value=value;
  ta.style.width="100%"; ta.style.height="120px"; ta.style.background="#0b1217";
  ta.style.border="1px solid #2a3a46"; ta.style.borderRadius="8px";
  ta.style.color="#d8f0ff"; ta.style.font="12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  const btn=document.createElement("button"); btn.textContent="OPS kopieren";
  btn.onclick=async()=>{ try{ await navigator.clipboard.writeText(ta.value); btn.textContent="Kopiert ✓"; setTimeout(()=>btn.textContent="OPS kopieren", 1200);}catch{} };
  wrap.append(ta, btn); return wrap;
}

export function openAppOpsPanel(){
  startCollectors();

  panel.innerHTML=""; panel.classList.remove("hidden");
  panel.append(buildHeader("App-Ops (Optimierer)"));

  const body=document.createElement("div"); body.className="panel-body"; panel.append(body);

  // Performance
  {
    const { box } = section("Performance");
    const s = getAppOpsSnapshot();
    box.append(
      row("FPS (aktuell / Ø)", `<b>${s.perf.fpsNow}</b> / <b>${s.perf.fpsAvg}</b>`),
      row("Jank (Frames >50ms)", `${s.perf.jank} · Summe ~${s.perf.jankMs}ms`),
      row("Long Tasks", `${s.perf.longTasks.count} · gesamt ~${s.perf.longTasks.totalMs}ms`),
      row("Engine-Backlog-Quote", `${Math.round((s.engine.capRatio||0)*100)}%`)
    );
    body.append(box);
  }

  // Layout
  {
    const { box } = section("Layout / Topbar");
    const s = getAppOpsSnapshot();
    box.append(
      row("Reflow-Zähler", `${s.layout.reflows}`),
      row("Höhenverlauf", `${(s.layout.heights||[]).join(" → ") || "–"}`)
    );
    body.append(box);
  }

  // Ressourcen
  {
    const { box } = section("Ressourcen (größte Assets)");
    const s = getAppOpsSnapshot();
    const list = document.createElement("div");
    for(const r of (s.resources.largest||[])){
      const line = document.createElement("div");
      line.className = "row";
      line.innerHTML = `<span>${r.name} <span class="badge">${r.type}</span></span><span>${r.sizeKB} KB · ${r.duration} ms</span>`;
      list.append(line);
    }
    if (!list.children.length) list.textContent = "–";
    box.append(list);
    body.append(box);
  }

  // Modul-Matrix
  {
    const { box } = section("Module / Exporte");
    const btnRun = document.createElement("button"); btnRun.textContent = "Module prüfen";
    const pre = document.createElement("pre"); pre.style.whiteSpace="pre-wrap"; pre.style.marginTop="8px";
    btnRun.onclick = async()=>{ pre.textContent = await runModuleMatrix(); };
    box.append(btnRun, pre);
    body.append(box);
  }

  // OPS-Generator
  {
    const { box } = section("Vorschläge (MDC-OPS)");
    const opsJSON = generateOps();
    box.append(codeField(opsJSON));
    body.append(box);
  }

  // Refresh-Knopf
  const footer = document.createElement("div");
  footer.style.display="flex"; footer.style.gap="8px"; footer.style.marginTop="8px";
  const btnRefresh = document.createElement("button"); btnRefresh.textContent = "Aktualisieren";
  btnRefresh.onclick = ()=> openAppOpsPanel();
  footer.append(btnRefresh);
  body.append(footer);
}