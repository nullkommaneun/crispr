// entities.js
import { emit, on } from './event.js';

let W = 1280, H = 720;
let MUT_PCT = 0.005;       // 0.5 %
let FOOD_RATE = 90;        // /s
let PERF = { drawStride:1, renderScale:1 };
let highlightStamm = null;

let _nextId = 0;
let _nextStamm = 1;

const CELLS = [];
const FOOD = [];
const BLOBS = []; // wandernde Food-Cluster
const ENV = { // Umweltkanten
  acid:   { enabled:false, range:14, dps:6 },
  barb:   { enabled:false, range:8,  dps:10 }, // Druck
  fence:  { enabled:false, range:12, impulse:10, period:1.6, t:0 },
  nano:   { enabled:false, dps:0.8 }
};

const TRAITS = ['TEM','GRO','EFF','SCH','MET'];

function rnd(a=0,b=1){ return a + Math.random()*(b-a); }
function clamp(x,a,b){ return x<a?a:x>b?b:x; }
function sign(x){ return x<0?-1:1; }

export function setWorldSize(w,h){ W=w; H=h; }
export function setMutationPct(p){ MUT_PCT = p; }
export function setFoodRate(r){ FOOD_RATE = r; }
export function setPerfProfile(p){ PERF = { ...PERF, ...p }; }
export function setHighlightStamm(id){ highlightStamm = id; }

export function getCounts(){
  const stamm = new Set(CELLS.map(c=>c.stammId));
  return { cells: CELLS.length, food: FOOD.length, stämme: stamm.size };
}
export function getStammIds(){
  return [...new Set(CELLS.map(c=>c.stammId))].sort((a,b)=>a-b);
}
export function getCells(){ return CELLS; }

export function reset() {
  CELLS.length = 0; FOOD.length = 0; BLOBS.length = 0;
  _nextId = 0; _nextStamm = 1; highlightStamm = null;
  // Start-Cluster
  for (let i=0;i<3;i++) BLOBS.push(makeBlob());
}

function makeBlob(){
  return {
    x: rnd(0.2*W,0.8*W),
    y: rnd(0.2*H,0.8*H),
    vx: rnd(-20,20), vy: rnd(-20,20),
    rate: FOOD_RATE/3
  };
}

export function applyEnvironment(cfg){
  Object.assign(ENV.acid,   cfg?.acid   ?? {});
  Object.assign(ENV.barb,   cfg?.barb   ?? {});
  Object.assign(ENV.fence,  cfg?.fence  ?? {});
  Object.assign(ENV.nano,   cfg?.nano   ?? {});
}

function newStammId(){ return _nextStamm++; }
function sexRandom(){ // ~1.05 : 1 (m:w)
  const pFemale = 1/2.05; // ≈0.4878
  return Math.random() < pFemale ? 'f':'m';
}

export function createGenome(base=null){
  const g = base ? { ...base } : { TEM:5, GRO:5, EFF:5, SCH:5, MET:5 };
  // Mutation um ±1 mit Wahrscheinlichkeit MUT_PCT je Trait
  for (const k of TRAITS) {
    if (Math.random() < MUT_PCT) g[k] = clamp(g[k] + (Math.random()<0.5?-1:1), 1, 9);
  }
  return g;
}

function mixGenomes(a,b){
  const g={};
  for (const k of TRAITS) {
    const avg = (a[k]+b[k])/2;
    g[k] = clamp(Math.round(avg + rnd(-0.5,0.5)), 1, 9);
  }
  return createGenome(g);
}

export function createCell({name, sex, stammId, x, y, genes, energy=60}){
  const id = ++_nextId;
  const g = genes ?? createGenome();
  const cell = {
    id, name: name ?? `Zelle #${id}`, sex: sex ?? sexRandom(),
    stammId: stammId ?? newStammId(),
    x: x ?? rnd(0.3*W, 0.7*W), y: y ?? rnd(0.3*H, 0.7*H),
    vx: 0, vy: 0, age:0, alive:true,
    genes: g,
    energy, maxEnergy: 100 + g.MET*6,
    hunger:0, nearWallT:0
  };
  CELLS.push(cell);
  emit('cells:created', { cell });
  return cell;
}

