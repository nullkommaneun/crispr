// advisor.js
// KI-/Heuristik-Advisor: wertet Genome aus, verwaltet Modus, lädt optional ein TFJS-Modell.
// Stellt rückwärtskompatible Exporte bereit (u.a. initAdvisor) UND einen benannten Namespace-Export "Advisor".

import { on, emit, EVT } from './event.js';

export const AdvisorMode = Object.freeze({
  OFF: 'off',
  HEUR: 'heuristic',
  MODEL: 'model',
});

let mode = AdvisorMode.OFF;
let modelUrl = 'models/model.json'; // Standardpfad
let tf = null;
let model = null;

// ---------------------- Status / Modus ----------------------

export function getAdvisorMode() { return mode; }

export function getAdvisorModeLabel() {
  switch (mode) {
    case AdvisorMode.HEUR:  return 'Heuristik';
    case AdvisorMode.MODEL: return 'KI Modell aktiv';
    default:                return 'Aus';
  }
}

export function isModelLoaded() { return !!model; }

export function setAdvisorMode(next) {
  if (![AdvisorMode.OFF, AdvisorMode.HEUR, AdvisorMode.MODEL].includes(next)) {
    next = AdvisorMode.OFF;
  }
  mode = next;
  emit(EVT.ADVISOR_MODE_CHANGED, { mode, modeLabel: getAdvisorModeLabel() });
}

export function toggleAdvisorMode() {
  if (mode === AdvisorMode.OFF) {
    setAdvisorMode(AdvisorMode.HEUR);
  } else if (mode === AdvisorMode.HEUR) {
    setAdvisorMode(isModelLoaded() ? AdvisorMode.MODEL : AdvisorMode.OFF);
  } else {
    setAdvisorMode(AdvisorMode.OFF);
  }
}

// ---------------------- Modell laden (optional) ----------------------

export async function loadAdvisorModel(url = modelUrl) {
  modelUrl = url || modelUrl;
  try {
    tf = globalThis.tf ?? null;

    // Optionales dynamisches Laden (deaktiviert, um Seitenstart schlank zu halten):
    // if (!tf) {
    //   const mod = await import('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.15.0/dist/tf.min.js');
    //   tf = globalThis.tf || mod?.default || mod;
    // }

    if (!tf || !tf.loadLayersModel) {
      console.warn('[advisor] TensorFlow.js nicht verfügbar – bleibe bei Heuristik.');
      return { ok: false, reason: 'no-tf' };
    }

    model = await tf.loadLayersModel(modelUrl);
    emit(EVT.ADVISOR_MODEL_LOADED, { url: modelUrl, ok: true });
    return { ok: true };
  } catch (err) {
    console.error('[advisor] Modell konnte nicht geladen werden:', err);
    emit(EVT.ERROR, { where: 'advisor', error: err });
    return { ok: false, reason: 'load-failed', error: err };
  }
}

// Rückwärtskompatibler Alias (falls ältere UIs „tryLoadTF“ verwenden)
export async function tryLoadTF(url) { return loadAdvisorModel(url); }

// ---------------------- Scoring ----------------------

export function scoreGenomeHeuristic(g) {
  const TEM = g?.TEM ?? 5;
  const GRO = g?.GRO ?? 5;
  const EFF = g?.EFF ?? 5;
  const SCH = g?.SCH ?? 5;
  const MET = g?.MET ?? 5;

  const forage = (0.55 * TEM + 0.65 * EFF) * 6;   // Nahrungssuche/-nutzung
  const surviv = (0.45 * SCH + 0.35 * GRO) * 6;   // Überleben/Tragen
  const upkeepPenalty = (10 - Math.max(1, MET)) * 2.5;

  let score = forage + surviv - upkeepPenalty;
  score = Math.max(1, Math.min(99, Math.round(score)));
  return score;
}

export function scoreGenomeWithModel(g) {
  if (!model || !globalThis.tf) return scoreGenomeHeuristic(g);
  try {
    const input = globalThis.tf.tensor2d([[
      g?.TEM ?? 5, g?.GRO ?? 5, g?.EFF ?? 5, g?.SCH ?? 5, g?.MET ?? 5
    ]]);
    const out = model.predict(input);
    const val = Array.isArray(out) ? out[0] : out;
    const data = val.dataSync ? val.dataSync()[0] : (val?.arraySync?.()[0]?.[0] ?? 0.5);
    input.dispose?.(); val.dispose?.();
    const score = Math.max(1, Math.min(99, Math.round(100 * data)));
    return score;
  } catch (e) {
    console.warn('[advisor] model.predict failed – fallback Heuristik', e);
    return scoreGenomeHeuristic(g);
  }
}

export function scoreGenome(g) {
  return (mode === AdvisorMode.MODEL)
    ? scoreGenomeWithModel(g)
    : scoreGenomeHeuristic(g);
}

// ---------------------- Initialisierung ----------------------

export function initAdvisor() {
  emit(EVT.ADVISOR_MODE_CHANGED, { mode, modeLabel: getAdvisorModeLabel() });
  on(EVT.ADVISOR_MODE_CHANGED, ({ mode: m }) => { mode = m; });

  // Optionales Autoload (deaktiviert)
  // loadAdvisorModel(modelUrl).then(r => { if (r?.ok) setAdvisorMode(AdvisorMode.MODEL); });
}

// Praktischer Alias
export const initAI = initAdvisor;

// ---------------------- Namespace-Export + Default ----------------------
// >>> Dieser Block stellt *zusätzlich* einen benannten Export "Advisor" bereit
//     und exportiert ihn außerdem als Default. So funktionieren beide Varianten:
//     import { Advisor } from './advisor.js'
//     import Advisor from './advisor.js'

export const Advisor = {
  // Methoden
  initAdvisor, initAI,
  setAdvisorMode, toggleAdvisorMode,
  loadAdvisorModel, tryLoadTF,
  scoreGenome, scoreGenomeHeuristic, scoreGenomeWithModel,

  // Status/Getter
  getAdvisorMode, getAdvisorModeLabel, isModelLoaded,

  // Konstanten
  AdvisorMode,
};

export default Advisor;