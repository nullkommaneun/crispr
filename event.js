const listeners = {};

export function on(type, cb) {
    if (!listeners[type]) listeners[type] = [];
    listeners[type].push(cb);
}

export function off(type, cb) {
    if (listeners[type]) {
        listeners[type] = listeners[type].filter(c => c !== cb);
    }
}

export function emit(type, payload) {
    if (listeners[type]) {
        listeners[type].forEach(cb => cb({type, payload}));
    }
}