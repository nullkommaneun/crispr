// entities.js – Welt, Zellen, Nahrung, Verhalten
// Spatial Grid + Scheduler + wandernde Food-Cluster
// NAT-Nav+: Wall-aware Scoring, Dichtebonus, Reflexion, Rand-Rauschen,
//           Tangential-Dämpfung + Escape-Waypoint

import { Events, EVT } from './event.js';
import { getStammColor, resetLegend } from './legend.js';
import { createGenome } from './genetics.js';
import { evaluateMatingPairs } from './reproduction.js';

/* =========================
   Welt-Config / öffentliche API
   ========================= */
const WORLD = {
  width: 800,
  height: 520,
  mutationRate: 0.10,   // 0..1 (Engine schreibt 0..0.10 rein)
  foodRate: 100,        // pro Minute (Engine-Regler liefert /s → *60)
  maxFood: 400
};

export function getWorldConfig(){ return { ...WORLD }; }
export function setWorldSize(w, h){
  WORLD.width  = Math.max(50, w | 0);
  WORLD.height = Math.max(50, h | 0);
  gridResize();
  // Cluster-Zentren innerhalb der sicheren Ränder halten
  for (const c of FOOD_CLUSTERS){
    c.x = clamp(c.x, NAV.margin, WORLD.width  - NAV.margin);
    c.y = clamp(c.y, NAV.margin, WORLD.height - NAV.margin);
  }
}
export function setMutationRate(p){ WORLD.mutationRate = Math.max(0, Math.min(1, p)); }
export function setFoodRate(perMinute){ WORLD.foodRate = Math.max(0, perMinute | 0); }

/* =========================
   IDs / Datencontainer
   ========================= */
let nextCellId  = 1;
let nextFoodId  = 1;
let nextStammId = 1;

export function newStammId(){ return nextStammId++; }

export const cells = [];
export const foods = [];

let foundersIds      = { adam: null, eva: null };
let foundersEverMated = false;
const hungerDeaths    = []; // Zeitstempel der letzten 60s für Hungertote

export function setFounders(adamId, evaId){ foundersIds = { adam: adamId, eva: evaId }; }
export function getFoundersState(){ return { ...foundersIds, foundersEverMated }; }

/* =========================
   Navigation/Verhalten – Parameter
   ========================= */
const NAV = {
  margin: 36,             // sichere Innenzone (für Scoring)
  gamma: 2.2,             // Exponent Innenraum-Faktor
  r0: 8,                  // Distanz-Offset
  alpha: 1.5,             // Distanz-Exponent
  densityR: 50,           // Food-Dichte-Radius
  densityK: 0.25,         // Dichtebonus (max ~ +25%)
  wallWanderBoost: 1.25,  // extra Rauschen nahe Wand

  // gegen „Entlang-Gleiten“
  tanDamp: 0.45,          // tangentiale Dämpfung nahe Wand
  escapeStay: 0.8,        // s Randnähe bis Escape-Target
  escapeHop: 90,          // px Hop ins Feld
  escapeHold: 1.2,        // s Escape-Target Vorrang
  stuckNear: 40,          // px für Stuck-Check
  stuckSpeedMin: 8,       // px/s
  stuckWindow: 1.5,       // s
  edgeCooldown: 1.5       // s: Randziele nach Stuck meiden
};

/* =========================
   Hilfsfunktionen
   ========================= */
const clamp   = (v,min,max)=> Math.max(min, Math.min(max, v));
const nowSec  = ()=> performance.now()/1000;
const distToWall = (x,y)=> Math.min(x, WORLD.width - x, y, WORLD.height - y);

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
    if (yy<0 || yy>=GRID.rows) continue;
    for (let xx=gx-1; xx<=gx+1; xx++){
      if (xx<0 || xx>=GRID.cols) continue;
      yield* GRID.foodB[yy*GRID.cols + xx];
    }
  }
}
function* neighborCells(x,y){
  const gx = Math.max(0, Math.min(GRID.cols-1, (x/GRID.size | 0)));
  const gy = Math.max(0, Math.min(GRID.rows-1, (y/GRID.size | 0)));
  for (let yy=gy-1; yy<=gy+1; yy++){
    if (yy<0 || yy>=GRID.rows) continue;
    for (let xx=gx-1; xx<=gx+1; xx++){
      if (xx<0 || xx>=GRID.cols) continue;
      yield* GRID.cellB[yy*GRID.cols + xx];
    }
  }
}

/* =========================
   Weltzeit & Scheduler
   ========================= */
let worldTime = 0;
const scheduled = []; // {due:number, fn:Function}

