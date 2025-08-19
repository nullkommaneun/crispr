// entities.js
// Zellen & Nahrung, zielgerichtetes Verhalten, Energie, Scheduler, Speciation & Balancing.

import { Events, EVT } from './event.js';
import { getStammColor, resetLegend } from './legend.js';
import { createGenome } from './genetics.js';
import { evaluateMatingPairs } from './reproduction.js';

const WORLD = {
  width: 800,
  height: 520,
  mutationRate: 0.10,     // 10%
  foodRate: 100,          // pro Minute
  maxFood: 400
};

let nextCellId = 1;
let nextFoodId = 1;
let nextStammId = 1;

export const cells = [];
export const foods = [];

const pedigree = new Map(); // id -> {motherId, fatherId, stammId}
const lastMinuteHungerDeaths = [];
let foundersIds = { adam: null, eva: null };
let foundersEverMated = false;

// Speciation (Abspaltung)
const SPEC = {
  split: {
    sum: 7,           // Mindest-Summe |ΔTrait| zur Mutter
    max: 3,           // oder ein Trait weicht ≥3 ab
    crossBonus: -2,   // Eltern aus unterschiedlichen Stämmen → Summe-Schwelle -2
    randomProb: 0.003 // 0.3% Gründer-Mutation
  }
};

// Nothilfe (Food-Drop)
let lastAidAt = -999;
const AID_INTERVAL = 20; // s
const AID_FOOD = 30;

// Weltzeit & Scheduler
let worldTime = 0;
const scheduled = []; // {due:number, fn:Function}
export function schedule(fn, delaySec=0){ scheduled.push({ due: worldTime + Math.max(0, delaySec), fn }); }
function runScheduler(){
  for (let i=scheduled.length-1; i>=0; i--){
    if (scheduled[i].due <= worldTime){
      const t = scheduled[i];
      scheduled.splice(i,1);
      try{ t.fn(); }catch(e){ console.error('[CRISPR] Scheduler-Fehler', e); }
    }
  }
}
function nowSec(){ return performance.now()/1000; }

// Welt-API
export function setWorldSize(w,h){
  WORLD.width = Math.max(50, w|0);
  WORLD.height = Math.max(50, h|0);
}
export function setMutationRate(p){ WORLD.mutationRate = Math.max(0, Math.min(1, p)); }
export function setFoodRate(perMinute){ WORLD.foodRate = Math.max(0, perMinute|0); }
export function getWorldConfig(){ return {...WORLD}; }

export function resetEntities(){
  cells.splice(0, cells.length);
  foods.splice(0, foods.length);
  pedigree.clear();
  resetLegend();
  lastMinuteHungerDeaths.length = 0;
  foundersIds = { adam: null, eva: null };
  foundersEverMated = false;
  worldTime = 0;

  nextCellId = 1;
  nextFoodId = 1;
  nextStammId = 1;
  scheduled.length = 0;

  Events.emit(EVT.RESET, {});
}

export function newStammId(){ return nextStammId++; }

// Abgeleitete Werte aus Genen
function n(v){ return (v-5)/4; } // norm: 1..9 → [-1,1]
function deriveFromGenes(g){
  const nTEM = n(g.TEM), nGRO = n(g.GRO), nEFF = n(g.EFF), nSCH = n(g.SCH);
  // Balancing
  const v0   = 40;            // px/s
  const s0   = 90;            // sensing in px
  const baseScan = 0.30;      // s
  const baseCD   = 6.0;       // s
  const r0 = 3, kR = 1;       // px
  const cap0 = 36;            // Energie-Kapazität
  const base0 = 0.50;         // e/s Grundumsatz
  const baseMove = 0.0030;    // e pro (px/s)

  return {
    speedMax: Math.max(12, v0 * (1 + 0.35*nTEM - 0.15*nGRO)),
    sense:    Math.max(30, s0 * (1 + 0.40*nEFF + 0.20*nGRO)),
    scanInterval: Math.max(0.10, baseScan * (1 - 0.30*nTEM)),
    mateCooldown: Math.max(2.0, baseCD   * (1 - 0.30*nTEM)),
    radius:  Math.max(2, r0 + kR*(g.GRO - 5)),
    energyCap: Math.max(16, cap0 * (1 + 0.50*nGRO)),
    baseDrain: Math.max(0.08, base0 * (1 + 0.25*nGRO - 0.15*nSCH)),
    moveCostPerSpeed: Math.max(0.0012, baseMove * (1 + 0.30*nTEM + 0.50*nGRO - 0.60*nEFF)),
    digestionMult: 1 + 0.30*nEFF,
    collisionMult: Math.max(0.3, 1 - 0.50*nSCH),
    mateEnergyThreshold: Math.max(8, 12 * (1 + 0.45*nGRO - 0.25*nEFF)),
    mateEnergyCost: Math.max(2,  3 * (1 + 0.20*nGRO - 0.20*nEFF)),
  };
}

