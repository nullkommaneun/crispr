// environment.js – Schaltbare Randgefahren + Nanonebel (ambient)
// Liefert pro Tick den Energieverlust über envDamageAtBorder(dist, speed, now, dt)

const state = {
  acid:     { enabled: false, range: 14, dps: 6 },       // kontinuierlich nahe Wand
  barbed:   { enabled: false, range:  8, dps: 10 },      // "Druck"-Schaden bei hoher v
  electric: { enabled: false, range: 12, dmg: 10, period: 1.6, last: 0 }, // Impulse
  fog:      { enabled: false, dps: 0.8 }                 // Nanonebel: global, leicht
};

export function getEnvState(){ return JSON.parse(JSON.stringify(state)); }

/**
 * Berechnet Umweltwirkung in diesem Zeitschritt.
 * @param {number} dist Abstand zur nächsten Außenkante in px
 * @param {number} speed Geschwindigkeit der Zelle in px/s
 * @param {number} now   Sekundenzeit (performance.now()/1000)
 * @param {number} dt    Zeitschritt in s
 * @returns {{energyLoss:number, slowFactor:number}}
 */
export function envDamageAtBorder(dist, speed, now, dt){
  let energyLoss = 0;
  let slowFactor = 1.0;

  // Nanonebel wirkt überall – absichtlich unabhängig von dist
  if (state.fog.enabled) {
    energyLoss += state.fog.dps * dt;
  }

  if (dist == null) return { energyLoss, slowFactor };

  // Säure: linear bis zur Range
  if (state.acid.enabled && dist < state.acid.range){
    const k = 1 - (dist / state.acid.range);
    energyLoss += state.acid.dps * k * dt;
  }

  // Stacheldraht: nur bei spürbarem "Druck" (höhere v)
  if (state.barbed.enabled && dist < state.barbed.range){
    const k = 1 - (dist / state.barbed.range);
    const dyn = Math.max(0, speed - 12) / 40; // erst über ~12 px/s
    energyLoss += state.barbed.dps * k * dyn * dt;
  }

  // Elektro: periodischer Impuls + kurzer Slow
  if (state.electric.enabled && dist < state.electric.range){
    if (now - (state.electric.last || 0) >= state.electric.period){
      state.electric.last = now;
      energyLoss += state.electric.dmg;
      slowFactor = 0.65;
    }
  }
  return { energyLoss, slowFactor };
}

// ---------- UI ----------

function bindRangeVal(input){
  if (!input) return;
  const wrap = input.closest('.stepper');
  const out  = wrap?.querySelector('.val');
  const write = () => { if (out) out.textContent = String(input.value); };
  input.addEventListener('input', write);
  write();
}

export function initEnvironment(){
  const dlg = document.getElementById('envModal');
  if (!dlg) return; // defensiv – keine harte Abhängigkeit

  // Säure
  const acidChk = dlg.querySelector('#envAcid');
  const acidRng = dlg.querySelector('#envAcidRange');
  const acidDps = dlg.querySelector('#envAcidDps');
  if (acidChk){ acidChk.checked = state.acid.enabled; acidChk.addEventListener('change', e=> state.acid.enabled = !!e.target.checked); }
  if (acidRng){ acidRng.value = String(state.acid.range); acidRng.addEventListener('input', e=> state.acid.range = Number(e.target.value)); bindRangeVal(acidRng); }
  if (acidDps){ acidDps.value = String(state.acid.dps);   acidDps.addEventListener('input', e=> state.acid.dps   = Number(e.target.value)); bindRangeVal(acidDps); }

  // Stacheldraht
  const barbChk = dlg.querySelector('#envBarb');
  const barbRng = dlg.querySelector('#envBarbRange');
  const barbDps = dlg.querySelector('#envBarbDps');
  if (barbChk){ barbChk.checked = state.barbed.enabled; barbChk.addEventListener('change', e=> state.barbed.enabled = !!e.target.checked); }
  if (barbRng){ barbRng.value = String(state.barbed.range); barbRng.addEventListener('input', e=> state.barbed.range = Number(e.target.value)); bindRangeVal(barbRng); }
  if (barbDps){ barbDps.value = String(state.barbed.dps);   barbDps.addEventListener('input', e=> state.barbed.dps   = Number(e.target.value)); bindRangeVal(barbDps); }

  // Elektro
  const elecChk = dlg.querySelector('#envElec');
  const elecRng = dlg.querySelector('#envElecRange');
  const elecDmg = dlg.querySelector('#envElecDmg');
  const elecPer = dlg.querySelector('#envElecPeriod');
  if (elecChk){ elecChk.checked = state.electric.enabled; elecChk.addEventListener('change', e=> state.electric.enabled = !!e.target.checked); }
  if (elecRng){ elecRng.value = String(state.electric.range); elecRng.addEventListener('input', e=> state.electric.range = Number(e.target.value)); bindRangeVal(elecRng); }
  if (elecDmg){ elecDmg.value = String(state.electric.dmg);   elecDmg.addEventListener('input', e=> state.electric.dmg   = Number(e.target.value)); bindRangeVal(elecDmg); }
  if (elecPer){ elecPer.value = String(state.electric.period); elecPer.addEventListener('input', e=> state.electric.period= Math.max(0.3, Number(e.target.value))); bindRangeVal(elecPer); }

  // Nanonebel
  const fogChk = dlg.querySelector('#envFog');
  const fogDps = dlg.querySelector('#envFogDps');
  if (fogChk){ fogChk.checked = state.fog.enabled; fogChk.addEventListener('change', e=> state.fog.enabled = !!e.target.checked); }
  if (fogDps){ fogDps.value = String(state.fog.dps); fogDps.addEventListener('input', e=> state.fog.dps = Number(e.target.value)); bindRangeVal(fogDps); }

  // Close
  dlg.querySelector('#envClose')?.addEventListener('click', ()=>{ if(dlg.close) dlg.close('cancel'); else dlg.removeAttribute('open'); });
}

export function openEnvironment(){
  const dlg = document.getElementById('envModal');
  if (!dlg) return;
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open','');
}