export function spawnAdamEva() {
  const stA = newStammId();
  const stE = newStammId();
  const Adam = createCell({ name:'Adam #1', sex:'m', stammId: stA, x: 0.48*W, y:0.50*H, genes:{TEM:6,GRO:5,EFF:5,SCH:5,MET:6}, energy:80 });
  const Eva  = createCell({ name:'Eva #2',  sex:'f', stammId: stE, x: 0.52*W, y:0.50*H, genes:{TEM:6,GRO:5,EFF:6,SCH:5,MET:6}, energy:80 });

  // Start-Boost: je 4 Kinder im Sekundentakt (abwechselnd)
  let idx = 0;
  const parents = [Adam,Eva];
  const timer = setInterval(() => {
    if (idx >= 8) return clearInterval(timer);
    const p = parents[idx%2];
    const partner = parents[(idx+1)%2];
    const childGenes = mixGenomes(p.genes, partner.genes);
    createCell({
      name:`Zelle #${_nextId+1}`, sex:sexRandom(),
      stammId: newStammId(), x:p.x+rnd(-20,20), y:p.y+rnd(-20,20),
      genes: childGenes, energy:70
    });
    idx++;
  }, 1000);
}

// ---------- Nahrung (Cluster)
function spawnFoodBlob(dt){
  for (const b of BLOBS) {
    b.x += b.vx*dt; b.y += b.vy*dt;
    if (b.x<40||b.x>W-40) b.vx*=-1;
    if (b.y<40||b.y>H-40) b.vy*=-1;
    const perSec = b.rate;
    let count = perSec*dt;
    while (count>0) {
      if (Math.random()<Math.min(1,count)) {
        FOOD.push({ x: clamp(b.x+rnd(-30,30),4,W-4), y: clamp(b.y+rnd(-30,30),4,H-4), v:1 });
      }
      count -= 1;
    }
  }
}

function eatNearby(cell){
  let ate=false;
  for (let i=FOOD.length-1;i>=0;i--){
    const f = FOOD[i];
    const dx=f.x-cell.x, dy=f.y-cell.y, d2=dx*dx+dy*dy;
    const r = 6 + cell.genes.GRO*0.6; // größere Zellen essen etwas größer
    if (d2 < r*r) {
      FOOD.splice(i,1);
      cell.energy = Math.min(cell.maxEnergy, cell.energy + 18 + 2*cell.genes.EFF);
      cell.hunger = 0;
      ate=true;
      if (ENV.nano.enabled) cell.energy -= ENV.nano.dps*0.1; // leichter Nebel-Malus
    }
  }
  return ate;
}

// ---------- Reproduktion
function tryMate(cell, dt) {
  if (cell.energy < 40) return; // zu hungrig
  // Suche partner anderer Stamm & anderes Geschlecht in Reichweite
  const r = 16 + 2*cell.genes.TEM;
  const r2=r*r;
  let partner=null, pd2=Infinity;
  for (const other of CELLS) {
    if (other===cell || !other.alive) continue;
    if (other.sex===cell.sex) continue;
    const dx=other.x-cell.x, dy=other.y-cell.y, d2=dx*dx+dy*dy;
    if (d2<r2 && d2<pd2) { partner=other; pd2=d2; }
  }
  if (!partner) return;

  // Paarungschance steigt mit Energie & EFF
  const p = 0.2 + 0.05*(cell.genes.EFF+partner.genes.EFF)/2;
  if (Math.random() < p*dt) {
    const g = mixGenomes(cell.genes, partner.genes);
    createCell({
      name:`Zelle #${_nextId+1}`, genes:g, sex:sexRandom(),
      stammId: newStammId(),
      x:(cell.x+partner.x)/2 + rnd(-8,8),
      y:(cell.y+partner.y)/2 + rnd(-8,8),
      energy: 60
    });
    // leichte Kosten
    cell.energy -= 12; partner.energy -= 12;
    emit('breed:child', { parents:[cell.id, partner.id] });
  }
}

// ---------- Bewegung & Ränder
function applyBoundaryForces(c, dt){
  const m = 10 + 1.2*c.genes.SCH; // Mauer-Repulsion
  const margin = 6;
  let fx=0, fy=0;

  if (c.x<margin) fx += (margin-c.x)*m;
  if (c.x>W-margin) fx -= (c.x-(W-margin))*m;
  if (c.y<margin) fy += (margin-c.y)*m;
  if (c.y>H-margin) fy -= (c.y-(H-margin))*m;

  // Tangential‑Jitter gegen „entlang der Wand kleben“
  const near = (c.x<margin+4)||(c.x>W-margin-4)||(c.y<margin+4)||(c.y>H-margin-4);
  if (near) {
    c.nearWallT += dt;
    const jitter = (0.5 + 0.1*c.genes.MET) * ( (Math.sin(17*c.nearWallT + c.id)%1)-0.5 );
    // jitter orthogonal zur stärkeren Komponente
    if (Math.abs(fx) > Math.abs(fy)) fy += jitter; else fx += jitter;
  } else {
    c.nearWallT = 0;
  }

  c.vx += fx*dt; c.vy += fy*dt;
}

