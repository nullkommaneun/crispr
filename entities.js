// entities.js — Zellen- & Weltzustand, Bewegung/Sensing, Energie & Tod
// Exports: setWorldSize, createAdamAndEve, step, getCells, getFoodItems, applyEnvironment
// Hilfs-Exports: spawnCell, spawnFoodAt

import { getAction, afterStep, initDrives } from "./drives.js";

/* --------------------------- Welt / Speicher --------------------------- */
let W = 1024, H = 640;
const CELLS = [];
const FOODS = []; // {x,y}

/* ------------------------------ Konstanten ----------------------------- */
// Welt/Physik
const V_MAX = 60;               // px/s
const S_FOOD = 120;             // Sense-Radien
const S_MATE = 150;
const R_EAT  = 10;              // Aufnahmeradius
const EAT_COOLDOWN = 0.15;      // s

// Energie
const MOVE_COEFF_BASE = 0.015;  // E/s bei v^2
const E_BASAL = 0.60;           // E/s (vor Gen-Skalierung)
const AGE_MAX = 180;            // s (Lebensdauer)
const LIMP_E  = 5;              // E-Schwelle für „Limp“-Modus
const LIMP_FACTOR = 0.4;        // Anteil der Maxspeed im Limp

// Food-Ökonomie
const E_FOOD = 12;              // Energie pro Partikel
const DEATH_YIELD = 0.5;        // Anteil Restenergie → Food bei Tod
const DEATH_SPREAD = 12;        // Streuung beim Drop (px)

// Reproduktion / Anzeige
const R_PAIR = 32;              // Paarungsdistanz (Stop-Hilfe)
const AGE_MATURE = 8;           // s

// IDs & Namen
let NEXT_ID = 1;
let NAME_SEQ = 3;               // fortlaufende #Nummern ab #3

/* --------------------- Start-Push (Adam/Eva + Kinder) ------------------- */
const START_PUSH = {
  active: false,
  baseSimT: null,             // tSec bei erstem step
  events: [],                 // {offset, parentId}
  nextIdx: 0,
  sexFlip: 0                  // alternierende Geschlechter
};

/* ------------------------------ Helpers ------------------------------- */
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const rnd   = (a,b)=>a+Math.random()*(b-a);
const len2  = (dx,dy)=>dx*dx+dy*dy;
const len   = (dx,dy)=>Math.sqrt(len2(dx,dy));
const norm01 = g => clamp((g+1)*0.5, 0, 1);

function deriveFromGenome(g){
  const EFF = clamp(+g?.EFF || 0, -1, +1);
  const MET = clamp(+g?.MET || 0, -1, +1);
  const GRO = clamp(+g?.["GRÖ"] ?? +g?.GRO ?? 0, -1, +1);

  const moveCoeff = MOVE_COEFF_BASE * (1 - 0.30 * EFF);
  const basal     = E_BASAL * (1 - 0.25 * MET);
  const eMax      = 100 * (1 + 0.20 * GRO);
  const radius    = 4 + 4 * norm01(GRO);

  return { moveCoeff, basal, eMax, radius };
}

function makeCell(genome, sex, x, y, energyFrac=0.7, opts={}){
  const d = deriveFromGenome(genome);
  return {
    id: NEXT_ID++,
    name: opts.name ?? `#${NAME_SEQ++}`,
    stammId: opts.stammId ?? 0,
    sex: sex || (Math.random()<0.5?'M':'F'),
    pos:{x:x|0, y:y|0},
    vel:{x:0, y:0},
    energy: clamp(d.eMax * clamp(energyFrac,0,1), 0, d.eMax),
    eMax: d.eMax,
    moveCoeff: d.moveCoeff,
    basal: d.basal,
    radius: d.radius,
    age: 0,
    cooldown: 0,
    eatCd: 0,
    genome: {
      EFF: clamp(+genome?.EFF || 0, -1, 1),
      MET: clamp(+genome?.MET || 0, -1, 1),
      ["GRÖ"]: clamp(+genome?.["GRÖ"] ?? +genome?.GRO ?? 0, -1, 1),
      TEM: clamp(+genome?.TEM || 0, -1, 1),
      SCH: clamp(+genome?.SCH || 0, -1, 1),
    },
    __drive: { mode:"wander", until:0, modeSince:0 }
  };
}

/* ------------------------- Öffentliche Helfer ------------------------- */
export function spawnCell(genome, sex, x, y, energyFrac=0.5, opts={}){
  CELLS.push(makeCell(genome, sex, x, y, energyFrac, opts));
}
export function spawnFoodAt(x, y, n=1, spread=DEATH_SPREAD){
  for(let i=0;i<n;i++){
    FOODS.push({ x: x + rnd(-spread, spread), y: y + rnd(-spread, spread) });
  }
}

