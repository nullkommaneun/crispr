// narrative/panel.js
// DNA Daily – Boulevard-Schlagzeilen als fortlaufende Mini-Story,
// mit Themen-Cooldowns, Dedupe und variantenreichen Phrasen.

import { Events, EVT } from '../event.js';
import * as Entities from '../entities.js';
import { survivalScore } from '../genetics.js';

let panel;

// ===== Utilities ============================================================
const now  = () => performance.now()/1000;
const pick = (arr)=> arr[(Math.random()*arr.length)|0];
const join = (parts)=> parts.filter(Boolean).join(' ');

function headline(html){
  const div = document.createElement('div');
  div.className = 'headline';
  div.innerHTML = `<b>${html}</b>`;
  return div;
}

function post(topic, html, cooldownSec = 45){
  if(!panel) return;
  if(!story.cooldown(topic, cooldownSec)) return;
  if(story.lastText === html) return;
  story.lastText = html;
  panel.prepend(headline(html));
}

// Himmelsrichtung anhand Koordinate
function quadrant(x, y, w, h){
  const hor = x < w*0.33 ? 'West' : x > w*0.67 ? 'Ost' : 'Mitte';
  const ver = y < h*0.33 ? 'Nord' : y > h*0.67 ? 'Süd' : 'Zentral';
  if (ver === 'Zentral' && hor === 'Mitte') return 'Zentrum';
  return ver + '-' + hor;
}

// ===== Story-Manager / State ===============================================
const story = {
  lastTopicAt: new Map(), // topic -> ts
  extinct: new Set(),
  foundersShown: false,
  famineStage: 0, overpopStage: 0,
  lastText: '',
  // Fenster
  births: [], deaths: [], aliveHist: [], stammHist: [],
  foodCentroid: {x: null, y: null, t: 0},

  cooldown(topic, sec){
    const t = now(); const last = this.lastTopicAt.get(topic) || 0;
    if (t - last < sec) return false;
    this.lastTopicAt.set(topic, t); return true;
  }
};

// ===== Phrase-Bausteine =====================================================
const P = {
  icons: {
    fire:  ['🔥','🔥','⚠️'],
    over:  ['🐝','🧪','🧨'],
    love:  ['❤️','💕'],
    mut:   ['🧬','🧪'],
    skull: ['⚰️','🪦'],
    rise:  ['🌱','🌿','🌼'],
    drift: ['🌪️','💨'],
    boom:  ['💞','✨']
  },
  words: {
    crisis:   ['Hungersnot','Versorgungskrise','Nahrungsengpass'],
    relax:    ['Entspannung','Erholung','Stabilisierung'],
    lab:      ['im Labor','im Testfeld','im Habitat'],
    burst:    ['Welle','Schub','Flut'],
    drift:    ['driften','wandern','verlagern sich'],
    frenzy:   ['Rausch','Fieber','Hochphase'],
    domin:    ['Beherrscht die Fläche','dominant','führt deutlich']
  }
};

