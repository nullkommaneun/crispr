// drives.js — Policy: Mate-first (Pop-aware Gating + Hysterese)
// Publiziert Diagnose-Felder zusätzlich auf window.__drivesDiag

import { on } from "./event.js";
import { CONFIG } from "./config.js";

let TRACE = false;
let SUBBED = false;

const CFG = {
  E_ENTER_MATE: 0.50,
  E_EXIT_MATE:  0.40,
  MATE_STICKY_SEC: 8.0
};

const MISC = {
  duels:0, wins:0,
  chooseMate:0, chooseFood:0, chooseWander:0,
  stickMate:0, lastNow:0
};

const POOLS = {
  byStamm:new Map(),
  total(){ return this.byStamm.size; },
  inc(s){ if(s==null) return; this.byStamm.set(s,(this.byStamm.get(s)||0)+1); },
  dec(s){ if(s==null) return; const n=(this.byStamm.get(s)||0)-1; if(n<=0) this.byStamm.delete(s); else this.byStamm.set(s,n); }
};

function ensureDS(c){ if(!c.__drive) c.__drive={mode:"wander",modeSince:0}; return c.__drive; }

export function initDrives(){
  if (SUBBED) return;
  SUBBED = true;

  on("cells:born",(p)=>{
    MISC.duels++; MISC.wins++;
    const sid = p?.child?.stammId ?? p?.stammId;
    if (sid!=null) POOLS.inc(sid);
    publish();
  });
  on("cells:died",(c)=>{
    const sid = c?.stammId;
    if (sid!=null) POOLS.dec(sid);
    publish();
  });
}

export function setTracing(on){ TRACE=!!on; }

export function getTraceText(){
  const m=MISC, c=CFG;
  return `mate-first | enter=${(c.E_ENTER_MATE*100)|0}% exit=${(c.E_EXIT_MATE*100)|0}% sticky=${c.MATE_STICKY_SEC}s | `+
         `choose M=${m.chooseMate} F=${m.chooseFood} W=${m.chooseWander} stick=${m.stickMate} | duels=${m.duels} wins=${m.wins}`;
}

export function getDrivesSnapshot(){
  const K_DIST=0.05, R_PAIR=CONFIG?.cell?.pairDistance ?? 28;
  const WIN=[MISC.wins, MISC.duels];
  const winRate = MISC.duels ? (MISC.wins/MISC.duels) : 0;
  const snap = {
    duels:MISC.duels, wins:MISC.wins, winRate,
    pools:POOLS.total(), K_DIST, R_PAIR, WIN,
    misc:{...MISC},
    cfg:{ E_ENTER_MATE:CFG.E_ENTER_MATE, E_EXIT_MATE:CFG.E_EXIT_MATE, MATE_STICKY_SEC:CFG.MATE_STICKY_SEC },
    params:{ K_DIST, R_PAIR, WIN }
  };
  publish(snap);
  return snap;
}

export function getAction(c, t, ctx){
  const ds=ensureDS(c); const now=+t||0; MISC.lastNow=now;
  const hasFood=!!ctx.food; const hasMate=!!ctx.mate && (ctx.mateDist!=null);
  const eFrac = typeof ctx.eFrac==="number" ? ctx.eFrac : Math.max(0,Math.min(1,(c.energy||0)/100));
  const popN = ctx.popN||0;
  let enter=CFG.E_ENTER_MATE, exit=CFG.E_EXIT_MATE;
  if (popN<=12){ enter=Math.max(0.35, enter-0.10); exit=Math.max(0.25, exit-0.15); }

  if (ds.mode==="mate"){
    const stick=(now-(ds.modeSince||0))<=CFG.MATE_STICKY_SEC;
    if (eFrac>=exit && stick){ MISC.stickMate++; return "mate"; }
  }
  if (hasMate && c.cooldown<=0 && eFrac>=enter){ ds.mode="mate"; ds.modeSince=now; MISC.chooseMate++; return "mate"; }
  if (hasFood){ ds.mode="food"; ds.modeSince=now; MISC.chooseFood++; return "food"; }
  ds.mode="wander"; ds.modeSince=now; MISC.chooseWander++; return "wander";
}

export function afterStep(){ /* noop */ }

// ---- Diagnose-Fallback ----
function publish(snap){
  try{
    const s = snap || getBare();
    window.__drivesDiag = {
      duels:s.duels, wins:s.wins, winRate:s.winRate,
      pools:s.pools, K_DIST:s.K_DIST, R_PAIR:s.R_PAIR, WIN:s.WIN
    };
  }catch{}
}
function getBare(){
  const K_DIST=0.05, R_PAIR=CONFIG?.cell?.pairDistance ?? 28;
  const WIN=[MISC.wins,MISC.duels];
  const winRate = MISC.duels ? (MISC.wins/MISC.duels) : 0;
  return { duels:MISC.duels, wins:MISC.wins, winRate, pools:POOLS.total(), K_DIST, R_PAIR, WIN };
}