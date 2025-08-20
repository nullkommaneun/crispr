// reproduction.js
// Kompat-Wrapper auf die neue Architektur – keine eigene Game-Logik mehr hier.
import { on, emit } from './event.js';
import { getCells } from './entities.js';

let inited = false;

/**
 * Optionaler Initialisieren (rückwärtskompatibel).
 * Baut nur Events auf, die für Debug/Telemetrie nützlich sind.
 */
export function initReproduction() {
  if (inited) return;
  inited = true;

  // Beispiel: Wenn ein Kind geboren wurde, loggen (oder DNA Daily/panel informieren).
  on('breed:child', ({ parents }) => {
    // Platz für Telemetrie/Statistik – bewusst minimal gehalten.
    // emit('narrative:note', { msg: '💞 Paarung registriert.' });
  });

  // Optional: Reaktive Hinweise bei Zellen-Schwund
  on('cells:died', () => {
    const n = getCells().length;
    if (n === 0) {
      emit('narrative:note', { msg: '⚠️ Population kollabiert.' });
    }
  });
}

// Convenience-API für sehr alte Aufrufer (kein Schaden, wenn ungenutzt):
export function requestPairing() {
  // Früher konnte hier aktiv eine Paarung angefragt werden.
  // Heute übernimmt `entities.update()` die Logik autonom.
  // Wir emittieren nur ein Signal für Telemetrie.
  emit('reproduction:requested', {});
}

export function isReproductionActive() {
  // In der neuen Architektur: immer aktiv (wird in entities.js bedingt gehandhabt).
  return true;
}