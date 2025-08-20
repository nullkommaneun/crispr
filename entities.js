import { CONFIG } from "./config.js";
import { emit } from "./event.js";

let W = CONFIG.world.width, H = CONFIG.world.height;

const cells = [];
const foodItems = []; // {x,y,amount,radius}

let stammMeta = new Map();
let nextCellId = 1;

/* ===== Utils ===== */
const clamp = (x,a,b)=> Math.max(a, Math.min(b,x));
const len = (x,y)=> Math.hypot(x,y);
function norm(x,y){ const L=len(x,y)||1e-6; return [x/L, y/L]; }
function limitVec(x,y,max){
  const L=len(x,y);
  if(L>max){ const s=max/(L||1e-6); return [x*s,y*s]; }
  return [x,y];
}
function rnd(a,b){ return a + Math.random()*(b-a); }

function pickColorByStamm(id){
  const rand = Math.sin(id*999)*43758.5453;
  const h = Math.abs(rand)%360;
  return `hsl(${h}deg 70% 60%)`;
}

/* Für Renderer */
export function worldSize(){ return {width:W,height:H}; }
export function setWorldSize(w,h){ W=w; H=h; }

/* Food-API (von food.js genutzt) */
export function addFoodItem(f){ foodItems.push(f); }
export function getFoodItems(){ return foodItems; }

/* Cells-API */
export function getCells(){ return cells; }
export function getStammCounts(){
  const m={}; for(const c of cells){ m[c.stammId]=(m[c.stammId]||0)+1; } return m;
}

export function createCell(opts={}){
  const id = nextCellId++;
  const stammId = opts.stammId ?? 1;
  if(!stammMeta.has(stammId)){
    stammMeta.set(stammId, { id: stammId, color: pickColorByStamm(stammId) });
  }
  const g = opts.genome || {
    TEM: (opts.TEM ?? (2+ (Math.random()*7|0))),
    GRÖ: (opts.GRÖ ?? (2+ (Math.random()*7|0))),
    EFF: (opts.EFF ?? (2+ (Math.random()*7|0))),
    SCH: (opts.SCH ?? (2+ (Math.random()*7|0))),
    MET: (opts.MET ?? (2+ (Math.random()*7|0))),
  };
  const energyMaxFromGenome = CONFIG.cell.energyMax * (1 + 0.08 * (g.GRÖ - 5));

  const cell = {
    id,
    name: opts.name || `Z${id}`,
    sex: opts.sex || (Math.random()<0.5 ? "M" : "F"),
    stammId,
    color: stammMeta.get(stammId).color,
    pos: opts.pos || { x: rnd(60, W-60), y: rnd(60, H-60) },
    vel: { x: 0, y: 0 },
    energy: Math.min(energyMaxFromGenome, opts.energy ?? rnd(60, energyMaxFromGenome)),
    age: 0,
    cooldown: 0,
    genome: g,
    // Wander-Noise (OU-Prozess)
    wander: { vx: 0, vy: 0 },
    // Paarung / Feed Locks
    mateLockId: null,
    mateLockT: 0,
    feedLockT: 0,
    // Dummy
    isDummy: !!opts.isDummy,
    dummyCfg: opts.dummyCfg || null
  };
  cells.push(cell);
  return cell;
}

export function killCell(id){
  const idx=cells.findIndex(c=>c.id===id);
  if(idx>=0){
    const c=cells[idx];
    cells.splice(idx,1);
    emit("cells:died", c);
  }
}

