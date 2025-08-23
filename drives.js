// drives.js — Policy: Mate-first (Pop-aware Gating + Hysterese)
// Bietet: initDrives, setTracing, getDrivesSnapshot, getTraceText, getAction, afterStep

import { on } from "./event.js";
import { CONFIG } from "./config.js";

let TRACE = false;
let SUBBED = false;

const CFG = {
  E_ENTER_MATE: 0.50,   // Energie-Schwelle zum Einsteigen (0..1)
  E_EXIT_MATE:  0.40,   // Energie-Schwelle zum Aussteigen
  MATE_STICKY_SEC: 8.0  // im Mate-Modus „kleben“
};

// Telemetrie
const MISC = {
  duels: 0, wins: 0,
  chooseMate: 0, chooseFood: 0, chooseWander: 0,
  stickMate: 0,
  lastNow: 0
};

// Pools (ungefähre Stamm-Vielfalt, über Events gepflegt)
const POOLS = {
  byStamm: new Map(),     // stammId -> count
  total() { return this.byStamm.size; },
  inc(stammId){ if(stammId==null) return; this.byStamm.set(stammId, (this.byStamm.get(stammId)||0)+1); },
  dec(stammId){ if(stammId==null) return; const n=(this.byStamm.get(stammId)||0)-1; if(n<=0) this.byStamm.delete(stammId); else this.byStamm.set(stammId,n); }
};

function ensureDS(c){
  if(!c.__drive) c.__drive = { mode:"wander", modeSince:0 };
  return c.__drive;
}

export function initDrives(){
  if (SUBBED) return;
  SUBBED = true;

  // Geburt -> als „Duell mit Erfolg“ zählen; Pools (falls stammId mitgegeben wird)
  on("cells:born", (p)=>{
    MISC.duels++; MISC.wins++;
    // Optionales Payload-Format akzeptieren: {child:{stammId}} oder {stammId}
    const sid = p?.child?.stammId ?? p?.stammId;
    if (sid != null) POOLS.inc(sid);
  });

  // Tod -> Pools ggf. reduzieren (Payload muss stammId enthalten, sonst ignorieren)
  on("cells:died", (c)=>{
    const sid = c?.stammId;
    if (sid != null) POOLS.dec(sid);
  });
}

export function setTracing(onFlag){ TRACE = !!onFlag; }

// Kompakter Ein-Zeilen-Trace für Preflight
export function getTraceText(){
  const m = MISC, c = CFG;
  return `mate-first | enter=${(c.E_ENTER_MATE*100)|0}% exit=${(c.E_EXIT_MATE*100)|0}% sticky=${c.MATE_STICKY_SEC}s | `
       + `choose: M=${m.chooseMate} F=${m.chooseFood} W=${m.chooseWander} stick=${m.stickMate} | `
       + `duels=${m.duels} wins=${m.wins}`;
}

// Snapshot für Diagnose-Panel (mit flachen Feldern)
export function getDrivesSnapshot(){
  const K_DIST = 0.05;                                   // Distanzabzug in entities.chooseMate
  const R_PAIR = CONFIG?.cell?.pairDistance ?? 28;       // Basis-Pair-Radius
  const WIN    = [MISC.wins, MISC.duels];               // [wins, duels]
  const winRate = MISC.duels ? (MISC.wins / MISC.duels) : 0;

  return {
    // flache Felder: Panel liest diese direkt
    duels: MISC.duels,
    wins:  MISC.wins,
    winRate,
    pools: POOLS.total(),
    K_DIST,
    R_PAIR,
    WIN,

    // zusätzlich: alte Struktur weiter anbieten
    misc:  { ...MISC },
    cfg:   { E_ENTER_MATE: CFG.E_ENTER_MATE, E_EXIT_MATE: CFG.E_EXIT_MATE, MATE_STICKY_SEC: CFG.MATE_STICKY_SEC },
    params:{ K_DIST, R_PAIR, WIN }
  };
}

// Hauptentscheidung
export function getAction(c, t, ctx){
  const ds = ensureDS(c);
  const now = +t || 0;
  MISC.lastNow = now;

  const hasFood = !!ctx.food;
  const hasMate = !!ctx.mate && (ctx.mateDist != null);

  // Energieanteil (exakt von entities geliefert) – Fallback falls nicht vorhanden
  const eFrac = typeof ctx.eFrac === "number" ? ctx.eFrac :
                Math.max(0, Math.min(1, (c.energy||0)/100));

  // Kleine Population -> Schwellen absenken
  const popN = ctx.popN || 0;
  let enter = CFG.E_ENTER_MATE;
  let exit  = CFG.E_EXIT_MATE;
  if (popN <= 12){ enter = Math.max(0.35, enter - 0.10); exit = Math.max(0.25, exit - 0.15); }

  // Hysterese
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

// Platzhalter (z. B. künftig „erfolgreiche Annäherungen“ zählen)
export function afterStep(/* c, dt, ctx */){ /* noop */ }