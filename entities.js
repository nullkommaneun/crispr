/**
 * entities.js — Quelle der Wahrheit für Zellen/Bewegung/Energie + Food-Interaktion
 * Exports (kompatibel): setWorldSize, getCells, getFoodItems, createAdamAndEve, step, applyEnvironment
 * Zusätzlicher, optionaler Export: spawnChild(x, y, genes?, sex?)
 *
 * Architektur (Phasen je Tick):
 *  1) AGE/COOLDOWN
 *  2) PERCEIVE (Food/Nachbar via Spatial Grid)
 *  3) DECIDE (drives) → Beschleunigung
 *  4) ACT (Kinematik + Bounds)
 *  5) ENERGY & EAT (Food-Konsum via Grid, kompakte Entfernung)
 *  6) CLEANUP (Tote Zellen)
 *
 * Neu: Uniform Spatial Grid (intern)
 *  - cellSize = 128 px; Buckets für Food & Cells
 *  - Rebuild pro Frame: O(nFood + nCells)
 *  - Food-Buckets halten Objektreferenzen; beim Essen: item.__dead = true; am Ende kompaktieren
 */

import * as drives from "./drives.js";

/* --------------------------------- Tuning ---------------------------------- */
// Energetik
const E_START     = 80;
const E_MAX       = 140;
const E_FOOD      = 22;
const EAT_RADIUS  = 9;
const META_BASE   = 0.10;
const META_JUV_FR = 0.55;
const JUV_AGE_S   = 12;
const MOVE_COST_S = 0.025;

// Kinematik
const MOVE_S_MAX  = 55;     // (Konstante Kappung; Traits können separat in drives genutzt werden)

// Wahrnehmung
const SENSE_FOOD  = 110;
const SENSE_SOC   = 120;

// Welt
let WORLD_W = 800, WORLD_H = 500;

/* ------------------------------ Welt / Zustand ------------------------------ */

const CELLS = [];
let NEXT_ID = 1;

function foods(){ return Array.isArray(window.__FOODS) ? window.__FOODS : (window.__FOODS = []); }

/* --------------------------------- Helpers --------------------------------- */

