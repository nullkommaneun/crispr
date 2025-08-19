// ticker.js
// Marquee-Ticker unten: sachliche Tipps/Statusmeldungen.

import { Events, EVT } from './event.js';

let elContent;

function show(text){
  if(!elContent) return;
  elContent.textContent = text;
  // CSS-Animation läuft endlos; hier nur Textwechsel.
}

export function initTicker(){
  elContent = document.getElementById('tickerContent');
  if(!elContent) return;

  // Starttext
  show('Tipp: Erhöhe die Nahrung, wenn viele Zellen verhungern.');

  Events.on(EVT.TIP, (d)=>{
    if(!d) return;
    const label = d.label ? `${d.label}: ` : '';
    show(`${label}${d.text}`);
  });
  Events.on(EVT.STATUS, (d)=>{
    if(!d) return;
    const src = d.source ? `${d.source} – ` : '';
    show(`${src}${d.text}`);
  });
}