// genea.js — Vollansicht-Stammbaum mit zwei Scroll-Slidern (oben/rechts) + "Fit"-Button
import { getAll, getStats, exportJSON } from "./genealogy.js";

const panel = document.getElementById("diagPanel");

// Hilfen
function buildHeader(title){
  const h=document.createElement("div"); h.className="panel-header";
  const t=document.createElement("h2"); t.textContent=title;
  const x=document.createElement("button"); x.className="closeX"; x.innerHTML="&times;"; x.onclick=()=>panel.classList.add("hidden");
  h.append(t,x); return h;
}
function badge(tx){ const s=document.createElement("span"); s.className="badge"; s.textContent=tx; return s; }

export function openGenealogyPanel(){
  panel.innerHTML=""; panel.classList.remove("hidden");
  panel.append(buildHeader("Stammbaum"));

  const body = document.createElement("div"); body.className="panel-body"; panel.append(body);

  // ======= Bedienleiste oben =======
  const topBar = document.createElement("div");
  topBar.style.display="flex"; topBar.style.alignItems="center"; topBar.style.gap="10px";
  topBar.style.marginBottom="8px";

  // horizontaler Slider (0..100)
  const hSlider = document.createElement("input");
  hSlider.type="range"; hSlider.min="0"; hSlider.max="100"; hSlider.step="1"; hSlider.value="50";
  hSlider.style.flex="1";

  const btnCenter = document.createElement("button"); btnCenter.textContent = "Zentrieren";
  const btnFit    = document.createElement("button"); btnFit.textContent    = "Fit";
  const btnExport = document.createElement("button"); btnExport.textContent = "Export JSON";

  topBar.append(hSlider, btnCenter, btnFit, btnExport);
  body.append(topBar);

  // ======= Canvas + vertikaler Slider rechts =======
  const holder = document.createElement("div");
  holder.style.position="relative";
  holder.style.display="grid";
  holder.style.gridTemplateColumns = "1fr auto";
  holder.style.gap = "8px";

  const cv = document.createElement("canvas");
  cv.width = 900; cv.height = 520;
  cv.style.width="100%";
  cv.style.border="1px solid #22303a"; cv.style.borderRadius="8px"; cv.style.background="#0b1217";

  // vertikaler Slider — gedreht und an die rechte Seite gelegt
  const vWrap = document.createElement("div");
  vWrap.style.display="flex"; vWrap.style.alignItems="center"; vWrap.style.justifyContent="center";
  vWrap.style.padding="2px 0";

  const vSlider = document.createElement("input");
  vSlider.type="range"; vSlider.min="0"; vSlider.max="100"; vSlider.step="1"; vSlider.value="0";
  vSlider.classList.add("vscroll"); // touch-action: pan-y (siehe CSS)
  vSlider.style.transform = "rotate(-90deg)";
  vSlider.style.width = "520px";   // entspricht Canvas-Höhe
  vSlider.style.height = "26px";
  vSlider.style.display = "block";

  vWrap.append(vSlider);
  holder.append(cv, vWrap);
  body.append(holder);

  // Stats unten
  const statsDiv=document.createElement("div"); statsDiv.className="muted"; statsDiv.style.marginTop="6px";
  body.append(statsDiv);

  // ======= Daten holen & Layout berechnen =======
  const data = getAll();
  if(!data.nodes.length){
    const msg=document.createElement("div");
    msg.className="muted"; msg.textContent="Noch keine Stammdaten vorhanden.";
    body.append(msg);
    statsDiv.textContent = "Knoten: 0 · Lebend: 0 · Wurzeln: 0 · Blätter: 0 · max. Gen: 0";
    return;
  }

  // Gruppiere nach Generation, stabile Reihenfolge (bornAt, dann id)
  const levels = new Map();
  let minGen=Infinity, maxGen=-Infinity;
  for(const n of data.nodes){
    const g = n.gen||0;
    minGen=Math.min(minGen,g); maxGen=Math.max(maxGen,g);
    if(!levels.has(g)) levels.set(g,[]);
    levels.get(g).push(n);
  }
  for(const arr of levels.values()){
    arr.sort((a,b)=> ( (a.bornAt??0)-(b.bornAt??0) ) || (a.id-b.id) );
  }

  // Layout in "Welt-Koordinaten"
  const colW=120, rowH=100;
  const positions = new Map(); // id -> [x,y]
  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;

  for(let g=minGen; g<=maxGen; g++){
    const arr = levels.get(g)||[];
    const y = (g-minGen) * rowH;
    const totalW = (arr.length-1) * colW;
    for(let i=0;i<arr.length;i++){
      const x = -totalW/2 + i*colW;
      positions.set(arr[i].id, [x,y]);
      minX=Math.min(minX,x); maxX=Math.max(maxX,x);
      minY=Math.min(minY,y); maxY=Math.max(maxY,y);
    }
  }

  const bbox = {
    x: minX-60, y: minY-60,
    w: (maxX-minX)+120,
    h: (maxY-minY)+120
  };

  // Viewport-Parameter
  let scale = Math.min(1, Math.min(cv.width/bbox.w, cv.height/bbox.h)); // fit falls größer
  let viewX = (bbox.x + bbox.w/2) - (cv.width/scale)/2;  // mittig
  let viewY = (bbox.y + bbox.h/2) - (cv.height/scale)/2;

  function syncSliders(){
    const maxHX = Math.max(0, bbox.w - cv.width/scale);
    const maxHY = Math.max(0, bbox.h - cv.height/scale);
    const hx = maxHX>0 ? ( (viewX - bbox.x) / maxHX )*100 : 0;
    const hy = maxHY>0 ? ( (viewY - bbox.y) / maxHY )*100 : 0;
    hSlider.value = String(Math.max(0, Math.min(100, Math.round(hx))));
    vSlider.value = String(Math.max(0, Math.min(100, Math.round(hy))));
  }

  function applyFromSliders(){
    const maxHX = Math.max(0, bbox.w - cv.width/scale);
    const maxHY = Math.max(0, bbox.h - cv.height/scale);
    viewX = bbox.x + (parseInt(hSlider.value,10)/100) * maxHX;
    viewY = bbox.y + (parseInt(vSlider.value,10)/100) * maxHY;
    draw();
  }

  hSlider.oninput = applyFromSliders;
  vSlider.oninput = applyFromSliders;

  btnCenter.onclick = ()=>{
    scale = Math.min(1, Math.min(cv.width/bbox.w, cv.height/bbox.h));
    viewX = (bbox.x + bbox.w/2) - (cv.width/scale)/2;
    viewY = (bbox.y + bbox.h/2) - (cv.height/scale)/2;
    syncSliders(); draw();
  };

  // === Fit-Handler: gesamte BBox in den Frame einpassen ===
  btnFit.onclick = ()=>{
    const scaleFit = Math.min(1, Math.min(cv.width/bbox.w, cv.height/bbox.h));
    scale = scaleFit;
    viewX = (bbox.x + bbox.w/2) - (cv.width/scale)/2;
    viewY = (bbox.y + bbox.h/2) - (cv.height/scale)/2;
    syncSliders(); draw();
  };

  btnExport.onclick = ()=>{
    const blob=new Blob([ JSON.stringify(exportJSON(),null,2) ], {type:"application/json"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="genealogy.json"; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  };

  // Zeichenroutine: nur sichtbarer Bereich + Puffer
  function draw(){
    const ctx=cv.getContext("2d");
    ctx.clearRect(0,0,cv.width,cv.height);

    ctx.save();
    ctx.translate(-viewX*scale, -viewY*scale);
    ctx.scale(scale, scale);

    // Sichtbarer Frame (in Welt-Koords)
    const vis = {
      x: viewX - 0.5*cv.width/scale,
      y: viewY - 0.5*cv.height/scale,
      w: 2*cv.width/scale,
      h: 2*cv.height/scale
    };

    // Kanten (Eltern -> Kind)
    ctx.strokeStyle = "rgba(180,200,220,0.35)";
    ctx.lineWidth = 1.2/scale;
    for(const e of data.edges){
      const a = positions.get(e.from), b = positions.get(e.to);
      if(!a||!b) continue;
      if (!rectIntersectsLine(vis, a[0],a[1], b[0],b[1])) continue;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]+18);
      ctx.lineTo(b[0], b[1]-18);
      ctx.stroke();
    }

    // Knoten
    for(const n of data.nodes){
      const p = positions.get(n.id); if(!p) continue;
      const x=p[0], y=p[1];
      if (x < vis.x-40 || x > vis.x+vis.w+40 || y < vis.y-60 || y > vis.y+vis.h+60) continue;

      const r=16;
      ctx.beginPath();
      ctx.fillStyle = n.sex==="M" ? "#27c7ff" : "#ff6bd6";
      ctx.strokeStyle = "#22303a"; ctx.lineWidth = 1/scale;
      ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); ctx.stroke();

      ctx.fillStyle = "#cfe7ff"; ctx.font = `${12/scale}px system-ui`;
      ctx.textAlign="center"; ctx.fillText(n.name ?? `Z${n.id}`, x, y-24/scale);
      const gtxt = `Gen ${n.gen ?? 0}${n.diedAt? " ✝" : ""}`;
      ctx.fillStyle = "#9fb6c9"; ctx.fillText(gtxt, x, y+34/scale);
    }

    ctx.restore();

    const s = getStats();
    statsDiv.innerHTML = `Knoten: <b>${s.nodes}</b> · Lebend: <b>${s.alive}</b> · Wurzeln: ${s.roots} · Blätter: ${s.leaves} · max. Gen: ${s.maxGen} · ${badge('Vollansicht').outerHTML}`;
  }

  function rectIntersectsLine(rect, x1,y1, x2,y2){
    const minX=Math.min(x1,x2), maxX=Math.max(x1,x2), minY=Math.min(y1,y2), maxY=Math.max(y1,y2);
    if (maxX < rect.x || minX > rect.x+rect.w || maxY < rect.y || minY > rect.y+rect.h) return false;
    return true;
  }

  // initial
  btnCenter.click();
}