function applyDerived(cell){
  const d = deriveFromGenes(cell.genes);
  cell.derived = d;
  cell.radius = d.radius;
  if (cell.vx === undefined || cell.vy === undefined){
    const ang = Math.random() * Math.PI * 2;
    cell.vx = Math.cos(ang) * d.speedMax * 0.5;
    cell.vy = Math.sin(ang) * d.speedMax * 0.5;
  }
  cell.scanTimer = Math.random() * d.scanInterval;
  cell.target = null; // {type:'food'|'mate', id, x,y}
}

// Gene-Distanzen (für Speciation)
function sumAbsDiff(a,b){ return Math.abs(a.TEM-b.TEM)+Math.abs(a.GRO-b.GRO)+Math.abs(a.EFF-b.EFF)+Math.abs(a.SCH-b.SCH); }
function maxAbsDiff(a,b){ return Math.max(Math.abs(a.TEM-b.TEM),Math.abs(a.GRO-b.GRO),Math.abs(a.EFF-b.EFF),Math.abs(a.SCH-b.SCH)); }

// Erzeugung
export function createCell(params = {}){
  const id = params.id ?? nextCellId++;
  const parents = params.parents || null;

  let stammId = params.stammId ?? newStammId();

  // Speciation (Abspaltung) – außer wenn noSplit gesetzt ist (z. B. Startbonus)
  if (!params.noSplit && parents?.motherId){
    const mother = cells.find(c=>c.id===parents.motherId);
    const father = parents.fatherId ? cells.find(c=>c.id===parents.fatherId) : null;
    if (mother){
      const sum = sumAbsDiff(params.genes, mother.genes);
      const mx  = maxAbsDiff(params.genes, mother.genes);
      const cross = !!(father && mother.stammId !== father.stammId);
      const threshSum = SPEC.split.sum + (cross ? SPEC.split.crossBonus : 0);
      if (sum >= threshSum || mx >= SPEC.split.max || Math.random() < SPEC.split.randomProb){
        stammId = newStammId();
        Events.emit(EVT.TIP, { label:'🧬 Abspaltung', text:`Neuer Stamm ${stammId}: starke Genabweichung von der Mutter.` });
      }
    }
  }

  const sex = params.sex ?? (Math.random() < 0.5 ? 'm' : 'f');
  const genes = params.genes ? {...params.genes} : createGenome();
  const angle = Math.random() * Math.PI * 2;

  const c = {
    id, name: params.name || `Zelle #${id}`,
    stammId, sex,
    x: params.x ?? Math.random()*WORLD.width,
    y: params.y ?? Math.random()*WORLD.height,
    vx: Math.cos(angle)*10,
    vy: Math.sin(angle)*10,
    genes,
    energy: params.energy ?? 22,
    age: 0,
    dead: false,
    parents,
    bornAt: nowSec(),
    lastMateAt: -999
  };

  applyDerived(c);
  cells.push(c);
  pedigree.set(c.id, {
    motherId: c.parents?.motherId ?? null,
    fatherId: c.parents?.fatherId ?? null,
    stammId: c.stammId
  });
  return c;
}

export function createFood(params = {}){
  const f = {
    id: params.id ?? nextFoodId++,
    x: params.x ?? Math.random()*WORLD.width,
    y: params.y ?? Math.random()*WORLD.height,
    value: params.value ?? 10
  };
  foods.push(f);
  Events.emit(EVT.FOOD_SPAWN, {id: f.id});
  return f;
}

// Zähler & Export/Import (Export wird nicht mehr per UI benutzt, bleibt intern nutzbar)
export function getStammCounts(){
  const counts = {};
  for(const c of cells){
    if(c.dead) continue;
    counts[c.stammId] = (counts[c.stammId]||0)+1;
  }
  return counts;
}

export function setFounders(adamId, evaId){ foundersIds = {adam: adamId, eva: evaId}; }

export function exportState(){
  return JSON.stringify({
    WORLD, nextCellId, nextFoodId, nextStammId,
    cells: cells.filter(c=>!c.dead).map(c=>({
      id:c.id, name:c.name, stammId:c.stammId, sex:c.sex,
      x:c.x, y:c.y, vx:c.vx, vy:c.vy, genes:c.genes, radius:c.radius,
      energy:c.energy, age:c.age, parents:c.parents, bornAt:c.bornAt,
      lastMateAt:c.lastMateAt
    })),
    foods: foods,
    foundersIds
  }, null, 2);
}

