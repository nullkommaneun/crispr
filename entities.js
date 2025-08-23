// entities.js — Zellen- & Weltzustand, Bewegung/Sensing, Energie & Tod
// Exports: setWorldSize, createAdamAndEve, step, getCells, getFoodItems, applyEnvironment
// (zusätzlich: spawnCell, spawnFoodAt – hilfreiche öffentliche Helfer)

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

// Reproduktion (für Sanity & Anzeige, eigentliche Koppelung in reproduction.js)
const R_PAIR = 32;              // Paarungsdistanz (Anzeige/Stop-Hilfe)
const AGE_MATURE = 8;           // s, geschlechtsreif

// IDs
let NEXT_ID = 1;

/* ------------------------------ Helpers ------------------------------- */
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const lerp  = (a,b,t)=>a+(b-a)*t;
const rnd   = (a,b)=>a+Math.random()*(b-a);
const len2  = (dx,dy)=>dx*dx+dy*dy;
const len   = (dx,dy)=>Math.sqrt(len2(dx,dy));
const norm01 = g => clamp((g+1)*0.5, 0, 1); // [-1,1] -> [0,1]

function deriveFromGenome(g){
  // Robust gegen fehlende Keys
  const EFF = clamp(+g?.EFF || 0, -1, +1);
  const MET = clamp(+g?.MET || 0, -1, +1);
  const GRO = clamp(+g?.["GRÖ"] ?? +g?.GRO ?? 0, -1, +1);

  const moveCoeff = MOVE_COEFF_BASE * (1 - 0.30 * EFF);
  const basal     = E_BASAL * (1 - 0.25 * MET);
  const eMax      = 100 * (1 + 0.20 * GRO);
  const radius    = 4 + 4 * norm01(GRO);

  return { moveCoeff, basal, eMax, radius };
}

