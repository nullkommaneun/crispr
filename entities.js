/**
 * entities.js — Quelle der Wahrheit für Zellen/Bewegung/Energie + Food-Interaktion
 * Exports: setWorldSize, getCells, getFoodItems, createAdamAndEve, step, applyEnvironment
 *
 * Inhalt & Architektur:
 *  - Tuning (Fallback-Konstanten; unabhängig von config.js)
 *  - Weltzustand & CellModel (Struktur einer Zelle)
 *  - Perception (lokale Wahrnehmung, z. B. nächstes Food im Radius)
 *  - Decision (delegiert an drives.decide; Fallback "wander")
 *  - Act (Physik: v += a*dt, clamp speed, Bounds)
 *  - Energie & Essen (metabolicLoss, eatNearby)
 *  - Public API (Weltgröße, Seeding, Step-Phasen)
 *
 * Designziele:
 *  - Klarer Phasenablauf: perceive → decide → act → energy/eat → cleanup
 *  - Austauschbare Policy via drives.decide(cell, ctx)
 *  - Sanfte Defaults („gutmütig“), kompatibel mit bestehender UI/Engine
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
const SENSE_FOOD  = 110;    // Wahrnehmungsradius für Food [px]

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

function addCell(name, sex, x, y){
  const c = {
    id: NEXT_ID++, name, sex,               // 'M' oder 'F'
    pos: { x, y },
    vel: { x: rnd(-10,10), y: rnd(-10,10) },
    energy: E_START,
    age: 0,
    cooldown: 0,
    vitality: 1,
    // Drive-Localstate (für wander o.ä.)
    drive: { wanderAngle: Math.random()*Math.PI*2, lastMode:"wander" }
  };
  CELLS.push(c);
  return c;
}

/* -------------------------------- Perception ------------------------------- */

function perceive(c){
  // Nächstes Food im Wahrnehmungsradius (euklidisch)
  const f = foods();
  let bestIdx = -1, bestD2 = (SENSE_FOOD*SENSE_FOOD), best = null;

  for (let i=0;i<f.length;i++){
    const dx = f[i].x - c.pos.x, dy = f[i].y - c.pos.y;
    const d2 = dx*dx + dy*dy;
    if (d2 <= bestD2){
      bestD2 = d2; bestIdx = i;
    }
  }
  if (bestIdx >= 0){
    const target = f[bestIdx];
    const dist = Math.sqrt(bestD2);
    best = { x: target.x, y: target.y, dist };
  }
  return {
    food: best,                               // {x,y,dist} | null
    energyRel: c.energy / E_MAX,              // 0..1
    isJuvenile: c.age < JUV_AGE_S
  };
}

/* ---------------------------------- Decision ------------------------------- */

function decide(c, ctx, dt, tSec){
  // Delegation an drives.decide – liefert {ax, ay, mode?}
  // Fallback: wander, falls nicht vorhanden
  try {
    const out = drives.decide?.(c, { ...ctx, dt, tSec }) || null;
    if (out && Number.isFinite(out.ax) && Number.isFinite(out.ay)) {
      if (out.mode) c.drive.lastMode = out.mode;
      return { ax: out.ax, ay: out.ay };
    }
  } catch {}
  // Fallback: leichtes „Zappeln“ + Mitte-Pull
  const cx = WORLD_W*0.5, cy = WORLD_H*0.5;
  const toC = { x: (cx - c.pos.x) * 0.12, y: (cy - c.pos.y) * 0.12 };
  return { ax: rnd(-30,30) + toC.x, ay: rnd(-30,30) + toC.y };
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
  addCell("Adam", "M", cx-12, cy);
  addCell("Eva",  "F", cx+12, cy);
}

/* ---------------------------------- Step ----------------------------------- */

export function step(dt, _env = {}, tSec = 0){
  dt = Math.max(0, Math.min(0.2, +dt || 0));

  // 1) AGE / COOLDOWN
  for (let i=0;i<CELLS.length;i++){
    const c = CELLS[i];
    c.age += dt;
    if (c.cooldown > 0) c.cooldown -= dt;
  }

  // 2) PERCEIVE → DECIDE → ACT
  for (let i=0;i<CELLS.length;i++){
    const c = CELLS[i];
    const percept = perceive(c);
    const ctx = { world:{ w: WORLD_W, h: WORLD_H }, percept };
    const a = decide(c, ctx, dt, tSec);
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