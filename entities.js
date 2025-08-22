// entities.js — Entities & Bewegung (Umwelt deaktiviert); Gen-Drift & Ökonomie-Stats
// Farbe: nach Geschlecht (M/F). Altersgrenze dynamisch nach Genetik & Vitalität.

import { CONFIG } from "./config.js";
import { emit } from "./event.js";
import { getAction as drivesGetAction, afterStep as drivesAfterStep } from "./drives.js";
import * as metrics from "./metrics.js";

let W = CONFIG.world.width, H = CONFIG.world.height;

const cells = [];
const foodItems = [];

let stammMeta = new Map();
let nextCellId = 1;

/* ============ Utils ============ */
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const len=(x,y)=>Math.hypot(x,y);
function norm(x,y){ const L=len(x,y)||1e-6; return [x/L,y/L]; }
function limitVec(x,y,max){ const L=len(x,y); if(L>max){ const s=max/(L||1e-6); return [x*s,y*s]; } return [x,y]; }
function rnd(a,b){ return a + Math.random()*(b-a); }
function radiusOf(c){ return CONFIG.cell.radius*(0.7+0.1*(c.genome.GRÖ)); }
function capEnergy(c){ return CONFIG.cell.energyMax*(1+0.08*(c.genome.GRÖ-5)); }

function worldScales(){
  const BASE_H=640, BASE_W=1024;
  const sMin = Math.max(0.6, Math.min(W,H)/BASE_H);
  const areaScale = (W*H)/(BASE_W*BASE_H);
  return { sMin, areaScale };
}

function sexColor(sex){ return sex==="M" ? CONFIG.colors.sexMale : CONFIG.colors.sexFemale; }

/* ============ Exporte ============ */
export function worldSize(){ return {width:W,height:H}; }
export function setWorldSize(w,h){ W=w; H=h; window.__WORLD_W=W; window.__WORLD_H=H; }

export function addFoodItem(f){ foodItems.push(f); }
export function getFoodItems(){ return foodItems; }

export function getCells(){ return cells; }
export function getStammCounts(){ const m={}; for(const c of cells){ m[c.stammId]=(m[c.stammId]||0)+1; } return m; }

export function createCell(opts={}){
  const id=nextCellId++;
  const sex = opts.sex || (Math.random()<0.5 ? "M" : "F");
  const stammId = opts.stammId ?? 1;
  if(!stammMeta.has(stammId)) stammMeta.set(stammId,{ id:stammId });

  const g = opts.genome || {
    TEM:(opts.TEM??(2+(Math.random()*7|0))),
    GRÖ:(opts.GRÖ??(2+(Math.random()*7|0))),
    EFF:(opts.EFF??(2+(Math.random()*7|0))),
    SCH:(opts.SCH??(2+(Math.random()*7|0))),
    MET:(opts.MET??(2+(Math.random()*7|0))),
  };
  const cap = capEnergy({ genome:g });

  const cell = {
    id, name: opts.name || `Z${id}`,
    sex, stammId, color: sexColor(sex),
    pos: opts.pos || { x: rnd(60, W-60), y: rnd(60, H-60) },
    vel: { x: 0, y: 0 },
    energy: Math.min(cap, opts.energy ?? rnd(60, cap)),
    age: 0, cooldown: 0,
    genome: g,
    vitality: 0,                 // Lebensstil-Integrator (-1..+1)
    wander:{ vx:0, vy:0 }
  };
  cells.push(cell);
  return cell;
}

export function killCell(id){
  const i=cells.findIndex(c=>c.id===id);
  if(i>=0){ const c=cells[i]; cells.splice(i,1); emit("cells:died",c); }
}

