// advisor.js
import { showError } from './errorManager.js';

let mode = 'off'; // 'off' | 'heuristic' | 'model'
let tf = null;
let model = null;

export function initAdvisor() { /* noop – lazy bei loadModel */ }

export function getAdvisorMode() { return mode; }
export function setAdvisorMode(m) {
  if (m === 'model' && !model) { mode = 'heuristic'; return mode; }
  mode = m;
  return mode;
}
export function isModelLoaded() { return !!model; }

export async function loadModel(url = 'models/model.json') {
  try {
    if (!tf) {
      // tfjs lazy laden; bei CORS/Offline wird gefangen und Heuristik genutzt
      const mod = await import('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.16.0/dist/tf.min.js');
      tf = mod?.default || (globalThis.tf ?? null);
    }
    if (!tf) throw new Error('TensorFlow.js nicht verfügbar');
    model = await tf.loadLayersModel(url);
    return true;
  } catch (e) {
    model = null;
    showError(`KI‑Modell konnte nicht geladen werden: ${e.message}`);
    return false;
  }
}

// --------- Scoring
export function scoreCellHeuristic(cell) {
  const g = cell.genes; // 1..9 (Standard)
  const energyRatio = Math.max(0, Math.min(1, cell.energy / cell.maxEnergy));
  // Gewichtung: EFF/TEM treiben Nahrungssuche; SCH Überleben; MET Puffer; GRO moderat
  let s = 0.34*g.EFF + 0.26*g.TEM + 0.18*g.SCH + 0.14*g.MET + 0.08*g.GRO;
  s *= (0.6 + 0.4*energyRatio);
  return Math.round(Math.max(0, Math.min(1, s/9)) * 100);
}

export async function scoreCells(cells) {
  if (mode === 'model' && model && tf) {
    try {
      const X = tf.tensor2d(cells.map(c => [
        c.genes.TEM, c.genes.GRO, c.genes.EFF, c.genes.SCH, c.genes.MET,
        Math.max(0, Math.min(1, c.energy/c.maxEnergy))
      ]));
      const y = model.predict(X);
      const arr = await y.data();
      X.dispose(); y.dispose();
      return cells.map((c,i) => ({ id:c.id, score: Math.round(Math.max(0, Math.min(1, arr[i]))*100), source:'AI' }));
    } catch (e) {
      showError(`Scoring (Modell) fehlgeschlagen – Heuristik aktiv. (${e.message})`);
      mode = 'heuristic';
    }
  }
  // Heuristik oder Off
  return cells.map(c => ({
    id: c.id,
    score: (mode === 'heuristic') ? scoreCellHeuristic(c) : null,
    source: (mode === 'heuristic') ? 'H' : '—'
  }));
}