export function importState(json){
  const data = typeof json==='string' ? JSON.parse(json) : json;
  resetEntities();
  Object.assign(WORLD, data.WORLD);
  nextCellId = data.nextCellId;
  nextFoodId = data.nextFoodId;
  nextStammId = data.nextStammId;

  for(const c of data.cells){
    const cc = {...c, dead:false};
    applyDerived(cc);
    cells.push(cc);
    pedigree.set(cc.id, {motherId: cc.parents?.motherId ?? null, fatherId: cc.parents?.fatherId ?? null, stammId: cc.stammId});
  }
  for(const f of data.foods){ foods.push({...f}); }
  foundersIds = data.foundersIds || foundersIds;
}

// Verwandtschaft
export function relatedness(a, b){
  if(a.id === b.id) return 1;
  const mapA = ancestorsUpTo(a.id, 3);
  const mapB = ancestorsUpTo(b.id, 3);
  let best = Infinity;
  for(const [aid, da] of mapA){
    if(mapB.has(aid)){
      const sum = da + mapB.get(aid);
      if(sum < best) best = sum;
    }
  }
  if(best === Infinity) return 0;
  return Math.pow(0.5, best);
}
function ancestorsUpTo(id, depth){
  const map = new Map();
  const queue = [{id, d:0}];
  while(queue.length){
    const {id:cur, d} = queue.shift();
    const p = pedigree.get(cur); if(!p) continue;
    if(p.motherId && d+1 <= depth){ if(!map.has(p.motherId)) map.set(p.motherId, d+1); queue.push({id:p.motherId, d:d+1}); }
    if(p.fatherId && d+1 <= depth){ if(!map.has(p.fatherId)) map.set(p.fatherId, d+1); queue.push({id:p.fatherId, d:d+1}); }
  }
  return map;
}

// Verhalten
function chooseFoodTarget(c){
  let best=null, bestScore=-Infinity;
  const sense2 = c.derived.sense * c.derived.sense;
  for(let i=0;i<foods.length;i++){
    const f = foods[i];
    const dx = f.x - c.x, dy = f.y - c.y;
    const d2 = dx*dx + dy*dy;
    if (d2 > sense2) continue;
    const dist = Math.sqrt(Math.max(1, d2));
    const alpha = 1.5 - 0.3*((c.genes.EFF-5)/4) + 0.2*((c.genes.TEM-5)/4);
    const score = c.derived.digestionMult * (f.value) / Math.pow(dist+8, alpha);
    if(score > bestScore){ bestScore = score; best = f; }
  }
  if(best){
    c.target = { type:'food', id: best.id, x: best.x, y: best.y };
    return true;
  }
  return false;
}

function chooseMateTarget(c, alive){
  const tNow = nowSec();
  if ((tNow - (c.lastMateAt||0)) < c.derived.mateCooldown) return false;
  if (c.energy < c.derived.mateEnergyThreshold) return false;

  let best=null, bestD2=Infinity;
  const sense2 = c.derived.sense * c.derived.sense;
  for(const o of alive){
    if (o===c || o.dead) continue;
    if (o.sex === c.sex) continue;
    if ((tNow - (o.lastMateAt||0)) < (o.derived?.mateCooldown ?? 6)) continue;
    if (o.energy < (o.derived?.mateEnergyThreshold ?? 14)) continue;
    const dx = o.x - c.x, dy = o.y - c.y;
    const d2 = dx*dx + dy*dy;
    if (d2 > sense2) continue;
    if (d2 < bestD2){ bestD2 = d2; best = o; }
  }
  if(best){
    c.target = { type:'mate', id: best.id, x: best.x, y: best.y };
    return true;
  }
  return false;
}

