/**
 * drives.js — Entscheidungs-Policy: menschlich anmutendes Verhalten
 * Exports: decide(cell, ctx), getDrivesSnapshot(), getTraceText()
 *
 * Idee:
 *  - Zellen besitzen Gene {EFF,MET,SCH,TEM,GRÖ} (0..1), die zu Traits abgeleitet werden.
 *  - Needs: Hunger (h), Fatigue (f), Social (ℓ), Curiosity (c)
 *  - Utilities: Feed, Explore, Socialize/Court, Rest → Softmax(β) → Policy
 *  - Policies produzieren Beschleunigung {ax,ay}:
 *      • feed: Seek/Arrive zum Food
 *      • explore: OU-ähnliches Wander + leichter Center-Pull
 *      • social/court: Seek/Arrive zum Mate-Kandidaten (wenn vorhanden)
 *      • rest: Bremsen (−k·v) + geringer Center-Pull
 */

const CFG = {
  // Grund-Gains (werden pro Zelle durch Traits skaliert)
  SEEK_ACC:   90,
  WANDER_ACC: 36,
  CENTER_ACC: 18,
  BRAKE_K:    1.8,   // ax = -BRAKE_K * vx für Rest
  ARRIVE_SLOW: 36,   // Distanz (px), ab der Seek sanft abgebremst wird
  MAX_ACC:    120
};

const SNAP = {
  decideCalls: 0,
  modeCounts: { feed:0, explore:0, social:0, rest:0 },
  lastMode: "explore",
  lastFoodDist: null
};

function clamp(v, lo, hi){ return v < lo ? lo : (v > hi ? hi : v); }
function lerp(a,b,t){ return a + (b-a)*t; }
function limitAcc(ax, ay, maxA){
  const a2 = ax*ax + ay*ay;
  if (a2 <= maxA*maxA) return { ax, ay };
  const s = maxA / Math.sqrt(a2);
  return { ax: ax*s, ay: ay*s };
}
function softmaxIdx(vals, beta){
  // numerisch stabil
  const b = clamp(beta, 0.1, 12);
  let maxv = -Infinity; for (const v of vals) if (v>maxv) maxv = v;
  const exps = vals.map(v => Math.exp(b*(v - maxv)));
  let sum = 0; for (const e of exps) sum += e;
  let best = 0, bestv = -1;
  for (let i=0;i<exps.length;i++){ const p = exps[i]/sum; if (p>bestv){ bestv=p; best=i; } }
  return best;
}

/* ----------------------------- Gene → Traits ------------------------------- */

function ensureGenes(cell){
  if (!cell.genes) cell.genes = { EFF:0.5, MET:0.5, SCH:0.5, TEM:0.5, GRÖ:0.5 };
  // Alias GRO → GRÖ (falls je nach Quelle)
  if (cell.genes.GRO != null && cell.genes["GRÖ"] == null) cell.genes["GRÖ"] = cell.genes.GRO;
}

function deriveTraits(cell){
  if (cell.traits && cell.traits._v === 1) return;
  ensureGenes(cell);
  const g = cell.genes;

  cell.traits = {
    // Dynamik
    vmax: lerp(62, 42, clamp(g["GRÖ"],0,1)),      // größer -> langsamer
    seekAcc: lerp(70, 120, clamp(g.EFF,0,1)),
    wanderAcc: lerp(28, 42, clamp(g.TEM,0,1)),
    sigma: lerp(0.4, 1.2, clamp(g.TEM,0,1)),      // Richtungsrauschen (rad/√s)
    beta: lerp(3, 8, clamp(g.EFF,0,1)),           // Softmax-Schärfe
    centerAcc: CFG.CENTER_ACC,

    // Needs-Gewichte
    w_hunger: lerp(0.8, 1.4, clamp(g.MET,0,1)),
    w_fatigue: lerp(0.7, 1.2, 1 - clamp(g.TEM,0,1)),
    w_social: lerp(0.5, 1.3, clamp(g.SCH,0,1)),
    w_explore: lerp(0.6, 1.2, clamp((g.EFF+g.TEM)/2,0,1)),

    // Social
    rSoc: lerp(70, 150, clamp(g.SCH,0,1)),

    _v: 1
  };
}

