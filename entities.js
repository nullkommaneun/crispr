// entities.js – Welt, Zellen, Nahrung, Verhalten
// Spatial Grid + Scheduler + wandernde Food-Cluster
// Schlichtes, natürliches Verhalten:
//  - Hunger → Food-Priorität (Zielverfolgung)
//  - Sonst Paarungsanreiz: Gegengeschlecht, Bonus „anderer Stamm“,
//    Kompatibilität: Gene/Verwandtschaft, Distanz
//  - Sanfte Bewegungs-Glättung, Rand-Reflexion – KEINE Gegensteuerungs-Heuristiken

import { Events, EVT } from './event.js';
import { getStammColor, resetLegend } from './legend.js';
import { createGenome, survivalScore } from './genetics.js';
import { evaluateMatingPairs } from './reproduction.js';

/* =========================
   Welt-Config / öffentliche API
   ========================= */
const WORLD = {
  width: 800,
  height: 520,
  mutationRate: 0.10,   // 0..1 (Engine setzt 0..0.10)
  foodRate: 100,        // pro Minute (UI: /s → *60)
  maxFood: 400
};

export function getWorldConfig(){ return { ...WORLD }; }
export function setWorldSize(w, h){
  WORLD.width  = Math.max(50, w | 0);
  WORLD.height = Math.max(50, h | 0);
  gridResize();
  // Clusterzentren innerhalb der Fläche halten
  for (const c of FOOD_CLUSTERS){
    c.x = clamp(c.x, 20, WORLD.width  - 20);
    c.y = clamp(c.y, 20, WORLD.height - 20);
  }
}
export function setMutationRate(p){ WORLD.mutationRate = Math.max(0, Math.min(1, p)); }
export function setFoodRate(perMinute){ WORLD.foodRate = Math.max(0, perMinute | 0); }

/* =========================
   IDs / Container / Founders
   ========================= */
let nextCellId  = 1;
let nextFoodId  = 1;
let nextStammId = 1;

export function newStammId(){ return nextStammId++; }

export const cells = [];
export const foods = [];

let foundersIds       = { adam: null, eva: null };
let foundersEverMated = false;
const hungerDeaths    = []; // Zeitstempel der letzten 60 s

export function setFounders(adamId, evaId){ foundersIds = { adam: adamId, eva: evaId }; }
export function getFoundersState(){ return { ...foundersIds, foundersEverMated }; }

/* =========================
   Helpers / Parameter
   ========================= */
const clamp  = (v,min,max)=> Math.max(min, Math.min(max, v));
const nowSec = ()=> performance.now()/1000;
const dist2  = (dx,dy)=> dx*dx + dy*dy;

function distToWall(x,y){
  return Math.min(x, WORLD.width - x, y, WORLD.height - y);
}

/* =========================
   Spatial Grid
   ========================= */
const GRID = { size:48, cols:0, rows:0, foodB:[], cellB:[] };

function gi(x,y){
  const gx = Math.max(0, Math.min(GRID.cols-1, (x/GRID.size | 0)));
  const gy = Math.max(0, Math.min(GRID.rows-1, (y/GRID.size | 0)));
  return gy*GRID.cols + gx;
}
function gridResize(){
  GRID.cols = Math.max(1, Math.ceil(WORLD.width  / GRID.size));
  GRID.rows = Math.max(1, Math.ceil(WORLD.height / GRID.size));
  GRID.foodB = new Array(GRID.cols * GRID.rows); for(let i=0;i<GRID.foodB.length;i++) GRID.foodB[i] = [];
  GRID.cellB = new Array(GRID.cols * GRID.rows); for(let i=0;i<GRID.cellB.length;i++) GRID.cellB[i] = [];
  for (const f of foods) GRID.foodB[gi(f.x,f.y)].push(f);
}
function addFoodToGrid(f){ GRID.foodB[gi(f.x,f.y)].push(f); }
function removeFoodFromGrid(fid){
  for (const b of GRID.foodB){
    const i = b.findIndex(o => o.id === fid);
    if (i !== -1){ b.splice(i,1); return; }
  }
}
function rebuildCellGrid(alive){
  for (let i=0;i<GRID.cellB.length;i++) GRID.cellB[i].length = 0;
  for (const c of alive) GRID.cellB[gi(c.x,c.y)].push(c);
}
function* neighborFoods(x,y){
  const gx = Math.max(0, Math.min(GRID.cols-1, (x/GRID.size | 0)));
  const gy = Math.max(0, Math.min(GRID.rows-1, (y/GRID.size | 0)));
  for (let yy=gy-1; yy<=gy+1; yy++){
    if (yy<0||yy>=GRID.rows) continue;
    for (let xx=gx-1; xx<=gx+1; xx++){
      if (xx<0||xx>=GRID.cols) continue;
      yield* GRID.foodB[yy*GRID.cols + xx];
    }
  }
}
function* neighborCells(x,y){
  const gx = Math.max(0, Math.min(GRID.cols-1, (x/GRID.size | 0)));
  const gy = Math.max(0, Math.min(GRID.rows-1, (y/GRID.size | 0)));
  for (let yy=gy-1; yy<=gy+1; yy++){
    if (yy<0||yy>=GRID.rows) continue;
    for (let xx=gx-1; xx<=gx+1; xx++){
      if (xx<0||xx>=GRID.cols) continue;
      yield* GRID.cellB[yy*GRID.cols + xx];
    }
  }
}

