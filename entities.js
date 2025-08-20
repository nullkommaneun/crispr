import { CONFIG } from "./config.js";
import { emit } from "./event.js";
import { getAction as drivesGetAction, afterStep as drivesAfterStep } from "./drives.js";

let W = CONFIG.world.width, H = CONFIG.world.height;

const cells = [];
const foodItems = [];

let stammMeta = new Map();
let nextCellId = 1;

/* Utils */
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const len=(x,y)=>Math.hypot(x,y);
function norm(x,y){ const L=len(x,y)||1e-6; return [x/L,y/L]; }
function limitVec(x,y,max){ const L=len(x,y); if(L>max){ const s=max/(L||1e-6); return [x*s,y*s]; } return [x,y]; }
function rnd(a,b){ return a + Math.random()*(b-a); }
function pickColorByStamm(id){ const r=Math.sin(id*999)*43758.5453; const h=Math.abs(r)%360; return `hsl(${h}deg 70% 60%)`; }

/* Exporte */
export function worldSize(){ return {width:W,height:H}; }
export function setWorldSize(w,h){ W=w; H=h; window.__WORLD_W=W; window.__WORLD_H=H; }
export function addFoodItem(f){ foodItems.push(f); }
export function getFoodItems(){ return foodItems; }
export function getCells(){ return cells; }
export function getStammCounts(){ const m={}; for(const c of cells){ m[c.stammId]=(m[c.stammId]||0)+1; } return m; }

export function createCell(opts={}){
  const id=nextCellId++, stammId=opts.stammId ?? 1;
  if(!stammMeta.has(stammId)) stammMeta.set(stammId,{id:stammId,color:pickColorByStamm(stammId)});
  const g = opts.genome || { TEM:(opts.TEM??(2+(Math.random()*7|0))), GRÖ:(opts.GRÖ??(2+(Math.random()*7|0))),
                             EFF:(opts.EFF??(2+(Math.random()*7|0))), SCH:(opts.SCH??(2+(Math.random()*7|0))),
                             MET:(opts.MET??(2+(Math.random()*7|0))) };
  const cap = CONFIG.cell.energyMax * (1 + 0.08*(g.GRÖ-5));
  const cell = {
    id, name:opts.name||`Z${id}`, sex:opts.sex||(Math.random()<0.5?"M":"F"),
    stammId, color:stammMeta.get(stammId).color,
    pos:opts.pos||{x:rnd(60,W-60), y:rnd(60,H-60)},
    vel:{x:0,y:0}, energy:Math.min(cap, opts.energy??rnd(60,cap)),
    age:0, cooldown:0, genome:g, wander:{vx:0,vy:0}
  };
  cells.push(cell); return cell;
}
export function killCell(id){ const i=cells.findIndex(c=>c.id===id); if(i>=0){ const c=cells[i]; cells.splice(i,1); emit("cells:died",c);} }