// ===== Init / Reset =========================================================
export function initNarrativePanel(){
  panel = document.getElementById('narrativePanel');
  if(!panel) return;

  function resetState(){
    story.lastTopicAt.clear();
    story.extinct.clear();
    story.foundersShown = false;
    story.famineStage = 0; story.overpopStage = 0;
    story.lastText = '';
    story.births.length = 0; story.deaths.length = 0;
    story.aliveHist.length = 0; story.stammHist.length = 0;
    story.foodCentroid = {x: null, y: null, t: 0};
    panel.innerHTML = '';
  }

  Events.on(EVT.RESET, resetState);
  resetState();

  // ===== Ereignis-Listener ==================================================

  // Paarung → Inzest-Arc
  Events.on(EVT.MATE, (d)=>{
    if(!d) return;
    if((d.relatedness ?? 0) >= 0.25 && story.cooldown('scandal', 60)){
      post('scandal', `${pick(P.icons.mut)}📰 Skandal! Nah verwandte Zellen erwischt – Ethikrat ${pick(['warnt','ist alarmiert','schlägt an die Glocke'])}.`, 60);
    }
  });

  // Geburt → Mutation-Arc, Birth-Statistik
  Events.on(EVT.BIRTH, (d)=>{
    const t = now(); story.births.push(t);
    while(story.births.length && t - story.births[0] > 60) story.births.shift();
    if(!d?.parents) return;
    const child  = Entities.cells.find(c=>c.id===d.id);
    const mom    = Entities.cells.find(c=>c.id===d.parents.motherId);
    const dad    = Entities.cells.find(c=>c.id===d.parents.fatherId);
    if (!child || !mom || !dad) return;

    const pAvg = Math.round((survivalScore(mom.genes) + survivalScore(dad.genes))/2);
    const cVal = survivalScore(child.genes);

    if (cVal >= pAvg + 14 && story.cooldown('mut-good', 45)){
      post('mut-good', `${pick(P.icons.mut)} Mutation-Durchbruch! Neue Linie ${pick(['übertrifft die Eltern','zeigt ungeahnte Stärke','setzt neue Maßstäbe'])}.`, 45);
    } else if (cVal <= pAvg - 16 && story.cooldown('mut-bad', 60)){
      post('mut-bad', `${pick(P.icons.mut)} Mutation mit Nebenwirkungen – Nachwuchs ${pick(['schwächelt','kommt nicht in Fahrt','ist deutlich unterlegen'])}.`, 60);
    }

    // Founders-Love einmalig
    onFoundersLove();
  });

  // Tod → Hungersnot/Extinktion + Statistik
  Events.on(EVT.DEATH, (d)=>{
    const t = now(); story.deaths.push(t);
    while(story.deaths.length && t - story.deaths[0] > 60) story.deaths.shift();

    if(d?.stammId){
      const cnt = (Entities.getStammCounts?.() || {})[d.stammId] || 0;
      if(cnt === 0 && !story.extinct.has(d.stammId) && story.cooldown('extinct-'+d.stammId, 120)){
        story.extinct.add(d.stammId);
        post('extinct-'+d.stammId, `${pick(P.icons.skull)} Drama! Stamm ${d.stammId} erlischt vollständig.`, 120);
      }
    }
  });

  // Krisen
  Events.on(EVT.HUNGER_CRISIS, (d)=>{
    const n = d?.inLastMinute ?? 12;
    const level = n > 25 ? 3 : n > 15 ? 2 : 1;
    if (level > story.famineStage && story.cooldown('famine-lvl'+level, 60)){
      story.famineStage = level;
      const line = level===3
        ? `${pick(P.icons.fire)}${pick(P.icons.fire)} Katastrophe! ${pick(['Massives Sterben','Versorgung kollabiert'])} – ${pick(P.words.lab)} im Ausnahmezustand.`
        : level===2
          ? `${pick(P.icons.fire)} Hungersnot! ${pick(['Rationen reichen nicht','Futterflecken reißen ab'])} – Zellen verhungern reihenweise.`
          : `⚠️ ${pick(P.words.crisis)} kündigt sich an – ${pick(['Reserven schwinden','Futter ist rar'])}.`;
      post('famine', line, 60);
    }
  });

  Events.on(EVT.OVERPOP, (d)=>{
    const pop = d?.population ?? 150;
    const level = pop > 200 ? 2 : 1;
    if (level > story.overpopStage && story.cooldown('over-lvl'+level, 60)){
      story.overpopStage = level;
      const line = level===2
        ? `${pick(P.icons.over)} Schwarmalarm! Dichtestress – ${pick(['Platz wird knapp','Kollisionen häufen sich'])}.`
        : `${pick(P.icons.over)} Überbevölkerung! Das Labor platzt aus allen Nähten.`;
      post('overpop', line, 60);
    }
  });

  // TICK → Trends, neue Arcs, Ressourcen-Drift…
  Events.on(EVT.TICK, onTick);

  // Initial eine freundliche Zeile – optional
  // post('welcome', '🗞️ Willkommen im CRISPR-Labor. Die Presse schaut genau hin.', 300);
}