export function schedule(fn, delaySec=0){
  scheduled.push({ due: worldTime + Math.max(0, delaySec), fn });
}
function runScheduler(){
  for (let i=scheduled.length-1; i>=0; i--){
    if (scheduled[i].due <= worldTime){
      const t = scheduled[i];
      scheduled.splice(i,1);
      try{ t.fn(); }catch(e){ console.error('[Scheduler]', e); }
    }
  }
}

/* =========================
   Food-Cluster (wandernde Hotspots)
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
  const totalPerSec    = (WORLD.foodRate / 60);
  const basePerCluster = totalPerSec / FOOD_CLUSTERS.length;

  for (const c of FOOD_CLUSTERS){
    // Drift
    const angJitter = (Math.random()*2-1) * CLUSTER_CONF.jitter * dt;
    const ang = Math.atan2(c.vy, c.vx) + angJitter;
    const sp  = CLUSTER_CONF.driftSpeed;
    c.vx = Math.cos(ang) * sp; c.vy = Math.sin(ang) * sp;
    c.x += c.vx * dt;          c.y += c.vy * dt;

    // Ränder
    if (c.x < NAV.margin){ c.x = NAV.margin; c.vx = Math.abs(c.vx); }
    if (c.x > WORLD.width - NAV.margin){ c.x = WORLD.width - NAV.margin; c.vx = -Math.abs(c.vx); }
    if (c.y < NAV.margin){ c.y = NAV.margin; c.vy = Math.abs(c.vy); }
    if (c.y > WORLD.height - NAV.margin){ c.y = WORLD.height - NAV.margin; c.vy = -Math.abs(c.vy); }

    // Spawnbudget
    const perSec = basePerCluster * c.rateMult;
    c.acc += perSec * dt;
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
    mateEnergyCost:      Math.max(2,  3*(1 + 0.20*nGRO - 0.20*nEFF)),
  };
}

/* =========================
   Erzeugung (exportiert)
   ========================= */
