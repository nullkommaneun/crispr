// narrative/panel.js
// DNA Daily – Boulevard-Schlagzeilen als fortlaufende Mini-Story
// • sensible, niedrigere Schwellen
// • dedupliziert & mit Cooldowns je Thema
// • Erst-Ereignisse (erste Paarung/Geburt/Tod)
// • Heartbeat (nach längerer Stille kurzer Situationssatz)

import { Events, EVT } from '../event.js';
import * as Entities from '../entities.js';
import { survivalScore } from '../genetics.js';

let panel;

// ===== Utils ==============================================================
const now  = () => performance.now()/1000;
const pick = (arr)=> arr[(Math.random()*arr.length)|0];

function headline(html){
  const div = document.createElement('div');
  div.className = 'headline';
  div.innerHTML = `<b>${html}</b>`;
  return div;
}

function post(topic, html, cooldownSec = 40){
  if(!panel) return;
  if(!story.cooldown(topic, cooldownSec)) return;
  if(story.lastText === html) return;
  story.lastText = html;
  panel.prepend(headline(html));
}

function quadrant(x, y, w, h){
  const hor = x < w*0.33 ? 'West' : x > w*0.67 ? 'Ost' : 'Mitte';
  const ver = y < h*0.33 ? 'Nord' : y > h*0.67 ? 'Süd' : 'Zentral';
  if (ver === 'Zentral' && hor === 'Mitte') return 'Zentrum';
  return ver + '-' + hor;
}

// ===== Konfiguration (Schwellen & Cooldowns) ==============================
const CFG = {
  // Cooldowns (Sekunden)
  cd: {
    small: 25,  // kurze Dinge
    med:   50,  // Standard
    big:   90,  // große Meilensteine
  },
  // Hungersnot-Stufen: Todesfälle / 60s
  famine: { s1: 6, s2: 12, s3: 20, recBelow: 3 },
  // Überbevölkerung (lebende Zellen)
  overpop: { s1: 120, s2: 180, easeBelow: 100 },
  // Goldenes Zeitalter / Crash
  golden: { births30: 8, deaths30: 2, growth10: 5 },
  crash:  { deaths30Factor: 1.4, drop30: 0.9 },
  // Speziation / Drift / Rausch / Flaschenhals / Dominanz
  speciation: { deltaStamm60: 2 }, // +2 in 60s
  drift:      { move: 40, every: 15 },
  frenzy:     { births15: 5 },
  bottle:     { alive: 16 },
  domin:      { share: 0.55 }
};

// ===== Story-State ========================================================
const story = {
  lastTopicAt: new Map(), // topic -> ts
  extinct: new Set(),
  foundersShown: false,
  famineStage: 0, overpopStage: 0,
  lastText: '',
  lastPostAt: 0,

  // Fenster
  births: [], deaths: [], aliveHist: [], stammHist: [],
  foodCentroid: {x: null, y: null, t: 0},

  // Erst-Ereignisse
  firstMate: false, firstBirth: false, firstDeath: false,

  cooldown(topic, sec){
    const t = now(); const last = this.lastTopicAt.get(topic) || 0;
    if (t - last < sec) return false;
    this.lastTopicAt.set(topic, t); this.lastPostAt = t;
    return true;
  }
};

// ===== Phrasen ============================================================
const PH = {
  fire:  ['🔥','🔥','⚠️'],
  over:  ['🐝','🧨'],
  love:  ['❤️','💕'],
  mut:   ['🧬','🧪'],
  skull: ['⚰️','🪦'],
  rise:  ['🌱','🌿'],
  drift: ['🌪️','💨'],
  boom:  ['💞','✨'],
  crisis:   ['Hungersnot','Versorgungskrise','Nahrungsengpass'],
  relax:    ['Entspannung','Erholung','Stabilisierung'],
  lab:      ['im Labor','im Testfeld','im Habitat'],
  burst:    ['Welle','Schub','Flut'],
  driftV:   ['driften','wandern','verlagern sich'],
};