/* Startpopulation + 10 Kinder */
export function createAdamAndEve(){
  cells.length=0; stammMeta=new Map(); nextCellId=1;
  const cx=W*0.5, cy=H*0.5, gap=Math.min(W,H)*0.18;
  const gA={TEM:6,GRÖ:5,EFF:6,SCH:5,MET:5}, gE={TEM:5,GRÖ:5,EFF:7,SCH:6,MET:4};
  const capA=CONFIG.cell.energyMax*(1+0.08*(gA.GRÖ-5)), capE=CONFIG.cell.energyMax*(1+0.08*(gE.GRÖ-5));
  const A=createCell({name:"Adam",sex:"M",stammId:1,genome:gA,pos:{x:cx-gap,y:cy},energy:capA*0.85});
  const E=createCell({name:"Eva", sex:"F",stammId:2,genome:gE,pos:{x:cx+gap,y:cy},energy:capE*0.85});
  for(let k=0;k<10;k++) cells.push(makeChild(A,E,k));
  return [A,E];
}
function mixGene(a,b,j=0.6){ const base=(a+b)/2; const mut=(Math.random()*2-1)*j; return clamp(Math.round(base+mut),1,10); }
function makeChild(A,E,k){
  const g={TEM:mixGene(A.genome.TEM,E.genome.TEM), GRÖ:mixGene(A.genome.GRÖ,E.genome.GRÖ),
           EFF:mixGene(A.genome.EFF,E.genome.EFF), SCH:mixGene(A.genome.SCH,E.genome.SCH),
           MET:mixGene(A.genome.MET,E.genome.MET)};
  const st=Math.random()<0.5?A.stammId:E.stammId, cap=CONFIG.cell.energyMax*(1+0.08*(g.GRÖ-5));
  const ang=(k/10)*Math.PI*2, r=Math.min(W,H)*0.08+Math.random()*20;
  return { id:nextCellId++, name:`C${1000+k}`, sex:(Math.random()<0.5?"M":"F"), stammId:st, color:pickColorByStamm(st),
           pos:{x:W*0.5+Math.cos(ang)*r, y:H*0.5+Math.sin(ang)*r}, vel:{x:0,y:0}, energy:cap*0.75, age:0, cooldown:0, genome:g, wander:{vx:0,vy:0} };
}

export function applyEnvironment(env){}

/* Steering */
function steerSeekArrive(c,t,maxSpeed,stopR,slowR){ const dx=t.x-c.pos.x, dy=t.y-c.pos.y; const d=len(dx,dy); if(d<stopR) return [0,0];
  let sp=maxSpeed; if(d<slowR) sp=maxSpeed*(d/slowR); const [ux,uy]=norm(dx,dy); return [ux*sp-c.vel.x, uy*sp-c.vel.y]; }
function steerWallAvoid(c){ const r=(CONFIG.physics.wallAvoidRadius??48)+radiusOf(c); let fx=0,fy=0;
  const l=c.pos.x; if(l<r) fx+=(r-l)/r; const rgt=W-c.pos.x; if(rgt<r) fx-=(r-rgt)/r;
  const t=c.pos.y; if(t<r) fy+=(r-t)/r; const b=H-c.pos.y; if(b<r) fy-=(r-b)/r; return [fx,fy]; }
function updateWander(c,dt){ const th=CONFIG.physics.wanderTheta??1.6, sg=CONFIG.physics.wanderSigma??0.45;
  const gauss=()=>{let u=0,v=0;while(u===0)u=Math.random();while(v===0)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};
  c.wander.vx += th*(0-c.wander.vx)*dt + sg*Math.sqrt(dt)*gauss();
  c.wander.vy += th*(0-c.wander.vy)*dt + sg*Math.sqrt(dt)*gauss();
  const [ux,uy] = (len(c.vel.x,c.vel.y)>1e-3)?norm(c.vel.x,c.vel.y):[0,0];
  return [c.wander.vx+0.2*ux, c.wander.vy+0.2*uy];
}
function radiusOf(c){ return CONFIG.cell.radius*(0.7+0.1*(c.genome.GRÖ)); }
function capEnergy(c){ return CONFIG.cell.energyMax*(1+0.08*(c.genome.GRÖ-5)); }

