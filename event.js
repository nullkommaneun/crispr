const listeners = new Map();

export function on(type, cb) {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(cb);
}

export function off(type, cb) {
    if (listeners.has(type)) {
        const cbs = listeners.get(type).filter(c => c !== cb);
        listeners.set(type, cbs);
    }
}

export function emit(type, payload) {
    if (listeners.has(type)) {
        listeners.get(type).forEach(cb => cb(payload));
    }
}