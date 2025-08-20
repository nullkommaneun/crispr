// environment/panel.js
// Die reine UI für die Umwelt-Kontrollen. Spricht nur über set/getEnvState mit environment.js.

import { getEnvState, setEnvState } from '../environment.js';

let $root = null;
const html = s => {
  const d = document.createElement('div');
  d.innerHTML = s.trim();
  return d.firstChild;
};

const TPL = `
<div class="modal env-modal">
  <div class="panel">
    <div class="hd">
      <strong>Umwelt – Randgefahren</strong>
      <button class="close" aria-label="Schließen">×</button>
    </div>

    <div class="body">
      <div class="col">
        <label><input type="checkbox" class="acid_on"> Säurewand</label>
        <div>Reichweite <input type="range" min="4" max="24" value="14" class="acid_r"></div>
        <div>Schaden / s <input type="range" min="0" max="12" step="0.5" value="6" class="acid_d"></div>

        <label><input type="checkbox" class="barb_on"> Stacheldraht</label>
        <div>Reichweite <input type="range" min="4" max="24" value="8" class="barb_r"></div>
        <div>Schaden (Druck) <input type="range" min="0" max="16" step="0.5" value="10" class="barb_d"></div>

        <label><input type="checkbox" class="fence_on"> Elektrozaun</label>
        <div>Reichweite <input type="range" min="4" max="24" value="12" class="fence_r"></div>
        <div>Schaden / Impuls <input type="range" min="0" max="20" step="0.5" value="10" class="fence_i"></div>
        <div>Periode (s) <input type="range" min="0.4" max="3" step="0.1" value="1.6" class="fence_p"></div>

        <label><input type="checkbox" class="nano_on"> Nanonebel (global)</label>
        <div>Schaden / s <input type="range" min="0" max="2" step="0.1" value="0.8" class="nano_d"></div>
      </div>

      <div class="col note">
        <div class="box">
          <div><strong>Visualisierung</strong></div>
          <div>Säure: gelber Schimmer · Stacheldraht: Zacken · Elektro: blaue Impulse (periodisch) · Nanonebel: globaler Lebensverlust.</div>
        </div>
      </div>
    </div>
  </div>
</div>`;

// UI -> State
function collect() {
  const q = s => $root.querySelector(s);
  return {
    acid:  { enabled: q('.acid_on').checked,  range: +q('.acid_r').value,  dps: +q('.acid_d').value },
    barb:  { enabled: q('.barb_on').checked,  range: +q('.barb_r').value,  dps: +q('.barb_d').value },
    fence: { enabled: q('.fence_on').checked, range: +q('.fence_r').value, impulse: +q('.fence_i').value, period: +q('.fence_p').value },
    nano:  { enabled: q('.nano_on').checked,  dps: +q('.nano_d').value }
  };
}

// State -> UI
function hydrateFrom(state) {
  const q = s => $root.querySelector(s);
  q('.acid_on').checked = !!state.acid.enabled;
  q('.acid_r').value    = state.acid.range;
  q('.acid_d').value    = state.acid.dps;

  q('.barb_on').checked = !!state.barb.enabled;
  q('.barb_r').value    = state.barb.range;
  q('.barb_d').value    = state.barb.dps;

  q('.fence_on').checked = !!state.fence.enabled;
  q('.fence_r').value    = state.fence.range;
  q('.fence_i').value    = state.fence.impulse;
  q('.fence_p').value    = state.fence.period;

  q('.nano_on').checked = !!state.nano.enabled;
  q('.nano_d').value    = state.nano.dps;
}

function push() {
  setEnvState(collect());
}

export function openEnvPanel() {
  if ($root) return;
  $root = html(TPL);
  document.body.appendChild($root);

  // initiale Werte übernehmen
  hydrateFrom(getEnvState());

  // Events
  $root.querySelector('.close').addEventListener('click', closeEnvPanel);
  $root.addEventListener('input', push);
}

export function closeEnvPanel() {
  if ($root) { $root.remove(); $root = null; }
}