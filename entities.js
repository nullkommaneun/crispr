// entities.js — Entities & Bewegung (Spatial-Hash aktiv)
// Neuerungen:
//  - Kreuzungsbonus bei Partnerwahl: +0.3, wenn stammId verschieden
//  - Juvenil-Schutz: baseMetabolic ×0.8 für Age < 15 s

import { CONFIG } from "./config.js";
import { emit } from "./event.js";
import { getAction as drivesGetAction, afterStep as drivesAfterStep } from "./drives.js";
import * as metrics from "./metrics.js";
import { createGrid } from "./grid.js";

let W = CONFIG.world.width, H = CONFIG.world.height;

const cells = [];
const foodItems = [];
let stammMeta = new Map();
let nextCellId = 1;

/* Utils */
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const len=(x,y)=>Math.hypot(x,y);
const d2=(x1,y1,x2,y2)=>{ const dx=x2-x1, dy=y2-y1; return dx*dx+dy*dy; };
function norm(x,y){ const L=len(x,y)||1e-6; return [x/L,y/L]; }
function limitVec(x,y,max){ const L=len(x,y); if(L>max){ const s=max/(L||1e-6); return [x*s,y*s]; } return [x,y]; }
function rnd(a,b){ return a + Math.random()*(b-a); }
function radiusOf(c){ return CONFIG.cell.radius*(0.7+0.1*(c.genome.GRÖ)); }
function capEnergy(c){ return CONFIG.cell.energyMax*(1+0.08*(c.genome.GRÖ-5)); }
function worldScales(){ const BASE_H=640, BASE_W=1024; const sMin=Math.max(0.6, Math.min(W,H)/BASE_H); const areaScale=(W*H)/(BASE_W*BASE_H); return { sMin, areaScale }; }
function sexColor(sex){ return sex==="M" ? CONFIG.colors.sexMale : CONFIG.colors.sexFemale; }

/* Exporte */
export function worldSize(){ return {width:W,height:H}; }
export function setWorldSize(w,h){ W=w; H=h; }
export function addFoodItem(f){ foodItems.push(f); }
export function getFoodItems(){ return foodItems; }
export function getCells(){ return cells; }
export function getStammCounts(){ const m={}; for(const c of cells){ m[c.stammId]=(m[c.stammId]||0)+1; } return m; }

/* Zellen */
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
    vitality: 0,
    wander:{ vx:0, vy:0 }
  };
  cells.push(cell);
  return cell;
}
export function killCell(id){
  const i=cells.findIndex(c=>c.id===id);
  if(i>=0){ const c=cells[i]; cells.splice(i,1); emit("cells:died",c); }
}

/* Startpopulation */
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

/* Environment (no-op) */
export function applyEnvironment(_env){}

/* Steering helpers */
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

/* Spatial Grid (mit Scale-Faktor) */
let grid = null;
let gridMeta = { cellSize: 0, W: 0, H: 0 };
let gridScaleFactor = 1.0; // 1.0 = Standard, <1 dichter
export function getGridScaleFactor(){ return gridScaleFactor; }
export function setGridScaleFactor(f){ gridScaleFactor = Math.max(0.6, Math.min(1.4, +f||1)); }
export function getGridCellSize(){ return gridMeta.cellSize || null; }

function ensureGrid(sMin){
  const baseSense = CONFIG.cell?.senseFood || 110;
  const desiredBase = baseSense * sMin * gridScaleFactor;
  const desired = Math.max(80, Math.round(desiredBase));
  if (!grid || gridMeta.cellSize !== desired || gridMeta.W !== W || gridMeta.H !== H){
    grid = createGrid(desired, W, H);
    gridMeta = { cellSize: desired, W, H };
  }
  return grid;
}