// ===== TICK-Loop: Trendanalyse & Zusatz-Arcs ================================
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
    if (deaths < 4 && story.cooldown('famine-rec-probe', 5)){
      story.famineStage = 0;
      post('famine-rec', `🌧️ ${pick(P.words.relax)}! Neue Futterflecken wandern ins Feld – Sterblichkeit sinkt.`, 90);
    }
  }

  // 2) Überbevölkerung entspannt sich
  if(story.overpopStage>0){
    if (alive < 120 && story.cooldown('overpop-rec', 30)){
      story.overpopStage = 0;
      post('overpop-rec', '🌬️ Aufatmen! Population verteilt sich – Gleichgewicht kehrt zurück.', 90);
    }
  }

  // 3) Goldenes Zeitalter (viel Geburt, kaum Tod, Wachstum)
  const births30 = story.births.filter(ts => t - ts <= 30).length;
  const deaths30 = story.deaths.filter(ts => t - ts <= 30).length;
  const alive10ago = story.aliveHist.find(([ts]) => t - ts >= 10)?.[1] ?? alive;
  const growth10 = alive - alive10ago;
  if (births30 >= 12 && deaths30 <= 2 && growth10 >= Math.max(8, Math.round(alive*0.05)) && story.cooldown('golden', 120)){
    post('golden', `${pick(P.icons.rise)} Goldenes Zeitalter: ${pick(['Geburtenwelle','Aufschwung','Blütephase'])} – ${pick(['Stämme expandieren','Cluster gedeihen','Nachwuchs dominiert'])}.`, 120);
  }

  // 4) Population-Crash (hohe Sterblichkeit + starker Rückgang)
  const alive30ago = story.aliveHist.find(([ts]) => t - ts >= 30)?.[1] ?? alive;
  if (deaths30 >= births30*2 && alive < alive30ago*0.9 && story.cooldown('crash', 90)){
    post('crash', `📉 Population bricht ein: ${pick(['Zellen reißen ab','Rückgang unübersehbar'])} – ${pick(['Futter fehlt','Evolution stolpert','Kälte der Ränder'])}.`, 90);
  }

  // 5) Speziations-Welle (Stämme +3 in 60s)
  if (story.stammHist.length>=2){
    const base = story.stammHist[0][1], nowC = story.stammHist[story.stammHist.length-1][1];
    if (nowC - base >= 3 && story.cooldown('speciation', 180)){
      post('speciation', `${pick(P.icons.mut)}🧬 Abspaltungs-${pick(P.words.burst)}! Neue Linien wagen den Sprung in die Freiheit.`, 180);
    }
  }

  // 6) Ressourcen-Drift (Food-Schwerpunkt wandert deutlich)
  if (Entities.foods?.length){
    const w = Entities.getWorldConfig().width  || 800;
    const h = Entities.getWorldConfig().height || 520;
    const cx = Entities.foods.reduce((a,f)=>a+f.x,0)/Entities.foods.length;
    const cy = Entities.foods.reduce((a,f)=>a+f.y,0)/Entities.foods.length;
    if (story.foodCentroid.x==null){
      story.foodCentroid = {x:cx,y:cy,t:t};
    }else if (t - story.foodCentroid.t > 20){
      const dx = cx - story.foodCentroid.x, dy = cy - story.foodCentroid.y;
      const dist = Math.hypot(dx,dy);
      if (dist > 60 && story.cooldown('drift', 120)){
        const dir = quadrant(cx,cy,w,h);
        post('drift', `${pick(P.icons.drift)} Ressourcen ${pick(P.words.drift)} ${pick(['spürbar','sichtbar'])} Richtung **${dir}**.`, 120);
      }
      story.foodCentroid = {x:cx,y:cy,t:t};
    }
  }

  // 7) Paarungsrausch (viele Geburten in kurzer Zeit)
  const births15 = story.births.filter(ts => t - ts <= 15).length;
  if (births15 >= 8 && story.cooldown('frenzy', 90)){
    post('frenzy', `${pick(P.icons.boom)} Paarungs-${pick(P.words.frenzy)} ${pick(P.words.lab)} – ${pick(['Gene tanzen','Stämme mischen sich','Nachwuchs flutet das Feld'])}.`, 90);
  }

  // 8) Bottleneck (sehr kleine Population)
  if (alive > 0 && alive <= 20 && story.cooldown('bottleneck', 120)){
    post('bottleneck', `🧊 Genetischer Flaschenhals: Nur ${alive} Zellen verbleiben – ${pick(['Zufall entscheidet','Selektion greift hart zu'])}.`, 120);
  }

  // 9) Dominanzwechsel (ein Stamm > 60%)
  const counts = Entities.getStammCounts?.() || {};
  const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  if(entries.length){
    const [lead, nLead] = entries[0];
    const sum = entries.reduce((a,[,v])=>a+v,0) || 1;
    if (nLead/sum >= 0.6 && story.cooldown('dominance-'+lead, 150)){
      post('dominance-'+lead, `👑 Stamm ${lead} ${pick(P.words.domin)} (${nLead}/${sum}).`, 150);
    }
  }
}

// ===== Zusatz: Founders-Love (einmalig) =====================================
function onFoundersLove(){
  if (story.foundersShown) return;
  const f = Entities.getFoundersState?.();
  if (!f?.adam || !f?.eva) return;

  const kidsOfEva = Entities.cells.filter(x => x.parents?.motherId === f.eva);
  if (kidsOfEva.some(k => k.parents?.fatherId === f.adam)){
    story.foundersShown = true;
    post('love', `${pick(P.icons.love)} Liebesgeschichte! Adam und Eva noch immer vereint.`, 300);
  }
}