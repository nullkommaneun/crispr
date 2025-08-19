// ticker.js
// Marquee-Ticker am unteren Rand. Zeigt sachliche Tipps & Status.

import { Events, EVT } from './events.js';

const queue = [];

export function initTicker(){
  const content = document.getElementById('tickerContent');
  if(!content) throw new Error('Ticker-Element fehlt.');
  // Basistipps
  pushTip('Tipp', 'Erhöhe die Nahrung, wenn viele Zellen verhungern.');
  pushTip('Hinweis', 'Reduziere die Timescale, um besser zu beobachten.');
  render(content);

  Events.on(EVT.TIP, (d)=>{ pushTip(d.label || 'Tipp', d.text || ''); render(content); });
  Events.on(EVT.STATUS, (d)=>{ pushTip('Status', d.text || ''); render(content); });
}

function pushTip(label, text){
  const t = { label, text, at: new Date() };
  queue.push(t);
  if(queue.length > 25) queue.shift();
}
function render(el){
  el.innerHTML = queue.map(t => `<span class="tick"><span class="label">${t.label}:</span> ${escapeHtml(t.text)}</span>`).join('');
}
function escapeHtml(s){ return String(s).replace(/[<>&"]/g, m => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[m])); }
