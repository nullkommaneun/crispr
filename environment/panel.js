// environment/panel.js
import { applyEnvironment } from '../entities.js';

let $o=null;
function h(html){ const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstChild; }

const TPL = `
<div class="modal env-modal">
  <div class="panel">
    <div class="hd"><strong>Umwelt – Randgefahren</strong><button class="close">×</button></div>
    <div class="body">
      <div class="col">
        <label><input type="checkbox" class="acid_on"> Säurewand</label>
        <div>Reichweite <input type="range" min="4" max="24" value="14" class="acid_r"></div>
        <div>Schaden/s <input type="range" min="0" max="12" step="0.5" value="6" class="acid_d"></div>

        <label><input type="checkbox" class="barb_on"> Stacheldraht</label>
        <div>Reichweite <input type="range" min="4" max="24" value="8" class="barb_r"></div>
        <div>Schaden (Druck) <input type="range" min="0" max="16" step="0.5" value="10" class="barb_d"></div>

        <label><input type="checkbox" class="fence_on"> Elektrozaun</label>
        <div>Reichweite <input type="range" min="4" max="24" value="12" class="fence_r"></div>
        <div>Schaden/Impuls <input type="range" min="0" max="20" step="0.5" value="10" class="fence_i"></div>
        <div>Periode (s) <input type="range" min="0.4" max="3" step="0.1" value="1.6" class="fence_p"></div>

        <label><input type="checkbox" class="nano_on"> Nanonebel (global)</label>
        <div>Schaden/s <input type="range" min="0" max="2" step="0.1" value="0.8" class="nano_d"></div>
      </div>
      <div class="col note">
        <div class="box">Hinweis: Säure = gelber Schimmer · Stacheldraht = Zacken · Elektro = blaue Impulse.</div>
      </div>
    </div>
  </div>
</div>`;

function pushConfig(){
  if (!$o) return;
  applyEnvironment({
    acid:  { enabled:$o.querySelector('.acid_on').checked,  range:+$o.querySelector('.acid_r').value,  dps:+$o.querySelector('.acid_d').value },
    barb:  { enabled:$o.querySelector('.barb_on').checked,  range:+$o.querySelector('.barb_r').value,  dps:+$o.querySelector('.barb_d').value },
    fence: { enabled:$o.querySelector('.fence_on').checked, range:+$o.querySelector('.fence_r').value, impulse:+$o.querySelector('.fence_i').value, period:+$o.querySelector('.fence_p').value },
    nano:  { enabled:$o.querySelector('.nano_on').checked,  dps:+$o.querySelector('.nano_d').value }
  });
}

export function openEnvPanel(){
  if ($o) return;
  $o = h(TPL);
  document.body.appendChild($o);
  $o.querySelector('.close').addEventListener('click', closeEnvPanel);
  $o.addEventListener('input', pushConfig);
  pushConfig();
}

export function closeEnvPanel(){
  if ($o){ $o.remove(); $o=null; }
}