/** Startpopulation mit Courtship-Assist */
export function createAdamAndEve(){
  cells.length=0;
  stammMeta = new Map();
  nextCellId=1;

  const cx = W*0.5, cy = H*0.5;
  const gap = Math.min(W, H) * 0.18;
  const lockSecs = Math.max(3, (CONFIG.physics?.mateLockSec ?? 1.5) * 3);

  const gA = { TEM:6, GRÖ:5, EFF:6, SCH:5, MET:5 };
  const gE = { TEM:5, GRÖ:5, EFF:7, SCH:6, MET:4 };
  const capA = CONFIG.cell.energyMax * (1 + 0.08*(gA.GRÖ-5));
  const capE = CONFIG.cell.energyMax * (1 + 0.08*(gE.GRÖ-5));

  const A=createCell({
    name:"Adam", sex:"M", stammId:1,
    genome:gA, pos:{ x: cx - gap, y: cy },
    energy: capA * 0.85
  });
  const E=createCell({
    name:"Eva",  sex:"F", stammId:2,
    genome:gE, pos:{ x: cx + gap, y: cy },
    energy: capE * 0.85
  });
  A.mateLockId = E.id; E.mateLockId = A.id;
  A.mateLockT  = lockSecs; E.mateLockT  = lockSecs;

  return [A,E];
}

/** Environment application (Placeholder) */
export function applyEnvironment(env){ /* no-op */ }

/* ===== Kernfunktionen ===== */
function senseRadii(c){
  const g=c.genome;
  const senseFood = CONFIG.cell.senseFood * (0.7 + 0.1*g.EFF);
  const senseMate = CONFIG.cell.senseMate * (0.7 + 0.08*g.EFF);
  const sep = CONFIG.physics.separationRadius * (0.8 + 0.06*(g.GRÖ));
  const ali = CONFIG.physics.alignmentRadius * (0.9 + 0.05*(g.EFF-5));
  const coh = CONFIG.physics.cohesionRadius * (0.9 + 0.05*(g.EFF-5));
  return { senseFood, senseMate, sep, ali, coh };
}
function speedAndForce(c){
  const g=c.genome;
  let maxSpeed = CONFIG.cell.baseSpeed * (0.7 + 0.08*g.TEM);
  let maxForce = CONFIG.physics.maxForceBase * (0.7 + 0.08*g.TEM);
  // Dummy-Speed-Multiplikator
  if(c.dummyCfg?.speedMul){ maxSpeed *= c.dummyCfg.speedMul; maxForce *= Math.max(0.5, Math.min(2.5, c.dummyCfg.speedMul)); }
  return { maxSpeed, maxForce };
}
function energyCapacity(c){ return CONFIG.cell.energyMax * (1 + 0.08*(c.genome.GRÖ-5)); }
function radiusOf(c){ return CONFIG.cell.radius * (0.7 + 0.1*(c.genome.GRÖ)); }

