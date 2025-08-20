// environment.js – Schaltbare Randgefahren (Säure, Stacheldraht, Elektrozaun)
// UI: Dialog #envModal; Button #btnEnv öffnet Modal
// Laufzeit: envDamageAtBorder(distToWall, speed, now, dt) → {energyLoss, slowFactor}

const state = {
  acid:    { enabled: false, range: 14, dps: 6 },      // kontinuierlich
  barbed:  { enabled: false, range:  8, dps: 10 },     // bei "Reindrücken" stärker
  electric:{ enabled: false, range: 12, dmg: 10, period: 1.6, last: 0 } // Impulse
};

export function getEnvState(){ return JSON.parse(JSON.stringify(state)); }

export function envDamageAtBorder(dist, speed, now, dt){
  let energyLoss = 0;
  let slowFactor = 1.0;

  if (dist == null || dist > 1e6) return { energyLoss, slowFactor };
  // Säure: linearer Abfall auf die Range
  if (state.acid.enabled && dist < state.acid.range){
    const k = 1 - (dist / state.acid.range);
    energyLoss += state.acid.dps * k * dt;
  }
  // Stacheldraht: nur wenn wirklich "drücken" -> Geschwindigkeit relevant und sehr nahe
  if (state.barbed.enabled && dist < state.barbed.range){
    const k = 1 - (dist / state.barbed.range);
    const dyn = Math.max(0, speed - 12) / 40; // erst über ~12 px/s greift es richtig
    energyLoss += state.barbed.dps * k * dyn * dt;
  }
  // Elektro: Pulse; kurzer "Stun"
  if (state.electric.enabled && dist < state.electric.range){
    if (now - (state.electric.last||0) >= state.electric.period){
      state.electric.last = now;
      energyLoss += state.electric.dmg; // sofortiger Impuls
      slowFactor = 0.65;                // kurzer Bremsfaktor für diesen Frame
    }
  }
  return { energyLoss, slowFactor };
}

export function initEnvironment(){
  const dlg = document.getElementById('envModal');
  if(!dlg) return;

  // Bindings
  const acidChk = document.getElementById('envAcid');
  const acidRng = document.getElementById('envAcidRange');
  const acidDps = document.getElementById('envAcidDps');

  const barbChk = document.getElementById('envBarb');
  const barbRng = document.getElementById('envBarbRange');
  const barbDps = document.getElementById('envBarbDps');

  const elecChk = document.getElementById('envElec');
  const elecRng = document.getElementById('envElecRange');
  const elecDmg = document.getElementById('envElecDmg');
  const elecPer = document.getElementById('envElecPeriod');

  // initial
  if(acidChk) acidChk.checked = state.acid.enabled;
  if(acidRng) acidRng.value = String(state.acid.range);
  if(acidDps) acidDps.value = String(state.acid.dps);

  if(barbChk) barbChk.checked = state.barbed.enabled;
  if(barbRng) barbRng.value = String(state.barbed.range);
  if(barbDps) barbDps.value = String(state.barbed.dps);

  if(elecChk) elecChk.checked = state.electric.enabled;
  if(elecRng) elecRng.value = String(state.electric.range);
  if(elecDmg) elecDmg.value = String(state.electric.dmg);
  if(elecPer) elecPer.value = String(state.electric.period);

  // events
  acidChk?.addEventListener('change', e=> state.acid.enabled = !!e.target.checked);
  acidRng?.addEventListener('input', e=> state.acid.range = Number(e.target.value));
  acidDps?.addEventListener('input', e=> state.acid.dps   = Number(e.target.value));

  barbChk?.addEventListener('change', e=> state.barbed.enabled = !!e.target.checked);
  barbRng?.addEventListener('input', e=> state.barbed.range = Number(e.target.value));
  barbDps?.addEventListener('input', e=> state.barbed.dps   = Number(e.target.value));

  elecChk?.addEventListener('change', e=> state.electric.enabled = !!e.target.checked);
  elecRng?.addEventListener('input', e=> state.electric.range = Number(e.target.value));
  elecDmg?.addEventListener('input', e=> state.electric.dmg   = Number(e.target.value));
  elecPer?.addEventListener('input', e=> state.electric.period= Math.max(0.3, Number(e.target.value)));

  const closeBtn = document.getElementById('envClose');
  closeBtn?.addEventListener('click', ()=>{ if(dlg?.close) dlg.close('cancel'); else dlg?.removeAttribute('open'); });
}

export function openEnvironment(){
  const dlg = document.getElementById('envModal');
  if(!dlg) return;
  if (dlg.showModal) dlg.showModal();
  else dlg.setAttribute('open','');
}