/* ============ Startpopulation ============ */
export function createAdamAndEve(){
  cells.length=0; stammMeta=new Map(); nextCellId=1;
  const cx=W*0.5, cy=H*0.5, gap=Math.min(W,H)*0.18;
  const gA={TEM:6,GRÖ:5,EFF:6,SCH:5,MET:5}, gE={TEM:5,GRÖ:5,EFF:7,SCH:6,MET:4};
  const A=createCell({name:"Adam",sex:"M",stammId:1,genome:gA,pos:{x:cx-gap,y:cy},energy:capEnergy({genome:gA})*0.85});
  const E=createCell({name:"Eva", sex:"F",stammId:2,genome:gE,pos:{x:cx+gap,y:cy},energy:capEnergy({genome:gE})*0.85});
  for(let k=0;k<10;k++) cells.push(makeChild(A,E,k));
  return [A,E];
}
function mixGene(a,b,j=0.6){ const base=(a+b)/2; const mut=(Math.random()*2-1)*j; return clamp(Math.round(base+mut),1,10); }
function makeChild(A,E,k){
  const g={TEM:mixGene(A.genome.TEM,E.genome.TEM), GRÖ:mixGene(A.genome.GRÖ,E.genome.GRÖ),
           EFF:mixGene(A.genome.EFF,E.genome.EFF), SCH:mixGene(A.genome.SCH,E.genome.SCH),
           MET:mixGene(A.genome.MET,E.genome.MET)};
  const st=Math.random()<0.5?A.stammId:E.stammId; const cap=capEnergy({genome:g});
  const ang=(k/10)*Math.PI*2, r=Math.min(W,H)*0.08+Math.random()*20;
  return { id:nextCellId++, name:`C${1000+k}`, sex:(Math.random()<0.5?"M":"F"),
           stammId:st, pos:{x:W*0.5+Math.cos(ang)*r, y:H*0.5+Math.sin(ang)*r},
           vel:{x:0,y:0}, energy:cap*0.75, age:0, cooldown:0, genome:g, vitality:0, wander:{vx:0,vy:0} };
}

/* ============ Environment (Export muss existieren) ============ */
export function applyEnvironment(_env){ /* no-op; env wird live gelesen */ }

