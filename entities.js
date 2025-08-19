// entities.js – Welt, Zellen, Nahrung, Verhalten (Spatial Grid + Scheduler + Food-Cluster)

import { Events, EVT } from './event.js';
import { getStammColor, resetLegend } from './legend.js';
import { createGenome } from './genetics.js';
import { evaluateMatingPairs } from './reproduction.js';

const WORLD = {
  width: 800,
  height: 520,
  mutationRate: 0.10,
  foodRate: 100,   // Gesamtziel pro Minute (wird auf Cluster verteilt)
  maxFood: 400
};

let nextCellId = 1, nextFoodId = 1, nextStammId = 1;

export const cells = [];
export const foods = [];

const pedigree = new Map();
const lastMinuteHungerDeaths = [];
let foundersIds = { adam: null, eva: null };
let foundersEverMated = false;

// ---------- Spatial Grid ----------
const GRID = { size:48, cols:0, rows:0, foodB:[], cellB:[] };

function gi(x,y){
  const gx=Math.max(0,Math.min(GRID.cols-1,(x/GRID.size|0)));
  const gy=Math.max(0,Math.min(GRID.rows-1,(y/GRID.size|0)));
  return gy*GRID.cols+gx;
}
function gridResize(){
  GRID.cols=Math.max(1,Math.ceil(WORLD.width/GRID.size));
  GRID.rows=Math.max(1,Math.ceil(WORLD.height/GRID.size));
  GRID.foodB=new Array(GRID.cols*GRID.rows); for(let i=0;i<GRID.foodB.length;i++) GRID.foodB[i]=[];
  GRID.cellB=new Array(GRID.cols*GRID.rows); for(let i=0;i<GRID.cellB.length;i++) GRID.cellB[i]=[];
  for(const f of foods) GRID.foodB[gi(f.x,f.y)].push(f);
}
function addFoodToGrid(f){ GRID.foodB[gi(f.x,f.y)].push(f); }
function removeFoodFromGrid(fid){
  for(const b of GRID.foodB){
    const i=b.findIndex(o=>o.id===fid);
    if(i!==-1){ b.splice(i,1); return; }
  }
}
function rebuildCellGrid(alive){
  for(let i=0;i<GRID.cellB.length;i++) GRID.cellB[i].length=0;
  for(const c of alive) GRID.cellB[gi(c.x,c.y)].push(c);
}
function* neighborFoods(x,y){
  const gx=Math.max(0,Math.min(GRID.cols-1,(x/GRID.size|0)));
  const gy=Math.max(0,Math.min(GRID.rows-1,(y/GRID.size|0)));
  for(let yy=gy-1;yy<=gy+1;yy++){
    if(yy<0||yy>=GRID.rows) continue;
    for(let xx=gx-1;xx<=gx+1;xx++){
      if(xx<0||xx>=GRID.cols) continue;
      yield* GRID.foodB[yy*GRID.cols+xx];
    }
  }
}
function* neighborCells(x,y){
  const gx=Math.max(0,Math.min(GRID.cols-1,(x/GRID.size|0)));
  const gy=Math.max(0,Math.min(GRID.rows-1,(y/GRID.size|0)));
  for(let yy=gy-1;yy<=gy+1;yy++){
    if(yy<0||yy>=GRID.rows) continue;
    for(let xx=gx-1;xx<=gx+1;xx++){
      if(xx<0||xx>=GRID.cols) continue;
      yield* GRID.cellB[yy*GRID.cols+xx];
    }
  }
}

// ---------- Weltzeit & Scheduler ----------
let worldTime = 0;
const scheduled = []; // {due:number, fn:Function}
/** Führt fn nach delaySec Simulationssekunden aus (wirkt mit Timescale) */
export function schedule(fn, delaySec=0){ scheduled.push({ due: worldTime + Math.max(0, delaySec), fn }); }
function runScheduler(){
  for(let i=scheduled.length-1;i>=0;i--){
    if(scheduled[i].due <= worldTime){
      const t=scheduled[i]; scheduled.splice(i,1);
      try{ t.fn(); }catch(e){ console.error('[Scheduler]', e); }
    }
  }
}

// ---------- Food-Cluster (wandernde Hotspots) ----------
/**
 * Jedes Cluster spawnt Food in seiner Nähe (Gauss-Distribution) und driftet langsam.
 * rateMult: 0.6..1.4 → individuelle Abweichung von der globalen foodRate.
 */
