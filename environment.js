import { emit } from './event.js';
import { on } from './event.js';

let envState = {
    acid: { enabled: false, range: 50, dps: 1 },
    barb: { enabled: false, range: 50, dps: 2 },
    fence: { enabled: false, range: 50, impulse: 10, period: 0.2 },
    nano: { enabled: false, dps: 0.5 }
};

export function getEnvState() {
    return envState;
}

export function setEnvState(newEnv) {
    envState = { ...envState, ...newEnv };
    emit('env:changed', envState);
}

export function onEnvChange(cb) {
    on('env:changed', cb);
}

export function openEnvPanel() {
    import('./environment/panel.js').then(module => module.openEnvPanel());
}