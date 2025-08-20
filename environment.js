// environment.js
// Zentrale Ablage & API für die Umwelt. Keine UI hier drin.

import { emit, on } from './event.js';
import { applyEnvironment } from './entities.js';

// Default-Umwelt (passt zu deinen bisherigen Slidern)
let ENV = {
  acid:  { enabled: false, range: 14, dps: 6 },     // Säurewand
  barb:  { enabled: false, range: 8,  dps: 10 },    // Stacheldraht (Druck)
  fence: { enabled: false, range: 12, impulse: 10, period: 1.6 }, // Elektro
  nano:  { enabled: false, dps: 0.8 }               // Nanonebel (global)
};

// Hilfsfunktionen
const num = (v, d=0) => (Number.isFinite(+v) ? +v : d);
const bool = v => !!v;

function normalize(e) {
  return {
    acid:  { enabled: bool(e?.acid?.enabled),  range: num(e?.acid?.range, 14),  dps: num(e?.acid?.dps, 6) },
    barb:  { enabled: bool(e?.barb?.enabled),  range: num(e?.barb?.range, 8),   dps: num(e?.barb?.dps, 10) },
    fence: { enabled: bool(e?.fence?.enabled), range: num(e?.fence?.range, 12), impulse: num(e?.fence?.impulse, 10), period: num(e?.fence?.period, 1.6) },
    nano:  { enabled: bool(e?.nano?.enabled),  dps: num(e?.nano?.dps, 0.8) }
  };
}

// ---- Öffentliche API ----

/** Aktuellen Umweltzustand (kopiert) liefern. */
export function getEnvState() {
  return JSON.parse(JSON.stringify(ENV));
}

/** Umweltzustand setzen + auf Entities anwenden + Event feuern. */
export function setEnvState(next) {
  ENV = normalize(next || {});
  applyEnvironment(ENV);            // <- nimmt dein Entities-Backend mit ins Boot
  emit('env:changed', getEnvState());
}

/** Optionaler Listener für externe Module. */
export function onEnvChange(cb) {
  return on('env:changed', cb);
}

/** UI öffnen – per Dynamic Import, um Zyklen zu vermeiden. */
export async function openEnvPanel() {
  const mod = await import('./environment/panel.js');
  return mod.openEnvPanel(); // UI-Aufbau
}

// Beim Laden einmal auf Entities spiegeln (falls Defaults abweichen)
applyEnvironment(ENV);