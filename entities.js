// entities.js — Zellen, Weltgröße, Energiehaushalt, "Essen in Reichweite"
// Exports: setWorldSize, getCells, getFoodItems, createAdamAndEve, step, applyEnvironment

/* ------------------------------ Welt / Zustand ------------------------------ */

let WORLD_W = 800, WORLD_H = 500;
const CELLS = [];
let NEXT_ID = 1;

/* --------------------------------- Tuning ---------------------------------- */
// Ziel: „gutmütig“ – Zellen sterben nicht sofort, Food lohnt sich sichtbar.

const E_START     = 80;     // Startenergie
const E_MAX       = 140;    // Obergrenze für Energie
const E_FOOD      = 22;     // Energiegewinn pro Food
const EAT_RADIUS  = 9;      // Reichweite zum „Aufheben“

const META_BASE   = 0.10;   // Basisverbrauch (E/s)
const META_JUV_FR = 0.55;   // Juveniler Schutzfaktor
const JUV_AGE_S   = 12;     // juvenile Dauer (s)

const MOVE_S_MAX  = 55;     // max. Geschwindigkeit (px/s)
const MOVE_NOISE  = 30;     // zufällige Rauschbeschleunigung (px/s^2)

const MOVE_COST_S = 0.025;  // Bewegungsaufschlag (E/s) bei Vmax (skaliert linear)

/* --------------------------------- Helpers --------------------------------- */

function clamp(v,min,max){ return v<min?min:v>max?max:v; }

function rnd(min,max){ return min + Math.random()*(max-min); }

function addCell(name, sex, x, y){
  const c = {
    id: NEXT_ID++, name,
    sex,                       // 'M' oder 'F'
    pos: { x, y },
    vel: { x: rnd(-10,10), y: rnd(-10,10) },
    energy: E_START,
    age: 0,
    cooldown: 0,               // für Fortpflanzung (falls genutzt)
    vitality: 1                // Platzhalter für spätere Genetik
  };
  CELLS.push(c);
  return c;
}

function keepInBounds(c, dt){
  // einfache Kollision an Rändern (prallen)
  if (c.pos.x < 3){ c.pos.x=3; if (c.vel.x<0) c.vel.x*=-0.5; }
  if (c.pos.x > WORLD_W-3){ c.pos.x=WORLD_W-3; if (c.vel.x>0) c.vel.x*=-0.5; }
  if (c.pos.y < 3){ c.pos.y=3; if (c.vel.y<0) c.vel.y*=-0.5; }
  if (c.pos.y > WORLD_H-3){ c.pos.y=WORLD_H-3; if (c.vel.y>0) c.vel.y*=-0.5; }
}

/* ------------------------------ Food-Integration --------------------------- */

function foods(){ return Array.isArray(window.__FOODS) ? window.__FOODS : (window.__FOODS = []); }

/** Frisst ein einzelnes Food-Item in Reichweite; gibt true zurück, wenn gegessen */
function tryEat(c){
  const f = foods();
  if (!f.length) return false;
  // Schnelle lineare Suche (gutmütig bei hunderten Items)
  // Für spätere Optimierung: Spatial Grid.
  for (let i = 0; i < f.length; i++){
    const dx = f[i].x - c.pos.x, dy = f[i].y - c.pos.y;
    if ((dx*dx + dy*dy) <= (EAT_RADIUS*EAT_RADIUS)){
      // essen
      c.energy = Math.min(E_MAX, c.energy + E_FOOD);
      // entferne Food schnell (swap-pop verhindert O(n) splice-Kosten)
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

// Renderer nutzt bereits window.__FOODS als Fallback; hier geben wir sie offiziell zurück
export function getFoodItems(){ return foods(); }

export function applyEnvironment(_e){ /* aktuell keine Umwelteffekte */ }

export function createAdamAndEve(){
  CELLS.length = 0; NEXT_ID = 1;
  const cx = WORLD_W*0.5, cy = WORLD_H*0.5;
  addCell("Adam", "M", cx-12, cy);
  addCell("Eva",  "F", cx+12, cy);
}

/* --------------------------------- Movement -------------------------------- */

function wander(c, dt){
  // Rauschbeschleunigung
  c.vel.x += rnd(-MOVE_NOISE, MOVE_NOISE) * dt;
  c.vel.y += rnd(-MOVE_NOISE, MOVE_NOISE) * dt;

  // begrenzen
  const v2 = c.vel.x*c.vel.x + c.vel.y*c.vel.y;
  const vmax = MOVE_S_MAX;
  if (v2 > vmax*vmax){
    const v = Math.sqrt(v2);
    const s = vmax / v;
    c.vel.x *= s; c.vel.y *= s;
  }

  // bewegen
  c.pos.x += c.vel.x * dt;
  c.pos.y += c.vel.y * dt;

  keepInBounds(c, dt);
}

/* ------------------------------- Energie-Haushalt -------------------------- */

function metabolicLoss(c){
  // juvenile Schutzphase reduziert Grundumsatz
  const juvenile = (c.age < JUV_AGE_S);
  const base = juvenile ? META_BASE * META_JUV_FR : META_BASE;

  // Bewegungsaufschlag skaliert mit aktueller Geschwindigkeit
  const v = Math.hypot(c.vel.x, c.vel.y);
  const move = (MOVE_COST_S * (v / MOVE_S_MAX));

  return base + move; // [E/s]
}

/* ---------------------------------- Step ----------------------------------- */

export function step(dt, _env = {}, tSec = 0){
  dt = Math.max(0, Math.min(0.2, +dt || 0));

  // 1) Bewegung / Orientierung (ganz simple Wanderung; „Zappeln“ reduzieren)
  for (let i=0;i<CELLS.length;i++){
    const c = CELLS[i];
    c.age += dt;
    if (c.cooldown > 0) c.cooldown -= dt;

    // Leichte Tendenz zum Mittelpunkt, damit sie nicht „versanden“
    const pullX = (WORLD_W*0.5 - c.pos.x) * 0.2; // schwach
    const pullY = (WORLD_H*0.5 - c.pos.y) * 0.2;
    c.vel.x += pullX * dt * 0.5;
    c.vel.y += pullY * dt * 0.5;

    wander(c, dt);
  }

  // 2) Energieverbrauch + Essen
  for (let i=0;i<CELLS.length;i++){
    const c = CELLS[i];

    // Verbrauch (E/s → * dt)
    c.energy -= metabolicLoss(c) * dt;

    // Essen nahe Food (sofortiger Gewinn)
    // kleine Chance, mehrfach zu essen wenn Food „stapelt“
    if (tryEat(c) && Math.random() < 0.2) {
      // zweites Stück wenn direkt drauf steht
      tryEat(c);
    }

    // Klemmen
    c.energy = clamp(c.energy, 0, E_MAX);
  }

  // 3) Sterben entkoppelt (kein „Massensterben“ in einem Frame)
  for (let i=CELLS.length-1;i>=0;i--){
    if (CELLS[i].energy <= 0){
      CELLS.splice(i,1);
    }
  }
}