// ===== Init / Reset =======================================================
export function initNarrativePanel(){
  panel = document.getElementById('narrativePanel');
  if(!panel) return;

  function resetState(){
    story.lastTopicAt.clear();
    story.extinct.clear();
    story.foundersShown = false;
    story.famineStage = 0; story.overpopStage = 0;
    story.lastText = ''; story.lastPostAt = 0;
    story.firstMate = story.firstBirth = story.firstDeath = false;

    story.births.length = 0; story.deaths.length = 0;
    story.aliveHist.length = 0; story.stammHist.length = 0;
    story.foodCentroid = {x: null, y: null, t: 0};
    panel.innerHTML = '';
  }

  on(EVT.RESET, resetState);
  resetState();

  // === Listener ===========================================================

  on(EVT.MATE, (d)=>{
    if(!d) return;
    if(!story.firstMate && story.cooldown('first-mate', CFG.cd.med)){
      story.firstMate = true;
      post('first-mate', `${pick(PH.boom)} Erste Paarung bestätigt – die Evolution legt los.`, CFG.cd.med);
    }
    if((d.relatedness ?? 0) >= 0.25 && story.cooldown('scandal', CFG.cd.med)){
      post('scandal', `${pick(PH.mut)}📰 Skandal! Nah verwandte Zellen erwischt – Ethikrat warnt.`, CFG.cd.med);
    }
  });

  on(EVT.BIRTH, (d)=>{
    const t = now(); story.births.push(t);
    while(story.births.length && t - story.births[0] > 60) story.births.shift();

    if(!story.firstBirth && story.cooldown('first-birth', CFG.cd.small)){
      story.firstBirth = true;
      post('first-birth', `${pick(PH.rise)} Erster Nachwuchs – ein zartes Signal der Zukunft.`, CFG.cd.small);
    }

    if(!d?.parents) return;
    const child  = Entities.cells.find(c=>c.id===d.id);
    const mom    = Entities.cells.find(c=>c.id===d.parents.motherId);
    const dad    = Entities.cells.find(c=>c.id===d.parents.fatherId);
    if (!child || !mom || !dad) return;

    const pAvg = Math.round((survivalScore(mom.genes) + survivalScore(dad.genes))/2);
    const cVal = survivalScore(child.genes);
    if (cVal >= pAvg + 12 && story.cooldown('mut-good', CFG.cd.small)){
      post('mut-good', `${pick(PH.mut)} Mutation-Durchbruch! Neue Linie ${pick(['übertrifft die Eltern','zeigt ungeahnte Stärke'])}.`, CFG.cd.small);
    } else if (cVal <= pAvg - 14 && story.cooldown('mut-bad', CFG.cd.med)){
      post('mut-bad', `${pick(PH.mut)} Mutation mit Nebenwirkung – Nachwuchs deutlich schwächer.`, CFG.cd.med);
    }

    onFoundersLove();
  });

  on(EVT.DEATH, (d)=>{
    const t = now(); story.deaths.push(t);
    while(story.deaths.length && t - story.deaths[0] > 60) story.deaths.shift();

    if(!story.firstDeath && story.cooldown('first-death', CFG.cd.small)){
      story.firstDeath = true;
      post('first-death', `🕯️ Erste Verluste ${pick(PH.lab)} – harte Bedingungen formen die Selektion.`, CFG.cd.small);
    }

    if(d?.stammId){
      const cnt = (Entities.getStammCounts?.() || {})[d.stammId] || 0;
      if(cnt === 0 && !story.extinct.has(d.stammId) && story.cooldown('extinct-'+d.stammId, CFG.cd.big)){
        story.extinct.add(d.stammId);
        post('extinct-'+d.stammId, `${pick(PH.skull)} Drama! Stamm ${d.stammId} erlischt vollständig.`, CFG.cd.big);
      }
    }
  });

  on(EVT.HUNGER_CRISIS, (d)=>{
    const n = d?.inLastMinute ?? CFG.famine.s1;
    const level = n >= CFG.famine.s3 ? 3 : n >= CFG.famine.s2 ? 2 : n >= CFG.famine.s1 ? 1 : 0;
    if (level > story.famineStage && story.cooldown('famine-lvl'+level, CFG.cd.med)){
      story.famineStage = level;
      const line = level===3
        ? `${pick(PH.fire)}${pick(PH.fire)} Katastrophe! Versorgung kollabiert – Ausnahmezustand.`
        : level===2
          ? `${pick(PH.fire)} Hungersnot! Rationen reichen nicht – Zellen verenden reihenweise.`
          : `⚠️ ${pick(PH.crisis)} kündigt sich an – Reserven schwinden.`;
      post('famine', line, CFG.cd.med);
    }
  });

  on(EVT.OVERPOP, (d)=>{
    const pop = d?.population ?? CFG.overpop.s1;
    const level = pop >= CFG.overpop.s2 ? 2 : pop >= CFG.overpop.s1 ? 1 : 0;
    if (level > story.overpopStage && story.cooldown('over-lvl'+level, CFG.cd.med)){
      story.overpopStage = level;
      const line = level===2
        ? `${pick(PH.over)} Schwarmalarm! Dichtestress – Platz wird knapp.`
        : `${pick(PH.over)} Überbevölkerung! Das Habitat ächzt.`;
      post('overpop', line, CFG.cd.med);
    }
  });

  on(EVT.TICK, onTick);
}

