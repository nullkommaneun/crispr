// editor.js – CRISPR-Editor: 5 Traits inkl. MET + Live-Effekte

import * as Entities from './entities.js';
import { TRAITS, createGenome } from './genetics.js';
import { Events, EVT } from './event.js';
import { predictProbability, getStatusLabel, cycleAdvisorMode, loadModelFromUrl, setEnabled, setUseModel } from './advisor.js';

const current = { TEM:5, GRO:5, EFF:5, SCH:5, MET:5 };
let selectedId = null;

function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

/* Ableitungen (identisch zu entities.js) */
function n(x){ return (x-5)/4; }
function deriveFromGenesPreview(g){
  const tem=n(g.TEM), gro=n(g.GRO), eff=n(g.EFF), sch=n(g.SCH), met=n(g.MET);
  const v0=40, s0=90, baseScan=0.30, baseCD=6.0, r0=3, kR=1, cap0=36;
  return {
    speedMax: Math.max(12, v0 * (1 + 0.35*tem - 0.15*gro)),
    sense:    Math.max(30, s0 * (1 + 0.35*eff + 0.15*gro)),
    scanInterval: Math.max(0.10, baseScan * (1 - 0.25*tem)),
    mateCooldown: Math.max(2.0,  baseCD * (1 - 0.15*tem)),
    radius:   Math.max(2, r0 + kR*(g.GRO - 5)),
    energyCap:Math.max(16, cap0*(1 + 0.50*gro)),
    baseDrain: Math.max(0.06, 0.50 * (1 + 0.40*met + 0.20*gro - 0.25*eff)),
    moveCostPerSpeed: Math.max(0.0010, 0.0030 * (1 + 0.20*tem + 0.40*gro - 0.50*eff)),
    hungerSteep: 3.0 + 0.40*met - 0.20*eff,
    mateEnergyThreshold: Math.max(8, 12*(1 + 0.45*gro - 0.25*eff)),
  };
}
const BASE = deriveFromGenesPreview({TEM:5,GRO:5,EFF:5,SCH:5,MET:5});

