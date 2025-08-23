// drives.js — Policy: Mate-first (Pop-aware Gating + Hysterese)
// Bietet: initDrives, setTracing, getDrivesSnapshot, getTraceText, getAction, afterStep

import { on } from "./event.js";
import { CONFIG } from "./config.js";

let TRACE = false;
let SUBBED = false;

const CFG = {
  E_ENTER_MATE: 0.50,   // Energie-Schwelle zum Einsteigen (0..1)
  E_EXIT_MATE:  0.40,   // Energie-Schwelle zum Aussteigen
  MATE_STICKY_SEC: 8.0  // Im Mate-Modus „kleben“
};

// leichte Telemetrie
const MISC = {
  duels: 0, wins: 0,
  chooseMate: 0, chooseFood: 0, chooseWander: 0,
  stickMate: 0,
  lastNow: 0
};

function ensureDS(c){
  if(!c.__drive) c.__drive = { mode:"wander", modeSince:0 };
  return c.__drive;
}

export function initDrives(){
  if (SUBBED) return;
  SUBBED = true;
  // Jede Geburt als „erfolgreiches Duell“ zählen
  on("cells:born", () => { MISC.duels++; MISC.wins++; });
}

export function setTracing(onFlag){ TRACE = !!onFlag; }

export function getDrivesSnapshot(){
  // Parameter, die Dein Diagnose-Panel erwartet
  const params = {
    K_DIST: 0.05,                                            // Distanzabzug in chooseMate (entities)
    R_PAIR: CONFIG?.cell?.pairDistance ?? 28,                // Basis-Pair-Radius
    WIN:    [MISC.wins, MISC.duels]                          // [wins, duels]
  };
  return {
    misc: { ...MISC },
    cfg:  { E_ENTER_MATE: CFG.E_ENTER_MATE, E_EXIT_MATE: CFG.E_EXIT_MATE, MATE_STICKY_SEC: CFG.MATE_STICKY_SEC },
    params
  };
}

// kompakter Ein-Zeilen-Trace für Preflight
export function getTraceText(){
  const m = MISC, c = CFG;
  return `mate-first | enter=${(c.E_ENTER_MATE*100)|0}% exit=${(c.E_EXIT_MATE*100)|0}% sticky=${c.MATE_STICKY_SEC}s | `
       + `choose: M=${m.chooseMate} F=${m.chooseFood} W=${m.chooseWander} stick=${m.stickMate} | duels=${m.duels} wins=${m.wins}`;
}

// Hauptentscheidung
export function getAction(c, t, ctx){
  const ds = ensureDS(c);
  const now = +t || 0;
  MISC.lastNow = now;

  const hasFood = !!ctx.food;
  const hasMate = !!ctx.mate && (ctx.mateDist != null);

  // Energieanteil (exakt von entities geliefert) – Fallback, falls nicht vorhanden
  const eFrac = typeof ctx.eFrac === "number" ? ctx.eFrac
                : Math.max(0, Math.min(1, (c.energy||0)/100));

  // kleine Population → Schwellen absenken
  const popN = ctx.popN || 0;
  let enter = CFG.E_ENTER_MATE;
  let exit  = CFG.E_EXIT_MATE;
  if (popN <= 12){ enter = Math.max(0.35, enter - 0.10); exit = Math.max(0.25, exit - 0.15); }

  // Hysterese: im Mate-Modus bleiben
  if (ds.mode === "mate"){
    const stick = (now - (ds.modeSince||0)) <= CFG.MATE_STICKY_SEC;
    if (eFrac >= exit && stick){
      MISC.stickMate++;
      if (TRACE) console.log(`[DRIVES] mate-stick e=${eFrac.toFixed(2)} dt=${(now-(ds.modeSince||0)).toFixed(1)}s`);
      return "mate";
    }
  }

  // Priorität: Mate vor Food (mit Gating)
  if (hasMate && c.cooldown<=0 && eFrac >= enter){
    ds.mode = "mate"; ds.modeSince = now;
    MISC.chooseMate++;
    if (TRACE) console.log(`[DRIVES] choose Mate (e=${eFrac.toFixed(2)} pop=${popN})`);
    return "mate";
  }

  if (hasFood){
    ds.mode = "food"; ds.modeSince = now;
    MISC.chooseFood++;
    return "food";
  }

  ds.mode = "wander"; ds.modeSince = now;
  MISC.chooseWander++;
  return "wander";
}

// Platzhalter – hier könntest du künftig Paarungserfolge differenziert zählen
export function afterStep(/* c, dt, ctx */){ /* noop */ }