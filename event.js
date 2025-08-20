// event.js
const _map = new Map();

export function on(type, fn) {
  if (!_map.has(type)) _map.set(type, new Set());
  _map.get(type).add(fn);
  return () => off(type, fn);
}

export function once(type, fn) {
  const offFn = on(type, (p) => { offFn(); fn(p); });
}

export function off(type, fn) {
  const s = _map.get(type);
  if (s) s.delete(fn);
}

export function emit(type, payload) {
  const s = _map.get(type);
  if (!s) return;
  for (const fn of [...s]) {
    try { fn(payload); } catch (e) { console.error(`[event:${type}]`, e); }
  }
}

export function clear() { _map.clear(); }