function updateCellBehavior(c, alive, dt){
  if (c.target){
    if (c.target.type === 'food'){
      const f = foods.find(ff => ff.id === c.target.id);
      if (f){ c.target.x = f.x; c.target.y = f.y; } else c.target = null;
    } else if (c.target.type === 'mate'){
      const o = alive.find(x => x.id === c.target.id && !x.dead);
      if (o){ c.target.x = o.x; c.target.y = o.y; } else c.target = null;
    }
  }

  c.scanTimer -= dt;
  const hungry = c.energy < 0.30 * c.derived.energyCap;
  if (c.scanTimer <= 0 || hungry || !c.target){
    let found = false;
    if (hungry) found = chooseFoodTarget(c);
    if (!found){
      found = chooseFoodTarget(c);
      if (!found && c.energy > 0.70 * c.derived.energyCap){
        found = chooseMateTarget(c, alive);
      }
    }
    c.scanTimer = c.derived.scanInterval;
  }

  // Steering
  let desiredVX = 0, desiredVY = 0;
  if (c.target){
    const dx = c.target.x - c.x, dy = c.target.y - c.y;
    const d  = Math.max(1, Math.hypot(dx, dy));
    const sp = c.derived.speedMax;
    desiredVX = (dx/d) * sp; desiredVY = (dy/d) * sp;
  }else{
    c.wanderAng = (c.wanderAng ?? Math.random()*Math.PI*2) + (Math.random()*2-1)*0.3*dt;
    const sp = c.derived.speedMax * 0.6;
    desiredVX = Math.cos(c.wanderAng) * sp;
    desiredVY = Math.sin(c.wanderAng) * sp;
  }
  c.vx = 0.85*c.vx + 0.15*desiredVX;
  c.vy = 0.85*c.vy + 0.15*desiredVY;

  c.x += c.vx * dt; c.y += c.vy * dt;
  if(c.x < c.radius){ c.x=c.radius; c.vx = Math.abs(c.vx); }
  if(c.x > WORLD.width - c.radius){ c.x = WORLD.width - c.radius; c.vx = -Math.abs(c.vx); }
  if(c.y < c.radius){ c.y=c.radius; c.vy = Math.abs(c.vy); }
  if(c.y > WORLD.height - c.radius){ c.y = WORLD.height - c.radius; c.vy = -Math.abs(c.vy); }

  const speed = Math.hypot(c.vx, c.vy);
  c.energy -= (c.derived.baseDrain + c.derived.moveCostPerSpeed * speed) * dt;
  c.energy = Math.min(c.energy, c.derived.energyCap);
  c.age += dt;
}

function eatPhase(){
  if(foods.length===0) return;
  for(const c of cells){
    if(c.dead) continue;
    for(let i=foods.length-1;i>=0;i--){
      const f = foods[i];
      const dx=c.x-f.x, dy=c.y-f.y;
      if(dx*dx + dy*dy <= (c.radius+3)*(c.radius+3)){
        c.energy = Math.min(c.derived.energyCap, c.energy + f.value * c.derived.digestionMult);
        foods.splice(i,1);
      }
    }
  }
}

function deathPhase(){
  const now = nowSec();
  for(const c of cells){
    if(c.dead) continue;
    if(c.energy <= 0){
      c.dead = true;
      lastMinuteHungerDeaths.push(now);
      Events.emit(EVT.DEATH, { id: c.id, stammId: c.stammId, reason: 'hunger' });
    }
  }
  while(lastMinuteHungerDeaths.length && now - lastMinuteHungerDeaths[0] > 60){
    lastMinuteHungerDeaths.shift();
  }
}

function crisisCheck(){
  if(lastMinuteHungerDeaths.length > 10 && worldTime - lastAidAt > AID_INTERVAL){
    lastAidAt = worldTime;
    for(let i=0;i<AID_FOOD;i++) if(foods.length < WORLD.maxFood) createFood();
    Events.emit(EVT.STATUS, { source:'world', text:'Nothilfe: zusätzlicher Nahrungsdrop.' });
  }
  const alive = cells.filter(c=>!c.dead).length;
  if(alive > 140){
    Events.emit(EVT.OVERPOP, { population: alive });
  }
}

let foodAcc = 0;
function foodSpawner(dt){
  const perSec = WORLD.foodRate / 60;
  foodAcc += perSec * dt;
  let n = Math.floor(foodAcc);
  if(n > 0){
    foodAcc -= n;
    for(let i=0;i<n;i++){
      if(foods.length < WORLD.maxFood) createFood();
    }
  }
}

// Hauptupdate
export function updateWorld(dt){
  worldTime += dt;
  runScheduler();

  foodSpawner(dt);
  const alive = cells.filter(c=>!c.dead);

  for (const c of alive) updateCellBehavior(c, alive, dt);
  eatPhase();

  evaluateMatingPairs(
    alive,
    (params) => createCell(params),
    { mutationRate: WORLD.mutationRate, relatednessFn: relatedness }
  );

  deathPhase();
  crisisCheck();

  if(!foundersEverMated && foundersIds.adam && foundersIds.eva){
    const kidsOfEva = cells.filter(c=>c.parents?.motherId === foundersIds.eva);
    foundersEverMated = kidsOfEva.some(k => k.parents?.fatherId === foundersIds.adam);
  }
}

// Darstellung
export function getFoundersState(){ return { ...foundersIds, foundersEverMated }; }
export function cellColor(c, highlightStammId){
  const col = getStammColor(c.stammId);
  if(highlightStammId!==null && c.stammId!==highlightStammId) return { fill: col, alpha: 0.25 };
  return { fill: col, alpha: 1 };
}