/* ------------------------- Pflicht-Exports (API) ---------------------- */
export function setWorldSize(w,h){ W=Math.max(2,w|0); H=Math.max(2,h|0); }
export function getCells(){ return CELLS; }
export function getFoodItems(){ return FOODS; }
export function applyEnvironment(_env){ /* aktuell keine globalen Felder */ }

export function createAdamAndEve(){
  if (CELLS.length) return;

  initDrives();
  NAME_SEQ = 3;               // Nummerierung ab #3
  START_PUSH.active   = true;
  START_PUSH.baseSimT = null;
  START_PUSH.events   = [];
  START_PUSH.nextIdx  = 0;
  START_PUSH.sexFlip  = 0;

  // nahe beieinander mittig platzieren
  const cx = W*0.5, cy = H*0.5;
  const ADAM = makeCell({EFF:0,MET:0,["GRÖ"]:0,TEM:0,SCH:0}, 'M', cx-12, cy, 0.75, {name:"Adam", stammId:1});
  const EVA  = makeCell({EFF:0,MET:0,["GRÖ"]:0,TEM:0,SCH:0}, 'F', cx+12, cy, 0.75, {name:"Eva",  stammId:2});
  CELLS.push(ADAM, EVA);

  // je 5 Kinder, alle 0.75s — Start-Push-Plan
  const OFF = 0.75;
  for (let k=0;k<5;k++){
    START_PUSH.events.push({ offset: OFF*k, parentId: ADAM.id });
    START_PUSH.events.push({ offset: OFF*k, parentId: EVA.id  });
  }
}

/* ---------------------------- Sensing/Find ---------------------------- */
function findNearestFood(x,y, maxR=S_FOOD){
  const r2 = maxR*maxR;
  let bestI=-1, bestD2=r2+1;
  for(let i=FOODS.length-1; i>=0; i--){
    const f=FOODS[i]; const d2 = (f.x-x)*(f.x-x) + (f.y-y)*(f.y-y);
    if(d2 < bestD2 && d2 <= r2) { bestD2=d2; bestI=i; }
  }
  if(bestI<0) return null;
  const f=FOODS[bestI];
  return { index: bestI, x:f.x, y:f.y, d2: bestD2, d: Math.sqrt(bestD2) };
}
function findNearestMate(me, maxR=S_MATE){
  const r2 = maxR*maxR;
  let best=null, bestD2=r2+1;
  for(let i=0;i<CELLS.length;i++){
    const c = CELLS[i];
    if (c===me) continue;
    if (c.sex === me.sex) continue;
    if (c.age < AGE_MATURE || me.age < AGE_MATURE) continue;
    if (c.cooldown > 0 || me.cooldown > 0) continue;
    const dx=c.pos.x-me.pos.x, dy=c.pos.y-me.pos.y;
    const d2=dx*dx+dy*dy;
    if(d2 < bestD2 && d2 <= r2){ bestD2=d2; best=c; }
  }
  if (!best) return null;
  return { mate: best, d2: bestD2, d: Math.sqrt(bestD2) };
}

/* ------------------------------ Aufnahme ----------------------------- */
function tryEat(c){
  if (c.eatCd > 0) return;
  const f = findNearestFood(c.pos.x, c.pos.y, R_EAT);
  if (!f) return;
  FOODS.splice(f.index, 1);
  c.energy = Math.min(c.eMax, c.energy + E_FOOD);
  c.eatCd = EAT_COOLDOWN;
}

/* --------------------------- Integration Schritt ---------------------- */
function integrate(c, dt, desiredVx, desiredVy){
  const limp = (c.energy <= LIMP_E);
  const vmax = (limp ? LIMP_FACTOR : 1) * V_MAX;

  const dLen = Math.hypot(desiredVx, desiredVy);
  let vx=0, vy=0;
  if (dLen > 1e-6){
    vx = desiredVx / dLen * vmax;
    vy = desiredVy / dLen * vmax;
  }
  c.vel.x = vx;
  c.vel.y = vy;

  c.pos.x += c.vel.x * dt;
  c.pos.y += c.vel.y * dt;

  if (c.pos.x < c.radius){ c.pos.x = c.radius; c.vel.x = Math.abs(c.vel.x); }
  if (c.pos.x > W - c.radius){ c.pos.x = W - c.radius; c.vel.x = -Math.abs(c.vel.x); }
  if (c.pos.y < c.radius){ c.pos.y = c.radius; c.vel.y = Math.abs(c.vel.y); }
  if (c.pos.y > H - c.radius){ c.pos.y = H - c.radius; c.vel.y = -Math.abs(c.vel.y); }

  const v2 = c.vel.x*c.vel.x + c.vel.y*c.vel.y;
  c.energy -= dt * (c.basal + c.moveCoeff * v2);
  c.energy = clamp(c.energy, 0, c.eMax);
}

