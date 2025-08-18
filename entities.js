// entities.js
// Definition & Verwaltung von Zellen und Nahrung.

import { Events, EVT } from './events.js';
import { getStammColor, resetLegend } from './legend.js';
import { createGenome } from './genetics.js';
import { evaluateMatingPairs } from './reproduction.js';

const WORLD = {
  width: 800,
  height: 520,
  mutationRate: 0.10,   // 10%
  foodRate: 60,         // pro Minute (default)
  maxFood: 280
};

let nextCellId = 1;
let nextFoodId = 1;
let nextStammId = 1;

export const cells = [];
export const foods = [];

// Für Verwandtschaftsberechnung: Elternbeziehungen & Vorfahren
const pedigree = new Map(); // id -> {motherId, fatherId, stammId, gen: generation}

const lastMinuteHungerDeaths = []; // timestamps (sec)
let foundersIds = { adam: null, eva: null };
let foundersEverMated = false;

function nowSec(){ return performance.now()/1000; }

export function setWorldSize(w,h){
  WORLD.width = w; WORLD.height = h;
}

export function setMutationRate(p){ WORLD.mutationRate = Math.max(0, Math.min(1, p)); }
export function setFoodRate(perMinute){ WORLD.foodRate = Math.max(0, perMinute|0); }
export function getWorldConfig(){ return {...WORLD}; }

export function resetEntities(){
  // Löschen
  cells.splice(0, cells.length);
  foods.splice(0, foods.length);
  pedigree.clear();
  resetLegend();
  lastMinuteHungerDeaths.length = 0;
  foundersIds = { adam: null, eva: null };
  foundersEverMated = false;

  // IDs zurücksetzen
  nextCellId = 1;
  nextFoodId = 1;
  nextStammId = 1;

  Events.emit(EVT.RESET, {});
}

export function newStammId(){ return nextStammId++; }

export function createCell(params = {}){
  const id = params.id ?? nextCellId++;
  const stammId = params.stammId ?? newStammId();
  const sex = params.sex ?? (Math.random() < 0.5 ? 'm' : 'f');

  const genes = params.genes ? {...params.genes} : createGenome();
  const size = 3 + genes.GRO; // Radius
  const baseSpeed = 18 + (genes.TEM - 5) * 3; // px/s

  const c = {
    id, name: params.name || `Zelle #${id}`,
    stammId, sex,
    x: params.x ?? Math.random()*WORLD.width,
    y: params.y ?? Math.random()*WORLD.height,
    vx: (Math.random()*2-1)*baseSpeed,
    vy: (Math.random()*2-1)*baseSpeed,
    genes,
    radius: size,
    energy: params.energy ?? 20,
    age: 0,
    dead: false,
    parents: params.parents || null,
    bornAt: nowSec()
  };

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
    value: params.value ?? 6
  };
  foods.push(f);
  Events.emit(EVT.FOOD_SPAWN, {id: f.id});
  return f;
}

export function getStammCounts(){
  const counts = {};
  for(const c of cells){
    if(c.dead) continue;
    counts[c.stammId] = (counts[c.stammId]||0)+1;
  }
  return counts;
}

export function setFounders(adamId, evaId){
  foundersIds = {adam: adamId, eva: evaId};
}

