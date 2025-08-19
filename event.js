// event.js – zentraler Event-Bus (einzige gültige Variante)

const listeners = new Map(); // Map<string, Set<Function>>

function on(type, handler){
  if(!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(handler);
}
function off(type, handler){
  const set = listeners.get(type); if(set) set.delete(handler);
}
function once(type, handler){
  const wrap = (payload) => { off(type, wrap); try{ handler(payload); }catch(e){ console.error('[EVT once]', type, e); } };
  on(type, wrap);
}
function emit(type, payload){
  const set = listeners.get(type); if(!set) return;
  for(const fn of Array.from(set)){
    try{ fn(payload); }catch(e){ console.error('[EVT]', type, e); }
  }
}

export const Events = { on, off, once, emit };

export const EVT = Object.freeze({
  TICK: 'tick',
  BIRTH: 'birth',
  DEATH: 'death',
  MATE: 'mate',
  FOOD_SPAWN: 'foodSpawn',
  TIP: 'tip',
  STATUS: 'status',
  HIGHLIGHT_CHANGED: 'highlightChanged',
  RESET: 'reset',
  HUNGER_CRISIS: 'hungerCrisis',
  OVERPOP: 'overPop'
});