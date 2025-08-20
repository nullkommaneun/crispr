// entities.js – Welt, Zellen, Nahrung, Verhalten
// Spatial Grid + wandernde Food-Cluster
// Natürliche, einfache Logik:
//  - Hunger → Food-Priorität
//  - satt → Paarungsanreiz: Gegengeschlecht, Bonus anderer Stamm, Fitness/Verwandtschaft
//  - Bewegung mit sanfter Glättung, Rand-Reflexion
// MET (Stoffwechsel) wirkt auf Basis-Drain & Hunger-Kurve

import { on, off, emit, once, EVT } from './event.js';
import { getStammColor } from './legend.js';
import { createGenome, survivalScore } from './genetics.js';
import { evaluateMatingPairs } from './reproduction.js';

/* ===== Welt-Config ===== */
const WORLD = { width: 800, height: 520, mutationRate: 0.10, foodRate: 100, maxFood: 400 };

export function getWorldConfig(){ return { ...WORLD }; }
export function setWorldSize(w, h){
  WORLD.width  = Math.max(50, w | 0);
  WORLD.height = Math.max(50, h | 0);
  gridResize();
  for (const c of FOOD_CLUSTERS){
    c.x = clamp(c.x, 20, WORLD.width  - 20);
    c.y = clamp(c.y, 20, WORLD.height - 20);
  }
}
export function setMutationRate(p){ WORLD.mutationRate = Math.max(0, Math.min(1, p)); }
export function setFoodRate(perMinute){ WORLD.foodRate = Math.max(0, perMinute | 0); }

/* ===== IDs / Container ===== */
let nextCellId  = 1;
let nextFoodId  = 1;
let nextStammId = 1;
export function newStammId(){ return nextStammId++; }

export const cells = [];
export const foods = [];

let foundersIds       = { adam: null, eva: null };
let foundersEverMated = false;
const hungerDeaths    = [];

/* Founders/Narrativ */
export function setFounders(adamId, evaId){ foundersIds = { adam: adamId, eva: evaId }; }
export function getFoundersState(){ return { ...foundersIds, foundersEverMated }; }

/* ===== Helpers / Ableitungen ===== */
const clamp  = (v,min,max)=> Math.max(min, Math.min(max, v));
const nowSec = ()=> performance.now()/1000;
const dist2  = (dx,dy)=> dx*dx + dy*dy;
const n = x => (x-5)/4; // -1..1

function deriveFromGenes(g){
  const v0=40, s0=90, baseScan=0.30, baseCD=6.0, r0=3, kR=1, cap0=36;
  const tem=n(g.TEM), gro=n(g.GRO), eff=n(g.EFF), sch=n(g.SCH), met=n(g.MET);
  return {
    speedMax: Math.max(12, v0 * (1 + 0.35*tem - 0.15*gro)),
    sense:    Math.max(30, s0 * (1 + 0.35*eff + 0.15*gro)),
    scanInterval: Math.max(0.10, baseScan * (1 - 0.25*tem)),
    mateCooldown: Math.max(2.0,  baseCD * (1 - 0.15*tem)),
    radius:   Math.max(2, r0 + kR*(g.GRO - 5)),
    energyCap:Math.max(16, cap0*(1 + 0.50*gro)),
    baseDrain: Math.max(0.06, 0.50 * (1 + 0.40*met + 0.20*gro - 0.25*eff)),
    moveCostPerSpeed: Math.max(0.0010, 0.0030 * (1 + 0.20*tem + 0.40*gro - 0.50*eff)),
    digestionMult: 1 + 0.30*eff,
    hungerSteep: 3.0 + 0.40*met - 0.20*eff,
    hungerTarget: 0.65
  };
}

