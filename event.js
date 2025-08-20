const subs = new Map();

/** Subscribe */
export function on(type, cb){ (subs.get(type) ?? subs.set(type,[]).get(type)).push(cb); }
/** Unsubscribe */
export function off(type, cb){ const arr=subs.get(type)||[]; const i=arr.indexOf(cb); if(i>=0) arr.splice(i,1); }
/** Emit */
export function emit(type, payload){
  const arr=subs.get(type)||[];
  for(const cb of arr){ try{ cb(payload); }catch(e){ console.error("event handler error",e);} }
}