function clamp(v, lo, hi){ return v < lo ? lo : (v > hi ? hi : v); }
function rnd(min,max){ return min + Math.random()*(max-min); }
function randn(){ let u=0, v=0; while(u===0) u=Math.random(); while(v===0) v=Math.random(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }

function keepInBounds(c){
  if (c.pos.x < 3){ c.pos.x=3; if (c.vel.x<0) c.vel.x*=-0.5; }
  if (c.pos.x > WORLD_W-3){ c.pos.x=WORLD_W-3; if (c.vel.x>0) c.vel.x*=-0.5; }
  if (c.pos.y < 3){ c.pos.y=3; if (c.vel.y<0) c.vel.y*=-0.5; }
  if (c.pos.y > WORLD_H-3){ c.pos.y=WORLD_H-3; if (c.vel.y>0) c.vel.y*=-0.5; }
}

/* ------------------------------ Spatial Grid -------------------------------- */

const GRID = {
  cellSize: 128,
  w: 0, h: 0, nx: 0, ny: 0,
  food: null,  // Array< Array<FoodRef> >
  cells: null, // Array< Array<CellRef> >

  build(w, h){
    this.w = Math.max(1, w|0); this.h = Math.max(1, h|0);
    this.nx = Math.max(1, Math.ceil(this.w / this.cellSize));
    this.ny = Math.max(1, Math.ceil(this.h / this.cellSize));
    const buckets = this.nx * this.ny;
    this.food  = new Array(buckets); for (let i=0;i<buckets;i++) this.food[i] = [];
    this.cells = new Array(buckets); for (let i=0;i<buckets;i++) this.cells[i] = [];
  },
  ensure(){
    if (!this.food || !this.cells || this.w !== WORLD_W || this.h !== WORLD_H){
      this.build(WORLD_W, WORLD_H);
    } else {
      // leeren, ohne Arrays neu zu allocen
      for (let i=0;i<this.food.length;i++)  this.food[i].length = 0;
      for (let i=0;i<this.cells.length;i++) this.cells[i].length = 0;
    }
  },
  _ix(x){ return clamp((x/this.cellSize)|0, 0, this.nx-1); },
  _iy(y){ return clamp((y/this.cellSize)|0, 0, this.ny-1); },
  _b(ix,iy){ return iy*this.nx + ix; },

  rebuildFoods(list){
    for (let i=0;i<list.length;i++){
      const f = list[i]; if (!f || f.__dead) continue;
      const ix = this._ix(f.x), iy = this._iy(f.y);
      this.food[this._b(ix,iy)].push(f);
    }
  },
  rebuildCells(list){
    for (let i=0;i<list.length;i++){
      const c = list[i];
      const ix = this._ix(c.pos.x), iy = this._iy(c.pos.y);
      this.cells[this._b(ix,iy)].push(c);
    }
  },
  _bucketRange(x,y,r){
    const cs = this.cellSize;
    const ix0 = this._ix(x - r), iy0 = this._iy(y - r);
    const ix1 = this._ix(x + r), iy1 = this._iy(y + r);
    return { ix0, iy0, ix1, iy1 };
  },
  queryFoodsCircle(x,y,r){
    const { ix0, iy0, ix1, iy1 } = this._bucketRange(x,y,r);
    const out = [];
    for (let iy=iy0; iy<=iy1; iy++){
      for (let ix=ix0; ix<=ix1; ix++){
        const bucket = this.food[this._b(ix,iy)];
        for (let k=0;k<bucket.length;k++){
          const f = bucket[k];
          if (f && !f.__dead){
            const dx = f.x - x, dy = f.y - y;
            if (dx*dx + dy*dy <= r*r) out.push(f);
          }
        }
      }
    }
    return out;
  },
  queryCellsCircle(x,y,r){
    const { ix0, iy0, ix1, iy1 } = this._bucketRange(x,y,r);
    const out = [];
    for (let iy=iy0; iy<=iy1; iy++){
      for (let ix=ix0; ix<=ix1; ix++){
        const bucket = this.cells[this._b(ix,iy)];
        for (let k=0;k<bucket.length;k++){
          const c = bucket[k];
          const dx = c.pos.x - x, dy = c.pos.y - y;
          if (dx*dx + dy*dy <= r*r) out.push(c);
        }
      }
    }
    return out;
  }
};

/* -------------------------------- CellModel -------------------------------- */

function addCell(name, sex, x, y, genesOpt){
  const genes = genesOpt && typeof genesOpt === "object" ? {
    EFF: clamp(+genesOpt.EFF ?? 0.5, 0, 1),
    MET: clamp(+genesOpt.MET ?? 0.5, 0, 1),
    SCH: clamp(+genesOpt.SCH ?? 0.5, 0, 1),
    TEM: clamp(+genesOpt.TEM ?? 0.5, 0, 1),
    GRÖ: clamp(+genesOpt.GRÖ ?? (genesOpt.GRO ?? 0.5), 0, 1)
  } : { EFF:0.5, MET:0.5, SCH:0.5, TEM:0.5, GRÖ:0.5 };

  const c = {
    id: NEXT_ID++, name, sex,
    pos: { x, y },
    vel: { x: rnd(-10,10), y: rnd(-10,10) },
    energy: E_START,
    age: 0,
    cooldown: 0,
    vitality: 1,
    genes,
    drive: {
      wanderAngle: Math.random()*Math.PI*2,
      lastMode: "wander",
      fatigue: 0,
      wantMate: false
    }
  };
  CELLS.push(c);
  return c;
}

/* ------------------------------- Perception -------------------------------- */

function perceiveFood(c){
  let best = null, bestD2 = (SENSE_FOOD*SENSE_FOOD);
  const cand = GRID.queryFoodsCircle(c.pos.x, c.pos.y, SENSE_FOOD);
  for (let i=0;i<cand.length;i++){
    const f = cand[i];
    const dx = f.x - c.pos.x, dy = f.y - c.pos.y;
    const d2 = dx*dx + dy*dy;
    if (d2 < bestD2){ bestD2 = d2; best = f; }
  }
  return best ? { x: best.x, y: best.y, dist: Math.sqrt(bestD2) } : null;
}

function perceiveNeighbor(c){
  let nearest=null, bestD2=(SENSE_SOC*SENSE_SOC);
  let mate=null,    bestMD2=(SENSE_SOC*SENSE_SOC);
  const cand = GRID.queryCellsCircle(c.pos.x, c.pos.y, SENSE_SOC);
  for (let i=0;i<cand.length;i++){
    const o = cand[i]; if (o===c) continue;
    const dx = o.pos.x - c.pos.x, dy = o.pos.y - c.pos.y;
    const d2 = dx*dx + dy*dy;
    if (d2 < bestD2){ bestD2=d2; nearest={ id:o.id, sex:o.sex, x:o.pos.x, y:o.pos.y, dist:Math.sqrt(d2) }; }
    if (o.sex !== c.sex && d2 < bestMD2){ bestMD2=d2; mate={ id:o.id, sex:o.sex, x:o.pos.x, y:o.pos.y, dist:Math.sqrt(d2) }; }
  }
  return { nearest, mate };
}

/* ------------------------------------- Act --------------------------------- */

function act(c, a, dt){
  c.vel.x += a.ax * dt;
  c.vel.y += a.ay * dt;

  const v2 = c.vel.x*c.vel.x + c.vel.y*c.vel.y;
  const vmax2 = MOVE_S_MAX*MOVE_S_MAX;
  if (v2 > vmax2){
    const s = MOVE_S_MAX / Math.sqrt(v2);
    c.vel.x *= s; c.vel.y *= s;
  }

  c.pos.x += c.vel.x * dt;
  c.pos.y += c.vel.y * dt;

  keepInBounds(c);
}

/* ------------------------------- Energie/ Essen ---------------------------- */

function metabolicLoss(c){
  const juvenile = (c.age < JUV_AGE_S);
  const base = juvenile ? META_BASE * META_JUV_FR : META_BASE;
  const v = Math.hypot(c.vel.x, c.vel.y);
  const move = (MOVE_COST_S * (v / MOVE_S_MAX));
  return base + move;
}

function eatNearbyUsingGrid(c){
  const cand = GRID.queryFoodsCircle(c.pos.x, c.pos.y, EAT_RADIUS);
  for (let i=0;i<cand.length;i++){
    const f = cand[i];
    if (f.__dead) continue;
    // Distanz ist durch query bereits ≤ EAT_RADIUS
    f.__dead = true;
    c.energy = Math.min(E_MAX, c.energy + E_FOOD);
    return true;
  }
  return false;
}

function compactFoods(){
  const f = foods(); if (!f.length) return;
  let w = 0;
  for (let i=0;i<f.length;i++){
    const item = f[i];
    if (!item.__dead){
      if (w !== i) f[w] = item;
      w++;
    }
  }
  f.length = w;
}

/* ------------------------- Start-Boost: Kinder-Erzeugung -------------------- */

function blendMutateGenes(base, other, mix = 0.7, sigma = 0.06){
  const b = base || {}, o = other || {};
  return {
    EFF: clamp(mix*(b.EFF ?? 0.5) + (1-mix)*(o.EFF ?? 0.5) + randn()*sigma, 0, 1),
    MET: clamp(mix*(b.MET ?? 0.5) + (1-mix)*(o.MET ?? 0.5) + randn()*sigma, 0, 1),
    SCH: clamp(mix*(b.SCH ?? 0.5) + (1-mix)*(o.SCH ?? 0.5) + randn()*sigma, 0, 1),
    TEM: clamp(mix*(b.TEM ?? 0.5) + (1-mix)*(o.TEM ?? 0.5) + randn()*sigma, 0, 1),
    GRÖ: clamp(mix*(b.GRÖ ?? b.GRO ?? 0.5) + (1-mix)*(o.GRÖ ?? o.GRO ?? 0.5) + randn()*sigma, 0, 1),
  };
}

function spawnBroodAround(parent, partnerGenes, count, namePrefix){
  for (let i=0;i<count;i++){
    const ang = Math.random()*Math.PI*2;
    const rad = 6 + Math.random()*10;
    const x = clamp(parent.pos.x + Math.cos(ang)*rad, 4, WORLD_W-4);
    const y = clamp(parent.pos.y + Math.sin(ang)*rad, 4, WORLD_H-4);
    const genes = blendMutateGenes(parent.genes, partnerGenes, 0.7, 0.06);
    const sex = (i % 2 === 0) ? "M" : "F";
    const name = `${namePrefix}${i+1}`;
    addCell(name, sex, x, y, genes);
  }
}

/* ------------------------------- Public API -------------------------------- */

export function setWorldSize(w,h){
  WORLD_W = Math.max(100, w|0);
  WORLD_H = Math.max(100, h|0);
  GRID.build(WORLD_W, WORLD_H); // Grid sofort an neue Welt anpassen
}

export function getCells(){ return CELLS; }

export function getFoodItems(){ return foods(); }

export function applyEnvironment(_e){ /* no-op */ }

export function createAdamAndEve(){
  CELLS.length = 0; NEXT_ID = 1;
  const cx = WORLD_W*0.5, cy = WORLD_H*0.5;

  const adam = addCell("Adam", "M", cx-12, cy, { EFF:0.55, MET:0.45, SCH:0.50, TEM:0.55, GRÖ:0.52 });
  const eva  = addCell("Eva",  "F", cx+12, cy, { EFF:0.60, MET:0.50, SCH:0.60, TEM:0.45, GRÖ:0.48 });

  // Start-Boost: je 5 Kinder um Adam/Eva
  spawnBroodAround(adam, eva.genes, 5, "A");
  spawnBroodAround(eva,  adam.genes, 5, "E");
}

/** Optional-Export: neues Kind erzeugen (für reproduction.js) */
export function spawnChild(x, y, genes, sexOpt){
  const sex = sexOpt || (Math.random() < 0.5 ? "M" : "F");
  const name = sex === "M" ? "Neo" : "Nia";
  const m = 4;
  const px = clamp(x, m, WORLD_W - m);
  const py = clamp(y, m, WORLD_H - m);
  return addCell(name, sex, px, py, genes);
}

/* ---------------------------------- Step ----------------------------------- */

export function step(dt, _env = {}, tSec = 0){
  dt = Math.max(0, Math.min(0.2, +dt || 0));

  // 0) Grid für diesen Frame aufbauen
  GRID.ensure();
  GRID.rebuildFoods(foods());
  GRID.rebuildCells(CELLS);

  // 1) AGE / COOLDOWN
  for (let i=0;i<CELLS.length;i++){
    const c = CELLS[i];
    c.age += dt;
    if (c.cooldown > 0) c.cooldown -= dt;
    if (c.drive){
      const v = Math.hypot(c.vel.x, c.vel.y);
      if (v < 8) c.drive.fatigue = Math.max(0, c.drive.fatigue - 0.25*dt);
      c.drive.wantMate = false; // wird in drives ggf. gesetzt
    }
  }

  // 2) PERCEIVE → DECIDE → ACT
  for (let i=0;i<CELLS.length;i++){
    const c = CELLS[i];
    const percept = {
      food: perceiveFood(c),
      ...perceiveNeighbor(c),
      energyRel: c.energy / E_MAX,
      isJuvenile: c.age < JUV_AGE_S
    };
    const ctx = { world:{ w: WORLD_W, h: WORLD_H }, percept };
    const a = (drives.decide?.(c, { ...ctx, dt, tSec })) || { ax:0, ay:0 };
    act(c, a, dt);
  }

  // 3) ENERGY & EAT (Food via Grid; entfernte Foods am Ende kompaktieren)
  for (let i=0;i<CELLS.length;i++){
    const c = CELLS[i];
    c.energy -= metabolicLoss(c) * dt;

    if (eatNearbyUsingGrid(c) && Math.random() < 0.20){
      eatNearbyUsingGrid(c);
    }

    c.energy = clamp(c.energy, 0, E_MAX);
  }
  // Nach allen Konsumaktionen: __FOODS kompaktieren (O(N))
  compactFoods();

  // 4) CLEANUP (Tote Zellen)
  for (let i=CELLS.length-1;i>=0;i--){
    if (CELLS[i].energy <= 0){
      CELLS.splice(i,1);
    }
  }
}