import { CONFIG } from "./config.js";
import { emit } from "./event.js";

let W = CONFIG.world.width, H = CONFIG.world.height;

const cells = [];
const foodItems = []; // {x,y,amount,radius}

let stammMeta = new Map();
let nextCellId = 1;

function rnd(a,b){ return a + Math.random()*(b-a); }
function pick(arr){ return arr[(Math.random()*arr.length)|0]; }

function stammColor(id){
  // deterministic pseudo-random color per stamm
  const rand = Math.sin(id*999)*43758.5453;
  const h = Math.abs(rand)%360;
  return `hsl(${h}deg 70% 60%)`;
}

export function worldSize(){ return {width:W,height:H}; }
export function setWorldSize(w,h){ W=w; H=h; }

export function addFoodItem(f){ foodItems.push(f); }
export function getFoodItems(){ return foodItems; }

export function getCells(){ return cells; }
export function getStammCounts(){
  const m={}; for(const c of cells){ m[c.stammId]=(m[c.stammId]||0)+1; } return m;
}

export function createCell(opts={}){
  const id = nextCellId++;
  const stammId = opts.stammId ?? (opts.id?.stammId) ?? 1;
  if(!stammMeta.has(stammId)){
    stammMeta.set(stammId, { id: stammId, color: stammColor(stammId) });
  }
  const cell = {
    id,
    name: opts.name || `Z${id}`,
    sex: opts.sex || (Math.random()<0.5 ? "M" : "F"),
    stammId,
    color: stammMeta.get(stammId).color,
    pos: opts.pos || { x: rnd(60, W-60), y: rnd(60, H-60) },
    vel: { x: 0, y: 0 },
    energy: Math.min(CONFIG.cell.energyMax, opts.energy ?? rnd(60, CONFIG.cell.energyMax)),
    age: 0,
    cooldown: 0,
    genome: opts.genome || {
      TEM: (opts.TEM ?? (2+ (Math.random()*7|0))),
      GRÖ: (opts.GRÖ ?? (2+ (Math.random()*7|0))),
      EFF: (opts.EFF ?? (2+ (Math.random()*7|0))),
      SCH: (opts.SCH ?? (2+ (Math.random()*7|0))),
      MET: (opts.MET ?? (2+ (Math.random()*7|0))),
    }
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

export function createAdamAndEve(){
  cells.length=0;
  stammMeta = new Map();
  nextCellId=1;
  const A=createCell({ name: "Adam", sex:"M", stammId: 1, genome:{TEM:6,GRÖ:5,EFF:6,SCH:5,MET:5}, pos:{x:W*0.35,y:H*0.5} });
  const E=createCell({ name: "Eva",  sex:"F", stammId: 2, genome:{TEM:5,GRÖ:5,EFF:7,SCH:6,MET:4}, pos:{x:W*0.65,y:H*0.5} });
  return [A,E];
}

/** Environment application is stateless here; we read env live in step(). */
export function applyEnvironment(env){ /* no-op holder to satisfy API */ }

/** Physics & Behaviour */
export function step(dt, env, t=0){
  // metabolism baseline: energy drain per sec depends on MET
  for(let i=cells.length-1;i>=0;i--){
    const c = cells[i];
    c.age += dt;
    c.cooldown = Math.max(0, c.cooldown - dt);

    // wall avoidance vector
    const margin=CONFIG.world.marginWall + c.genome.GRÖ;
    let ax=0, ay=0;

    if(c.pos.x < margin) ax += (margin - c.pos.x);
    if(c.pos.x > W - margin) ax -= (c.pos.x - (W - margin));
    if(c.pos.y < margin) ay += (margin - c.pos.y);
    if(c.pos.y > H - margin) ay -= (c.pos.y - (H - margin));

    // sense food
    let targetFood = null, targetDist2=Infinity;
    const sense = CONFIG.cell.senseFood * (0.8 + 0.08*c.genome.EFF);
    for(const f of foodItems){
      const dx=f.x - c.pos.x, dy=f.y - c.pos.y;
      const d2=dx*dx+dy*dy;
      if(d2 < sense*sense && d2 < targetDist2){
        targetDist2 = d2; targetFood = f;
      }
    }
    if(targetFood){
      const dx=targetFood.x - c.pos.x, dy=targetFood.y - c.pos.y;
      const d = Math.hypot(dx,dy)+1e-6;
      ax += (dx/d)*1.8; ay += (dy/d)*1.8;
      // eat if within radius
      if(d < (CONFIG.food.itemRadius + radiusOf(c))){
        const take = CONFIG.cell.eatPerSecond * dt;
        const got = Math.min(take, targetFood.amount);
        c.energy = Math.min(CONFIG.cell.energyMax*(1+0.08*(c.genome.GRÖ-5)), c.energy + got);
        targetFood.amount -= got;
        if(targetFood.amount <= 1){
          const idx = foodItems.indexOf(targetFood);
          if(idx>=0) foodItems.splice(idx,1);
        }
      }
    }else{
      // no food: seek mate
      const mateSense = CONFIG.cell.senseMate * (0.9 + 0.05*c.genome.EFF);
      let best=null, bestd2=Infinity;
      for(const o of cells){
        if(o===c) continue;
        if(o.sex===c.sex) continue;
        if(o.cooldown>0 || c.cooldown>0) continue;
        const dx=o.pos.x - c.pos.x, dy=o.pos.y - c.pos.y;
        const d2=dx*dx+dy*dy;
        if(d2 < mateSense*mateSense && d2 < bestd2){
          best=o; bestd2=d2;
        }
      }
      if(best){
        const dx=best.pos.x - c.pos.x, dy=best.pos.y - c.pos.y;
        const d = Math.hypot(dx,dy)+1e-6;
        ax += (dx/d)*1.2; ay += (dy/d)*1.2;
      }else{
        // wander slight
        ax += (Math.random()-0.5)*0.6; ay += (Math.random()-0.5)*0.6;
      }
    }

    // speed and energy
    const maxSpeed = CONFIG.cell.baseSpeed * (0.7 + 0.08*(c.genome.TEM));
    c.vel.x = (c.vel.x + ax) * 0.92;
    c.vel.y = (c.vel.y + ay) * 0.92;
    // clamp speed
    const sp = Math.hypot(c.vel.x, c.vel.y);
    if(sp > maxSpeed){ c.vel.x *= maxSpeed/sp; c.vel.y *= maxSpeed/sp; }

    c.pos.x += c.vel.x * dt;
    c.pos.y += c.vel.y * dt;
    // clamp inside
    c.pos.x = Math.max(0, Math.min(W, c.pos.x));
    c.pos.y = Math.max(0, Math.min(H, c.pos.y));

    // base metabolism
    const baseDrain = CONFIG.cell.baseMetabolic * (0.6 + 0.1*c.genome.MET) * dt;
    // moving drain
    const moveDrain = 0.002 * sp * dt;
    c.energy -= baseDrain + moveDrain;

    // environment damage
    let dmg = 0;
    const nearLeft = c.pos.x, nearRight = W - c.pos.x, nearTop = c.pos.y, nearBot = H - c.pos.y;
    const distEdge = Math.min(nearLeft,nearRight,nearTop,nearBot);

    if(env.acid.enabled && distEdge < env.acid.range){ dmg += env.acid.dps * dt; }
    if(env.barb.enabled && distEdge < env.barb.range){ dmg += env.barb.dps * dt; }
    if(env.nano.enabled){ dmg += env.nano.dps * dt; }

    // shield by SCH
    dmg *= (1 - 0.06 * (c.genome.SCH-5));
    c.energy -= Math.max(0, dmg);

    // fence impulse (periodic)
    if(env.fence.enabled && distEdge < env.fence.range){
      const phase = (t % env.fence.period);
      if(phase < dt){
        // push back from nearest edge
        const fx = (nearLeft === distEdge) ? 1 : (nearRight === distEdge ? -1 : 0);
        const fy = (nearTop === distEdge) ? 1 : (nearBot === distEdge ? -1 : 0);
        c.vel.x += fx * env.fence.impulse;
        c.vel.y += fy * env.fence.impulse;
      }
    }

    // death by starvation or age
    if(c.energy <= 0 || c.age > CONFIG.cell.ageMax){
      killCell(c.id);
    }
  }
}

function radiusOf(c){
  return CONFIG.cell.radius * (0.7 + 0.1*(c.genome.GRÖ));
}

export { radiusOf as __radiusForDebug };