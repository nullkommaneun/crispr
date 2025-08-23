// drives.js — Policy: Mate-first (Pop-aware Gating + Hysterese)
// + Preflight-Hook: getTraceText()

let TRACE = false;

const CFG = {
  E_ENTER_MATE: 0.50,   // Energie-Schwelle zum Einsteigen
  E_EXIT_MATE:  0.40,   // Energie-Schwelle zum Aussteigen
  MATE_STICKY_SEC: 8.0  // Im Mate-Modus „kleben“
};

// Leichte Telemetrie
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

export function initDrives(){ /* noop */ }
export function setTracing(on){ TRACE = !!on; }

export function getDrivesSnapshot(){
  return {
    misc: { ...MISC },
    cfg:  { E_ENTER_MATE: CFG.E_ENTER_MATE, E_EXIT_MATE: CFG.E_EXIT_MATE, MATE_STICKY_SEC: CFG.MATE_STICKY_SEC }
  };
}

// **Neu für Preflight**: kurzer, lesbarer Trace
export function getTraceText(){
  const lines = [];
  lines.push(`Policy: mate-first (enter=${(CFG.E_ENTER_MATE*100)|0}%, exit=${(CFG.E_EXIT_MATE*100)|0}%, sticky=${CFG.MATE_STICKY_SEC}s)`);
  lines.push(`Decisions total: mate=${MISC.chooseMate}, food=${MISC.chooseFood}, wander=${MISC.chooseWander}, stickMate=${MISC.stickMate}`);
  lines.push(`Duels=${MISC.duels}, Wins=${MISC.wins}`);
  return lines.join("\n");
}

// Hauptentscheidung
export function getAction(c, t, ctx){
  const ds = ensureDS(c);
  const now = +t || 0;
  MISC.lastNow = now;

  const hasFood = !!ctx.food;
  const hasMate = !!ctx.mate && (ctx.mateDist != null);

  // Energieanteil (exakt von entities geliefert)
  const eFrac = typeof ctx.eFrac === "number" ? ctx.eFrac :
                Math.max(0, Math.min(1, (c.energy||0)/100));

  // Populations-adaptive Schwellen (kleine Pop → leichter in Mate)
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
    if (TRACE) console.log(`[DRIVES] choose Mate (e=${eFrac.toFixed(2)} pop=${popN})`);
    return "mate";
  }

  if (hasFood){
    ds.mode = "food"; ds.modeSince = now;
    MISC.chooseFood++;
    if (TRACE) console.log(`[DRIVES] choose Food (e=${eFrac.toFixed(2)} pop=${popN})`);
    return "food";
  }

  ds.mode = "wander"; ds.modeSince = now;
  MISC.chooseWander++;
  return "wander";
}

// Platzhalter – könnte künftig Paarungserfolge zählen
export function afterStep(/* c, dt, ctx */){ /* noop */ }