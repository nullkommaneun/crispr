// dummy.js – frei konfigurierbare Dummy-Zelle
import { getCells, createCell, worldSize } from "./entities.js";
import { emit } from "./event.js";

let dummyId = null;
let pointerMode = false; // Ziel per Klick setzen?

const panel = document.getElementById("dummyPanel");

// Standard-Config für neue Dummy-Zellen
function defaultDummyCfg(){
  return {
    invulnerable: false,
    infiniteEnergy: false,
    noRepro: true,
    disableFlocking: false,
    noWander: false,
    speedMul: 1.0,
    manualTarget: null,      // {x,y} oder null
  };
}

function findDummy(){
  if(dummyId==null) return null;
  return getCells().find(c=>c.id===dummyId) || null;
}

function ensureDummy(){
  let d = findDummy();
  if(d) return d;

  const { width:W, height:H } = worldSize();
  d = createCell({
    name: "Dummy",
    sex: "M",
    stammId: 99,
    pos: { x: W*0.5, y: H*0.5 },
    genome: { TEM:7, GRÖ:6, EFF:7, SCH:6, MET:4 },
  });
  d.isDummy = true;
  d.dummyCfg = defaultDummyCfg();
  dummyId = d.id;
  return d;
}

function badge(val){ const s=document.createElement("span"); s.className="badge"; s.textContent=val; return s; }
function row(label, nodeRight){
  const div=document.createElement("div"); div.className="row";
  const l=document.createElement("span"); l.textContent=label;
  div.append(l, nodeRight);
  return div;
}
function slider(min,max,step,val,on){
  const w=document.createElement("div"); w.style.display="flex"; w.style.alignItems="center"; w.style.gap="8px";
  const span=badge(val);
  const i=document.createElement("input"); i.type="range"; i.min=min; i.max=max; i.step=step; i.value=val;
  i.oninput = ()=>{ span.textContent=i.value; on(parseFloat(i.value)); };
  w.append(i, span);
  return w;
}
function checkbox(val,on){
  const i=document.createElement("input"); i.type="checkbox"; i.checked=!!val;
  i.oninput = ()=> on(i.checked); return i;
}
function button(txt,on){ const b=document.createElement("button"); b.textContent=txt; b.onclick=on; return b; }

function buildHeader(title){
  const header=document.createElement("div");
  header.className="panel-header";
  const h2=document.createElement("h2"); h2.textContent=title;
  const close=document.createElement("button"); close.className="closeX"; close.innerHTML="&times;";
  close.onclick = ()=> panel.classList.add("hidden");
  header.append(h2, close);
  return header;
}

function render(){
  const d = ensureDummy();
  panel.innerHTML=""; panel.classList.remove("hidden");
  panel.append(buildHeader("Dummy-Zelle"));

  const body = document.createElement("div"); body.className="panel-body"; panel.append(body);

  // --- Status & Aktionen
  const statusBox = document.createElement("div");
  statusBox.style.border="1px solid #22303a"; statusBox.style.borderRadius="8px"; statusBox.style.padding="8px"; statusBox.style.marginBottom="8px";
  statusBox.append(badge(`ID ${d.id}`), " ", badge(`Energie ${d.energy.toFixed(0)}`));
  statusBox.append(document.createElement("br"));

  statusBox.append(
    button("Refill Energie", ()=>{ d.energy = energyCapacity(d); render(); }),
    " ",
    button("Teleport Mitte", ()=>{ const {width:W,height:H}=worldSize(); d.pos.x=W*0.5; d.pos.y=H*0.5; }),
    " ",
    button(pointerMode ? "Ziel per Klick: AN" : "Ziel per Klick: AUS", ()=>{
      pointerMode = !pointerMode; render();
    }),
  );
  statusBox.append(document.createElement("br"));
  statusBox.append(
    button("Ziel löschen", ()=>{ if(d.dummyCfg) d.dummyCfg.manualTarget=null; }),
    " ",
    button("Neu erstellen", ()=>{
      if(d){ d.isDummy=false; d.dummyCfg=null; }
      dummyId=null; ensureDummy(); render();
    }),
    " ",
    button("Löschen", ()=>{
      if(d){ d.isDummy=false; d.dummyCfg=null; dummyId=null; }
      panel.classList.add("hidden");
    })
  );
  body.append(statusBox);

  // --- Overrides
  const ovBox = document.createElement("div");
  ovBox.style.border="1px solid #22303a"; ovBox.style.borderRadius="8px"; ovBox.style.padding="8px"; ovBox.style.marginBottom="8px";
  const ovTitle = document.createElement("div"); ovTitle.textContent = "Overrides";
  ovBox.append(ovTitle);

  ovBox.append(row("Unsterblich", checkbox(d.dummyCfg.invulnerable, v=>{ d.dummyCfg.invulnerable=v; })));
  ovBox.append(row("Unendliche Energie", checkbox(d.dummyCfg.infiniteEnergy, v=>{ d.dummyCfg.infiniteEnergy=v; })));
  ovBox.append(row("Nicht reproduzieren", checkbox(d.dummyCfg.noRepro, v=>{ d.dummyCfg.noRepro=v; })));
  ovBox.append(row("Flocking aus", checkbox(d.dummyCfg.disableFlocking, v=>{ d.dummyCfg.disableFlocking=v; })));
  ovBox.append(row("Wander aus", checkbox(d.dummyCfg.noWander, v=>{ d.dummyCfg.noWander=v; })));
  ovBox.append(row("Speed ×", slider(0.5, 3, 0.1, d.dummyCfg.speedMul, v=>{ d.dummyCfg.speedMul=v; })));

  body.append(ovBox);

  // --- Genome live
  const g = d.genome;
  const genomeBox = document.createElement("div");
  genomeBox.style.border="1px solid #22303a"; genomeBox.style.borderRadius="8px"; genomeBox.style.padding="8px";
  const gTitle = document.createElement("div"); gTitle.textContent = "Genome";
  genomeBox.append(gTitle);

  genomeBox.append(row("TEM", slider(1,10,1,g.TEM, v=>{ g.TEM=v; emit("cell:edited",{id:d.id}); render(); })));
  genomeBox.append(row("GRÖ", slider(1,10,1,g.GRÖ, v=>{ g.GRÖ=v; emit("cell:edited",{id:d.id}); render(); })));
  genomeBox.append(row("EFF", slider(1,10,1,g.EFF, v=>{ g.EFF=v; emit("cell:edited",{id:d.id}); render(); })));
  genomeBox.append(row("SCH", slider(1,10,1,g.SCH, v=>{ g.SCH=v; emit("cell:edited",{id:d.id}); render(); })));
  genomeBox.append(row("MET", slider(1,10,1,g.MET, v=>{ g.MET=v; emit("cell:edited",{id:d.id}); render(); })));

  body.append(genomeBox);

  // Fuß
  const foot=document.createElement("div"); foot.style.marginTop="8px"; foot.className="muted";
  foot.textContent = `Ziel per Klick: ${pointerMode ? "AN" : "AUS"}. Klicke ins Spielfeld, um ein Ziel zu setzen.`;
  body.append(foot);
}

function energyCapacity(c){
  return 120 * (1 + 0.08*(c.genome.GRÖ - 5)); // konsistent zu entities.js
}

/* === Public API === */
export function openDummyPanel(){ render(); }
export function handleCanvasClickForDummy(x,y){
  if(!pointerMode) return;
  const d = ensureDummy();
  if(!d.dummyCfg) d.dummyCfg = defaultDummyCfg();
  d.dummyCfg.manualTarget = { x, y };
}