/* ===== Spatial Grid ===== */
const GRID = { size:48, cols:0, rows:0, foodB:[], cellB:[] };
function gi(x,y){ const gx=Math.max(0,Math.min(GRID.cols-1,(x/GRID.size|0))); const gy=Math.max(0,Math.min(GRID.rows-1,(y/GRID.size|0))); return gy*GRID.cols+gx; }
function gridResize(){
  GRID.cols=Math.max(1,Math.ceil(WORLD.width/GRID.size));
  GRID.rows=Math.max(1,Math.ceil(WORLD.height/GRID.size));
  GRID.foodB=new Array(GRID.cols*GRID.rows); for(let i=0;i<GRID.foodB.length;i++) GRID.foodB[i]=[];
  GRID.cellB=new Array(GRID.cols*GRID.rows); for(let i=0;i<GRID.cellB.length;i++) GRID.cellB[i]=[];
  for(const f of foods) GRID.foodB[gi(f.x,f.y)].push(f);
}
function addFoodToGrid(f){ GRID.foodB[gi(f.x,f.y)].push(f); }
function removeFoodFromGrid(fid){ for(const b of GRID.foodB){ const i=b.findIndex(o=>o.id===fid); if(i!==-1){ b.splice(i,1); return; } } }
function rebuildCellGrid(alive){ for(let i=0;i<GRID.cellB.length;i++) GRID.cellB[i].length=0; for(const c of alive) GRID.cellB[gi(c.x,c.y)].push(c); }
function* neighborFoods(x,y){
  const gx=Math.max(0,Math.min(GRID.cols-1,(x/GRID.size|0))); const gy=Math.max(0,Math.min(GRID.rows-1,(y/GRID.size|0)));
  for(let yy=gy-1;yy<=gy+1;yy++){ if(yy<0||yy>=GRID.rows) continue; for(let xx=gx-1;xx<=gx+1;xx++){ if(xx<0||xx>=GRID.cols) continue; yield* GRID.foodB[yy*GRID.cols+xx]; } }
}
function* neighborCells(x,y){
  const gx=Math.max(0,Math.min(GRID.cols-1,(x/GRID.size|0))); const gy=Math.max(0,Math.min(GRID.rows-1,(y/GRID.size|0)));
  for(let yy=gy-1;yy<=gy+1;yy++){ if(yy<0||yy>=GRID.rows) continue; for(let xx=gx-1;xx<=gx+1;xx++){ if(xx<0||xx>=GRID.cols) continue; yield* GRID.cellB[yy*GRID.cols+xx]; } }
}

/* ===== Scheduler ===== */
let worldTime = 0;
const scheduled = [];
export function schedule(fn, delaySec=0){ scheduled.push({ due: worldTime + Math.max(0, delaySec), fn }); }
function runScheduler(){ for(let i=scheduled.length-1;i>=0;i--){ if(scheduled[i].due <= worldTime){ const t=scheduled[i]; scheduled.splice(i,1); try{ t.fn(); }catch(e){ console.error('[Scheduler]', e); } } } }