/* =========================
   Scheduler / Weltzeit
   ========================= */
let worldTime = 0;
const scheduled = []; // { due:number, fn:Function }

export function schedule(fn, delaySec=0){
  scheduled.push({ due: worldTime + Math.max(0, delaySec), fn });
}
function runScheduler(){
  for (let i=scheduled.length-1; i>=0; i--){
    if (scheduled[i].due <= worldTime){
      const t = scheduled[i]; scheduled.splice(i,1);
      try{ t.fn(); }catch(e){ console.error('[Scheduler]', e); }
    }
  }
}

/* =========================
   Food-Cluster (Hotspots)
   ========================= */
const FOOD_CLUSTERS = [];
const CLUSTER_CONF = { count:3, driftSpeed:20, jitter:0.6, radius:80 };
const randRange = (a,b)=> a + Math.random()*(b-a);
function gauss(){ let u=0,v=0; while(u===0) u=Math.random(); while(v===0) v=Math.random(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }

function initFoodClusters(){
  FOOD_CLUSTERS.length = 0;
  for (let i=0;i<CLUSTER_CONF.count;i++){
    FOOD_CLUSTERS.push({
      x: randRange(WORLD.width*0.2, WORLD.width*0.8),
      y: randRange(WORLD.height*0.2, WORLD.height*0.8),
      vx: randRange(-1,1) * CLUSTER_CONF.driftSpeed,
      vy: randRange(-1,1) * CLUSTER_CONF.driftSpeed,
      rateMult: randRange(0.6, 1.4),
      acc: 0
    });
  }
}
function updateFoodClusters(dt){
  if (FOOD_CLUSTERS.length === 0) initFoodClusters();
  const perSecTotal   = (WORLD.foodRate / 60);
  const perCluster    = perSecTotal / FOOD_CLUSTERS.length;

  for (const c of FOOD_CLUSTERS){
    const angJitter = (Math.random()*2-1) * CLUSTER_CONF.jitter * dt;
    const ang = Math.atan2(c.vy, c.vx) + angJitter;
    const sp  = CLUSTER_CONF.driftSpeed;
    c.vx = Math.cos(ang) * sp; c.vy = Math.sin(ang) * sp;
    c.x += c.vx * dt;          c.y += c.vy * dt;

    if (c.x < 20){ c.x = 20; c.vx = Math.abs(c.vx); }
    if (c.x > WORLD.width - 20){ c.x = WORLD.width - 20; c.vx = -Math.abs(c.vx); }
    if (c.y < 20){ c.y = 20; c.vy = Math.abs(c.vy); }
    if (c.y > WORLD.height - 20){ c.y = WORLD.height - 20; c.vy = -Math.abs(c.vy); }

    c.acc += perCluster * c.rateMult * dt;
    while (c.acc >= 1 && foods.length < WORLD.maxFood){
      c.acc -= 1;
      const dx = gauss() * CLUSTER_CONF.radius * 0.5;
      const dy = gauss() * CLUSTER_CONF.radius * 0.5;
      const fx = clamp(c.x + dx, 2, WORLD.width  - 2);
      const fy = clamp(c.y + dy, 2, WORLD.height - 2);
      createFood({ x: fx, y: fy, value: 10 });
    }
  }
}

/* =========================
   Gene → abgeleitete Werte
   ========================= */
function n(v){ return (v-5)/4; }
function deriveFromGenes(g){
  const nTEM=n(g.TEM), nGRO=n(g.GRO), nEFF=n(g.EFF), nSCH=n(g.SCH);
  const v0=40, s0=90, baseScan=0.30, baseCD=6.0, r0=3, kR=1, cap0=36, base0=0.50, baseMove=0.0030;
  return {
    speedMax: Math.max(12, v0*(1+0.35*nTEM - 0.15*nGRO)),
    sense:    Math.max(30, s0*(1+0.40*nEFF + 0.20*nGRO)),
    scanInterval: Math.max(0.10, baseScan*(1 - 0.30*nTEM)),
    mateCooldown: Math.max(2.0,  baseCD  *(1 - 0.30*nTEM)),
    radius:  Math.max(2, r0 + kR*(g.GRO - 5)),
    energyCap: Math.max(16, cap0 * (1 + 0.50*nGRO)),
    baseDrain: Math.max(0.08, base0 * (1 + 0.25*nGRO - 0.15*nSCH)),
    moveCostPerSpeed: Math.max(0.0012, baseMove * (1 + 0.30*nTEM + 0.50*nGRO - 0.60*nEFF)),
    digestionMult: 1 + 0.30*nEFF,
    collisionMult: Math.max(0.3, 1 - 0.50*nSCH),
    mateEnergyThreshold: Math.max(8, 12*(1 + 0.45*nGRO - 0.25*nEFF)),
    mateEnergyCost:      Math.max(2, 3*(1 + 0.20*nGRO - 0.20*nEFF)),
  };
}

/* =========================
   Erzeugung (exportiert)
   ========================= */
export function createCell(params = {}){
  const id = params.id ?? nextCellId++;
  const parents = params.parents || null;
  let stammId = params.stammId ?? newStammId();

  // Geschlecht: 1.05 : 1 (m : f) → p_m ≈ 0.5122
  const MALE_RATIO = 1.05 / (1 + 1.05);
  const sex   = params.sex ?? (Math.random() < MALE_RATIO ? 'm' : 'f');

  const genes = params.genes ? { ...params.genes } : createGenome();
  const ang   = Math.random() * Math.PI * 2;

  const c = {
    id, name: params.name || `Zelle #${id}`,
    stammId, sex,
    x: params.x ?? Math.random()*WORLD.width,
    y: params.y ?? Math.random()*WORLD.height,
    vx: Math.cos(ang)*10, vy: Math.sin(ang)*10,
    genes, energy: params.energy ?? 22, age: 0, dead: false, parents,
    bornAt: nowSec(), lastMateAt: -999,
    // Laufzeitfelder (schlank)
    scanTimer: 0
  };
  const d = deriveFromGenes(c.genes); c.derived = d; c.radius = d.radius;
  c.scanTimer = Math.random()*d.scanInterval;

  cells.push(c);
  return c;
}

export function createFood(params = {}){
  const f = {
    id: params.id ?? nextFoodId++,
    x:  params.x ?? Math.random()*WORLD.width,
    y:  params.y ?? Math.random()*WORLD.height,
    value: params.value ?? 10
  };
  foods.push(f);
  addFoodToGrid(f);
  Events.emit(EVT.FOOD_SPAWN, { id: f.id });
  return f;
}

/* =========================
   Zähler / Darstellung
   ========================= */
export function getStammCounts(){
  const counts = {};
  for (const c of cells){ if (!c.dead) counts[c.stammId] = (counts[c.stammId] || 0) + 1; }
  return counts;
}
export function cellColor(c, highlightStammId){
  const col = getStammColor(c.stammId);
  if (highlightStammId !== null && c.stammId !== highlightStammId) return { fill: col, alpha: 0.25 };
  return { fill: col, alpha: 1 };
}

/* =========================
   Zielwahl
   ========================= */
function chooseFoodTarget(c){
  let best=null, bestScore=-Infinity;
  const sense2 = c.derived.sense * c.derived.sense;
  for (const f of neighborFoods(c.x,c.y)){
    const dx=f.x-c.x, dy=f.y-c.y; const d2=dx*dx+dy*dy;
    if (d2 > sense2) continue;
    const dist = Math.sqrt(Math.max(1,d2));
    const alpha = 1.5 - 0.3*((c.genes.EFF-5)/4) + 0.2*((c.genes.TEM-5)/4);
    const score = c.derived.digestionMult * f.value / Math.pow(dist+8, alpha);
    if (score > bestScore){ bestScore = score; best = f; }
  }
  if (best){
    c.target = { type:'food', id: best.id, x: best.x, y: best.y };
    return true;
  }
  return false;
}

function chooseMateTarget(c, alive){
  const tNow = nowSec();
  if ((tNow - (c.lastMateAt || 0)) < c.derived.mateCooldown) return false;
  if (c.energy < c.derived.mateEnergyThreshold) return false; // nicht bereit

  let best=null, bestScore=-Infinity;
  const sense2 = c.derived.sense * c.derived.sense;

  for (const o of neighborCells(c.x,c.y)){
    if (o===c || o.dead) continue;
    if (o.sex === c.sex) continue; // Gegengeschlecht
    if ((tNow - (o.lastMateAt || 0)) < (o.derived?.mateCooldown ?? 6)) continue;
    if (o.energy < (o.derived?.mateEnergyThreshold ?? 14)) continue;

    const dx=o.x-c.x, dy=o.y-c.y; const d2=dx*dx+dy*dy;
    if (d2 > sense2) continue;

    const dist = Math.max(1, Math.sqrt(d2));
    const distTerm = 1 / (dist + 8); // nah bevorzugt

    // leichte Bevorzugung anderer Stamm
    const cross = (o.stammId !== c.stammId) ? 1.15 : 1.0;

    // genetische Attraktivität (überlebensnahe Heuristik)
    const fit = survivalScore(o.genes) / 100;

    // geringe Verwandtschaft attraktiv (0..1 → 1 ideal)
    const rel = relatedness(c, o); // 0..1
    const compat = clamp(1 - 0.8*rel, 0.2, 1.0);

    const score = distTerm * cross * fit * compat;
    if (score > bestScore){ bestScore = score; best = o; }
  }

  if (best){
    c.target = { type:'mate', id: best.id, x: best.x, y: best.y };
    return true;
  }
  return false;
}

/* =========================
   Verhalten / Bewegung
   ========================= */
function updateCellBehavior(c, alive, dt){
  // Zielpflege (Target aktualisieren oder fallen lassen, wenn Objekt weg)
  if (c.target){
    if (c.target.type === 'food'){
      const f = foods.find(ff => ff.id === c.target.id);
      if (f){ c.target.x = f.x; c.target.y = f.y; } else c.target = null;
    } else if (c.target.type === 'mate'){
      const o = alive.find(x => x.id === c.target.id && !x.dead);
      if (o){ c.target.x = o.x; c.target.y = o.y; } else c.target = null;
    }
  }

  // Scannen
  c.scanTimer -= dt;
  const hungry = c.energy < 0.30 * c.derived.energyCap;
  if (c.scanTimer <= 0 || hungry || !c.target){
    let found = false;
    if (hungry) found = chooseFoodTarget(c);
    if (!found){
      found = chooseFoodTarget(c);
      if (!found) found = chooseMateTarget(c, alive);
    }
    c.scanTimer = c.derived.scanInterval;
  }

  // Wunschvektor
  let dVX=0, dVY=0;
  if (c.target){
    const dx = c.target.x - c.x, dy = c.target.y - c.y;
    const d  = Math.max(1, Math.hypot(dx,dy));
    const sp = c.derived.speedMax;
    dVX = (dx/d) * sp; dVY = (dy/d) * sp;
  }else{
    // leichte Eigenbewegung, damit niemand völlig einfriert
    const base = 0.15;
    c.wanderAng = (c.wanderAng ?? Math.random()*Math.PI*2) + (Math.random()*2-1)*base*dt;
    const sp = c.derived.speedMax * 0.4;
    dVX = Math.cos(c.wanderAng)*sp; dVY = Math.sin(c.wanderAng)*sp;
  }

  // sanfte Glättung
  c.vx = 0.85*c.vx + 0.15*dVX;
  c.vy = 0.85*c.vy + 0.15*dVY;

  // Bewegung + einfache Rand-Reflexion
  c.x += c.vx * dt; c.y += c.vy * dt;
  if (c.x < c.radius){ c.x = c.radius; c.vx = Math.abs(c.vx); }
  if (c.x > WORLD.width  - c.radius){ c.x = WORLD.width  - c.radius; c.vx = -Math.abs(c.vx); }
  if (c.y < c.radius){ c.y = c.radius; c.vy = Math.abs(c.vy); }
  if (c.y > WORLD.height - c.radius){ c.y = WORLD.height - c.radius; c.vy = -Math.abs(c.vy); }

  // Energie
  const speed = Math.hypot(c.vx,c.vy);
  c.energy -= (c.derived.baseDrain + c.derived.moveCostPerSpeed*speed) * dt;
  c.energy  = Math.min(c.energy, c.derived.energyCap);
  c.age    += dt;
}

/* =========================
   Eat / Death / Crisis
   ========================= */
function eatPhase(){
  for (const c of cells){
    if (c.dead) continue;
    for (const f of [...neighborFoods(c.x,c.y)]){
      const dx=c.x-f.x, dy=c.y-f.y;
      if (dist2(dx,dy) <= (c.radius+3)*(c.radius+3)){
        c.energy = Math.min(c.derived.energyCap, c.energy + f.value*c.derived.digestionMult);
        removeFoodFromGrid(f.id);
        const i = foods.findIndex(ff => ff.id === f.id); if (i !== -1) foods.splice(i,1);
      }
    }
  }
}
function deathPhase(){
  const t = nowSec();
  for (const c of cells){
    if (c.dead) continue;
    if (c.energy <= 0){
      c.dead = true; hungerDeaths.push(t);
      Events.emit(EVT.DEATH, { id:c.id, stammId:c.stammId, reason:'hunger' });
    }
  }
  while (hungerDeaths.length && t - hungerDeaths[0] > 60) hungerDeaths.shift();
}
function crisisCheck(){
  if (hungerDeaths.length > 10) Events.emit(EVT.HUNGER_CRISIS, { inLastMinute:hungerDeaths.length });
  const alive = cells.filter(c=>!c.dead).length;
  if (alive > 140) Events.emit(EVT.OVERPOP, { population: alive });
}

/* =========================
   Hauptupdate (exportiert)
   ========================= */
export function updateWorld(dt){
  worldTime += dt;
  runScheduler();

  updateFoodClusters(dt);

  const alive = cells.filter(c => !c.dead);
  rebuildCellGrid(alive);

  for (const c of alive) updateCellBehavior(c, alive, dt);
  eatPhase();

  evaluateMatingPairs(
    alive,
    (params)=>createCell(params),
    { mutationRate: WORLD.mutationRate, relatednessFn: relatedness, neighborQuery: (cell)=>neighborCells(cell.x,cell.y) }
  );

  deathPhase();
  crisisCheck();

  // Gründerliebe (Narrative)
  if (!foundersEverMated && foundersIds.adam && foundersIds.eva){
    const kids = cells.filter(x => x.parents?.motherId === foundersIds.eva);
    foundersEverMated = kids.some(k => k.parents?.fatherId === foundersIds.adam);
  }
}

/* =========================
   Verwandtschaft (exportiert)
   ========================= */
export function relatedness(a, b){
  if (a.id === b.id) return 1;
  const ancUp = (id, depth)=>{
    const map=new Map(); const q=[{id,d:0}];
    while(q.length){
      const { id:cur, d } = q.shift();
      const p=cells.find(x=>x.id===cur);
      if(!p?.parents) continue;
      const m=p.parents.motherId, f=p.parents.fatherId;
      if(m && d+1<=depth && !map.has(m)){ map.set(m,d+1); q.push({id:m,d:d+1}); }
      if(f && d+1<=depth && !map.has(f)){ map.set(f,d+1); q.push({id:f,d:d+1}); }
    }
    return map;
  };
  const A=ancUp(a.id,3), B=ancUp(b.id,3);
  let best=Infinity;
  for(const [aid,da] of A){ if(B.has(aid)){ const sum=da+B.get(aid); if(sum<best) best=sum; } }
  if(best===Infinity) return 0;
  return Math.pow(0.5, best);
}

/* ===== init ===== */
gridResize();
initFoodClusters();