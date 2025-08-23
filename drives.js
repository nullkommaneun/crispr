// drives.js — Verhaltenspolitik (Mate-first mit Gating & Hysterese)
// Exports: initDrives, getAction, afterStep, getDrivesSnapshot, setTracing, getTraceText

let TRACE = false;

// Policy-Parameter (konservativ gewählt)
const CFG = {
  // Energie-Schwellen (Anteil an Emax)
  E_ENTER_MATE: 0.55,   // ab hier Paarung priorisieren
  E_EXIT_MATE:  0.45,   // unter diese Schwelle -> raus aus Mate-Modus
  // Zeit-Hysterese (verhindert Zickzack)
  MATE_STICKY_SEC: 6.0, // bleibe bis zu 6s im Paarungsmodus
  // Pairing & Distanzen (nur Info für Snapshot; das eigentliche Steuern macht entities.js)
  R_PAIR: 32,           // "Pair distance" ist in entities geregelt; hier nur Anzeige
  K_DIST: 0.05,         // Distanzabzug im Score (entities nutzt −0.05*d analog)
  EPS: 0
};

// Laufzeitzähler (für Ticker/Diagnose)
const MISC = { duels: 0, wins: 0 };

// Pro-Zelle: kleiner Drive-Status (Mate-Hysterese)
function ensureDS(c){
  if (!c.__drive) c.__drive = { mode: "wander", until: 0, modeSince: 0 };
  return c.__drive;
}

export function initDrives(){ /* aktuell nichts nötig */ }
export function setTracing(on){ TRACE = !!on; }

export function getDrivesSnapshot(){
  return {
    misc: { duels: MISC.duels, wins: MISC.wins },
    cfg:  { K_DIST: CFG.K_DIST, R_PAIR: CFG.R_PAIR, EPS: CFG.EPS }
  };
}

// Diagnose-Text (für Preflight / Smart-Ops)
export function getTraceText(){
  return `K_DIST=${CFG.K_DIST} · R_PAIR=${CFG.R_PAIR} · EPS=${CFG.EPS} · duels=${MISC.duels} · wins=${MISC.wins}`;
}

// Energieanteil robust normalisieren
function energyFrac(c){
  const E = Math.max(0, Math.min(120, c.energy || 0));
  return E / 100;
}

// Hauptentscheidung
export function getAction(c, t, ctx){
  const ds = ensureDS(c);

  const hasFood = !!ctx.food;
  const hasMate = !!ctx.mate && (ctx.mateDist != null);

  const eFrac = energyFrac(c);

  // Mate-Hysterese
  if (ds.mode === "mate"){
    const tooLow  = eFrac < CFG.E_EXIT_MATE;
    const tooLong = (t - (ds.modeSince || 0)) > CFG.MATE_STICKY_SEC;
    if (!tooLow && !tooLong){
      if (TRACE) console.log(`[DRIVES] stick: mate (e=${eFrac.toFixed(2)})`);
      return "mate";
    }
    ds.mode = "wander";
  }

  // Neue Entscheidung
  if (hasMate && (c.cooldown || 0) <= 0 && eFrac >= CFG.E_ENTER_MATE){
    ds.mode = "mate";
    ds.modeSince = t;
    if (TRACE) console.log(`[DRIVES] choose: mate (e=${eFrac.toFixed(2)})`);
    return "mate";
  }

  if (hasFood){
    ds.mode = "food";
    ds.modeSince = t;
    if (TRACE) console.log(`[DRIVES] choose: food (e=${eFrac.toFixed(2)})`);
    return "food";
  }

  ds.mode = "wander";
  ds.modeSince = t;
  if (TRACE) console.log(`[DRIVES] choose: wander (e=${eFrac.toFixed(2)})`);
  return "wander";
}

// Feedback-Hook je Schritt (Platzhalter)
export function afterStep(c, dt, ctx){
  if (false) {
    MISC.duels++;
    MISC.wins++;
  }
}