// events.js
// Kompatibilitäts-Alias: re-exportiert den kanonischen Event-Bus aus "event.js".
// Damit laufen alte Importe ("./events.js") und neue ("./event.js") parallel.

export { Events, EVT } from './event.js';