/* ===== Food-Cluster ===== */
const FOOD_CLUSTERS = [];
const CLUSTER_CONF = { count:3, driftSpeed:20, jitter:0.6, radius:80 };
const randRange=(a,b)=> a + Math.random()*(b-a);
function gauss(){ let u=0,v=0; while(u===0) u=Math.random(); while(v===0) v=Math.random(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
function initFoodClusters(){
  FOOD_CLUSTERS.length=0;
  for(let i=0;i<CLUSTER_CONF.count;i++){
    FOOD_CLUSTERS.push({ x:randRange(WORLD.width*0.2, WORLD.width*0.8), y:randRange(WORLD.height*0.2, WORLD.height*0.8),
      vx:randRange(-1,1)*CLUSTER_CONF.driftSpeed, vy:randRange(-1,1)*CLUSTER_CONF.driftSpeed, rateMult:randRange(0.6,1.4), acc:0 });
  }
}
function updateFoodClusters(dt){
  if(FOOD_CLUSTERS.length===0) initFoodClusters();
  const perSecTotal=(WORLD.foodRate/60), perCl=perSecTotal/FOOD_CLUSTERS.length;
  for(const c of FOOD_CLUSTERS){
    const jitter=(Math.random()*2-1)*CLUSTER_CONF.jitter*dt;
    const ang=Math.atan2(c.vy,c.vx)+jitter; const sp=CLUSTER_CONF.driftSpeed;
    c.vx=Math.cos(ang)*sp; c.vy=Math.sin(ang)*sp; c.x+=c.vx*dt; c.y+=c.vy*dt;
    if(c.x<20){ c.x=20; c.vx=Math.abs(c.vx);} if(c.x>WORLD.width-20){ c.x=WORLD.width-20; c.vx=-Math.abs(c.vx);}
    if(c.y<20){ c.y=20; c.vy=Math.abs(c.vy);} if(c.y>WORLD.height-20){ c.y=WORLD.height-20; c.vy=-Math.abs(c.vy);}
    c.acc += perCl*c.rateMult*dt;
    while(c.acc>=1 && foods.length<WORLD.maxFood){
      c.acc -= 1;
      const dx=gauss()*CLUSTER_CONF.radius*0.5, dy=gauss()*CLUSTER_CONF.radius*0.5;
      const fx=clamp(c.x+dx,2,WORLD.width-2), fy=clamp(c.y+dy,2,WORLD.height-2);
      createFood({ x:fx, y:fy, value:10 });
    }
  }
}

/* ===== Erzeugung ===== */
export function createCell(params = {}){
  const id = params.id ?? nextCellId++;
  const parents = params.parents || null;
  let stammId = params.stammId ?? newStammId();

  // Geschlechterquote ~1.05 : 1 (m : f)
  const PM = 1.05 / (1+1.05);
  const sex = params.sex ?? (Math.random() < PM ? 'm' : 'f');

  const genes = params.genes ? { ...params.genes } : createGenome();
  const ang   = Math.random()*Math.PI*2;

  const c = {
    id, name: params.name || `Zelle #${id}`,
    stammId, sex,
    x: params.x ?? Math.random()*WORLD.width,
    y: params.y ?? Math.random()*WORLD.height,
    vx: Math.cos(ang)*10, vy: Math.sin(ang)*10,
    genes, energy: params.energy ?? 22, age:0, dead:false, parents,
    bornAt: nowSec(), lastMateAt:-999,
    scanTimer:0
  };
  const d = deriveFromGenes(c.genes); c.derived=d; c.radius=d.radius;
  c.scanTimer = Math.random()*d.scanInterval;

  cells.push(c);
  return c;
}

export function createFood(params = {}){
  const f = { id: params.id ?? nextFoodId++, x: params.x ?? Math.random()*WORLD.width, y: params.y ?? Math.random()*WORLD.height, value: params.value ?? 10 };
  foods.push(f); addFoodToGrid(f); emit(EVT.FOOD_SPAWN,{id:f.id});
  return f;
}

/* ===== Zähler / Darstellung ===== */
export function getStammCounts(){
  const counts={}; for(const c of cells){ if(!c.dead) counts[c.stammId]=(counts[c.stammId]||0)+1; }
  return counts;
}
export function cellColor(c, highlightStammId){
  const col = getStammColor(c.stammId);
  if (highlightStammId!==null && c.stammId!==highlightStammId) return { fill: col, alpha: 0.25 };
  return { fill: col, alpha: 1 };
}

/* ===== Zielwahl ===== */
function chooseFoodTarget(c){
  let best=null, bestScore=-Infinity;
  const sense2=c.derived.sense*c.derived.sense;
  for(const f of neighborFoods(c.x,c.y)){
    const dx=f.x-c.x, dy=f.y-c.y; const d2=dx*dx+dy*dy;
    if(d2>sense2) continue;
    const dist=Math.sqrt(Math.max(1,d2));
    const alpha=1.5 - 0.3*n(c.genes.EFF) + 0.2*n(c.genes.TEM);
    const score=c.derived.digestionMult * f.value / Math.pow(dist+8, alpha);
    if(score>bestScore){ bestScore=score; best=f; }
  }
  if(best){ c.target={ type:'food', id:best.id, x:best.x, y:best.y }; return true; }
  return false;
}

function relatednessLocal(a,b){
  // lokale Ahnenprüfung (Tiefe 3) genügt für Kompatibilität
  const ancUp=(id,depth)=>{
    const set=new Set(); const q=[{id,d:0}];
    while(q.length){
      const it=q.shift(); const p=cells.find(x=>x.id===it.id);
      if(!p?.parents) continue;
      const m=p.parents.motherId, f=p.parents.fatherId;
      if(m && it.d+1<=depth && !set.has(m)){ set.add(m); q.push({id:m,d:it.d+1}); }
      if(f && it.d+1<=depth && !set.has(f)){ set.add(f); q.push({id:f,d:it.d+1}); }
    }
    return set;
  };
  const A=ancUp(a.id,3), B=ancUp(b.id,3);
  for(const id of A){ if(B.has(id)) return 0.25; } // grob Cousin
  return 0;
}

function chooseMateTarget(c, alive){
  const tNow = nowSec();
  if((tNow-(c.lastMateAt||0))< (c.derived?.mateCooldown ?? 6)) return false;
  if(c.energy < (c.derived?.mateEnergyThreshold ?? 14)) return false;

  let best=null, bestScore=-Infinity;
  const sense2=c.derived.sense*c.derived.sense;

  for(const o of neighborCells(c.x,c.y)){
    if(o===c || o.dead) continue;
    if(o.sex===c.sex) continue;

    const dx=o.x-c.x, dy=o.y-c.y; const d2=dx*dx+dy*dy;
    if(d2>sense2) continue;

    const dist=Math.max(1, Math.sqrt(d2));
    const prox=1/(dist+8);
    const fit=(survivalScore(o.genes)/100);
    const rel=relatednessLocal(c,o);
    const compat=Math.max(0.2, 1-0.8*rel*4);
    const cross=(o.stammId!==c.stammId)?1.15:1.0;

    const score = prox * fit * compat * cross;
    if(score>bestScore){ bestScore=score; best=o; }
  }

  if(best){ c.target={type:'mate', id:best.id, x:best.x, y:best.y }; return true; }
  return false;
}

/* ===== Verhalten / Bewegung ===== */
function updateCellBehavior(c, alive, dt){
  // Zielpflege
  if(c.target){
    if(c.target.type==='food'){
      const f=foods.find(ff=>ff.id===c.target.id);
      if(f){ c.target.x=f.x; c.target.y=f.y; } else c.target=null;
    }else if(c.target.type==='mate'){
      const o=alive.find(x=>x.id===c.target.id && !x.dead);
      if(o){ c.target.x=o.x; c.target.y=o.y; } else c.target=null;
    }
  }

  // Hunger entscheidet über Priorität
  const d=c.derived;
  const hunger = 1/(1+Math.exp(-d.hungerSteep * ((d.hungerTarget*d.energyCap - c.energy)/d.energyCap)));
  const wantsFood = hunger > 0.5;

  // Scannen
  c.scanTimer -= dt;
  if(c.scanTimer<=0 || !c.target){
    let found=false;
    if(wantsFood) found = chooseFoodTarget(c);
    if(!found)    found = chooseFoodTarget(c);
    if(!found)    found = chooseMateTarget(c, alive);
    if(!found && !c.target){
      c.wanderAng=(c.wanderAng ?? Math.random()*Math.PI*2)+(Math.random()*2-1)*0.2*dt;
      const sp=c.derived.speedMax*0.4;
      c.vx = 0.85*c.vx + 0.15*Math.cos(c.wanderAng)*sp;
      c.vy = 0.85*c.vy + 0.15*Math.sin(c.wanderAng)*sp;
    }
    c.scanTimer = d.scanInterval;
  }

  // Zielverfolgung
  if(c.target){
    const dx=c.target.x-c.x, dy=c.target.y-c.y;
    const dist=Math.max(1, Math.hypot(dx,dy));
    const sp=c.derived.speedMax;
    const dvx=(dx/dist)*sp, dvy=(dy/dist)*sp;
    c.vx = 0.85*c.vx + 0.15*dvx;
    c.vy = 0.85*c.vy + 0.15*dvy;
  }

  // Bewegung + Rand-Reflexion
  c.x += c.vx*dt; c.y += c.vy*dt;
  if(c.x<c.radius){ c.x=c.radius; c.vx=Math.abs(c.vx); }
  if(c.x>WORLD.width-c.radius){ c.x=WORLD.width-c.radius; c.vx=-Math.abs(c.vx); }
  if(c.y<c.radius){ c.y=c.radius; c.vy=Math.abs(c.vy); }
  if(c.y>WORLD.height-c.radius){ c.y=WORLD.height-c.radius; c.vy=-Math.abs(c.vy); }

  // Energie
  const speed=Math.hypot(c.vx,c.vy);
  c.energy -= (d.baseDrain + d.moveCostPerSpeed*speed) * dt;
  c.energy  = Math.min(c.energy, d.energyCap);
  c.age    += dt;
}

/* ===== Eat / Death / Crisis ===== */
function eatPhase(){
  for(const c of cells){
    if(c.dead) continue;
    for(const f of [...neighborFoods(c.x,c.y)]){
      const dx=c.x-f.x, dy=c.y-f.y;
      if(dist2(dx,dy) <= (c.radius+3)*(c.radius+3)){
        c.energy = Math.min(c.derived.energyCap, c.energy + f.value*c.derived.digestionMult);
        removeFoodFromGrid(f.id);
        const i=foods.findIndex(ff=>ff.id===f.id); if(i!==-1) foods.splice(i,1);
      }
    }
  }
}
function deathPhase(){
  const t=nowSec();
  for(const c of cells){
    if(c.dead) continue;
    if(c.energy<=0){
      c.dead=true; hungerDeaths.push(t);
      emit(EVT.DEATH,{id:c.id, stammId:c.stammId, reason:'hunger'});
    }
  }
  while(hungerDeaths.length && t-hungerDeaths[0] > 60) hungerDeaths.shift();
}
function crisisCheck(){
  if(hungerDeaths.length>10) emit(EVT.HUNGER_CRISIS,{inLastMinute:hungerDeaths.length});
  const alive=cells.filter(c=>!c.dead).length;
  if(alive>140) emit(EVT.OVERPOP,{population:alive});
}

/* ===== Hauptupdate ===== */
export function updateWorld(dt){
  worldTime += dt; runScheduler(); updateFoodClusters(dt);
  const alive=cells.filter(c=>!c.dead); rebuildCellGrid(alive);

  for(const c of alive) updateCellBehavior(c, alive, dt);
  eatPhase();

  evaluateMatingPairs(alive, (p)=>createCell(p), {
    mutationRate: WORLD.mutationRate,
    relatednessFn: (a,b)=>relatednessLocal(a,b),
    neighborQuery: (cell)=>neighborCells(cell.x,cell.y)
  });

  deathPhase(); crisisCheck();

  if(!foundersEverMated && foundersIds.adam && foundersIds.eva){
    const kids=cells.filter(x=>x.parents?.motherId===foundersIds.eva);
    foundersEverMated = kids.some(k=>k.parents?.fatherId===foundersIds.adam);
  }
}

/* ===== init ===== */
gridResize();
initFoodClusters();