export function initEditor(){
  const dlg = document.getElementById('editorModal');
  const form = document.getElementById('editorForm');
  const closeBtn = document.getElementById('editorClose');
  const list = document.getElementById('editorCellList');
  const advisorLbl = document.getElementById('editorAdvisorStatus');
  const btnToggle = document.getElementById('editorAdvisorToggle');
  const modelUrl  = document.getElementById('editorModelUrl');
  const btnLoad   = document.getElementById('editorModelLoad');
  const effBox    = document.getElementById('editorEffects'); // darf null sein
  const effNote   = document.getElementById('effectsNote');   // darf null sein

  if(modelUrl && !modelUrl.value) modelUrl.value = 'models/model.json';

  // Stepper
  for(const row of document.querySelectorAll('.traitRow')){
    const trait = row.dataset.trait;
    const out = row.querySelector('.val');
    if(current[trait]==null) current[trait]=5;
    out.textContent = String(current[trait]);
    const upd = d => { current[trait]=clamp(current[trait]+d,1,9); out.textContent=String(current[trait]); renderEffects(); };
    row.querySelector('.dec')?.addEventListener('click', ()=>upd(-1));
    row.querySelector('.inc')?.addEventListener('click', ()=>upd(+1));
  }

  function setFromGenome(g){
    for(const t of TRAITS) current[t]=clamp(Math.round(g[t]??5),1,9);
    for(const row of document.querySelectorAll('.traitRow')){
      const trait=row.dataset.trait; row.querySelector('.val').textContent=String(current[trait]??5);
    }
    renderEffects();
  }

  // Live-Effekte
  function pctDelta(curr, base, lowerIsBetter=false){
    const ratio = curr/(base||1e-6);
    const x = lowerIsBetter ? (1/ratio) : ratio;
    return Math.round((x-1)*100);
  }
  function fmt(x){ return (Math.abs(x)>=100 ? x.toFixed(0) : x.toFixed(1)).replace('.',','); }
  function badge(delta, low=false){
    const cls = delta>0 ? 'good' : delta<0 ? 'bad' : 'neutral';
    const sign = delta>0? '+' : '';
    return `<span class="delta ${cls}">${sign}${delta}%</span>`;
  }
  function renderEffects(){
    if(!effBox) return; // wenn HTML nicht aktualisiert wurde → einfach nichts tun
    const d = deriveFromGenesPreview(current);
    effNote && (effNote.textContent = 'Basis = Traits 5 | Grün: besser, Rot: schlechter (bei Kosten: kleiner ist besser)');
    const rows = [
      {label:'Geschwindigkeit',   val:d.speedMax, unit:'px/s', base:BASE.speedMax,  low:false},
      {label:'Sensorik',          val:d.sense,    unit:'px',   base:BASE.sense,     low:false},
      {label:'Energie-Cap',       val:d.energyCap,unit:'',     base:BASE.energyCap, low:false},
      {label:'Grundverbrauch',    val:d.baseDrain,unit:'/s',   base:BASE.baseDrain, low:true },
      {label:'Bewegungskosten',   val:d.moveCostPerSpeed,unit:'·v', base:BASE.moveCostPerSpeed, low:true},
      {label:'Hunger-Steilheit',  val:d.hungerSteep,unit:'',   base:BASE.hungerSteep, low:true},
      {label:'Paarungs-Schwelle', val:d.mateEnergyThreshold,unit:'E', base:BASE.mateEnergyThreshold, low:true},
      {label:'Cooldown',          val:d.mateCooldown,unit:'s', base:BASE.mateCooldown, low:true},
    ];
    effBox.innerHTML = rows.map(r=>{
      const delta = pctDelta(r.val, r.base, r.low);
      return `<div class="traitRow effRow"><label>${r.label}</label>
        <div class="stepper"><span class="val mono">${fmt(r.val)}</span>${badge(delta, r.low)}</div></div>`;
    }).join('');
  }
  renderEffects();

  // Advisor
  const refreshAdvisorUI=()=>{ advisorLbl && (advisorLbl.textContent = getStatusLabel().replace('Berater: ','')); };

  function refreshList(){
    refreshAdvisorUI();
    if(!list) return;
    list.innerHTML='';
    const alive=(Entities.cells||[]).filter(c=>!c.dead);
    for(const c of alive){
      const p=predictProbability(c.genes);
      const card=document.createElement('button'); card.type='button';
      card.className='cellCard selectable'+(selectedId===c.id?' active':'');
      card.innerHTML=`<span class="id">${c.name} <small class="mono">• Stamm ${c.stammId}</small></span>
                      <span class="score">${p==null?'–':`${Math.round(p*100)}<small>%</small>`}</span>`;
      card.addEventListener('click', ()=>{ selectedId=c.id; setFromGenome(c.genes);
        for(const el of list.querySelectorAll('.cellCard')) el.classList.remove('active'); card.classList.add('active'); });
      list.appendChild(card);
    }
  }
  refreshList();
  Events.on(EVT.BIRTH, refreshList); Events.on(EVT.DEATH, refreshList); Events.on(EVT.STATUS, refreshAdvisorUI);

  // Submit → neue Zelle (neuer Stamm)
  form?.addEventListener('submit',(e)=>{
    e.preventDefault();
    const genome=createGenome({...current});
    const stamm=Entities.newStammId?.();
    const c=Entities.createCell?.({ x:Math.random()*800, y:Math.random()*520, genes:genome, stammId:stamm??undefined, energy:22 });
    if(c){ Events.emit(EVT.TIP,{label:'Tipp', text:`Neue Zelle #${c.id} als neuer Stamm ${c.stammId} erzeugt.`}); refreshList(); }
  });

  // Advisor-Buttons
  btnToggle?.addEventListener('click', async ()=>{ await cycleAdvisorMode(modelUrl?.value.trim()||'models/model.json'); refreshAdvisorUI(); refreshList(); });
  btnLoad?.addEventListener('click', async ()=>{
    const url=modelUrl?.value.trim()||'models/model.json';
    try{ await loadModelFromUrl(url); setEnabled(true); setUseModel(true); refreshAdvisorUI(); refreshList();
      Events.emit(EVT.STATUS,{source:'editor',text:'KI-Modell geladen'});}catch{}
  });

  closeBtn?.addEventListener('click', ()=>{ if(dlg?.close) dlg.close('cancel'); else dlg?.removeAttribute('open'); });
}

export function openEditor(){ const dlg=document.getElementById('editorModal'); if(!dlg) return; if(dlg.showModal) dlg.showModal(); else dlg.setAttribute('open',''); }