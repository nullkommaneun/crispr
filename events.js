// events.js
// Minimaler Event‑Bus für lose gekoppelte Module.

const _listeners = new Map();

/** Eindeutige Event-Namen */
export const EVT = Object.freeze({
  TICK: 'tick',
  BIRTH: 'birth',
  DEATH: 'death',
  MATE: 'mate',
  FOOD_SPAWN: 'foodSpawn',
  TIP: 'tip',
  STATUS: 'status',
  HIGHLIGHT_CHANGED: 'highlightChanged',
  MUTATION: 'mutation',
  OVERPOP: 'overpopulation',
  HUNGER_CRISIS: 'hungerCrisis',
  RESET: 'reset',
  ERROR: 'error',
});

export const Events = {
  on(type, handler){
    if(!_listeners.has(type)) _listeners.set(type, new Set());
    _listeners.get(type).add(handler);
    return () => this.off(type, handler);
  },
  once(type, handler){
    const off = this.on(type, (data)=>{ off(); handler(data); });
  },
  off(type, handler){
    const set = _listeners.get(type);
    if(set){ set.delete(handler); if(set.size===0) _listeners.delete(type); }
  },
  emit(type, data){
    const set = _listeners.get(type);
    if(!set) return;
    for(const cb of [...set]) {
      try { cb(data); } catch(err){ console.error('Event-Handler Fehler', type, err); }
    }
  },
  clear(){ _listeners.clear(); }
};
