// appops_panel.js — Smart-Ops Panel (beta)

import * as metrics from "./metrics.js";
import { getDrivesSnapshot } from "./drives.js";
import { generateOps } from "./appops.js";

export function openAppOps(){
  let wrap = document.getElementById("appops-wrap");
  if (!wrap){
    wrap = document.createElement("div");
    wrap.id = "appops-wrap";
    wrap.style.cssText = "position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.55);display:flex;align-items:flex-start;justify-content:center;padding:24px;";
    const panel = document.createElement("div");
    panel.id = "appops-panel";
    panel.style.cssText = "max-width:960px;width:92%;background:#10161d;border:1px solid #2a3b4a;border-radius:12px;color:#d6e1ea;padding:16px 16px 8px;box-shadow:0 30px 70px rgba(0,0,0,.45);";
    wrap.appendChild(panel);

    const close = document.createElement('button');
    close.textContent = 'Schließen';
    close.style.cssText = 'position:absolute;top:10px;right:10px;background:#243241;color:#cfe6ff;border:1px solid #47617a;border-radius:8px;padding:6px 10px;';
    close.onclick = ()=> wrap.remove();
    wrap.appendChild(close);

    document.body.appendChild(wrap);
  }

  const box = document.getElementById("appops-panel");
  box.innerHTML = renderContent();
  wire(box);
}

function renderContent(){
  const ph = metrics.getPhases();
  const drv = safe(()=> getDrivesSnapshot(), { duels:0, wins:0, winRate:0, pools:0 });

  const fps = estFPS(ph);
  return `
  <h3 style="margin:0 0 8px;">App-Ops (Optimierer) — Smart Mode (beta)</h3>
  <div style="opacity:.8;margin-bottom:10px;">Live-Übersicht & Vorschläge</div>

  <section style="margin:8px 0;">
    <strong>Performance</strong>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px;">
      <div>FPS (geschätzt): <b>${fps}</b></div>
      <div>Engine-Phasen (EMA, ms): ent=<b>${fmt(ph.entities)}</b> repro=<b>${fmt(ph.reproduction)}</b> food=<b>${fmt(ph.food)}</b> draw=<b>${fmt(ph.draw)}</b></div>
      <div>Drives: Duels <b>${drv.duels}</b> • Win-Rate <b>${pct(drv.winRate)}</b> • Pools <b>${drv.pools||0}</b></div>
    </div>
  </section>

  <section style="margin:8px 0;">
    <strong>OPS-Vorschläge</strong>
    <div style="margin-top:6px;">
      <button id="btnGenOps" style="background:#2b3b4d;border:1px solid #4a627a;color:#e7f3ff;border-radius:8px;padding:6px 10px;cursor:pointer;">OPS erzeugen</button>
      <button id="btnCopyOps" style="margin-left:6px;background:#2b3b4d;border:1px solid #4a627a;color:#e7f3ff;border-radius:8px;padding:6px 10px;cursor:pointer;">In Zwischenablage</button>
    </div>
    <textarea id="opsOut" style="width:100%;height:220px;margin-top:8px;background:#0e151c;color:#d6e1ea;border:1px solid #33485b;border-radius:8px;padding:10px;white-space:pre;"></textarea>
  </section>
  `;
}

function wire(box){
  const out = box.querySelector('#opsOut');
  const gen = ()=>{
    try{
      const s = generateOps();
      out.value = s;
    }catch(e){
      out.value = '// Fehler beim Generieren: ' + (e?.message||e);
      console.error(e);
    }
  };
  box.querySelector('#btnGenOps').addEventListener('click', gen);
  box.querySelector('#btnCopyOps').addEventListener('click', async ()=>{
    try{
      await navigator.clipboard.writeText(out.value||'');
    }catch(e){ console.warn('Clipboard fehlgeschlagen', e); }
  });
  // initial
  gen();
}

function estFPS(ph){
  const total = (ph.entities||0)+(ph.reproduction||0)+(ph.food||0)+(ph.draw||0);
  if (total <= 0) return '–';
  const fps = Math.round(1000/total);
  return isFinite(fps) ? fps : '–';
}

function fmt(v){ return (v>0) ? v.toFixed(1) : '0.0'; }
function pct(v){ return Math.round((+v||0)*100)+'%'; }
function safe(f, d){ try{ return f(); }catch{ return d; } }