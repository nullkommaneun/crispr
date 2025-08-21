// genealogy.js — lückenloser Stammbaum: Eltern/Kind-Beziehungen, Generationen, Export
import { on } from "./event.js";

const nodes = new Map(); // id -> node
// Node: { id, name, sex, stammId, genome, bornAt, diedAt, ageAtDeath, parents:[id,id]|[], children:Set<id>, gen:number }

function ensureNode(id){
  if(!nodes.has(id)){
    nodes.set(id, { id, name:`Z${id}`, sex:null, stammId:null, genome:null,
      bornAt:null, diedAt:null, ageAtDeath:null, parents:[], children:new Set(), gen:0 });
  }
  return nodes.get(id);
}

function computeGen(childId){
  const n = nodes.get(childId);
  if(!n) return 0;
  if(!n.parents || n.parents.length===0) { n.gen = 0; return 0; }
  let g = 0;
  for(const pid of n.parents){
    const p = nodes.get(pid);
    if(p) g = Math.max(g, (typeof p.gen==="number" ? p.gen : 0)+1);
  }
  n.gen = g;
  return g;
}

// Events binden
on("cells:born", (payload)=>{
  // payload: { child, parents:[idA,idB] } – child enthält genome, sex, stammId, name, evtl. pos/energy (ignorieren)
  try{
    const t = Date.now();
    const cid = payload?.child?.id;
    if(cid==null) return;
    const cn = ensureNode(cid);
    cn.name    = payload.child.name ?? cn.name;
    cn.sex     = payload.child.sex ?? cn.sex;
    cn.stammId = payload.child.stammId ?? cn.stammId;
    cn.genome  = payload.child.genome ?? cn.genome;
    cn.bornAt  = t;
    cn.parents = Array.isArray(payload.parents) ? payload.parents.slice(0,2) : [];
    for(const pid of cn.parents){
      if(pid==null) continue;
      const pn = ensureNode(pid);
      pn.children.add(cid);
    }
    computeGen(cid);
  }catch(e){ console.warn("[genealogy] cells:born handler error", e); }
});

on("cells:died", (cell)=>{
  try{
    const n = ensureNode(cell?.id);
    n.diedAt = Date.now();
    n.ageAtDeath = cell?.age ?? null;
    // sex/stamm/genome ggf. nachtragen (falls Node ein Platzhalter war)
    if(n.sex==null && cell?.sex!=null) n.sex = cell.sex;
    if(n.stammId==null && cell?.stammId!=null) n.stammId = cell.stammId;
    if(!n.genome && cell?.genome) n.genome = cell.genome;
  }catch(e){ console.warn("[genealogy] cells:died handler error", e); }
});

// ---------- API ----------
export function getNode(id){ return nodes.get(id) || null; }
export function getParents(id){ const n=nodes.get(id); return n ? (n.parents||[]).map(pid=>nodes.get(pid)||null) : []; }
export function getChildren(id){ const n=nodes.get(id); return n ? Array.from(n.children||[]).map(cid=>nodes.get(cid)||null) : []; }

export function getStats(){
  let count=0, roots=0, leaves=0, maxGen=0, alive=0;
  for(const n of nodes.values()){
    count++;
    if((n.parents||[]).length===0) roots++;
    if(!n.children || n.children.size===0) leaves++;
    if(typeof n.gen==="number") maxGen = Math.max(maxGen, n.gen);
    if(!n.diedAt) alive++;
  }
  return { nodes:count, roots, leaves, maxGen, alive };
}

// Teilbaum um Fokus: 'up' Generationen Vorfahren, 'down' Generationen Nachfahren
export function getSubtree(focusId, up=4, down=4){
  const include = new Set();
  const edges = [];

  function addPathUp(id, depth){
    if(depth<0 || id==null) return;
    if(!include.has(id)) include.add(id);
    const n = nodes.get(id); if(!n) return;
    for(const pid of (n.parents||[])){
      if(pid==null) continue;
      edges.push({ from:pid, to:id }); // von Eltern zu Kind
      addPathUp(pid, depth-1);
    }
  }
  function addPathDown(id, depth){
    if(depth<0 || id==null) return;
    if(!include.has(id)) include.add(id);
    const n=nodes.get(id); if(!n) return;
    for(const cid of (n.children||[])){
      edges.push({ from:id, to:cid });
      addPathDown(cid, depth-1);
    }
  }

  addPathUp(focusId, up);
  addPathDown(focusId, down);

  const subNodes = Array.from(include).map(id=>nodes.get(id)).filter(Boolean);
  return { nodes: subNodes, edges };
}

export function searchByNameOrId(q){
  if(!q) return [];
  const s = String(q).toLowerCase();
  const out = [];
  for(const n of nodes.values()){
    if(String(n.id)===s || (n.name && n.name.toLowerCase().includes(s))) out.push(n);
  }
  // jüngste zuerst
  out.sort((a,b)=> (b.bornAt||0) - (a.bornAt||0));
  return out.slice(0,25);
}

export function exportJSON(){
  // kompaktes Exportformat
  const list = [];
  for(const n of nodes.values()){
    list.push({
      id:n.id, name:n.name, sex:n.sex, stammId:n.stammId,
      genome:n.genome, bornAt:n.bornAt, diedAt:n.diedAt, ageAtDeath:n.ageAtDeath,
      parents:n.parents||[], children: Array.from(n.children||[]), gen:n.gen
    });
  }
  return { v:1, kind:"genealogy", ts:Date.now(), nodes:list };
}