export function createCell(params = {}){
  const id = params.id ?? nextCellId++;
  const parents = params.parents || null;
  let stammId = params.stammId ?? newStammId();

  // (Speciation optional; derzeit neutral beibehalten)

  const sex   = params.sex ?? (Math.random() < 0.5 ? 'm' : 'f');
  const genes = params.genes ? { ...params.genes } : createGenome();
  const ang   = Math.random() * Math.PI * 2;

  const c = {
    id, name: params.name || `Zelle #${id}`,
    stammId, sex,
    x: params.x ?? Math.random()*WORLD.width,
    y: params.y ?? Math.random()*WORLD.height,
    vx: Math.cos(ang)*10, vy: Math.sin(ang)*10,
    genes,
    energy: params.energy ?? 22,
    age: 0,
    dead: false,
    parents,
    bornAt: nowSec(),
    lastMateAt: -999,
    // Laufzeitfelder:
    scanTimer: 0, _stuckT: 0, _lastX: 0, _lastY: 0,
    _avoidEdgeUntil: 0, _nearWallT: 0, _escapeUntil: 0, _escapeTarget: null
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
   Zähler / Informationen
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
   Zielwahl / Scoring
   ========================= */
function interiorFactor(x,y){
  const t = clamp(distToWall(x,y) / NAV.margin, 0, 1);
  return Math.pow(t, NAV.gamma);
}
function densityBoostAt(x,y){
  const R2 = NAV.densityR * NAV.densityR;
  let cnt = 0, cap = 24;
  for (const f of neighborFoods(x,y)){
    const dx=f.x-x, dy=f.y-y;
    if (dx*dx + dy*dy <= R2){ cnt++; if(--cap<=0) break; }
  }
  return 1 + NAV.densityK * Math.min(1, cnt/20);
}

function chooseFoodTarget(c){
  const now = nowSec();
  const avoidEdge = now < (c._avoidEdgeUntil || 0);
  let best = null, bestScore = -Infinity;

  for (const f of neighborFoods(c.x,c.y)){
    const dx=f.x-c.x, dy=f.y-c.y; const d2=dx*dx+dy*dy;
    if (d2 > c.derived.sense*c.derived.sense) continue;

    const interior = interiorFactor(f.x, f.y);
    if (avoidEdge && interior < 0.6) continue;

    const dist = Math.sqrt(Math.max(1, d2));
    const distTerm = Math.pow(dist + NAV.r0, NAV.alpha);
    const density  = densityBoostAt(f.x, f.y);

    const score = interior * density * c.derived.digestionMult * (f.value / distTerm);
    if (score > bestScore){ bestScore = score; best = f; }
  }

  if (best){
    c.target = { type:'food', id: best.id, x: best.x, y: best.y };
    return true;
  }
  return false;
}

function chooseMateTarget(c, alive){
  const now = nowSec();
  const avoidEdge = now < (c._avoidEdgeUntil || 0);
  if ((now - (c.lastMateAt || 0)) < c.derived.mateCooldown) return false;
  if (c.energy < c.derived.mateEnergyThreshold) return false;

  let best=null, bestScore=-Infinity;
  for (const o of neighborCells(c.x,c.y)){
    if (o===c || o.dead || o.sex===c.sex) continue;
    if ((now - (o.lastMateAt || 0)) < (o.derived?.mateCooldown ?? 6)) continue;
    if (o.energy < (o.derived?.mateEnergyThreshold ?? 14)) continue;

    const interior = interiorFactor(o.x, o.y);
    if (avoidEdge && interior < 0.6) continue;

    const dist = Math.max(1, Math.hypot(o.x - c.x, o.y - c.y));
    const score = interior / Math.pow(dist + NAV.r0, NAV.alpha);
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
  // Zielpflege
  if (c.target){
    if (c.target.type === 'food'){
      const f = foods.find(ff => ff.id === c.target.id);
      if (f){ c.target.x = f.x; c.target.y = f.y; } else c.target = null;
    } else if (c.target.type === 'mate'){
      const o = alive.find(x => x.id === c.target.id && !x.dead);
      if (o){ c.target.x = o.x; c.target.y = o.y; } else c.target = null;
    }
  }

  // Zeit in Randnähe und ggf. Escape-Ziel
  const near = distToWall(c.x,c.y) < NAV.margin;
  c._nearWallT = Math.max(0, (c._nearWallT || 0) + (near ? dt : -dt));

  const now = nowSec();
  if (near && c._nearWallT > NAV.escapeStay && now > (c._escapeUntil || 0)){
    const cx = WORLD.width/2, cy = WORLD.height/2;
    const ang = Math.atan2(cy - c.y, cx - c.x);
    const tx  = clamp(c.x + Math.cos(ang)*NAV.escapeHop, NAV.margin, WORLD.width  - NAV.margin);
    const ty  = clamp(c.y + Math.sin(ang)*NAV.escapeHop, NAV.margin, WORLD.height - NAV.margin);
    c._escapeTarget = { x: tx, y: ty };
    c._escapeUntil  = now + NAV.escapeHold;
  }

  // Scans
  c.scanTimer -= dt;
  const hungry = c.energy < 0.30 * c.derived.energyCap;
  if (c.scanTimer <= 0 || hungry || !c.target){
    let found=false;
    if (hungry) found = chooseFoodTarget(c);
    if (!found){
      found = chooseFoodTarget(c);
      if (!found && c.energy > 0.70*c.derived.energyCap) found = chooseMateTarget(c, alive);
    }
    c.scanTimer = c.derived.scanInterval;
  }

  // aktives Ziel (Escape hat Vorrang)
  const activeTarget = (c._escapeUntil && now < c._escapeUntil && c._escapeTarget) ? c._escapeTarget : c.target;

  // Wunschvektor
  let dVX=0, dVY=0;
  if (activeTarget){
    const dx = activeTarget.x - c.x, dy = activeTarget.y - c.y;
    const d  = Math.max(1, Math.hypot(dx,dy));
    const sp = c.derived.speedMax;
    dVX = (dx/d)*sp; dVY = (dy/d)*sp;
  } else {
    const base = 0.3 * (near ? NAV.wallWanderBoost : 1);
    c.wanderAng = (c.wanderAng ?? Math.random()*Math.PI*2) + (Math.random()*2-1)*base*dt;
    const sp = c.derived.speedMax * 0.6;
    dVX = Math.cos(c.wanderAng) * sp; dVY = Math.sin(c.wanderAng) * sp;
  }

  // Glättung
  c.vx = 0.85*c.vx + 0.15*dVX;
  c.vy = 0.85*c.vy + 0.15*dVY;

  // Tangential-Dämpfung nahe Wand
  if (near){
    const nx = Math.sign((WORLD.width/2)  - c.x);
    const ny = Math.sign((WORLD.height/2) - c.y);
    const nlen = Math.hypot(nx,ny) || 1;
    const inx = nx/nlen, iny = ny/nlen;
    let tx = -iny, ty = inx;
    const vdot = c.vx*tx + c.vy*ty;
    c.vx -= tx * vdot * NAV.tanDamp;
    c.vy -= ty * vdot * NAV.tanDamp;
  }

  // Bewegung + Reflexion
  c.x += c.vx * dt; c.y += c.vy * dt;
  if (c.x < c.radius){ c.x = c.radius; c.vx = Math.abs(c.vx); }
  if (c.x > WORLD.width  - c.radius){ c.x = WORLD.width  - c.radius; c.vx = -Math.abs(c.vx); }
  if (c.y < c.radius){ c.y = c.radius; c.vy = Math.abs(c.vy); }
  if (c.y > WORLD.height - c.radius){ c.y = WORLD.height - c.radius; c.vy = -Math.abs(c.vy); }

  // Stuck-Detektor nahe Wand → Edge-Cooldown + kleiner Hop
  const dxm = c.x - (c._lastX || c.x), dym = c.y - (c._lastY || c.y);
  const effSpeed = Math.hypot(dxm,dym) / Math.max(1e-6, dt);
  const nearStuck = distToWall(c.x,c.y) < NAV.stuckNear;
  if (nearStuck && effSpeed < NAV.stuckSpeedMin){
    c._stuckT = (c._stuckT || 0) + dt;
    if (c._stuckT > NAV.stuckWindow){
      c._stuckT = 0;
      c._avoidEdgeUntil = now + NAV.edgeCooldown;
      c.wanderAng = (c.wanderAng ?? 0) + (Math.random()*2-1)*0.8;
      const cx = WORLD.width/2, cy = WORLD.height/2;
      const ang = Math.atan2(cy - c.y, cx - c.x);
      c._escapeTarget = {
        x: clamp(c.x + Math.cos(ang)*NAV.escapeHop*0.6, NAV.margin, WORLD.width  - NAV.margin),
        y: clamp(c.y + Math.sin(ang)*NAV.escapeHop*0.6, NAV.margin, WORLD.height - NAV.margin)
      };
      c._escapeUntil = now + NAV.escapeHold;
    }
  } else {
    c._stuckT = Math.max(0, (c._stuckT || 0) - dt*0.5);
  }
  c._lastX = c.x; c._lastY = c.y;

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
      if (dx*dx + dy*dy <= (c.radius+3)*(c.radius+3)){
        c.energy = Math.min(c.derived.energyCap, c.energy + f.value*c.derived.digestionMult);
        removeFoodFromGrid(f.id);
        const i = foods.findIndex(ff => ff.id === f.id); if (i !== -1) foods.splice(i,1);
      }
    }
  }
}
function deathPhase(){
  const now = nowSec();
  for (const c of cells){
    if (c.dead) continue;
    if (c.energy <= 0){
      c.dead = true; hungerDeaths.push(now);
      Events.emit(EVT.DEATH, { id:c.id, stammId:c.stammId, reason:'hunger' });
    }
  }
  while (hungerDeaths.length && now - hungerDeaths[0] > 60) hungerDeaths.shift();
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

  // Gründerliebe für Narrative
  if (!foundersEverMated && foundersIds.adam && foundersIds.eva){
    const kids = cells.filter(x => x.parents?.motherId === foundersIds.eva);
    foundersEverMated = kids.some(k => k.parents?.fatherId === foundersIds.adam);
  }
}

/* =========================
   Verwandtschaft (für reproduction.js)
   ========================= */
export function relatedness(a, b){
  if (a.id === b.id) return 1;
  // Elternketten bis Tiefe 3 sammeln
  const ancUp = (id, depth)=>{
    const map = new Map();
    const q = [{ id, d:0 }];
    while (q.length){
      const { id:cur, d } = q.shift();
      const p = cells.find(x => x.id === cur);
      if (!p?.parents) continue;
      const m = p.parents.motherId, f = p.parents.fatherId;
      if (m && d+1 <= depth && !map.has(m)){ map.set(m, d+1); q.push({ id:m, d:d+1 }); }
      if (f && d+1 <= depth && !map.has(f)){ map.set(f, d+1); q.push({ id:f, d:d+1 }); }
    }
    return map;
  };
  const A = ancUp(a.id, 3), B = ancUp(b.id, 3);
  let best = Infinity;
  for (const [aid, da] of A){
    if (B.has(aid)){
      const sum = da + B.get(aid);
      if (sum < best) best = sum;
    }
  }
  if (best === Infinity) return 0;
  return Math.pow(0.5, best);
}

/* =========================
   Darstellungshilfe
   ========================= */
export function cellColor(c, highlightStammId){
  const col = getStammColor(c.stammId);
  if (highlightStammId !== null && c.stammId !== highlightStammId) return { fill: col, alpha: 0.25 };
  return { fill: col, alpha: 1 };
}

/* ===== init ===== */
gridResize();
initFoodClusters();