/* ============ Steering ============ */
function steerSeekArrive(c,t,maxSpeed,stopR,slowR){
  const dx=t.x-c.pos.x, dy=t.y-c.pos.y; const d=len(dx,dy); if(d<stopR) return [0,0];
  let sp=maxSpeed; if(d<slowR) sp=maxSpeed*(d/slowR);
  const [ux,uy]=norm(dx,dy); return [ux*sp-c.vel.x, uy*sp-c.vel.y];
}
function steerWallAvoid(c){
  const r=(CONFIG.physics.wallAvoidRadius??48)+radiusOf(c); let fx=0,fy=0;
  const l=c.pos.x; if(l<r) fx+=(r-l)/r; const rgt=W-c.pos.x; if(rgt<r) fx-=(r-rgt)/r;
  const t=c.pos.y; if(t<r) fy+=(r-t)/r; const b=H-c.pos.y; if(b<r) fy-=(r-b)/r;
  return [fx,fy];
}
function updateWander(c,dt){
  const th=CONFIG.physics.wanderTheta??1.6, sg=CONFIG.physics.wanderSigma??0.45;
  const gauss=()=>{let u=0,v=0; while(u===0) u=Math.random(); while(v===0) v=Math.random(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};
  c.wander.vx += th*(0-c.wander.vx)*dt + sg*Math.sqrt(dt)*gauss();
  c.wander.vy += th*(0-c.wander.vy)*dt + sg*Math.sqrt(dt)*gauss();
  const [ux,uy]=(len(c.vel.x,c.vel.y)>1e-3)?norm(c.vel.x,c.vel.y):[0,0]; return [c.wander.vx+0.2*ux, c.wander.vy+0.2*uy];
}

/* Food-Sensor */
function senseFood(c, sense){
  let nearestItem=null, nd=Infinity; let cx=0, cy=0, n=0;
  for(const f of foodItems){
    const dx=f.x-c.pos.x, dy=f.y-c.pos.y; const d2=dx*dx+dy*dy;
    if(d2> sense*sense) continue;
    const d=Math.sqrt(d2);
    if(d<nd){ nd=d; nearestItem={x:f.x,y:f.y,d}; }
    if(n<3){ cx+=f.x; cy+=f.y; n++; }
  }
  const center = n? {x:cx/n, y:cy/n, d: Math.hypot(cx/n-c.pos.x, cy/n-c.pos.y)} : null;
  if(!nearestItem && !center) return null;
  return { item: nearestItem, center };
}

/* ============ Langlebigkeits-Funktion ============ */
function effectiveAgeLimit(c){
  const L = CONFIG.longevity || {};
  const base = (L.baseAge ?? CONFIG.cell.ageMax) || 600;

  const z = v => (v - 5) / 5;
  const gw = L.geneWeights || { EFF:0.50, MET:-0.50, SCH:0.30, TEM:0.10, "GRÖ":0.00 };
  const g = c.genome;

  let geneScore =
      (gw.EFF||0)*z(g.EFF) +
      (gw.MET||0)*z(g.MET) +
      (gw.SCH||0)*z(g.SCH) +
      (gw.TEM||0)*z(g.TEM) +
      ((gw["GRÖ"]||0)*z(g["GRÖ"]));

  let boost = geneScore + (L.nutritionK ?? 0.15) * (c.vitality ?? 0);
  boost = clamp(boost, (L.minBoost ?? -0.30), (L.maxBoost ?? 0.50));
  return base * (1 + boost);
}

/* ============ Hauptschritt (Scaffold-Hook gesetzt) ============ */
export function step(dt, _env, _t){ /* grid scaffold: befüllt im nächsten Schritt produktiv */
  const neighbors=cells;
  const { sMin } = worldScales();

  metrics.beginTick();

  for(let i=cells.length-1;i>=0;i--){
    const c=cells[i];
    c.age += dt; c.cooldown=Math.max(0,c.cooldown-dt);

    const g=c.genome;
    const senseFoodR=CONFIG.cell.senseFood*(0.7+0.1*g.EFF)*sMin;
    const senseMateR=CONFIG.cell.senseMate*(0.7+0.08*g.EFF)*sMin;
    const maxSpeed = CONFIG.cell.baseSpeed*(0.7+0.08*g.TEM)*sMin;
    const maxForce = (CONFIG.physics.maxForceBase??140)*(0.7+0.08*g.TEM)*sMin;

    const foodS = senseFood(c, senseFoodR);
    const mate  = chooseMate(c, senseMateR, neighbors);

    // grobe Nachbardichte
    let neigh=0; for(const o of neighbors){ if(o===c) continue; const dx=o.pos.x-c.pos.x, dy=o.pos.y-c.pos.y; if(dx*dx+dy*dy<(60*sMin)*(60*sMin)) neigh++; }

    const ctx={ env:{},
      food: foodS ? { x:(foodS.item?.x ?? foodS.center?.x), y:(foodS.item?.y ?? foodS.center?.y) } : null,
      foodDist: foodS ? (foodS.item?.d ?? foodS.center?.d) : null,
      mate: mate?.cell??null, mateDist:mate?.d??null,
      hazard:0, neighCount:neigh, worldMin:Math.min(W,H)
    };

    const option = drivesGetAction(c, 0, ctx);

    // Avoid
    let [fx,fy]=[0,0], rem=maxForce;
    const fAvoid=steerWallAvoid(c);
    const avoidW=(CONFIG.physics.wAvoid??1.15);
    ({fx,fy,rem}=addBudget(fx,fy,rem,fAvoid[0],fAvoid[1],avoidW));

    // Primärvektor
    let fOpt=[0,0]; const slowR=Math.max(CONFIG.physics.slowRadius??120, CONFIG.cell.pairDistance*3);
    if(option==="food" && foodS){
      const eatR = (CONFIG.food.itemRadius + radiusOf(c) + 2) * sMin;
      if(foodS.item){
        fOpt = steerSeekArrive(c,{x:foodS.item.x,y:foodS.item.y}, maxSpeed, Math.max(2,eatR-2), slowR);
      }else if(foodS.center){
        const stopCenter = Math.max(2, (radiusOf(c)*0.25 + 1) * sMin);
        fOpt = steerSeekArrive(c,{x:foodS.center.x,y:foodS.center.y}, maxSpeed, stopCenter, slowR);
      }
    }else if(option==="mate" && mate){
      fOpt = steerSeekArrive(c,{x:mate.cell.pos.x,y:mate.cell.pos.y}, maxSpeed*0.9, CONFIG.cell.pairDistance*0.9, slowR);
    }else{
      fOpt = updateWander(c,dt);
    }
    ({fx,fy,rem}=addBudget(fx,fy,rem,fOpt[0],fOpt[1],1.0));

    // Mini-Separation
    const fSep=quickSeparation(c,neighbors,22*sMin);
    ({fx,fy,rem}=addBudget(fx,fy,rem,fSep[0],fSep[1],0.35));

    // Integration
    [fx,fy]=limitVec(fx,fy,maxForce);
    c.vel.x += fx*dt; c.vel.y += fy*dt;
    [c.vel.x,c.vel.y]=limitVec(c.vel.x,c.vel.y,maxSpeed);
    c.pos.x=clamp(c.pos.x+c.vel.x*dt,0,W); c.pos.y=clamp(c.pos.y+c.vel.y*dt,0,H);
    c.vel.x*=0.985; c.vel.y*=0.985;

    // ===== Essen & Ökonomie-Sample =====
    let eaten = 0;
    {
      const eatR = (CONFIG.food.itemRadius + radiusOf(c) + 2) * sMin;
      for(let k=foodItems.length-1;k>=0;k--){
        const f=foodItems[k]; const dx=f.x-c.pos.x, dy=f.y-c.pos.y;
        if(dx*dx+dy*dy<eatR*eatR){
          const take=CONFIG.cell.eatPerSecond*dt, got=Math.min(take,f.amount);
          c.energy=Math.min(capEnergy(c),c.energy+got);
          f.amount-=got; eaten += got;
          if(f.amount<=1) foodItems.splice(k,1);
        }
      }
    }

    // ===== Energie (keine Umwelt) =====
    const sp=len(c.vel.x,c.vel.y);
    const baseDrain=CONFIG.cell.baseMetabolic*(0.6+0.1*g.MET)*dt;
    const moveDrain=(CONFIG.physics.moveCostK??0.0006)*(sp*sp)*dt / sMin;

    c.energy -= baseDrain + moveDrain;

    // ===== Vitalität integrieren (-1..+1) =====
    {
      const L = CONFIG.longevity || {};
      const eFrac = clamp(c.energy / capEnergy(c), 0, 1);
      let dv = 0;
      if (eFrac >= (L.energyGood ?? 0.60)) dv += (L.vitalityRate ?? 0.6) * dt;
      else if (eFrac <= (L.energyBad ?? 0.25)) dv -= (L.vitalityRate ?? 0.6) * dt;
      // hazard ist 0 (Umwelt aus)
      c.vitality = clamp((c.vitality ?? 0) + dv, -1, 1);
    }

    // Lernen/Fenster schließen
    drivesAfterStep(c, dt, ctx);

    // ===== Tod (dynamische Altersgrenze) =====
    const ageLimit = effectiveAgeLimit(c);
    if(c.energy<=0 || c.age>ageLimit) killCell(c.id);
  }

  // --- Gen-Stats & Commit (~1/s) ---
  {
    const n = cells.length;
    let sTEM=0,sGRO=0,sEFF=0,sSCH=0,sMET=0;
    for(const c of cells){
      sTEM+=c.genome.TEM; sGRO+=c.genome["GRÖ"]; sEFF+=c.genome.EFF; sSCH+=c.genome.SCH; sMET+=c.genome.MET;
    }
    const means = n? { TEM:sTEM/n, "GRÖ":sGRO/n, EFF:sEFF/n, SCH:sSCH/n, MET:sMET/n } : { TEM:0,"GRÖ":0,EFF:0,SCH:0,MET:0 };
    metrics.commitTick(dt, foodItems.length, { n, means });
  }
}

/* Mate-Ziel */
function chooseMate(c,sense,arr){
  if(c.cooldown>0) return null; let best=null, bestScore=-1e9, bestD=Infinity;
  for(const o of arr){ if(o===c||o.sex===c.sex||o.cooldown>0) continue;
    const dx=o.pos.x-c.pos.x, dy=o.pos.y-c.pos.y; const d2=dx*dx+dy*dy; if(d2>sense*sense) continue; const d=Math.sqrt(d2);
    const geneScore=(o.genome.EFF*0.8+(10-o.genome.MET)*0.7+o.genome.SCH*0.2+o.genome.TEM*0.2);
    const total=-0.05*d + geneScore; if(total>bestScore){ best=o; bestScore=total; bestD=d; } }
  return best?{cell:best,d:bestD}:null;
}

/* Hilfsfunktionen */
function addBudget(fx,fy,rem,vx,vy,w){ const rx=vx*w, ry=vy*w; const m=Math.hypot(rx,ry); if(m<1e-6||rem<=0) return {fx,fy,rem};
  const allow=Math.min(m,rem), s=allow/m; return {fx:fx+rx*s, fy:fy+ry*s, rem:rem-allow}; }
function quickSeparation(c,arr,r){ let sx=0,sy=0,n=0, rr=r*r; for(const o of arr){ if(o===c) continue; const dx=c.pos.x-o.pos.x, dy=c.pos.y-o.pos.y;
  const d2=dx*dx+dy*dy; if(d2>rr||d2===0) continue; const d=Math.sqrt(d2); sx+=dx/d; sy+=dy/d; n++; } return n? [sx/n,sy/n]:[0,0]; }

export { radiusOf as __radiusForDebug };