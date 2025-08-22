// drives.js — Verhaltenspolitik: Mate-first mit Energie-Gating & Hysterese (Pop-aware)

let TRACE = false;

const CFG = {
  E_ENTER_MATE: 0.55,   // Energieanteil zum Einsteigen
  E_EXIT_MATE:  0.45,   // zum Aussteigen
  MATE_STICKY_SEC: 6.0  // solange im Mate-Modus kleben (wenn Energie ok)
};

const MISC = { duels:0, wins:0 };

function ensureDS(c){
  if(!c.__drive) c.__drive = { mode:"wander", modeSince:0 };
  return c.__drive;
}

export function initDrives(){ /* noop */ }
export function setTracing(on){ TRACE = !!on; }
export function getDrivesSnapshot(){
  return { misc:{...MISC}, cfg:{ R_PAIR:32, K_DIST:0.05, EPS:0 } };
}

// Hauptentscheidung
export function getAction(c, t, ctx){
  const ds = ensureDS(c);
  const now = +t || 0;

  const hasFood = !!ctx.food;
  const hasMate = !!ctx.mate && (ctx.mateDist != null);

  // Energieanteil möglichst exakt aus entities geliefert
  const eFrac = typeof ctx.eFrac === "number" ? ctx.eFrac :
                Math.max(0, Math.min(1, (c.energy||0)/100));

  // Dynamische Schwellen bei kleiner Population → früher Mate versuchen
  const popN = ctx.popN || 0;
  let enter = CFG.E_ENTER_MATE;
  let exit  = CFG.E_EXIT_MATE;
  if (popN <= 12){ enter = Math.max(0.40, enter - 0.10); exit = Math.max(0.30, exit - 0.10); }

  // Stickiness (nur wenn Energie nicht unter Exit fällt)
  if (ds.mode === "mate"){
    const stick = (now - (ds.modeSince||0)) <= CFG.MATE_STICKY_SEC;
    if (eFrac >= exit && stick){
      if (TRACE) console.log(`[DRIVES] mate-stick e=${eFrac.toFixed(2)} dt=${(now-(ds.modeSince||0)).toFixed(1)}s`);
      return "mate";
    }
    // sonst neu entscheiden
  }

  // Priorität: Mate vor Food (mit Gating)
  if (hasMate && c.cooldown<=0 && eFrac >= enter){
    ds.mode = "mate"; ds.modeSince = now;
    if (TRACE) console.log(`[DRIVES] choose Mate (e=${eFrac.toFixed(2)} pop=${popN})`);
    return "mate";
  }

  if (hasFood){
    ds.mode = "food"; ds.modeSince = now;
    if (TRACE) console.log(`[DRIVES] choose Food (e=${eFrac.toFixed(2)} pop=${popN})`);
    return "food";
  }

  ds.mode = "wander"; ds.modeSince = now;
  return "wander";
}

export function afterStep(/* c, dt, ctx */){
  // hier könntest du in Zukunft Erfolg von Paarungen hochzählen (wins++)
}