/* -------------------------------- Policies -------------------------------- */

function centerPull(cell, world, gain){
  const cx = world.w*0.5, cy = world.h*0.5;
  return { ax: gain*(cx - cell.pos.x), ay: gain*(cy - cell.pos.y) };
}

function arriveScale(dist){
  // sanftes Abbremsen
  return clamp(dist / CFG.ARRIVE_SLOW, 0.2, 1);
}

function policyFeed(cell, ctx){
  const t = cell.traits, p = ctx.percept;
  if (!p.food) return null;
  const dx = p.food.x - cell.pos.x;
  const dy = p.food.y - cell.pos.y;
  const d  = Math.hypot(dx, dy) || 1;
  const k  = t.seekAcc * arriveScale(d);
  let ax = (dx / d) * k;
  let ay = (dy / d) * k;

  // leichte Stabilisierung zur Mitte
  const cp = centerPull(cell, ctx.world, t.centerAcc / 100);
  ax += cp.ax; ay += cp.ay;

  return limitAcc(ax, ay, CFG.MAX_ACC);
}

function policyExplore(cell, ctx, dt){
  const t = cell.traits;
  // OU-ähnliches Richtungsrauschen
  if (!cell.drive) cell.drive = { wanderAngle: Math.random()*Math.PI*2, lastMode:"explore", fatigue:0, wantMate:false };
  const jitter = (Math.random()*2-1) * t.sigma * Math.sqrt(Math.max(0.0001, dt));
  cell.drive.wanderAngle += jitter;

  const wx = Math.cos(cell.drive.wanderAngle) * t.wanderAcc;
  const wy = Math.sin(cell.drive.wanderAngle) * t.wanderAcc;

  // leichter Center-Pull
  const cp = centerPull(cell, ctx.world, t.centerAcc / 100);

  let ax = wx + cp.ax * 0.6;
  let ay = wy + cp.ay * 0.6;
  return limitAcc(ax, ay, CFG.MAX_ACC);
}

function policySocial(cell, ctx){
  const t = cell.traits, p = ctx.percept;
  const m = p.mate;
  if (!m) return null;
  const dx = m.x - cell.pos.x;
  const dy = m.y - cell.pos.y;
  const d  = Math.hypot(dx, dy) || 1;
  const k  = (t.seekAcc * 0.85) * arriveScale(d); // etwas sanfter als Futter
  let ax = (dx / d) * k;
  let ay = (dy / d) * k;

  const cp = centerPull(cell, ctx.world, t.centerAcc / 120);
  ax += cp.ax; ay += cp.ay;

  // Signal an Reproduktion: Bereitschaft
  if (cell.drive) cell.drive.wantMate = true;

  return limitAcc(ax, ay, CFG.MAX_ACC);
}

function policyRest(cell, ctx){
  // Bremse proportional zur aktuellen Geschwindigkeit + leichter Center-Pull
  const cp = centerPull(cell, ctx.world, (cell.traits.centerAcc || CFG.CENTER_ACC) / 140);
  const ax = -CFG.BRAKE_K * (cell.vel?.x || 0) + cp.ax;
  const ay = -CFG.BRAKE_K * (cell.vel?.y || 0) + cp.ay;
  return limitAcc(ax, ay, CFG.MAX_ACC);
}

/* -------------------------------- Decide() --------------------------------- */

