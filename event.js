// event.js
// Einheitlicher Event-Bus: nur benannte Exporte (on, off, emit, once, EVT).

const _listeners = new Map(); // Map<string, Set<Function>>

function _get(type) {
  let set = _listeners.get(type);
  if (!set) { set = new Set(); _listeners.set(type, set); }
  return set;
}

/** Einheitliche Event-Namen – zentral definiert. */
export const EVT = Object.freeze({
  INIT: 'init',
  TICK: 'tick',
  RENDER: 'render',

  BIRTH: 'birth',
  DEATH: 'death',
  MATE: 'mate',

  FOOD_SPAWN: 'foodSpawn',

  TIP: 'tip',
  STATUS: 'status',
  ERROR: 'error',

  HIGHLIGHT_CHANGED: 'highlightChanged',
  TIMESCALE_CHANGED: 'timescaleChanged',

  EDITOR_OPEN: 'ui:editor:open',
  EDITOR_APPLY: 'editor:apply',

  ENV_OPEN: 'ui:env:open',

  ADVISOR_MODE_CHANGED: 'advisor:modeChanged',
  ADVISOR_MODEL_LOADED: 'advisor:modelLoaded'
});

/** Listener registrieren. Rückgabe: Unsubscribe-Funktion. */
export function on(type, handler) {
  const set = _get(type);
  set.add(handler);
  return () => off(type, handler);
}

/** Listener entfernen. */
export function off(type, handler) {
  const set = _listeners.get(type);
  if (set) set.delete(handler);
}

/** Ereignis auslösen; detail = Payload-Objekt. */
export function emit(type, detail = {}) {
  const set = _listeners.get(type);
  if (!set || set.size === 0) return 0;
  for (const fn of Array.from(set)) {
    try { fn(detail); }
    catch (e) { console.error(`[event] handler for "${type}" failed:`, e); }
  }
  return set.size;
}

/** Einmaliger Listener (Promise-basiert). */
export function once(type) {
  return new Promise(resolve => {
    const unsub = on(type, (data) => { unsub(); resolve(data); });
  });
}

// KEIN Default-Export, KEIN "Events"-Objekt.