/* ------------------------------ Tod / Drop ---------------------------- */
function dieAndDrop(c){
  const n = Math.min(12, Math.max(0, Math.round((c.energy * DEATH_YIELD) / E_FOOD)));
  if (n > 0) spawnFoodAt(c.pos.x, c.pos.y, n, DEATH_SPREAD);
}

/* ---------------------- Start-Push Ausführung (sim) -------------------- */
function doStartPush(tSec){
  if (!START_PUSH.active) return;
  if (START_PUSH.baseSimT == null) START_PUSH.baseSimT = tSec;
  const rel = tSec - START_PUSH.baseSimT;

  while (START_PUSH.nextIdx < START_PUSH.events.length &&
         START_PUSH.events[START_PUSH.nextIdx].offset <= rel){
    const ev = START_PUSH.events[START_PUSH.nextIdx++];
    const parent = CELLS.find(c=>c.id===ev.parentId);
    if (!parent) continue;

    // Kind nahe am Elternteil, Genome = parent ± kleine Mutation
    const childGenome = {
      EFF: clamp(parent.genome.EFF + rnd(-0.05, 0.05), -1, 1),
      MET: clamp(parent.genome.MET + rnd(-0.05, 0.05), -1, 1),
      ["GRÖ"]: clamp(parent.genome["GRÖ"] + rnd(-0.05, 0.05), -1, 1),
      TEM: clamp(parent.genome.TEM + rnd(-0.05, 0.05), -1, 1),
      SCH: clamp(parent.genome.SCH + rnd(-0.05, 0.05), -1, 1),
    };
    const sex = (START_PUSH.sexFlip++ % 2 === 0) ? 'M' : 'F';
    const px = parent.pos.x + rnd(-8, 8);
    const py = parent.pos.y + rnd(-8, 8);

    spawnCell(childGenome, sex, px, py, 0.4, { stammId: parent.stammId });
  }

  if (START_PUSH.nextIdx >= START_PUSH.events.length){
    START_PUSH.active = false;
  }
}

/* --------------------------------- STEP -------------------------------- */
export function step(dt, _env, tSec){
  // Start-Push ggf. abarbeiten (simulation time)
  doStartPush(tSec);

  for (let i=CELLS.length-1; i>=0; i--){
    const c = CELLS[i];

    c.age += dt;
    if (c.cooldown > 0) c.cooldown = Math.max(0, c.cooldown - dt);
    if (c.eatCd    > 0) c.eatCd    = Math.max(0, c.eatCd - dt);

    if (c.age >= AGE_MAX || c.energy <= 0){
      dieAndDrop(c);
      CELLS.splice(i,1);
      continue;
    }

    // Sensing
    const foodN = findNearestFood(c.pos.x, c.pos.y, S_FOOD);
    const mateN = findNearestMate(c, S_MATE);

    // Drives-Entscheidung
    const act = getAction(c, tSec, {
      food: !!foodN,
      mate: !!mateN?.mate,
      mateDist: mateN?.d ?? null
    });

    // Zielrichtung
    let tx = 0, ty = 0;
    if (act === "mate" && mateN){
      const dx = (mateN.mate.pos.x - c.pos.x);
      const dy = (mateN.mate.pos.y - c.pos.y);
      const d  = Math.max(1e-6, mateN.d);
      const stop = (d < R_PAIR*0.6);
      const scale = stop ? 0.35 : 1.0;
      tx = dx * scale; ty = dy * scale;
    } else if (act === "food" && foodN){
      const dx=(foodN.x - c.pos.x), dy=(foodN.y - c.pos.y);
      const d = Math.max(1e-6, foodN.d);
      const stop = (d < R_EAT*0.8);
      const scale = stop ? 0.25 : 1.0;
      tx = dx * scale; ty = dy * scale;
    } else {
      tx = (Math.random()-0.5)*0.6;
      ty = (Math.random()-0.5)*0.6;
      tx += (W*0.5 - c.pos.x) * 0.0006;
      ty += (H*0.5 - c.pos.y) * 0.0006;
    }

    integrate(c, dt, tx, ty);
    tryEat(c);
    afterStep(c, dt, { act });
  }
}