function makeCell(genome, sex, x, y, energyFrac=0.7){
  const d = deriveFromGenome(genome);
  return {
    id: NEXT_ID++,
    name: `C${Date.now()%10000}${Math.floor(Math.random()*90+10)}`,
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
export function spawnCell(genome, sex, x, y, energyFrac=0.5){
  CELLS.push(makeCell(genome, sex, x, y, energyFrac));
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
  if (!CELLS.length){
    initDrives(); // einmalig sicherstellen
    const g0 = { EFF:0, MET:0, ["GRÖ"]:0, TEM:0, SCH:0 };
    const ax = rnd(0.2*W, 0.4*W), ay = rnd(0.3*H, 0.7*H);
    const bx = rnd(0.6*W, 0.8*W), by = rnd(0.3*H, 0.7*H);
    CELLS.push(makeCell(g0, 'M', ax, ay, 0.75));
    CELLS.push(makeCell(g0, 'F', bx, by, 0.75));
  }
}

/* ---------------------------- Sensing/Find ---------------------------- */
function findNearestFood(x,y, maxR=S_FOOD){
  const r2 = maxR*maxR;
  let bestI=-1, bestD2=r2+1;
  for(let i=FOODS.length-1; i>=0; i--){
    const f=FOODS[i]; const d2 = len2(f.x-x, f.y-y);
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
    // einfache Gatings (sanity); drives macht den Rest energetisch
    if (c.age < AGE_MATURE || me.age < AGE_MATURE) continue;
    if (c.cooldown > 0 || me.cooldown > 0) continue;
    const d2 = len2(c.pos.x-me.pos.x, c.pos.y-me.pos.y);
    if(d2 < bestD2 && d2 <= r2){ bestD2=d2; best=c; }
  }
  if (!best) return null;
  return { mate: best, d2: bestD2, d: Math.sqrt(bestD2) };
}

/* ------------------------------ Aufnahme ----------------------------- */
function tryEat(c){
  if (c.eatCd > 0) return;
  // Schnellprüfung: naheliegendes Food suchen
  const f = findNearestFood(c.pos.x, c.pos.y, R_EAT);
  if (!f) return;
  // aufheben (ein Partikel)
  FOODS.splice(f.index, 1);
  c.energy = Math.min(c.eMax, c.energy + E_FOOD);
  c.eatCd = EAT_COOLDOWN;
}

/* --------------------------- Integration Schritt ---------------------- */
function integrate(c, dt, desiredVx, desiredVy){
  // Limp-Mode & Maxspeed
  const limp = (c.energy <= LIMP_E);
  const vmax = (limp ? LIMP_FACTOR : 1) * V_MAX;

  // gewünschte Geschwindigkeit als Richtung * vmax
  const dLen = len(desiredVx, desiredVy);
  let vx=0, vy=0;
  if (dLen > 1e-6){
    vx = desiredVx / dLen * vmax;
    vy = desiredVy / dLen * vmax;
  }
  c.vel.x = vx;
  c.vel.y = vy;

  // Position
  c.pos.x += c.vel.x * dt;
  c.pos.y += c.vel.y * dt;

  // Ränder: Bounce
  if (c.pos.x < c.radius){ c.pos.x = c.radius; c.vel.x = Math.abs(c.vel.x); }
  if (c.pos.x > W - c.radius){ c.pos.x = W - c.radius; c.vel.x = -Math.abs(c.vel.x); }
  if (c.pos.y < c.radius){ c.pos.y = c.radius; c.vel.y = Math.abs(c.vel.y); }
  if (c.pos.y > H - c.radius){ c.pos.y = H - c.radius; c.vel.y = -Math.abs(c.vel.y); }

  // Energieverbrauch (basal + bewegung)
  const v2 = c.vel.x*c.vel.x + c.vel.y*c.vel.y;
  c.energy -= dt * (c.basal + c.moveCoeff * v2);
  c.energy = clamp(c.energy, 0, c.eMax);
}

/* ------------------------------ Tod / Drop ---------------------------- */
function dieAndDrop(c){
  // Futter aus Restenergie
  const n = Math.min(12, Math.max(0, Math.round((c.energy * DEATH_YIELD) / E_FOOD)));
  if (n > 0) spawnFoodAt(c.pos.x, c.pos.y, n, DEATH_SPREAD);
}

/* --------------------------------- STEP -------------------------------- */
export function step(dt, _env, tSec){
  // Zähler & Cooldowns
  for (let i=CELLS.length-1; i>=0; i--){
    const c = CELLS[i];

    // Aging / Cooldowns
    c.age += dt;
    if (c.cooldown > 0) c.cooldown = Math.max(0, c.cooldown - dt);
    if (c.eatCd    > 0) c.eatCd    = Math.max(0, c.eatCd - dt);

    // Sanity: Tod durch Alter oder Energie
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
      food: !!foodN,             // bool
      mate: !!mateN?.mate,       // bool
      mateDist: mateN?.d ?? null // Zahl oder null
    });

    // Zielrichtung setzen
    let tx = 0, ty = 0;
    if (act === "mate" && mateN){
      // sanft auf Partner zusteuern, beim Kontakt leicht abbremsen
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
      // Wander: leichte Rauschdrift + sehr sanftes Zurück in Bounds
      tx = (Math.random()-0.5)*0.6;
      ty = (Math.random()-0.5)*0.6;
      // weiches Zentrum
      tx += (W*0.5 - c.pos.x) * 0.0006;
      ty += (H*0.5 - c.pos.y) * 0.0006;
    }

    // Integration & Energie
    integrate(c, dt, tx, ty);

    // Essen (nach dem Bewegen, wenn nahe dran)
    tryEat(c);

    // Feedback-Hook (optional analytics)
    afterStep(c, dt, { act });
  }
}

/* ------------------------- Debug/Dev-Helfer (optional) ---------------- */
// (keine weiteren Exports nötig, API bleibt kompatibel)