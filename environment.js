// environment.js — Stub: Umwelt ist vollständig deaktiviert.
// Alle Exporte bleiben bestehen, damit bestehende Importe nicht brechen.

export function getEnvState(){
  // Keine Gefahren, keine Impulse
  return {
    acid:  { enabled:false, range:0, dps:0 },
    barb:  { enabled:false, range:0, dps:0 },
    fence: { enabled:false, range:0, impulse:0, period:2 },
    nano:  { enabled:false, dps:0 }
  };
}

export function setEnvState(_env){
  // bewusst no-op
}

export function openEnvPanel(){
  // kein UI mehr
  console.warn("[environment] Umwelt-Panel wurde entfernt (Stub).");
}