/* Ziele */
function nearestFoodCenter(c,sense){
  let best=[]; for(const f of foodItems){ const dx=f.x-c.pos.x, dy=f.y-c.pos.y; const d2=dx*dx+dy*dy; if(d2<sense*sense) best.push({f,d2}); }
  if(best.length===0) return null; best.sort((a,b)=>a.d2-b.d2);
  const take=best.slice(0,3).map(o=>o.f); const cx=take.reduce((s,f)=>s+f.x,0)/take.length; const cy=take.reduce((s,f)=>s+f.y,0)/take.length;
  return { x:cx, y:cy, d:Math.hypot(cx-c.pos.x, cy-c.pos.y) };
}
function chooseMate(c,sense,arr){
  if(c.cooldown>0) return null; let best=null, bestScore=-1e9, bestD=Infinity;
  for(const o of arr){ if(o===c || o.sex===c.sex || o.cooldown>0) continue;
    const dx=o.pos.x-c.pos.x, dy=o.pos.y-c.pos.y; const d2=dx*dx+dy*dy; if(d2>sense*sense) continue; const d=Math.sqrt(d2);
    const geneScore=(o.genome.EFF*0.8+(10-o.genome.MET)*0.7+o.genome.SCH*0.2+o.genome.TEM*0.2);
    const total = -0.05*d + geneScore; if(total>bestScore){bestScore=total; best=o; bestD=d;}
  }
  return best?{cell:best,d:bestD}:null;
}