/* Grid-Queries */
function senseFoodGrid(c, senseR, grid){
  const cand = grid.queryCircle(c.pos.x, c.pos.y, senseR);
  let nearestItem=null, nd2=Infinity; let cx=0, cy=0, n=0; const r2=senseR*senseR;
  for(const p of cand){
    if(p?.type!=="food") continue;
    const f=p.obj; const dist2=d2(c.pos.x,c.pos.y,f.x,f.y);
    if(dist2>r2) continue;
    if(dist2<nd2){ nd2=dist2; nearestItem={x:f.x,y:f.y,d:Math.sqrt(dist2)}; }
    if(n<3){ cx+=f.x; cy+=f.y; n++; }
  }
  const center = n? { x:cx/n, y:cy/n, d: Math.hypot(cx/n-c.pos.x, cy/n-c.pos.y) } : null;
  if(!nearestItem && !center) return null;
  return { item: nearestItem, center };
}
function quickSeparationGrid(c, r, grid){
  const cand = grid.queryCircle(c.pos.x, c.pos.y, r);
  let sx=0, sy=0, n=0, rr=r*r;
  for(const p of cand){
    if(p?.type!=="cell") continue;
    const o=p.obj; if(o===c) continue;
    const d2v=d2(c.pos.x,c.pos.y,o.pos.x,o.pos.y);
    if(d2v===0||d2v>rr) continue; const d=Math.sqrt(d2v); sx+= (c.pos.x-o.pos.x)/d; sy+= (c.pos.y-o.pos.y)/d; n++;
  }
  return n? [sx/n, sy/n]:[0,0];
}
function chooseMateGrid(c, senseR, grid){
  if(c.cooldown>0) return null;
  const cand = grid.queryCircle(c.pos.x, c.pos.y, senseR);
  let best=null, bestScore=-1e9, bestD=Infinity, rr=senseR*senseR;

  for(const p of cand){
    if(p?.type!=="cell") continue;
    const o=p.obj;
    if (o === c || o.sex === c.sex || o.cooldown > 0) continue;
    const dist2 = d2(c.pos.x,c.pos.y,o.pos.x,o.pos.y);
    if (dist2 > rr) continue;
    const d = Math.sqrt(dist2);

    // Gene-Score + Kreuzungsbonus
    const geneScore = (o.genome.EFF*0.8 + (10 - o.genome.MET)*0.7 + o.genome.SCH*0.2 + o.genome.TEM*0.2);
    const crossBonus = (o.stammId !== c.stammId) ? 0.3 : 0.0;

    const total = -0.05*d + geneScore + crossBonus;
    if (total > bestScore){ best = o; bestScore = total; bestD = d; }
  }
  return best ? { cell: best, d: bestD } : null;
}

/* Langlebigkeit */
function effectiveAgeLimit(c){
  const L = CONFIG.longevity || {};
  const base = (L.baseAge ?? CONFIG.cell.ageMax) || 600;
  const z = v => (v - 5) / 5;
  const gw = L.geneWeights || { EFF:0.50, MET:-0.50, SCH:0.30, TEM:0.10, "GRÖ":0.00 };
  const g=c.genome;
  let geneScore=(gw.EFF||0)*z(g.EFF)+(gw.MET||0)*z(g.MET)+(gw.SCH||0)*z(g.SCH)+(gw.TEM||0)*z(g.TEM)+((gw["GRÖ"]||0)*z(g["GRÖ"]));
  let boost = geneScore + (L.nutritionK ?? 0.15) * (c.vitality ?? 0);
  boost = clamp(boost, (L.minBoost ?? -0.30), (L.maxBoost ?? 0.50));
  return base * (1 + boost);
}