function steerSeekArrive(c, target, maxSpeed, stopR, slowR){
  const dx=target.x - c.pos.x, dy=target.y - c.pos.y;
  const d=len(dx,dy); if(d < stopR) return [0,0];
  let sp = maxSpeed; if(d < slowR) sp = maxSpeed * (d/slowR);
  const [ux,uy] = norm(dx,dy);
  return [ux*sp - c.vel.x, uy*sp - c.vel.y];
}
function steerSeparation(c, neighbors, sepR, ignoreId=null){
  let fx=0, fy=0, n=0;
  for(const o of neighbors){
    if(o===c) continue;
    if(ignoreId && o.id===ignoreId) continue;
    const dx = c.pos.x - o.pos.x, dy = c.pos.y - o.pos.y;
    const d2 = dx*dx + dy*dy;
    if(d2 > sepR*sepR || d2===0) continue;
    const d = Math.sqrt(d2);
    const w = 1/Math.max(d,1e-3);
    fx += (dx/d)*w; fy += (dy/d)*w; n++;
  }
  return [fx/n||0, fy/n||0, n];
}
function steerAlignment(c, neighbors, aliR, maxSpeed){
  let vx=0, vy=0, n=0;
  for(const o of neighbors){
    const dx=o.pos.x - c.pos.x, dy=o.pos.y - c.pos.y;
    const d2=dx*dx+dy*dy; if(d2>aliR*aliR) continue;
    vx += o.vel.x; vy += o.vel.y; n++;
  }
  if(n===0) return [0,0,0];
  const [ux,uy] = norm(vx/n, vy/n);
  return [ux*maxSpeed - c.vel.x, uy*maxSpeed - c.vel.y, n];
}
function steerCohesion(c, neighbors, cohR, maxSpeed){
  let sx=0, sy=0, n=0;
  for(const o of neighbors){
    const dx=o.pos.x - c.pos.x, dy=o.pos.y - c.pos.y;
    const d2=dx*dx+dy*dy; if(d2>cohR*cohR) continue;
    sx += o.pos.x; sy += o.pos.y; n++;
  }
  if(n===0) return [0,0,0];
  const cx = sx/n, cy = sy/n;
  const [ax,ay] = steerSeekArrive(c, {x:cx,y:cy}, maxSpeed*0.6, CONFIG.physics.stopRadius, CONFIG.physics.slowRadius);
  return [ax,ay,n];
}
function steerWallAvoid(c){
  const r = CONFIG.physics.wallAvoidRadius + radiusOf(c);
  let fx=0, fy=0;
  const l = c.pos.x;            if(l < r) fx += (r - l)/r;
  const rgt = W - c.pos.x;      if(rgt < r) fx -= (r - rgt)/r;
  const t = c.pos.y;            if(t < r) fy += (r - t)/r;
  const b = H - c.pos.y;        if(b < r) fy -= (r - b)/r;
  return [fx, fy];
}
function updateWander(c, dt){
  const th = CONFIG.physics.wanderTheta;
  const sg = CONFIG.physics.wanderSigma;
  const gauss = ()=>{ let u=0,v=0; while(u===0) u=Math.random(); while(v===0) v=Math.random(); return Math.sqrt(-2*Math.log(u)) * Math.cos(2*Math.PI*v); };
  c.wander.vx += th * (0 - c.wander.vx) * dt + sg * Math.sqrt(dt) * gauss();
  c.wander.vy += th * (0 - c.wander.vy) * dt + sg * Math.sqrt(dt) * gauss();
  const [ux,uy] = (len(c.vel.x, c.vel.y) > 1e-3) ? norm(c.vel.x, c.vel.y) : [0,0];
  return [ c.wander.vx + 0.2*ux, c.wander.vy + 0.2*uy ];
}

function nearestFoodCenter(c, sense){
  let best = [];
  for(const f of foodItems){
    const dx=f.x - c.pos.x, dy=f.y - c.pos.y;
    const d2=dx*dx+dy*dy; if(d2 < sense*sense){ best.push({ f, d2 }); }
  }
  if(best.length===0) return null;
  best.sort((a,b)=>a.d2-b.d2);
  const take = best.slice(0,3).map(o=>o.f);
  const cx = take.reduce((s,f)=>s+f.x,0)/take.length;
  const cy = take.reduce((s,f)=>s+f.y,0)/take.length;
  return { x: cx, y: cy };
}
function chooseMate(c, sense, cells){
  if(c.cooldown>0) return null;
  let best=null, bestScore=-1e9;
  for(const o of cells){
    if(o===c || o.sex===c.sex || o.cooldown>0) continue;
    const dx=o.pos.x - c.pos.x, dy=o.pos.y - c.pos.y;
    const d2=dx*dx+dy*dy; if(d2 > sense*sense) continue;
    const distScore = -Math.sqrt(d2);
    const geneScore = (o.genome.EFF*0.8 + (10-o.genome.MET)*0.7 + o.genome.SCH*0.2 + o.genome.TEM*0.2);
    const total = distScore*0.05 + geneScore;
    if(total > bestScore){ bestScore=total; best=o; }
  }
  return best;
}

