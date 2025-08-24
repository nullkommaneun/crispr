/**
 * drives.js — Entscheidungs-Policy für Zellen (food-seek / wander)
 * Exports: decide(cell, ctx), getDrivesSnapshot(), getTraceText()
 *
 * Design:
 *  - Input: cell, ctx = { world:{w,h}, percept:{ food?:{x,y,dist}, energyRel, isJuvenile }, dt, tSec }
 *  - Output: { ax, ay, mode? }  (Beschleunigung in px/s²; Entities clamped speed)
 *  - Sanfte, performante Defaults (keine teuren Strukturen)
 */

const CFG = {
  // Steuer-Gains
  SEEK_ACC:   90,     // px/s² Richtung Food
  WANDER_ACC: 36,     // px/s² Rausch-/Wander-Anteil
  CENTER_ACC: 18,     // px/s² schwacher Mitte-Pull
  // Wander-Noise
  WANDER_SIGMA: 0.85, // rad/sqrt(s) — Brownian ähnlicher Drift
};

const SNAP = {
  modeCounts: { food:0, wander:0 },
  decideCalls: 0,
  lastMode: "wander",
  lastFoodDist: null
};

function centerPull(cell, world){
  const cx = world.w * 0.5, cy = world.h * 0.5;
  return { ax: (cx - cell.pos.x) * 0.12, ay: (cy - cell.pos.y) * 0.12 };
}

function limitAcc(ax, ay, maxAcc){
  const a2 = ax*ax + ay*ay;
  if (a2 <= maxAcc*maxAcc) return { ax, ay };
  const s = maxAcc / Math.sqrt(a2);
  return { ax: ax*s, ay: ay*s };
}

/**
 * Primäre Entscheidungsfunktion.
 * Gibt Beschleunigung zurück; Entities integriert & clamped Speed.
 */
export function decide(cell, ctx){
  const dt = Math.max(0, +ctx.dt || 0.016);
  const w  = ctx.world || { w: 800, h: 500 };
  const p  = ctx.percept || {};
  let ax = 0, ay = 0;
  let mode = "wander";

  // 1) Zielorientiertes "seek", wenn Food im Wahrnehmungsradius
  if (p.food){
    const dx = p.food.x - cell.pos.x;
    const dy = p.food.y - cell.pos.y;
    const d  = Math.hypot(dx, dy) || 1;
    ax += (dx / d) * CFG.SEEK_ACC;
    ay += (dy / d) * CFG.SEEK_ACC;
    mode = "food";
    SNAP.lastFoodDist = p.food.dist|0;
  }

  // 2) Wander-Rausch (OU-ähnlich über Winkel)
  if (!cell.drive) cell.drive = { wanderAngle: Math.random()*Math.PI*2, lastMode:"wander" };
  const jitter = (Math.random()*2-1) * CFG.WANDER_SIGMA * Math.sqrt(dt);
  cell.drive.wanderAngle += jitter;

  const wx = Math.cos(cell.drive.wanderAngle) * CFG.WANDER_ACC;
  const wy = Math.sin(cell.drive.wanderAngle) * CFG.WANDER_ACC;
  ax += wx; ay += wy;

  // 3) Leichter Mitte-Pull stabilisiert die Schwarmlage
  const cp = centerPull(cell, w);
  ax += cp.ax * (CFG.CENTER_ACC / 100);
  ay += cp.ay * (CFG.CENTER_ACC / 100);

  // 4) Limit finaler Acc
  const out = limitAcc(ax, ay, Math.max(CFG.SEEK_ACC, CFG.WANDER_ACC) + CFG.CENTER_ACC);

  // Snapshot
  SNAP.decideCalls++;
  SNAP.modeCounts[mode] = (SNAP.modeCounts[mode]||0) + 1;
  SNAP.lastMode = cell.drive.lastMode = mode;

  return { ...out, mode };
}

/* ------------------------------ Diagnostics -------------------------------- */

export function getDrivesSnapshot(){
  const total = Math.max(1, SNAP.decideCalls);
  const pct = (n)=> Math.round((n/total)*100);
  return {
    calls: total,
    modes: {
      food:   { n: SNAP.modeCounts.food|0,   pct: pct(SNAP.modeCounts.food|0) },
      wander: { n: SNAP.modeCounts.wander|0, pct: pct(SNAP.modeCounts.wander|0) }
    },
    lastMode: SNAP.lastMode,
    lastFoodDist: SNAP.lastFoodDist
  };
}

export function getTraceText(){
  const s = getDrivesSnapshot();
  return `DRIVES calls=${s.calls} | food=${s.modes.food.pct}% | wander=${s.modes.wander.pct}% | last=${s.lastMode}` +
         (s.lastFoodDist!=null ? ` | lastFoodDist=~${s.lastFoodDist}px` : "");
}