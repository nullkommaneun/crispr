// genea.js — Stammbaum-Panel (Fokusansicht mit Vorfahren/Nachfahren, Pan/Zoom, Suche)
import { getCells } from "./entities.js";
import { getSubtree, searchByNameOrId, getNode, exportJSON, getStats } from "./genealogy.js";

const panel = document.getElementById("diagPanel"); // wir nutzen den vorhandenen Panel-Slot

// ---------- UI ----------
function buildHeader(title){
  const h=document.createElement("div"); h.className="panel-header";
  const t=document.createElement("h2"); t.textContent=title;
  const x=document.createElement("button"); x.className="closeX"; x.innerHTML="&times;"; x.onclick=()=>panel.classList.add("hidden");
  h.append(t,x); return h;
}
function row(label, child){
  const r=document.createElement("div"); r.className="row";
  const l=document.createElement("span"); l.textContent=label; r.append(l, child); return r;
}
function badge(tx){ const s=document.createElement("span"); s.className="badge"; s.textContent=tx; return s; }

export function openGenealogyPanel(focusIdOptional=null){
  panel.innerHTML=""; panel.classList.remove("hidden");
  panel.append(buildHeader("Stammbaum"));

  const body = document.createElement("div"); body.className="panel-body"; panel.append(body);

  // Controls
  const controls=document.createElement("div");
  controls.style.display="grid"; controls.style.gridTemplateColumns="1fr auto auto auto auto"; controls.style.gap="8px"; controls.style.marginBottom="8px";

  const search = document.createElement("input"); search.type="text"; search.placeholder="Suche Name/ID…";
  const upSel = document.createElement("input"); upSel.type="range"; upSel.min="0"; upSel.max="8"; upSel.step="1"; upSel.value="4"; upSel.title="Vorfahren-Tiefe";
  const downSel = document.createElement("input"); downSel.type="range"; downSel.min="0"; downSel.max="8"; downSel.step="1"; downSel.value="4"; downSel.title="Nachfahren-Tiefe";
  const btnCenter=document.createElement("button"); btnCenter.textContent="Zentrieren";
  const btnExport=document.createElement("button"); btnExport.textContent="Export JSON";

  controls.append(search, row("↑", upSel), row("↓", downSel), btnCenter, btnExport);
  body.append(controls);

  // Canvas
  const cv = document.createElement("canvas"); cv.width=900; cv.height=520; cv.style.width="100%";
  cv.style.border="1px solid #22303a"; cv.style.borderRadius="8px"; cv.style.background="#0b1217";
  body.append(cv);

  // Quick stats
  const statsDiv=document.createElement("div"); statsDiv.className="muted"; statsDiv.style.marginTop="6px";
  body.append(statsDiv);

  // initialer Fokus
  let focusId = focusIdOptional ?? (getCells().at(-1)?.id ?? getCells().at(0)?.id ?? null);

  // Pan/Zoom
  let tx=0, ty=0, scale=1;
  let dragging=false, lastX=0, lastY=0;
  cv.addEventListener("wheel",(e)=>{ e.preventDefault(); const s = Math.exp((e.deltaY>0?-1:1)*0.1);
    // zoom zum Mauspunkt
    const rect=cv.getBoundingClientRect(); const mx=(e.clientX-rect.left), my=(e.clientY-rect.top);
    const ox=(mx - tx), oy=(my - ty);
    tx = mx - s*ox; ty = my - s*oy; scale*=s; scale=Math.max(0.3, Math.min(3, scale)); draw(); }, {passive:false});
  cv.addEventListener("mousedown",(e)=>{dragging=true; lastX=e.clientX; lastY=e.clientY;});
  window.addEventListener("mousemove",(e)=>{ if(!dragging) return; const dx=e.clientX-lastX, dy=e.clientY-lastY; lastX=e.clientX; lastY=e.clientY; tx+=dx; ty+=dy; draw(); });
  window.addEventListener("mouseup",()=> dragging=false);

  // Suche
  let searchResults=[];
  search.oninput = ()=>{
    const q = (search.value||"").trim(); searchResults = q? searchByNameOrId(q) : [];
    // wenn eindeutiges Ergebnis, Fokus setzen
    if(searchResults.length===1){ focusId = searchResults[0].id; center(); draw(); }
  };

  btnCenter.onclick=()=>{ center(); draw(); };
  btnExport.onclick=()=>{
    const blob=new Blob([ JSON.stringify(exportJSON(),null,2) ], {type:"application/json"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="genealogy.json"; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  };

  function center(){ tx = cv.width*0.5; ty = 60; scale = 1; }
  center();

  function draw(){
    const ctx=cv.getContext("2d");
    ctx.clearRect(0,0,cv.width,cv.height);
    const up = parseInt(upSel.value,10), down = parseInt(downSel.value,10);
    const tree = getSubtree(focusId, up, down);

    // Level-Gruppierung relativ zum Fokus
    const levels = new Map(); // key: genOffset -> array of nodes
    const focusNode = getNode(focusId);
    const focusGen = focusNode?.gen ?? 0;
    for(const n of tree.nodes){
      const off = (n.gen??0) - focusGen;
      if(!levels.has(off)) levels.set(off, []);
      levels.get(off).push(n);
    }
    // sort each level for stable layout
    for(const arr of levels.values()){ arr.sort((a,b)=> (a.id-b.id)); }

    // Layout: pro Level horizontale Verteilung
    const rowH = 90, colW = 120;
    const positions = new Map(); // id -> [x,y]

    const minOff = Math.min(...levels.keys(), 0);
    const maxOff = Math.max(...levels.keys(), 0);

    // zeichne Kanten zuerst
    ctx.save(); ctx.translate(tx, ty); ctx.scale(scale, scale);
    ctx.lineWidth = 1.2/scale;

    // Positionen berechnen
    for(let off=minOff; off<=maxOff; off++){
      const arr = levels.get(off)||[];
      const y = off * rowH;
      const totalW = (arr.length-1) * colW;
      for(let i=0;i<arr.length;i++){
        const x = -totalW/2 + i*colW;
        positions.set(arr[i].id, [x,y]);
      }
    }

    // Kanten (Eltern -> Kind)
    ctx.strokeStyle = "rgba(180,200,220,0.35)";
    for(const e of tree.edges){
      const a = positions.get(e.from), b = positions.get(e.to);
      if(!a||!b) continue;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]+18);
      ctx.lineTo(b[0], b[1]-18);
      ctx.stroke();
    }

    // Knoten
    for(const n of tree.nodes){
      const [x,y] = positions.get(n.id);
      const r = 16;
      ctx.beginPath();
      ctx.fillStyle = n.sex==="M" ? "#27c7ff" : "#ff6bd6";
      ctx.strokeStyle = (n.id===focusId) ? "#2ee56a" : "#22303a";
      ctx.lineWidth = (n.id===focusId)? 2.4/scale : 1/scale;
      ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); ctx.stroke();

      ctx.fillStyle = "#cfe7ff"; ctx.font = `${12/scale}px system-ui`;
      ctx.textAlign="center"; ctx.fillText(n.name ?? `Z${n.id}`, x, y-24/scale);
      const gtxt = `Gen ${n.gen ?? 0}${n.diedAt? " ✝" : ""}`;
      ctx.fillStyle = "#9fb6c9"; ctx.fillText(gtxt, x, y+34/scale);
    }

    ctx.restore();

    // Stats
    const s = getStats();
    statsDiv.innerHTML = `Knoten: <b>${s.nodes}</b> · Lebend: <b>${s.alive}</b> · Wurzeln: ${s.roots} · Blätter: ${s.leaves} · max. Gen: ${s.maxGen}`;
  }

  draw();
}