const FOOD_CLUSTERS = [];
const CLUSTER_CONF = {
  count: 3,
  driftSpeed: 20,       // px/s (langsam)
  jitter: 0.6,          // zufällige Richtungsänderung
  radius: 80,           // Spawn-Streuung (σ)
};

function randRange(a,b){ return a + Math.random()*(b-a); }
function gauss(){ // Box-Muller
  let u=0, v=0; while(u===0) u=Math.random(); while(v===0) v=Math.random();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

function initFoodClusters(){
  FOOD_CLUSTERS.length = 0;
  for(let i=0;i<CLUSTER_CONF.count;i++){
    FOOD_CLUSTERS.push({
      x: randRange(WORLD.width*0.2, WORLD.width*0.8),
      y: randRange(WORLD.height*0.2, WORLD.height*0.8),
      vx: randRange(-1,1) * CLUSTER_CONF.driftSpeed,
      vy: randRange(-1,1) * CLUSTER_CONF.driftSpeed,
      rateMult: randRange(0.6, 1.4),
      acc: 0 // Spawn-Akkumulator
    });
  }
}
function updateFoodClusters(dt){
  if(FOOD_CLUSTERS.length===0) initFoodClusters();

  // Gesamt-Spawnrate (pro Sekunde) aus UI foodRate
  const totalPerSec = (WORLD.foodRate / 60);
  const basePerCluster = totalPerSec / FOOD_CLUSTERS.length;

  for(const c of FOOD_CLUSTERS){
    // Driften
    const angJitter = (Math.random()*2-1) * CLUSTER_CONF.jitter * dt;
    const ang = Math.atan2(c.vy, c.vx) + angJitter;
    const sp = CLUSTER_CONF.driftSpeed;
    c.vx = Math.cos(ang) * sp;
    c.vy = Math.sin(ang) * sp;

    c.x += c.vx * dt;
    c.y += c.vy * dt;

    // sanft an Rändern reflektieren
    if(c.x < 30){ c.x=30; c.vx = Math.abs(c.vx); }
    if(c.x > WORLD.width-30){ c.x=WORLD.width-30; c.vx = -Math.abs(c.vx); }
    if(c.y < 30){ c.y=30; c.vy = Math.abs(c.vy); }
    if(c.y > WORLD.height-30){ c.y=WORLD.height-30; c.vy = -Math.abs(c.vy); }

    // Spawner
    const perSec = basePerCluster * c.rateMult;
    c.acc += perSec * dt;

    // Spawn nur solange wir unter maxFood liegen
    while(c.acc >= 1 && foods.length < WORLD.maxFood){
      c.acc -= 1;

      // Gauss-Offset um das Clusterzentrum
      const dx = gauss() * CLUSTER_CONF.radius * 0.5;
      const dy = gauss() * CLUSTER_CONF.radius * 0.5;
      const fx = clamp(c.x + dx, 2, WORLD.width-2);
      const fy = clamp(c.y + dy, 2, WORLD.height-2);
      createFood({ x: fx, y: fy, value: 10 });
    }
  }
}

// ---------- Welt-API ----------
export function setWorldSize(w,h){
  WORLD.width=Math.max(50,w|0);
  WORLD.height=Math.max(50,h|0);
  gridResize();
  // Clusterränder berücksichtigen (zentren im Bereich halten)
  for(const c of FOOD_CLUSTERS){
    c.x = clamp(c.x, 30, WORLD.width-30);
    c.y = clamp(c.y, 30, WORLD.height-30);
  }
}
export function setMutationRate(p){ WORLD.mutationRate=Math.max(0,Math.min(1,p)); }
export function setFoodRate(perMinute){ WORLD.foodRate=Math.max(0, perMinute|0); }
export function getWorldConfig(){ return {...WORLD}; }

export function resetEntities(){
  cells.length=0; foods.length=0; pedigree.clear(); resetLegend(); lastMinuteHungerDeaths.length=0;
  foundersIds={adam:null,eva:null}; foundersEverMated=false;
  nextCellId=1; nextFoodId=1; nextStammId=1;
  worldTime=0; scheduled.length=0;
  gridResize();
  initFoodClusters();
  Events.emit(EVT.RESET,{});
}
export function newStammId(){ return nextStammId++; }

// ---------- Abgeleitete Werte (Gene) ----------
function n(v){ return (v-5)/4; }
function deriveFromGenes(g){
  const nTEM=n(g.TEM), nGRO=n(g.GRO), nEFF=n(g.EFF), nSCH=n(g.SCH);
  const v0=40, s0=90, baseScan=0.30, baseCD=6.0, r0=3, kR=1, cap0=36, base0=0.50, baseMove=0.0030;
  return {
    speedMax: Math.max(12, v0*(1+0.35*nTEM-0.15*nGRO)),
    sense: Math.max(30, s0*(1+0.40*nEFF+0.20*nGRO)),
    scanInterval: Math.max(0.10, baseScan*(1-0.30*nTEM)),
    mateCooldown: Math.max(2.0, baseCD*(1-0.30*nTEM)),
    radius: Math.max(2, r0+kR*(g.GRO-5)),
    energyCap: Math.max(16, cap0*(1+0.50*nGRO)),
    baseDrain: Math.max(0.08, base0*(1+0.25*nGRO-0.15*nSCH)),
    moveCostPerSpeed: Math.max(0.0012, baseMove*(1+0.30*nTEM+0.50*nGRO-0.60*nEFF)),
    digestionMult: 1+0.30*nEFF,
    collisionMult: Math.max(0.3, 1-0.50*nSCH),
    mateEnergyThreshold: Math.max(8, 12*(1+0.45*nGRO-0.25*nEFF)),
    mateEnergyCost: Math.max(2, 3*(1+0.20*nGRO-0.20*nEFF)),
  };
}
function applyDerived(c){
  const d=deriveFromGenes(c.genes); c.derived=d; c.radius=d.radius;
  if(c.vx===undefined || c.vy===undefined){ const ang=Math.random()*Math.PI*2; c.vx=Math.cos(ang)*10; c.vy=Math.sin(ang)*10; }
  c.scanTimer=Math.random()*d.scanInterval; c.target=null;
}

// ---------- Speciation ----------
const SPEC={ split:{ sum:7, max:3, crossBonus:-2, randomProb:0.003 } };
function sumAbsDiff(a,b){ return Math.abs(a.TEM-b.TEM)+Math.abs(a.GRO-b.GRO)+Math.abs(a.EFF-b.EFF)+Math.abs(a.SCH-b.SCH); }
function maxAbsDiff(a,b){ return Math.max(Math.abs(a.TEM-b.TEM),Math.abs(a.GRO-b.GRO),Math.abs(a.EFF-b.EFF),Math.abs(a.SCH-b.SCH)); }

// ---------- Erzeuger ----------
export function createCell(params={}){
  const id=params.id??nextCellId++; const parents=params.parents||null;
  let stammId=params.stammId??newStammId();

  if(!params.noSplit && parents?.motherId){
    const mother=cells.find(c=>c.id===parents.motherId);
    const father=parents.fatherId?cells.find(c=>c.id===parents.fatherId):null;
    if(mother){
      const sum=sumAbsDiff(params.genes,mother.genes);
      const mx=maxAbsDiff(params.genes,mother.genes);
      const cross=!!(father && mother.stammId!==father.stammId);
      const thresh=SPEC.split.sum + (cross?SPEC.split.crossBonus:0);
      if(sum>=thresh || mx>=SPEC.split.max || Math.random()<SPEC.split.randomProb){
        stammId=newStammId();
        Events.emit(EVT.TIP,{label:'Tipp', text:`Neuer Stamm ${stammId} abgespalten.`});
      }
    }
  }

  const sex=params.sex??(Math.random()<0.5?'m':'f'); const genes=params.genes?{...params.genes}:createGenome(); const angle=Math.random()*Math.PI*2;
  const c={ id, name:params.name||`Zelle #${id}`, stammId, sex,
            x:params.x??Math.random()*WORLD.width, y:params.y??Math.random()*WORLD.height,
            vx:Math.cos(angle)*10, vy:Math.sin(angle)*10,
            genes, energy:params.energy??22, age:0, dead:false, parents,
            bornAt:performance.now()/1000, lastMateAt:-999 };
  applyDerived(c); cells.push(c);
  pedigree.set(c.id,{motherId:c.parents?.motherId??null, fatherId:c.parents?.fatherId??null, stammId:c.stammId});
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
  addFoodToGrid(f);
  Events.emit(EVT.FOOD_SPAWN, {id: f.id});
  return f;
}

// ---------- Zähler / Export ----------
export function getStammCounts(){ const counts={}; for(const c of cells){ if(c.dead) continue; counts[c.stammId]=(counts[c.stammId]||0)+1; } return counts; }
export function setFounders(adamId,evaId){ foundersIds = {adam: adamId, eva: evaId}; }

export function exportState(){
  return JSON.stringify({
    WORLD,nextCellId,nextFoodId,nextStammId,
    cells:cells.filter(c=>!c.dead).map(c=>({
      id:c.id,name:c.name,stammId:c.stammId,sex:c.sex,
      x:c.x,y:c.y,vx:c.vx,vy:c.vy,genes:c.genes,radius:c.radius,
      energy:c.energy,age:c.age,parents:c.parents,bornAt:c.bornAt,lastMateAt:c.lastMateAt
    })),
    foods, foundersIds
  }, null, 2);
}
export function importState(json){
  const data=typeof json==='string'?JSON.parse(json):json;
  resetEntities(); Object.assign(WORLD,data.WORLD); gridResize();
  nextCellId=data.nextCellId; nextFoodId=data.nextFoodId; nextStammId=data.nextStammId;
  for(const c of data.cells){
    const cc={...c,dead:false}; applyDerived(cc); cells.push(cc);
    pedigree.set(cc.id,{motherId:cc.parents?.motherId??null,fatherId:cc.parents?.fatherId??null,stammId:cc.stammId});
  }
  for(const f of data.foods){ foods.push({...f}); addFoodToGrid(f); }
  foundersIds=data.foundersIds||foundersIds;
}

// ---------- Verwandtschaft ----------
export function relatedness(a,b){
  if(a.id===b.id) return 1;
  const mapA=ancUp(a.id,3), mapB=ancUp(b.id,3); let best=Infinity;
  for(const [aid,da] of mapA){ if(mapB.has(aid)){ const sum=da+mapB.get(aid); if(sum<best) best=sum; } }
  if(best===Infinity) return 0;
  return Math.pow(0.5, best);
}
function ancUp(id,depth){
  const map=new Map(); const q=[{id,d:0}];
  while(q.length){
    const {id:cur,d}=q.shift();
    const p=pedigree.get(cur); if(!p) continue;
    if(p.motherId && d+1<=depth){ if(!map.has(p.motherId)) map.set(p.motherId,d+1); q.push({id:p.motherId,d:d+1}); }
    if(p.fatherId && d+1<=depth){ if(!map.has(p.fatherId)) map.set(p.fatherId,d+1); q.push({id:p.fatherId,d:d+1}); }
  }
  return map;
}

// ---------- Verhalten ----------
function chooseFoodTarget(c){
  let best=null, bestScore=-Infinity;
  for(const f of neighborFoods(c.x,c.y)){
    const dx=f.x-c.x, dy=f.y-c.y; const d2=dx*dx+dy*dy;
    if(d2 > c.derived.sense*c.derived.sense) continue;
    const dist=Math.sqrt(Math.max(1,d2));
    const alpha=1.5 - 0.3*((c.genes.EFF-5)/4) + 0.2*((c.genes.TEM-5)/4);
    const score=c.derived.digestionMult * f.value / Math.pow(dist+8, alpha);
    if(score>bestScore){ bestScore=score; best=f; }
  }
  if(best){ c.target={type:'food',id:best.id,x:best.x,y:best.y}; return true; }
  return false;
}
function chooseMateTarget(c,alive){
  const tNow=performance.now()/1000;
  if((tNow-(c.lastMateAt||0))<c.derived.mateCooldown) return false;
  if(c.energy<c.derived.mateEnergyThreshold) return false;
  let best=null, bestD2=Infinity;
  for(const o of neighborCells(c.x,c.y)){
    if(o===c||o.dead) continue;
    if(o.sex===c.sex) continue;
    if((tNow-(o.lastMateAt||0))<(o.derived?.mateCooldown??6)) continue;
    if(o.energy<(o.derived?.mateEnergyThreshold??14)) continue;
    const dx=o.x-c.x, dy=o.y-c.y; const d2=dx*dx+dy*dy;
    if(d2>c.derived.sense*c.derived.sense) continue;
    if(d2<bestD2){ bestD2=d2; best=o; }
  }
  if(best){ c.target={type:'mate',id:best.id,x:best.x,y:best.y}; return true; }
  return false;
}
function updateCellBehavior(c, alive, dt){
  if(c.target){
    if(c.target.type==='food'){
      const f=foods.find(ff=>ff.id===c.target.id);
      if(f){ c.target.x=f.x; c.target.y=f.y; } else c.target=null;
    }else if(c.target.type==='mate'){
      const o=alive.find(x=>x.id===c.target.id && !x.dead);
      if(o){ c.target.x=o.x; c.target.y=o.y; } else c.target=null;
    }
  }

  c.scanTimer -= dt;
  const hungry = c.energy < 0.30*c.derived.energyCap;
  if(c.scanTimer<=0 || hungry || !c.target){
    let found=false;
    if(hungry) found=chooseFoodTarget(c);
    if(!found){
      found=chooseFoodTarget(c);
      if(!found && c.energy>0.70*c.derived.energyCap) found=chooseMateTarget(c, alive);
    }
    c.scanTimer = c.derived.scanInterval;
  }

  let dVX=0, dVY=0;
  if(c.target){
    const dx=c.target.x-c.x, dy=c.target.y-c.y; const d=Math.max(1,Math.hypot(dx,dy));
    const sp=c.derived.speedMax; dVX=(dx/d)*sp; dVY=(dy/d)*sp;
  } else {
    c.wanderAng=(c.wanderAng??Math.random()*Math.PI*2)+(Math.random()*2-1)*0.3*dt;
    const sp=c.derived.speedMax*0.6;
    dVX=Math.cos(c.wanderAng)*sp; dVY=Math.sin(c.wanderAng)*sp;
  }
  c.vx=0.85*c.vx+0.15*dVX; c.vy=0.85*c.vy+0.15*dVY;

  c.x+=c.vx*dt; c.y+=c.vy*dt;
  if(c.x<c.radius){ c.x=c.radius; c.vx=Math.abs(c.vx); }
  if(c.x>WORLD.width-c.radius){ c.x=WORLD.width-c.radius; c.vx=-Math.abs(c.vx); }
  if(c.y<c.radius){ c.y=c.radius; c.vy=Math.abs(c.vy); }
  if(c.y>WORLD.height-c.radius){ c.y=WORLD.height-c.radius; c.vy=-Math.abs(c.vy); }

  const speed=Math.hypot(c.vx,c.vy);
  c.energy -= (c.derived.baseDrain + c.derived.moveCostPerSpeed*speed) * dt;
  c.energy = Math.min(c.energy, c.derived.energyCap);
  c.age += dt;
}

function eatPhase(){
  for(const c of cells){
    if(c.dead) continue;
    for(const f of [...neighborFoods(c.x,c.y)]){
      const dx=c.x-f.x, dy=c.y-f.y;
      if(dx*dx+dy*dy <= (c.radius+3)*(c.radius+3)){
        c.energy = Math.min(c.derived.energyCap, c.energy + f.value*c.derived.digestionMult);
        removeFoodFromGrid(f.id);
        const i=foods.findIndex(ff=>ff.id===f.id);
        if(i!==-1) foods.splice(i,1);
      }
    }
  }
}

function deathPhase(){
  const now=performance.now()/1000;
  for(const c of cells){
    if(c.dead) continue;
    if(c.energy<=0){
      c.dead=true; lastMinuteHungerDeaths.push(now);
      Events.emit(EVT.DEATH,{id:c.id,stammId:c.stammId,reason:'hunger'});
    }
  }
  while(lastMinuteHungerDeaths.length && now-lastMinuteHungerDeaths[0] > 60) lastMinuteHungerDeaths.shift();
}

function crisisCheck(){
  if(lastMinuteHungerDeaths.length>10){
    Events.emit(EVT.HUNGER_CRISIS,{inLastMinute:lastMinuteHungerDeaths.length});
  }
  const alive=cells.filter(c=>!c.dead).length;
  if(alive>140) Events.emit(EVT.OVERPOP,{population:alive});
}

// ---------- Hauptupdate ----------
export function updateWorld(dt){
  worldTime += dt;
  runScheduler();

  // Cluster-Logik anstelle uniformem Spawner
  updateFoodClusters(dt);

  const alive=cells.filter(c=>!c.dead);
  rebuildCellGrid(alive);

  for(const c of alive) updateCellBehavior(c, alive, dt);
  eatPhase();

  evaluateMatingPairs(
    alive,
    (params)=>createCell(params),
    { mutationRate: WORLD.mutationRate, relatednessFn: relatedness, neighborQuery: (cell)=>neighborCells(cell.x,cell.y) }
  );

  deathPhase();
  crisisCheck();

  if(!foundersEverMated && foundersIds.adam && foundersIds.eva){
    const kids=cells.filter(x=>x.parents?.motherId===foundersIds.eva);
    foundersEverMated = kids.some(k=>k.parents?.fatherId===foundersIds.adam);
  }
}

// ---------- Darstellung ----------
export function getFoundersState(){ return {...foundersIds, foundersEverMated}; }
export function cellColor(c, highlightStammId){
  const col=getStammColor(c.stammId);
  if(highlightStammId!==null && c.stammId!==highlightStammId) return { fill: col, alpha: 0.25 };
  return { fill: col, alpha: 1 };
}

// init
gridResize();
initFoodClusters();