/* Hauptschritt */
export function step(dt, _env, _t){
  const { sMin } = worldScales();

  // Grid vorbereiten
  const g = ensureGrid(sMin);
  g.clear();
  for (const f of foodItems) g.insert(f.x, f.y, { type:"food", obj:f });
  for (const c of cells)     g.insert(c.pos.x, c.pos.y, { type:"cell", obj:c });

  metrics.beginTick();

  for(let i=cells.length-1;i>=0;i--){
    const c=cells[i];
    c.age += dt; c.cooldown=Math.max(0,c.cooldown-dt);

    const gnm=c.genome;
    const senseFoodR=CONFIG.cell.senseFood*(0.7+0.1*gnm.EFF)*sMin;
    const senseMateR=CONFIG.cell.senseMate*(0.7+0.08*gnm.EFF)*sMin;
    const maxSpeed =  CONFIG.cell.baseSpeed*(0.7+0.08*gnm.TEM)*sMin;
    const maxForce = (CONFIG.physics.maxForceBase??140)*(0.7+0.08*gnm.TEM)*sMin;

    const foodS = senseFoodGrid(c, senseFoodR, g);
    const mate  = chooseMateGrid(c, senseMateR, g);

    // Nachbardichte
    let neigh=0;{
      const R = 60*sMin, R2=R*R;
      const local = g.queryCircle(c.pos.x, c.pos.y, R);
      for(const p of local){ if(p?.type!=="cell") continue; const o=p.obj; if(o===c) continue;
        if(d2(c.pos.x,c.pos.y,o.pos.x,o.pos.y) <= R2) neigh++; }
    }

    const ctx={ env:{},
      food: foodS ? { x:(foodS.item?.x ?? foodS.center?.x), y:(foodS.item?.y ?? foodS.center?.y) } : null,
      foodDist: foodS ? (foodS.item?.d ?? foodS.center?.d) : null,
      mate: mate?.cell??null, mateDist:mate?.d??null,
      hazard:0, neighCount:neigh, worldMin:Math.min(W,H)
    };

    const option = drivesGetAction(c, 0, ctx);

    // Avoid
    let [fx,fy]=[0,0], rem=maxForce; const fAvoid=steerWallAvoid(c);
    ({fx,fy,rem}=addBudget(fx,fy,rem,fAvoid[0],fAvoid[1], (CONFIG.physics.wAvoid??1.15)));

    // Primär
    let fOpt=[0,0]; const slowR=Math.max(CONFIG.physics.slowRadius??120, CONFIG.cell.pairDistance*3);
    if(option==="food" && foodS){
      const eatR = (CONFIG.food.itemRadius + radiusOf(c) + 2) * sMin, eatR2=eatR*eatr;
      // Tippfehler korrigieren
    } // Dieser Block wird weiter unten korrekt implementiert
    // KORREKT:
    if(option==="food" && foodS){
      const eatR = (CONFIG.food.itemRadius + radiusOf(c) + 2) * sMin, eatR2=eatR*eatR;
      if(foodS.item){
        fOpt = steerSeekArrive(c,{x:foodS.item.x,y:foodS.item.y}, maxSpeed, Math.max(2,eatR-2), slowR);
      }else{
        const stopCenter = Math.max(2, (radiusOf(c)*0.25 + 1) * sMin);
        fOpt = steerSeekArrive(c,{x:foodS.center.x,y:foodS.center.y}, maxSpeed, stopCenter, slowR);
      }
      // Essen (nur lokale Buckets)
      let eaten=0;
      const localFood = g.queryCircle(c.pos.x, c.pos.y, eatR);
      for(const p of localFood){
        if(p?.type!=="food") continue; const f=p.obj;
        if (d2(c.pos.x,c.pos.y,f.x,f.y) > eatR2) continue;
        const take=CONFIG.cell.eatPerSecond*dt, got=Math.min(take,f.amount);
        c.energy=Math.min(capEnergy(c),c.energy+got); f.amount-=got; eaten+=got;
        if(f.amount<=1){ const idx=foodItems.indexOf(f); if(idx>=0) foodItems.splice(idx,1); }
      }
      metrics.sampleEnergy({ intake:eaten, base:0, move:0, env:0, eating:(eaten>0) });
    } else if(option==="mate" && mate){
      fOpt = steerSeekArrive(c,{x:mate.cell.pos.x,y:mate.cell.pos.y}, maxSpeed*0.9, CONFIG.cell.pairDistance*0.9, slowR);
    } else {
      fOpt = updateWander(c,dt);
    }
    ({fx,fy,rem}=addBudget(fx,fy,rem,fOpt[0],fOpt[1],1.0));

    // Separation
    const fSep=quickSeparationGrid(c, 22*sMin, g);
    ({fx,fy,rem}=addBudget(fx,fy,rem,fSep[0],fSep[1],0.35));

    // Integration
    [fx,fy]=limitVec(fx,fy,maxForce);
    c.vel.x += fx*dt; c.vel.y += fy*dt;
    [c.vel.x,c.vel.y]=limitVec(c.vel.x,c.vel.y,maxSpeed);
    c.pos.x=clamp(c.pos.x+c.vel.x*dt,0,W); c.pos.y=clamp(c.pos.y+c.vel.y*dt,0,H);
    c.vel.x*=0.985; c.vel.y*=0.985;

    // Energie (Juvenil-Schutz + Grundkosten)
    const sp=len(c.vel.x,c.vel.y);
    let baseDrain=CONFIG.cell.baseMetabolic*(0.6+0.1*gnm.MET)*dt;
    if (c.age < 15) baseDrain *= 0.8; // Juvenil-Schutz
    const moveDrain=(CONFIG.physics.moveCostK??0.0006)*(sp*sp)*dt / sMin;
    c.energy -= baseDrain + moveDrain;
    metrics.sampleEnergy({ base:baseDrain, move:moveDrain, env:0, intake:0, eating:false });

    // Vitalität
    {
      const L = CONFIG.longevity || {};
      const eFrac = clamp(c.energy / capEnergy(c), 0, 1);
      let dv = 0;
      if (eFrac >= (L.energyGood ?? 0.60)) dv += (L.vitalityRate ?? 0.6) * dt;
      else if (eFrac <= (L.energyBad ?? 0.25)) dv -= (L.vitalityRate ?? 0.6) * dt;
      c.vitality = clamp((c.vitality ?? 0) + dv, -1, 1);
    }

    drivesAfterStep(c, dt, ctx);

    // Tod
    const ageLimit = effectiveAgeLimit(c);
    if(c.energy<=0 || c.age>ageLimit) killCell(c.id);
  }

  // Stats
  {
    const n = cells.length;
    let sTEM=0,sGRO=0,sEFF=0,sSCH=0,sMET=0;
    for(const c of cells){ sTEM+=c.genome.TEM; sGRO+=c.genome["GRÖ"]; sEFF+=c.genome.EFF; sSCH+=c.genome.SCH; sMET+=c.genome.MET; }
    const means = n? { TEM:sTEM/n, "GRÖ":sGRO/n, EFF:sEFF/n, SCH:sSCH/n, MET:sMET/n } : { TEM:0,"GRÖ":0,EFF:0,SCH:0,MET:0 };
    metrics.commitTick(dt, foodItems.length, { n, means });
  }
}

/* Hilfen */
function addBudget(fx,fy,rem,vx,vy,w){ const rx=vx*w, ry=vy*w; const m=Math.hypot(rx,ry); if(m<1e-6||rem<=0) return {fx,fy,rem};
  const allow=Math.min(m,rem), s=allow/m; return {fx:fx+rx*s, fy:fy+ry*s, rem:rem-allow}; }

export { radiusOf as __radiusForDebug };