// ===== TICK-Loop ===========================================================
function onTick(){
  const t = now();

  // Alive/Clans Verlauf pflegen
  const alive = Entities.cells.filter(c=>!c.dead).length;
  story.aliveHist.push([t, alive]);
  while(story.aliveHist.length && t - story.aliveHist[0][0] > 60) story.aliveHist.shift();

  const stammCount = Object.keys(Entities.getStammCounts?.()||{}).length;
  story.stammHist.push([t, stammCount]);
  while(story.stammHist.length && t - story.stammHist[0][0] > 60) story.stammHist.shift();

  // 1) Hungersnot-Erholung
  if(story.famineStage>0){
    const deaths = story.deaths.length;
    if (deaths <= CFG.famine.recBelow && story.cooldown('famine-rec-probe', 8)){
      story.famineStage = 0;
      post('famine-rec', `🌧️ ${pick(PH.relax)}! Neue Futterflecken – Sterblichkeit sinkt.`, CFG.cd.med);
    }
  }

  // 2) Überbevölkerung entspannt sich
  if(story.overpopStage>0){
    if (alive <= CFG.overpop.easeBelow && story.cooldown('overpop-rec', 20)){
      story.overpopStage = 0;
      post('overpop-rec', '🌬️ Aufatmen! Population verteilt sich – Balance kehrt zurück.', CFG.cd.med);
    }
  }

  // 3) Goldenes Zeitalter
  const births30 = story.births.filter(ts => t - ts <= 30).length;
  const deaths30 = story.deaths.filter(ts => t - ts <= 30).length;
  const alive10ago = story.aliveHist.find(([ts]) => t - ts >= 10)?.[1] ?? alive;
  const growth10 = alive - alive10ago;
  if (births30 >= CFG.golden.births30 && deaths30 <= CFG.golden.deaths30 && growth10 >= CFG.golden.growth10
      && story.cooldown('golden', CFG.cd.big)){
    post('golden', `${pick(PH.rise)} Goldenes Zeitalter: ${pick(['Geburtenwelle','Aufschwung'])} – Stämme expandieren.`, CFG.cd.big);
  }

  // 4) Population-Crash
  const alive30ago = story.aliveHist.find(([ts]) => t - ts >= 30)?.[1] ?? alive;
  if (deaths30 >= births30 * CFG.crash.deaths30Factor && alive < alive30ago * CFG.crash.drop30
      && story.cooldown('crash', CFG.cd.med)){
    post('crash', `📉 Population bricht ein – Rückgang unübersehbar.`, CFG.cd.med);
  }

  // 5) Speziations-Welle
  if (story.stammHist.length>=2){
    const base = story.stammHist[0][1], nowC = story.stammHist[story.stammHist.length-1][1];
    if (nowC - base >= CFG.speciation.deltaStamm60 && story.cooldown('speciation', CFG.cd.big)){
      post('speciation', `${pick(PH.mut)}🧬 Abspaltungs-${pick(PH.burst)}! Neue Linien wagen den Sprung.`, CFG.cd.big);
    }
  }

  // 6) Ressourcen-Drift (Schwerpunkt der Nahrung bewegt sich deutlich)
  if (Entities.foods?.length){
    const w = Entities.getWorldConfig().width  || 800;
    const h = Entities.getWorldConfig().height || 520;
    const cx = Entities.foods.reduce((a,f)=>a+f.x,0)/Entities.foods.length;
    const cy = Entities.foods.reduce((a,f)=>a+f.y,0)/Entities.foods.length;
    if (story.foodCentroid.x==null){
      story.foodCentroid = {x:cx,y:cy,t:t};
    }else if (t - story.foodCentroid.t > CFG.drift.every){
      const dx = cx - story.foodCentroid.x, dy = cy - story.foodCentroid.y;
      const dist = Math.hypot(dx,dy);
      if (dist > CFG.drift.move && story.cooldown('drift', CFG.cd.big)){
        const dir = quadrant(cx,cy,w,h);
        post('drift', `${pick(PH.drift)} Ressourcen ${pick(PH.driftV)} Richtung **${dir}**.`, CFG.cd.big);
      }
      story.foodCentroid = {x:cx,y:cy,t:t};
    }
  }

  // 7) Paarungsrausch
  const births15 = story.births.filter(ts => t - ts <= 15).length;
  if (births15 >= CFG.frenzy.births15 && story.cooldown('frenzy', CFG.cd.med)){
    post('frenzy', `${pick(PH.boom)} Paarungsrausch ${pick(['im Labor','im Habitat'])} – Gene tanzen.`, CFG.cd.med);
  }

  // 8) Bottleneck
  if (alive > 0 && alive <= CFG.bottle.alive && story.cooldown('bottleneck', CFG.cd.big)){
    post('bottleneck', `🧊 Genetischer Flaschenhals: Nur ${alive} Zellen verbleiben.`, CFG.cd.big);
  }

  // 9) Dominanzwechsel
  const counts = Entities.getStammCounts?.() || {};
  const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  if(entries.length){
    const [lead, nLead] = entries[0];
    const sum = entries.reduce((a,[,v])=>a+v,0) || 1;
    if (nLead/sum >= CFG.domin.share && story.cooldown('dominance-'+lead, 120)){
      post('dominance-'+lead, `👑 Stamm ${lead} dominiert (${nLead}/${sum}).`, 120);
    }
  }

  // 10) Heartbeat: Wenn 30s gar nichts kam, kurze Lagezeile
  if (t - (story.lastPostAt||0) > 30 && story.cooldown('heartbeat', 30)){
    const sc = Object.keys(counts).length;
    const fr = Math.round(((Entities.getWorldConfig?.().foodRate||0)/60));
    post('heartbeat', `🗞️ Lage: ${alive} Zellen, ${sc} Stämme, Nahrung ${fr}/s.`, 30);
  }
}

// ===== Founders-Love =======================================================
function onFoundersLove(){
  if (story.foundersShown) return;
  const f = Entities.getFoundersState?.();
  if (!f?.adam || !f?.eva) return;

  const kidsOfEva = Entities.cells.filter(x => x.parents?.motherId === f.eva);
  if (kidsOfEva.some(k => k.parents?.fatherId === f.adam)){
    story.foundersShown = true;
    post('love', `${pick(PH.love)} Liebesgeschichte! Adam und Eva noch immer vereint.`, 180);
  }
}