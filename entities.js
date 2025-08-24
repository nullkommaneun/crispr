/**
 * entities.js — Quelle der Wahrheit für Zellen/Bewegung/Energie + Food-Interaktion
 * Exports (kompatibel): setWorldSize, getCells, getFoodItems, createAdamAndEve, step, applyEnvironment
 * Zusätzlicher, optionaler Export: spawnChild(x, y, genes?, sex?)  → neue Zelle mit Genen
 *
 * Architektur (Phasen je Tick):
 *  1) AGE/COOLDOWN      – Alter & Timings updaten
 *  2) PERCEIVE          – nächstes Food, (option.) nächster Nachbar / potenzieller Partner
 *  3) DECIDE (drives)   – menschlich anmutende Needs/Utilities → Beschleunigung
 *  4) ACT               – kinematische Integration + Weltgrenzen
 *  5) ENERGY & EAT      – Stoffwechsel (inkl. Bewegungskosten) + Food-Aufnahme
 *  6) CLEANUP           – Tote Zellen entfernen
 *
 * Designziele:
 *  - Logik bleibt modular (Entscheidungen in drives.js; Paarung in reproduction.js)
 *  - Zellen tragen Gene {EFF,MET,SCH,TEM,GRÖ}, die in drives.js zu Traits abgeleitet werden
 *  - Perception liefert genug Kontext (Food, Nachbar, Mate-Kandidat) für menschliche Policies
 */

import * as drives from "./drives.js";

/* --------------------------------- Tuning ---------------------------------- */
// Energetik
const E_START     = 80;     // Startenergie
const E_MAX       = 140;    // Obergrenze für Energie
const E_FOOD      = 22;     // Energiegewinn pro Food
const EAT_RADIUS  = 9;      // Radius für "Essen berührt Zelle"
const META_BASE   = 0.10;   // Grundumsatz [E/s]
const META_JUV_FR = 0.55;   // Juveniler Schutzfaktor auf Grundumsatz
const JUV_AGE_S   = 12;     // juvenile Dauer [s]
const MOVE_COST_S = 0.025;  // Bewegungsaufschlag [E/s] bei Vmax (linear skaliert)

// Kinematik
const MOVE_S_MAX  = 55;     // maximale Geschwindigkeit [px/s]

// Wahrnehmung
const SENSE_FOOD  = 110;    // Food-Radius [px]
const SENSE_SOC   = 120;    // Sozial-/Mate-Radius [px]

// Welt
let WORLD_W = 800, WORLD_H = 500;

/* ------------------------------ Welt / Zustand ------------------------------ */

const CELLS = [];
let NEXT_ID = 1;

function foods(){
  return Array.isArray(window.__FOODS) ? window.__FOODS : (window.__FOODS = []);
}

/* --------------------------------- Helpers --------------------------------- */

function clamp(v, lo, hi){ return v < lo ? lo : (v > hi ? hi : v); }
function rnd(min,max){ return min + Math.random()*(max-min); }

function keepInBounds(c){
  // einfache Kollision an Rändern (prallen & dämpfen)
  if (c.pos.x < 3){ c.pos.x=3; if (c.vel.x<0) c.vel.x*=-0.5; }
  if (c.pos.x > WORLD_W-3){ c.pos.x=WORLD_W-3; if (c.vel.x>0) c.vel.x*=-0.5; }
  if (c.pos.y < 3){ c.pos.y=3; if (c.vel.y<0) c.vel.y*=-0.5; }
  if (c.pos.y > WORLD_H-3){ c.pos.y=WORLD_H-3; if (c.vel.y>0) c.vel.y*=-0.5; }
}

/* -------------------------------- CellModel -------------------------------- */

function addCell(name, sex, x, y, genesOpt){
  // Gene: defensiv, falls nicht angegeben
  const genes = genesOpt && typeof genesOpt === "object" ? {
    EFF: clamp(+genesOpt.EFF ?? 0.5, 0, 1),
    MET: clamp(+genesOpt.MET ?? 0.5, 0, 1),
    SCH: clamp(+genesOpt.SCH ?? 0.5, 0, 1),
    TEM: clamp(+genesOpt.TEM ?? 0.5, 0, 1),
    GRÖ: clamp(+genesOpt.GRÖ ?? (genesOpt.GRO ?? 0.5), 0, 1)
  } : { EFF:0.5, MET:0.5, SCH:0.5, TEM:0.5, GRÖ:0.5 };

  const c = {
    id: NEXT_ID++, name, sex,               // 'M' oder 'F'
    pos: { x, y },
    vel: { x: rnd(-10,10), y: rnd(-10,10) },
    energy: E_START,
    age: 0,
    cooldown: 0,
    vitality: 1,
    genes,
    // Drive-Localstate (für menschliche Policies)
    drive: {
      wanderAngle: Math.random()*Math.PI*2,
      lastMode: "wander",
      fatigue: 0,     // wächst mit Bewegung, sinkt bei Rest
      wantMate: false // Flag, das drives setzen darf
    }
  };
  CELLS.push(c);
  return c;
}

/* ------------------------------- Perception -------------------------------- */

function perceiveFood(c){
  const f = foods();
  let bestIdx = -1, bestD2 = (SENSE_FOOD*SENSE_FOOD);

  for (let i=0;i<f.length;i++){
    const dx = f[i].x - c.pos.x, dy = f[i].y - c.pos.y;
    const d2 = dx*dx + dy*dy;
    if (d2 <= bestD2){
      bestD2 = d2; bestIdx = i;
    }
  }
  if (bestIdx >= 0){
    const target = f[bestIdx];
    return { x: target.x, y: target.y, dist: Math.sqrt(bestD2) };
  }
  return null;
}

