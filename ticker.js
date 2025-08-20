// ticker.js
import { getCounts } from './entities.js';

let last = performance.now(), fps=60;
let acc=0, frames=0, mounted=false;

function ensureBar(){
  let el = document.getElementById('ticker');
  if (!el) {
    el = document.createElement('div');
    el.id='ticker';
    Object.assign(el.style, {
      position:'fixed', bottom:'0', left:'0', right:'0',
      padding:'6px 10px', font:'12px/1.4 system-ui, sans-serif',
      color:'#ddd', background:'rgba(10,10,10,0.8)', zIndex:9998
    });
    document.body.appendChild(el);
  }
  return el;
}

export function mountTicker(){
  mounted = true;
  tick();
  setInterval(()=>refresh(), 5000); // nur alle 5s auditieren
}

export function unmountTicker(){ mounted=false; }

export function registerFrame(){
  const now = performance.now();
  const dt = (now-last)/1000; last=now;
  acc += dt; frames++;
  if (acc>=1) { fps = Math.round(frames/acc); acc=0; frames=0; }
}

function refresh(){
  if (!mounted) return;
  const el = ensureBar();
  const c = getCounts();
  el.textContent = `FPS ${fps} • Zellen ${c.cells} • Food ${c.food} • Stämme ${c.stämme}`;
}

function tick(){ if (mounted) requestAnimationFrame(tick); }