export function decide(cell, ctx){
  const dt = Math.max(0, +ctx.dt || 0.016);
  deriveTraits(cell);

  // Needs (0..1)
  const energyRel = clamp(ctx.percept?.energyRel ?? (cell.energy/140), 0, 1);
  const hunger  = 1 - energyRel;
  const speed   = Math.hypot(cell.vel?.x||0, cell.vel?.y||0);
  // Fatigue wächst mit Bewegung, fällt bei geringer Geschwindigkeit (in entities.js wird zusätzlich abgebaut)
  if (cell.drive) cell.drive.fatigue = clamp((cell.drive.fatigue || 0) + (speed/ (cell.traits.vmax||55)) * 0.18 * dt, 0, 1);

  // Sozial: Nähe vorhanden? (0 = nah, 1 = einsam)
  const mateDist = ctx.percept?.mate?.dist ?? null;
  const lonely = mateDist == null ? 1 : clamp(mateDist / (cell.traits.rSoc || 120), 0, 1);

  // Curiosity/Explore als Grunddrang
  const curiosity = 0.6; // leicht konstant; könnte mit Heatmap/Mappung erweitert werden

  // Utilities
  const t = cell.traits;
  const U_feed    = t.w_hunger  * (0.15 + 0.85*hunger)    + (ctx.percept?.food ? 0.3 : -0.2);
  const U_explore = t.w_explore * curiosity               + 0.05;
  const U_social  = t.w_social  * (1 - lonely)            + (ctx.percept?.mate ? 0.15 : -0.1);
  const U_rest    = t.w_fatigue * (cell.drive?.fatigue || 0);

  const utils = [U_feed, U_explore, U_social, U_rest];
  const modes = ["feed","explore","social","rest"];
  let pickIdx = softmaxIdx(utils, t.beta);

  // Degradierungen, falls Ziel fehlt
  if (modes[pickIdx] === "feed" && !ctx.percept?.food) pickIdx = utils.indexOf(Math.max(U_explore, U_rest) === U_explore ? U_explore : U_rest);
  if (modes[pickIdx] === "social" && !ctx.percept?.mate) pickIdx = utils.indexOf(Math.max(U_feed, U_explore) === U_feed ? U_feed : U_explore);

  let ax=0, ay=0, mode = modes[pickIdx];
  if (mode === "feed"){
    const out = policyFeed(cell, ctx); if (out){ ax=out.ax; ay=out.ay; SNAP.lastFoodDist = ctx.percept?.food?.dist|0; }
  } else if (mode === "social"){
    const out = policySocial(cell, ctx); if (out){ ax=out.ax; ay=out.ay; }
  } else if (mode === "rest"){
    const out = policyRest(cell, ctx); if (out){ ax=out.ax; ay=out.ay; }
  } else {
    const out = policyExplore(cell, ctx, dt); ax=out.ax; ay=out.ay;
  }

  // Snapshot
  SNAP.decideCalls++;
  SNAP.modeCounts[mode] = (SNAP.modeCounts[mode]||0) + 1;
  SNAP.lastMode = cell.drive ? (cell.drive.lastMode = mode) : mode;

  return { ax, ay, mode };
}

/* ------------------------------ Diagnostics -------------------------------- */

export function getDrivesSnapshot(){
  const total = Math.max(1, SNAP.decideCalls);
  const pct = (n)=> Math.round((n/total)*100);
  return {
    calls: total,
    modes: {
      feed:    { n: SNAP.modeCounts.feed|0,    pct: pct(SNAP.modeCounts.feed|0) },
      explore: { n: SNAP.modeCounts.explore|0, pct: pct(SNAP.modeCounts.explore|0) },
      social:  { n: SNAP.modeCounts.social|0,  pct: pct(SNAP.modeCounts.social|0) },
      rest:    { n: SNAP.modeCounts.rest|0,    pct: pct(SNAP.modeCounts.rest|0) },
    },
    lastMode: SNAP.lastMode,
    lastFoodDist: SNAP.lastFoodDist
  };
}

export function getTraceText(){
  const s = getDrivesSnapshot();
  return `DRIVES calls=${s.calls} | feed=${s.modes.feed.pct}% | explore=${s.modes.explore.pct}% | social=${s.modes.social.pct}% | rest=${s.modes.rest.pct}% | last=${s.lastMode}` +
         (s.lastFoodDist!=null ? ` | lastFoodDist=~${s.lastFoodDist}px` : "");
}