function steerToFood(c, dt){
  // sensorische Reichweite steigt mit TEM & EFF
  const R = 50 + 6*(c.genes.TEM + c.genes.EFF);
  const R2 = R*R;
  let tx=0, ty=0, best=Infinity;
  for (const f of FOOD) {
    const dx=f.x-c.x, dy=f.y-c.y, d2=dx*dx+dy*dy;
    if (d2<best && d2<R2) { best=d2; tx=dx; ty=dy; }
  }
  if (best<Infinity) {
    const speed = 18 + 2*c.genes.TEM;
    const len = Math.hypot(tx,ty)||1;
    c.vx += (tx/len)*speed*dt;
    c.vy += (ty/len)*speed*dt;
  } else {
    // Exploratives Rauschen (abhängig von TEM)
    const roam = (6 + c.genes.TEM)*dt;
    c.vx += roam*(Math.random()-0.5);
    c.vy += roam*(Math.random()-0.5);
  }
}

function applyEnvironmentDamage(c, dt){
  const near = (d) => (
    c.x<d || c.x>W-d || c.y<d || c.y>H-d
  );
  if (ENV.acid.enabled && near(ENV.acid.range)) c.energy -= ENV.acid.dps*dt;
  if (ENV.barb.enabled && near(ENV.barb.range)) c.energy -= ENV.barb.dps*dt;
  if (ENV.fence.enabled && near(ENV.fence.range)) {
    ENV.fence.t += dt;
    const pulse = (ENV.fence.t % ENV.fence.period) < 0.08;
    if (pulse) {
      const k = ENV.fence.impulse;
      c.vx += (c.x<W/2?1:-1)*k;
      c.vy += (c.y<H/2?1:-1)*k;
      c.energy -= 0.8;
    }
  }
  if (ENV.nano.enabled) c.energy -= ENV.nano.dps*dt*0.15;
}

// ---------- Hauptupdate/Render
export function update(dt){
  // Nahrung spawnen (Cluster)
  spawnFoodBlob(dt);

  for (let i=CELLS.length-1;i>=0;i--){
    const c = CELLS[i];
    if (!c.alive) continue;

    // Priorität Hunger -> Nahrung steuern
    steerToFood(c, dt);

    // Mauerkräfte
    applyBoundaryForces(c, dt);

    // Dämpfung (effizientere Zellen verlieren weniger Tempo)
    const damp = 0.88 + c.genes.EFF*0.008;
    c.vx *= damp; c.vy *= damp;

    // Bewegung
    c.x = clamp(c.x + c.vx*dt, 2, W-2);
    c.y = clamp(c.y + c.vy*dt, 2, H-2);

    // Energieverbrauch (Tempo + Größe + Grundumsatz ~ MET)
    const moveCost = (Math.abs(c.vx)+Math.abs(c.vy))*0.02 + 0.05*c.genes.GRO;
    c.energy -= dt*(moveCost + 0.25*(10-c.genes.MET));

    // Nahrung aufnehmen
    const ate = eatNearby(c);
    if (!ate) c.hunger += dt; else c.hunger = Math.max(0, c.hunger-2*dt);

    // Umwelt
    applyEnvironmentDamage(c, dt);

    // Reproduktion
    tryMate(c, dt);

    // Tod
    if (c.energy <= 0) {
      c.alive = false;
      CELLS.splice(i,1);
      emit('cells:died', { id:c.id, stammId:c.stammId });
    }
  }
}

export function draw(ctx){
  // Food (Matrix‑Grün)
  ctx.save();
  ctx.fillStyle = '#5CFF6C';
  for (let i=0;i<FOOD.length;i+=PERF.drawStride){
    const f = FOOD[i];
    ctx.fillRect(f.x-1,f.y-1,2,2);
  }
  ctx.restore();

  // Cells
  for (let i=0;i<CELLS.length;i+=PERF.drawStride){
    const c = CELLS[i];
    const focus = !highlightStamm || c.stammId===highlightStamm;
    ctx.globalAlpha = focus?1:0.35;
    ctx.fillStyle = (c.sex==='m') ? '#ffd54f' : '#b388ff'; // m:gelb, f:lila
    const r = 2.2 + 0.3*c.genes.GRO;
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}