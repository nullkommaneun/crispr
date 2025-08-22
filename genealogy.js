// genealogy.js — Stammbaumdaten (Eltern/Kind, Generationen), Events, Export
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

on("cells:born", (payload)=>{
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
export function getSubtree(focusId, up=4, down=4){
  const include = new Set(), edges = [];
  function addUp(id,d){ if(d<0||id==null) return; include.add(id);
    const n=nodes.get(id); if(!n) return;
    for(const pid of (n.parents||[])){ if(pid==null) continue; edges.push({from:pid,to:id}); addUp(pid,d-1); } }
  function addDown(id,d){ if(d<0||id==null) return; include.add(id);
    const n=nodes.get(id); if(!n) return;
    for(const cid of (n.children||[])){ edges.push({from:id,to:cid}); addDown(cid,d-1); } }
  addUp(focusId,up); addDown(focusId,down);
  return { nodes:[...include].map(id=>nodes.get(id)).filter(Boolean), edges };
}
// NEU: gesamte Population
export function getAll(){
  const arr = Array.from(nodes.values());
  const edges = [];
  for(const n of arr){
    if(n.children && n.children.size){
      for(const cid of n.children) edges.push({from:n.id, to:cid});
    }
  }
  return { nodes: arr, edges };
}
export function searchByNameOrId(q){
  if(!q) return [];
  const s = String(q).toLowerCase(); const out = [];
  for(const n of nodes.values()){
    if(String(n.id)===s || (n.name && n.name.toLowerCase().includes(s))) out.push(n);
  }
  out.sort((a,b)=> (b.bornAt||0) - (a.bornAt||0));
  return out.slice(0,25);
}
export function exportJSON(){
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