/* Hauptschritt – ruft Drives mit dt-basiertem Fenster an */
export function step(dt, env, /*t ungenutzt*/){
  const neighbors=cells;

  for(let i=cells.length-1;i>=0;i--){
    const c=cells[i];
    c.age += dt; c.cooldown = Math.max(0, c.cooldown - dt);

    const g=c.genome;
    const maxSpeed=CONFIG.cell.baseSpeed*(0.7+0.08*g.TEM);
    const maxForce=(CONFIG.physics.maxForceBase??140)*(0.7+0.08*g.TEM);

    const senseFood=CONFIG.cell.senseFood*(0.7+0.1*g.EFF);
    const senseMate=CONFIG.cell.senseMate*(0.7+0.08*g.EFF);

    const food=nearestFoodCenter(c,senseFood);
    const mate=chooseMate(c,senseMate,neighbors);

    const dEdge=Math.min(c.pos.x,W-c.pos.x,c.pos.y,H-c.pos.y);
    const hazard=(env.acid?.enabled?clamp(1-dEdge/Math.max(env.acid.range,1),0,1):0)
               + (env.barb?.enabled?clamp(1-dEdge/Math.max(env.barb.range,1),0,1):0)
               + (env.fence?.enabled?clamp(1-dEdge/Math.max(env.fence.range,1),0,1):0)
               + (env.nano?.enabled?0.3:0);

    let neigh=0; for(const o of neighbors){ if(o===c) continue; const dx=o.pos.x-c.pos.x, dy=o.pos.y-c.pos.y; if(dx*dx+dy*dy<60*60) neigh++; }

    const ctx={ env,
      food: food?{x:food.x,y:food.y}:null, foodDist:food?.d??null,
      mate: mate?.cell??null, mateDist:mate?.d??null,
      hazard, neighCount:neigh, worldMin:Math.min(W,H)
    };

    // Option via Drives
    const option = drivesGetAction(c, /*t*/0, ctx);

    // Avoid
    let [fx,fy]=[0,0], rem=maxForce;
    const fAvoid=steerWallAvoid(c);
    const avoidW=(CONFIG.physics.wAvoid??1.15)*(0.6+0.7*clamp(hazard,0,1))*(0.9+0.03*g.SCH);
    ({fx,fy,rem}=addBudget(fx,fy,rem,fAvoid[0],fAvoid[1],avoidW));

    // Primärvektor
    let fOpt=[0,0]; const slowR=Math.max(CONFIG.physics.slowRadius??120, CONFIG.cell.pairDistance*3);
    if(option==="food" && food){ fOpt=steerSeekArrive(c,{x:food.x,y:food.y},maxSpeed, CONFIG.food.itemRadius+radiusOf(c)+2,slowR); }
    else if(option==="mate" && mate){ fOpt=steerSeekArrive(c,{x:mate.cell.pos.x,y:mate.cell.pos.y},maxSpeed*0.9, CONFIG.cell.pairDistance*0.9, slowR); }
    else { fOpt=updateWander(c,dt); }
    ({fx,fy,rem}=addBudget(fx,fy,rem,fOpt[0],fOpt[1],1.0));

    // Mini-Separation
    const fSep=quickSeparation(c,neighbors,22);
    ({fx,fy,rem}=addBudget(fx,fy,rem,fSep[0],fSep[1],0.35));

    // Integration
    [fx,fy]=limitVec(fx,fy,maxForce);
    c.vel.x += fx*dt; c.vel.y += fy*dt;
    [c.vel.x,c.vel.y]=limitVec(c.vel.x,c.vel.y,maxSpeed);
    c.pos.x=clamp(c.pos.x+c.vel.x*dt,0,W); c.pos.y=clamp(c.pos.y+c.vel.y*dt,0,H);
    c.vel.x*=0.985; c.vel.y*=0.985;

    // Essen
    const eatR=CONFIG.food.itemRadius+radiusOf(c)+0.5;
    for(let k=foodItems.length-1;k>=0;k--){
      const f=foodItems[k]; const dx=f.x-c.pos.x, dy=f.y-c.pos.y;
      if(dx*dx+dy*dy<eatR*eatR){
        const take=CONFIG.cell.eatPerSecond*dt, got=Math.min(take,f.amount);
        c.energy=Math.min(capEnergy(c),c.energy+got); f.amount-=got; if(f.amount<=1) foodItems.splice(k,1);
      }
    }

    // Energie/Umwelt
    const sp=len(c.vel.x,c.vel.y);
    const baseDrain=CONFIG.cell.baseMetabolic*(0.6+0.1*g.MET)*dt;
    const moveDrain=(CONFIG.physics.moveCostK??0.0006)*sp*sp*dt;
    c.energy -= baseDrain + moveDrain;
    let dmg=0; if(env.acid?.enabled&&dEdge<env.acid.range)dmg+=env.acid.dps*dt;
    if(env.barb?.enabled&&dEdge<env.barb.range)dmg+=env.barb.dps*dt;
    if(env.nano?.enabled)dmg+=env.nano.dps*dt; dmg*= (1-0.06*(g.SCH-5)); c.energy-=Math.max(0,dmg);

    // Zaun
    if(env.fence?.enabled && dEdge<env.fence.range){
      const phase = 0; // dt-basiert, Impuls genügt hier nicht entscheidend
      if(phase < dt){ const fxz=(c.pos.x===dEdge)?1:((W-c.pos.x)===dEdge?-1:0);
        const fyz=(c.pos.y===dEdge)?1:((H-c.pos.y)===dEdge?-1:0);
        c.vel.x += fxz*env.fence.impulse; c.vel.y += fyz*env.fence.impulse;
      }
    }

    // Lernen/Fenster schließen → **mit dt**
    drivesAfterStep(c, dt, ctx);

    if(c.energy<=0 || c.age>CONFIG.cell.ageMax) killCell(c.id);
  }
}

/* Hilfen */
function addBudget(fx,fy,rem,vx,vy,w){ const rx=vx*w, ry=vy*w; const m=Math.hypot(rx,ry); if(m<1e-6||rem<=0) return {fx,fy,rem};
  const allow=Math.min(m,rem), s=allow/m; return {fx:fx+rx*s, fy:fy+ry*s, rem:rem-allow}; }
function quickSeparation(c,arr,r){ let sx=0,sy=0,n=0, rr=r*r; for(const o of arr){ if(o===c) continue; const dx=c.pos.x-o.pos.x, dy=c.pos.y-o.pos.y;
  const d2=dx*dx+dy*dy; if(d2>rr||d2===0) continue; const d=Math.sqrt(d2); sx+=dx/d; sy+=dy/d; n++; } return n? [sx/n,sy/n]:[0,0]; }
function radiusOf(c){ return CONFIG.cell.radius*(0.7+0.1*(c.genome.GRÖ)); }
function capEnergy(c){ return CONFIG.cell.energyMax*(1+0.08*(c.genome.GRÖ-5)); }
export { radiusOf as __radiusForDebug };