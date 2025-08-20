// environment.js
export { openEnvPanel } from './environment/panel.js';

// Optional: sehr alte Aufrufer
export function openEnvironment() {
  return import('./environment/panel.js').then(m => m.openEnvPanel());
}