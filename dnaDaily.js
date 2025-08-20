// dnaDaily.js
import { on } from './event.js';

let box;
const seen = new Map(); // key -> timestamp

function ensureBox(){
  if (box) return box;
  box = document.getElementById('dna-daily');
  if (!box) {
    box = document.createElement('div');
    box.id='dna-daily';
    Object.assign(box.style,{
      position:'fixed', left:'0', right:'0', bottom:'34px',
      maxHeight:'28vh', overflow:'auto', background:'rgba(20,18,12,0.6)',
      color:'#eee', padding:'10px', font:'14px system-ui, sans-serif', zIndex:9997
    });
    box.innerHTML = `<strong>DNA Daily</strong><div class="feed"></div>`;
    document.body.appendChild(box);
  }
  return box;
}

function push(type, title){
  const t = performance.now();
  const last = seen.get(type)||0;
  if (t-last < 30000) return; // 30s Dedupe
  seen.set(type, t);
  const b = ensureBox();
  const feed = b.querySelector('.feed');
  const item = document.createElement('div');
  item.textContent = title;
  feed.prepend(item);
}

export function initDaily(){
  on('cells:created', () => push('birth', '👶 Neue Generation keimt auf.'));
  on('cells:died',    () => push('death', '🪦 Verlorene Zelle – Belastung steigt.'));
  on('breed:child',   () => push('love',  '💞 Paarung gesichtet – Gene mischen sich.'));
}