function addWithBudget(state, vx, vy, weight){
  if(weight<=0) return state;
  const rx = vx*weight, ry = vy*weight;
  const mag = len(rx,ry);
  if(mag < 1e-6 || state.rem<=0) return state;
  const allowed = Math.min(mag, state.rem);
  const s = allowed / mag;
  state.fx += rx * s; state.fy += ry * s; state.rem -= allowed;
  return state;
}

/** Hauptschritt */
export function step(dt, env, t=0){
  const neighbors = cells;

  for(let i=cells.length-1;i>=0;i--){
    const c = cells[i];
    c.age += dt;
    c.cooldown = Math.max(0, c.cooldown - dt);
    if(c.mateLockT > 0) c.mateLockT -= dt;
    if(c.feedLockT > 0) c.feedLockT -= dt;

    const g = c.genome;
    let { senseFood, senseMate, sep, ali, coh } = senseRadii(c);
    const { maxSpeed, maxForce } = speedAndForce(c);

    // Motivation
    const cap = energyCapacity(c);
    const eRatio = clamp(c.energy / cap, 0, 1);
    const wantFood0 = Math.pow(1 - eRatio, 1.3);
    let   wantMate  = (c.cooldown<=0 && eRatio>0.35) ? (0.4*(1 - wantFood0)) : 0;
    const dEdge = Math.min(c.pos.x, W-c.pos.x, c.pos.y, H-c.pos.y);
    const wantAvoid = clamp(
      (env.acid.enabled  ? clamp(1 - dEdge/env.acid.range, 0, 1) : 0) +
      (env.barb.enabled  ? clamp(1 - dEdge/env.barb.range, 0, 1) : 0) +
      (env.fence.enabled ? clamp(1 - dEdge/env.fence.range,0,1) : 0) +
      (env.nano.enabled  ? 0.3 : 0), 0, 1
    );

    // Feeding-Lock
    let nearestFood = null, nearestD2 = Infinity;
    const eatRBase = CONFIG.food.itemRadius + radiusOf(c) + 0.5;
    const eatRLock = eatRBase * 1.6;
    for(const f of foodItems){
      const dx=f.x - c.pos.x, dy=f.y - c.pos.y;
      const d2=dx*dx+dy*dy; if(d2 < nearestD2){ nearestD2 = d2; nearestFood = f; }
    }
    const isNearFood = nearestFood && nearestD2 < (eatRLock*eatRLock);
    let wantFood = wantFood0;
    if(isNearFood && eRatio < 0.95){
      c.feedLockT = Math.max(c.feedLockT, 0.8);
      wantFood = Math.max(wantFood, 0.9);
      senseFood *= 1.2;
      wantMate *= 0.15;
    }

    // Courtship-Prio
    let mateTarget = null;
    if(c.mateLockId && c.mateLockT > 0){
      mateTarget = neighbors.find(o=>o.id===c.mateLockId) || null;
      if(mateTarget){ wantMate = Math.max(wantMate, 0.9); senseMate *= 1.4; }
      else { c.mateLockId = null; c.mateLockT = 0; }
    } else if (wantMate > 0.05){
      mateTarget = chooseMate(c, senseMate, neighbors);
    }

    // Dummy: manuelles Ziel / Flocking-/Wander-Schalter
    let manualTarget = null;
    let flockEnabled = true;
    let wanderEnabled = true;
    if(c.dummyCfg){
      if(c.dummyCfg.manualTarget) manualTarget = c.dummyCfg.manualTarget;
      if(c.dummyCfg.disableFlocking) flockEnabled = false;
      if(c.dummyCfg.noWander) wanderEnabled = false;
    }

    // Ziele
    const foodTarget = (nearestFood && c.feedLockT>0)
      ? { x: nearestFood.x, y: nearestFood.y }
      : (wantFood > 0.05 ? nearestFoodCenter(c, senseFood) : null);

    // Seek/Arrive
    const slowR = Math.max(CONFIG.physics.slowRadius, CONFIG.cell.pairDistance*3);
    const foodStop = CONFIG.food.itemRadius + radiusOf(c) + 2;
    const mateStop = CONFIG.cell.pairDistance * 0.9;

    let fFood=[0,0], fMate=[0,0], fManual=[0,0];
    if(foodTarget){ fFood = steerSeekArrive(c, foodTarget, maxSpeed, foodStop, slowR); }
    if(mateTarget){ fMate = steerSeekArrive(c, {x:mateTarget.pos.x, y:mateTarget.pos.y}, maxSpeed*0.9, mateStop, slowR); }
    if(manualTarget){ fManual = steerSeekArrive(c, manualTarget, maxSpeed, CONFIG.physics.stopRadius, slowR); }

    // Flocking
    let nSep=0, nAli=0, nCoh=0;
    let fSep=[0,0], fAli=[0,0], fCoh=[0,0];
    if(flockEnabled){
      const r1 = steerSeparation(c, neighbors, sep, mateTarget?.id || null); fSep=[r1[0],r1[1]]; nSep=r1[2];
      const r2 = steerAlignment(c, neighbors, ali, maxSpeed);             fAli=[r2[0],r2[1]]; nAli=r2[2];
      const r3 = steerCohesion(c, neighbors, coh, maxSpeed);              fCoh=[r3[0],r3[1]]; nCoh=r3[2];
    }

    // Rand-Vermeidung
    const fAvoid = steerWallAvoid(c);
    // Wander
    let fWander=[0,0];
    if(wanderEnabled){ fWander = updateWander(c, dt); }

    /* ===== Priority-Blending ===== */
    let st = { fx:0, fy:0, rem: maxForce };

    // 1) Avoid
    st = addWithBudget(st, fAvoid[0], fAvoid[1],
      CONFIG.physics.wAvoid * (0.6 + 0.7*wantAvoid) * (0.9 + 0.03*g.SCH));

    // 2) Manuelles Ziel (Dummy hat Vorrang vor allem anderen außer Avoid)
    if(manualTarget){
      st = addWithBudget(st, fManual[0], fManual[1], 1.2); // kräftig
    }

    // Hunger-Drosselung
    const hungerFac = (wantFood > 0.6) ? 0.35 : 1.0;
    const flockFacBase = (wantFood > 0.6) ? 0.35 : 1.0;

    // 3) Hauptziel Food/Mate mit Secondary
    const wFood = CONFIG.physics.wFood * (0.7 + 0.5*wantFood) * (0.85 + 0.05*g.EFF) * (c.feedLockT>0 ? 1.35 : 1.0);
    const wMate = CONFIG.physics.wMate * (0.8 + 0.4*wantMate) * (c.feedLockT>0 ? 0.25 : 1.0) * hungerFac;
    const secondaryScale = CONFIG.physics.secondaryGoalScale;

    const foodFirst = (wantFood >= wantMate);
    if(foodFirst){
      if(foodTarget) st = addWithBudget(st, fFood[0], fFood[1], wFood);
      if(mateTarget) st = addWithBudget(st, fMate[0], fMate[1], wMate * secondaryScale);
    }else{
      if(mateTarget) st = addWithBudget(st, fMate[0], fMate[1], wMate);
      if(foodTarget) st = addWithBudget(st, fFood[0], fFood[1], wFood * secondaryScale);
    }

    // 4/5/6) Flocking + Wander
    if(flockEnabled){
      st = addWithBudget(st, fSep[0], fSep[1], CONFIG.physics.wSep * flockFacBase);
      const nFlock = Math.max(nAli, nCoh);
      let flockFac = 1.0; if(nFlock < 3) flockFac = 0.45; else if(nFlock > 8) flockFac = 1.25;
      flockFac *= flockFacBase;
      st = addWithBudget(st, fCoh[0], fCoh[1], CONFIG.physics.wCoh * flockFac);
      st = addWithBudget(st, fAli[0], fAli[1], CONFIG.physics.wAli * flockFac);
    }
    const hasTarget = !!(foodTarget || mateTarget || manualTarget);
    const wanderScaleBase = CONFIG.physics.wWander * (hasTarget ? CONFIG.physics.wanderWhenTarget : 1.0);
    const wanderScale = wanderEnabled ? (wanderScaleBase * (1 - 0.6*wantAvoid) * (c.feedLockT>0 ? 0.1 : 1.0) * hungerFac) : 0;
    st = addWithBudget(st, fWander[0], fWander[1], wanderScale);

    [st.fx, st.fy] = limitVec(st.fx, st.fy, maxForce);

    // Integration
    c.vel.x += st.fx * dt; c.vel.y += st.fy * dt;
    [c.vel.x, c.vel.y] = limitVec(c.vel.x, c.vel.y, maxSpeed);
    c.pos.x = clamp(c.pos.x + c.vel.x * dt, 0, W);
    c.pos.y = clamp(c.pos.y + c.vel.y * dt, 0, H);
    const damp = (c.feedLockT>0) ? 0.975 : 0.985;
    c.vel.x *= damp; c.vel.y *= damp;

    /* ===== Essen in Reichweite ===== */
    const eatR = CONFIG.food.itemRadius + radiusOf(c) + 0.5;
    for(let k=foodItems.length-1;k>=0;k--){
      const f = foodItems[k];
      const dx=f.x - c.pos.x, dy=f.y - c.pos.y;
      if(dx*dx + dy*dy < eatR*eatR){
        const take = CONFIG.cell.eatPerSecond * dt;
        const got = Math.min(take, f.amount);
        c.energy = Math.min(energyCapacity(c), c.energy + got);
        f.amount -= got;
        if(f.amount <= 1){ foodItems.splice(k,1); }
      }
    }

    /* ===== Energie & Umwelt ===== */
    const sp = len(c.vel.x, c.vel.y);
    const baseDrain = CONFIG.cell.baseMetabolic * (0.6 + 0.1*g.MET) * dt;
    const moveDrain = (CONFIG.physics.moveCostK ?? 0.0006) * sp * sp * dt;
    c.energy -= baseDrain + moveDrain;

    // Umweltschaden (Dummy unsterblich?)
    let dmg = 0;
    if(!(c.dummyCfg?.invulnerable)){
      const nearLeft = c.pos.x, nearRight = W - c.pos.x, nearTop = c.pos.y, nearBot = H - c.pos.y;
      const distEdge = Math.min(nearLeft,nearRight,nearTop,nearBot);
      if(env.acid.enabled && distEdge < env.acid.range){ dmg += env.acid.dps * dt; }
      if(env.barb.enabled && distEdge < env.barb.range){ dmg += env.barb.dps * dt; }
      if(env.nano.enabled){ dmg += env.nano.dps * dt; }
      dmg *= (1 - 0.06 * (g.SCH-5));
      c.energy -= Math.max(0, dmg);

      if(env.fence.enabled && distEdge < env.fence.range){
        const phase = (t % env.fence.period);
        if(phase < dt){
          const fx = (nearLeft === distEdge) ? 1 : (nearRight === distEdge ? -1 : 0);
          const fy = (nearTop === distEdge) ? 1 : (nearBot === distEdge ? -1 : 0);
          c.vel.x += fx * env.fence.impulse;
          c.vel.y += fy * env.fence.impulse;
        }
      }
    }

    // Dummy: unendliche Energie?
    if(c.dummyCfg?.infiniteEnergy){
      c.energy = energyCapacity(c);
    }

    // Tod
    if(c.energy <= 0 || c.age > CONFIG.cell.ageMax){
      if(!c.isDummy) killCell(c.id);
      else c.energy = Math.max(1, c.energy); // Dummy stirbt nicht „einfach so“
    }
  }
}

/* Für Renderer */
export { radiusOf as __radiusForDebug };