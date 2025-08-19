// ticker.js – Marquee-Ticker unten

import { Events, EVT } from './event.js';
let elContent;
const show=(t)=>{ if(elContent) elContent.textContent=t; };

export function initTicker(){
  elContent=document.getElementById('tickerContent'); if(!elContent) return;
  show('Tipp: Erhöhe die Nahrung, wenn viele Zellen verhungern.');
  Events.on(EVT.TIP,(d)=>{ if(!d) return; const label=d.label?`${d.label}: `:''; show(`${label}${d.text}`); });
  Events.on(EVT.STATUS,(d)=>{ if(!d) return; const src=d.source?`${d.source} – `:''; show(`${src}${d.text}`); });
}