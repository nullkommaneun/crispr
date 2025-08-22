// drives.js — Verhaltenspolitik (Mate-first mit Gating & Hysterese)
// Exports: initDrives, getAction, afterStep, getDrivesSnapshot, setTracing

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
  EPS: 0                // frei für spätere Feinheiten
};

// Laufzeitzähler (für Ticker/Diagnose)
const MISC = {
  duels: 0,
  wins:  0
};

// Pro-Zelle: kleiner Drive-Status (Mate-Hysterese)
function ensureDS(c){
  if (!c.__drive) c.__drive = { mode: "wander", until: 0 };
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

// Hilfen
function capEnergyOf(c){
  const g = c.genome || {};
  const baseMax = 100; // Fallback; real kommt aus CONFIG in entities (wir kennen die dortige Skalierung nicht direkt)
  // Wir schätzen hier nur den Anteil über c.energy/cap, falls entities capEnergy nicht exportiert.
  // Falls kein Hinweis, benutzen wir heuristisch 80..140 als plausible Range:
  return Math.max(40, Math.min(240, (c.energy / Math.max(0.01, c.vitality+1)) * 2)); // sehr grobe Schätzung
}

// Besser: Anteil via "virtueller Kapazität" (entities exportiert cap nicht).
function energyFrac(c){
  // Wir haben keinen direkten cap(). Näherung: skaliere auf [0,1] relativ zu typischen Energiespannen.
  // c.energy bewegt sich in deiner Sim normalerweise ~[0..100+] — wir normalisieren robust:
  const E = Math.max(0, Math.min(120, c.energy || 0));
  return E / 100; // robust, hinreichend für Policy-Gating
}

// Hauptentscheidung
export function getAction(c, t, ctx){
  const ds = ensureDS(c);

  const hasFood = !!ctx.food;
  const hasMate = !!ctx.mate && (ctx.mateDist != null);

  const eFrac = energyFrac(c);

  // Mate-Hysterese: bleib im Mate-Modus, solange Energie nicht unter Exit fällt
  // oder die Sticky-Zeit nicht abgelaufen ist.
  if (ds.mode === "mate"){
    if (eFrac < CFG.E_EXIT_MATE || (t - (ds.modeSince || 0)) > CFG.MATE_STICKY_SEC) {
      ds.mode = "wander"; // neu entscheiden
    } else {
      if (TRACE) console.log(`[DRIVES] stick: mate (e=${eFrac.toFixed(2)})`);
      return "mate";
    }
  }

  // Neue Entscheidung
  if (hasMate && c.cooldown <= 0 && eFrac >= CFG.E_ENTER_MATE){
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

// Feedback-Hook je Schritt (kann später für Lernen genutzt werden)
export function afterStep(c, dt, ctx){
  // Zählwerke optional pflegen (z.B. wenn eine Paarung erfolgreich war → wins++)
  // Hier kein direkter Ereignis-Hook; könnte über emit('cells:born') angebunden werden.
  // Platzhalter:
  if (false) {
    MISC.duels++;
    MISC.wins++;
  }
}