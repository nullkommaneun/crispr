// event.js
// Minimaler, robuster Event-Bus mit benannten Exporten + Default-Export.

const _listeners = new Map(); // Map<string, Set<Function>>

function _getSet(type) {
  let set = _listeners.get(type);
  if (!set) { set = new Set(); _listeners.set(type, set); }
  return set;
}

/** Listener registrieren. Rückgabewert ist eine Unsubscribe-Funktion. */
export function on(type, handler) {
  const set = _getSet(type);
  set.add(handler);
  return () => off(type, handler);
}

/** Listener entfernen. */
export function off(type, handler) {
  const set = _listeners.get(type);
  if (set) set.delete(handler);
}

/** Ereignis auslösen; detail ist das Payload-Objekt. */
export function emit(type, detail = {}) {
  const set = _listeners.get(type);
  if (!set || set.size === 0) return 0;
  // Kopie, damit Entfernen während der Iteration nicht stört
  for (const fn of Array.from(set)) {
    try { fn(detail); } catch (e) { console.error(`[event] handler for "${type}" failed:`, e); }
  }
  return set.size;
}

/** Einmaliger Listener (Promise-basiert). */
export function once(type) {
  return new Promise(resolve => {
    const unsub = on(type, (data) => { unsub(); resolve(data); });
  });
}

// Optional: alles auch als Default-Objekt exportieren
const Events = { on, off, emit, once };
export default Events;