function perceiveNeighbor(c){
  // Einfach: nächster beliebiger Nachbar + nächster potenzieller Partner (Gegengeschlecht)
  let nearest = null, bestD2 = (SENSE_SOC*SENSE_SOC);
  let mate    = null, bestMD2 = (SENSE_SOC*SENSE_SOC);

  for (let i=0;i<CELLS.length;i++){
    const o = CELLS[i];
    if (o === c) continue;
    const dx = o.pos.x - c.pos.x, dy = o.pos.y - c.pos.y;
    const d2 = dx*dx + dy*dy;
    if (d2 < bestD2){ bestD2 = d2; nearest = { id:o.id, sex:o.sex, x:o.pos.x, y:o.pos.y, dist:Math.sqrt(d2) }; }
    if (o.sex !== c.sex && d2 < bestMD2){ bestMD2 = d2; mate = { id:o.id, sex:o.sex, x:o.pos.x, y:o.pos.y, dist:Math.sqrt(d2) }; }
  }
  return { nearest, mate };
}

/* ------------------------------------- Act --------------------------------- */

function act(c, a, dt){
  // v += a*dt
  c.vel.x += a.ax * dt;
  c.vel.y += a.ay * dt;

  // clamp speed
  const v2 = c.vel.x*c.vel.x + c.vel.y*c.vel.y;
  const vmax2 = MOVE_S_MAX*MOVE_S_MAX;
  if (v2 > vmax2){
    const s = MOVE_S_MAX / Math.sqrt(v2);
    c.vel.x *= s; c.vel.y *= s;
  }

  // p += v*dt
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
  return base + move; // [E/s]
}

/** Frisst ein einzelnes Food-Item in Reichweite; gibt true bei Erfolg */
function eatNearby(c){
  const f = foods();
  if (!f.length) return false;
  const R2 = EAT_RADIUS*EAT_RADIUS;

  for (let i = 0; i < f.length; i++){
    const dx = f[i].x - c.pos.x, dy = f[i].y - c.pos.y;
    if ((dx*dx + dy*dy) <= R2){
      c.energy = Math.min(E_MAX, c.energy + E_FOOD);
      // swap-pop
      const last = f.length - 1;
      if (i !== last) f[i] = f[last];
      f.pop();
      return true;
    }
  }
  return false;
}

/* ------------------------------- Public API -------------------------------- */

export function setWorldSize(w,h){
  WORLD_W = Math.max(100, w|0);
  WORLD_H = Math.max(100, h|0);
}

export function getCells(){ return CELLS; }

// Renderer nutzt window.__FOODS; hier geben wir sie offiziell zurück
export function getFoodItems(){ return foods(); }

// Environment aktuell nicht genutzt; behalten für API-Stabilität
export function applyEnvironment(_e){ /* no-op */ }

export function createAdamAndEve(){
  CELLS.length = 0; NEXT_ID = 1;
  const cx = WORLD_W*0.5, cy = WORLD_H*0.5;
  // Gene für Adam/Eva: leicht unterschiedliche Defaults
  addCell("Adam", "M", cx-12, cy, { EFF:0.55, MET:0.45, SCH:0.50, TEM:0.55, GRÖ:0.52 });
  addCell("Eva",  "F", cx+12, cy, { EFF:0.60, MET:0.50, SCH:0.60, TEM:0.45, GRÖ:0.48 });
}

/** Optional-Export: neues Kind erzeugen (für reproduction.js) */
export function spawnChild(x, y, genes, sexOpt){
  const sex = sexOpt || (Math.random() < 0.5 ? "M" : "F");
  const name = sex === "M" ? "Neo" : "Nia";
  const m = 4; // kleiner Rand
  const px = clamp(x, m, WORLD_W - m);
  const py = clamp(y, m, WORLD_H - m);
  return addCell(name, sex, px, py, genes);
}

/* ---------------------------------- Step ----------------------------------- */

export function step(dt, _env = {}, tSec = 0){
  dt = Math.max(0, Math.min(0.2, +dt || 0));

  // 1) AGE / COOLDOWN
  for (let i=0;i<CELLS.length;i++){
    const c = CELLS[i];
    c.age += dt;
    if (c.cooldown > 0) c.cooldown -= dt;
    // leichte Müdigkeit abbauen, wenn Geschwindigkeit gering ist (drive.fatigue wird in drives aufgebaut)
    if (c.drive) {
      const v = Math.hypot(c.vel.x, c.vel.y);
      if (v < 8) c.drive.fatigue = Math.max(0, c.drive.fatigue - 0.25*dt);
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
    const a = drives.decide?.(c, { ...ctx, dt, tSec }) || { ax:0, ay:0 };
    act(c, a, dt);
  }

  // 3) ENERGY & EAT
  for (let i=0;i<CELLS.length;i++){
    const c = CELLS[i];
    c.energy -= metabolicLoss(c) * dt;

    if (eatNearby(c) && Math.random() < 0.20){
      // zweites Stück, wenn direkt drauf steht
      eatNearby(c);
    }

    c.energy = clamp(c.energy, 0, E_MAX);
  }

  // 4) CLEANUP (Tote entfernen)
  for (let i=CELLS.length-1;i>=0;i--){
    if (CELLS[i].energy <= 0){
      CELLS.splice(i,1);
    }
  }
}