export function exportState(){
  return JSON.stringify({
    WORLD, nextCellId, nextFoodId, nextStammId,
    cells: cells.filter(c=>!c.dead).map(c=>({
      id:c.id, name:c.name, stammId:c.stammId, sex:c.sex,
      x:c.x, y:c.y, vx:c.vx, vy:c.vy, genes:c.genes, radius:c.radius,
      energy:c.energy, age:c.age, parents:c.parents, bornAt:c.bornAt
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
    cells.push({...c, dead:false});
    pedigree.set(c.id, {motherId: c.parents?.motherId ?? null, fatherId: c.parents?.fatherId ?? null, stammId: c.stammId});
  }
  for(const f of data.foods){ foods.push({...f}); }
  foundersIds = data.foundersIds || foundersIds;
}

/** Verwandtschaftskoeffizient anhand nächstem gemeinsamen Vorfahren (bis Tiefe 3) */
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
  return Math.pow(0.5, best); // z.B. Eltern-Kind: 0.5, Geschwister: 0.5, Cousins: 0.125
}

function ancestorsUpTo(id, depth){
  const map = new Map(); // ancestorId -> dist
  const queue = [{id, d:0}];
  while(queue.length){
    const {id:cur, d} = queue.shift();
    // Eltern
    const p = pedigree.get(cur); if(!p) continue;
    if(p.motherId && d+1 <= depth){ if(!map.has(p.motherId)) map.set(p.motherId, d+1); queue.push({id:p.motherId, d:d+1}); }
    if(p.fatherId && d+1 <= depth){ if(!map.has(p.fatherId)) map.set(p.fatherId, d+1); queue.push({id:p.fatherId, d:d+1}); }
  }
  return map;
}

function eatPhase(){
  if(foods.length===0) return;
  // Brutal simple O(n*m) – genügt für moderates m
  for(const c of cells){
    if(c.dead) continue;
    for(let i=foods.length-1;i>=0;i--){
      const f = foods[i];
      const dx=c.x-f.x, dy=c.y-f.y;
      const d2 = dx*dx + dy*dy;
      if(d2 <= (c.radius+2)*(c.radius+2)){
        c.energy += f.value;
        foods.splice(i,1);
      }
    }
  }
}

function movePhase(dt){
  for(const c of cells){
    if(c.dead) continue;

    const speed = Math.sqrt(c.vx*c.vx + c.vy*c.vy);
    const targetSpeed = 18 + (c.genes.TEM - 5) * 3;
    // sanfte Anpassung
    const s = 0.9*speed + 0.1*targetSpeed;
    const angleJitter = (Math.random()*2-1) * 0.3; // leichte Richtungsänderung
    const ang = Math.atan2(c.vy, c.vx) + angleJitter*dt;
    c.vx = Math.cos(ang) * s;
    c.vy = Math.sin(ang) * s;

    c.x += c.vx * dt;
    c.y += c.vy * dt;

    // Wände – sanftes Abprallen
    if(c.x < c.radius){ c.x=c.radius; c.vx = Math.abs(c.vx); }
    if(c.x > WORLD.width - c.radius){ c.x = WORLD.width - c.radius; c.vx = -Math.abs(c.vx); }
    if(c.y < c.radius){ c.y=c.radius; c.vy = Math.abs(c.vy); }
    if(c.y > WORLD.height - c.radius){ c.y = WORLD.height - c.radius; c.vy = -Math.abs(c.vy); }

    // Energieverbrauch: Basis + Effekt TEM/GRO – Effizienz reduziert
    const baseDrain = 1.2; // pro Sekunde
    const moveDrain = 0.05 * (c.genes.TEM - 5 + 5) + 0.06 * (c.genes.GRO - 5 + 5);
    const effFactor = 1 - (c.genes.EFF - 5) * 0.05; // 0.8..1.2
    c.energy -= (baseDrain + moveDrain) * effFactor * dt;
    c.age += dt;
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
  // alter Historie putzen (60s)
  while(lastMinuteHungerDeaths.length && now - lastMinuteHungerDeaths[0] > 60){
    lastMinuteHungerDeaths.shift();
  }
}

function crisisCheck(){
  // Hungersnot?
  if(lastMinuteHungerDeaths.length > 10){
    Events.emit(EVT.HUNGER_CRISIS, { inLastMinute: lastMinuteHungerDeaths.length });
  }
  // Überbevölkerung?
  const alive = cells.filter(c=>!c.dead).length;
  if(alive > 120){
    Events.emit(EVT.OVERPOP, { population: alive });
  }
}

let foodAcc = 0;
function foodSpawner(dt){
  // Ziel-Spawnrate pro Sekunde: WORLD.foodRate / 60
  const perSec = WORLD.foodRate / 60;
  foodAcc += perSec * dt;
  const n = Math.floor(foodAcc);
  if(n > 0){
    foodAcc -= n;
    for(let i=0;i<n;i++){
      if(foods.length < WORLD.maxFood){
        createFood();
      }
    }
  }
}

export function updateWorld(dt){
  foodSpawner(dt);
  movePhase(dt);
  eatPhase();

  // Paarung (externes Modul)
  evaluateMatingPairs(
    cells.filter(c=>!c.dead),
    (params) => createCell(params),
    { mutationRate: WORLD.mutationRate, relatednessFn: relatedness }
  );

  deathPhase();
  crisisCheck();

  // Founders-Liebe: Narrative-Trigger, wenn Adam & Eva miteinander Kind erzeugen
  if(!foundersEverMated && foundersIds.adam && foundersIds.eva){
    const kidsOfEva = cells.filter(c=>c.parents?.motherId === foundersIds.eva);
    foundersEverMated = kidsOfEva.some(k => k.parents?.fatherId === foundersIds.adam);
  }
}

export function getFoundersState(){ return { ...foundersIds, foundersEverMated }; }

/** Utility für Renderer */
export function cellColor(c, highlightStammId){
  const col = getStammColor(c.stammId);
  if(highlightStammId!==null && c.stammId!==highlightStammId) return { fill: col, alpha: 0.25 };
  return { fill: col, alpha: 1 };
}