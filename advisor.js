// advisor.js
// KI-/Heuristik-Advisor: wertet Genome aus, verwaltet Modus, lädt optional ein TFJS-Modell.
// Bietet rückwärtskompatible Exporte (initAdvisor, tryLoadTF, etc.).

import { on, emit, EVT } from './event.js';

export const AdvisorMode = Object.freeze({
  OFF: 'off',
  HEUR: 'heuristic',
  MODEL: 'model',
});

let mode = AdvisorMode.OFF;
let modelUrl = 'models/model.json'; // Standardpfad (falls UI nichts setzt)
let tf = null;
let model = null;

// ---------- Status-Helfer ----------

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

// ---------- Modell laden (optional) ----------

/** Versucht, TFJS zu verwenden und ein Layers-Model zu laden. */
export async function loadAdvisorModel(url = modelUrl) {
  modelUrl = url || modelUrl;
  try {
    // TFJS aus globalem Namespace verwenden, falls schon eingebunden.
    tf = globalThis.tf ?? null;

    // Wenn TFJS nicht global vorliegt, kannst du (optional) dynamisch laden:
    // Achtung: große Library; ggf. bewusst deaktiviert lassen.
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

// Rückwärtskompatibler Alias (einige ältere UIs rufen „tryLoadTF“ auf).
export async function tryLoadTF(url) { return loadAdvisorModel(url); }

// ---------- Scoring ----------

/** Heuristische Bewertung (1..99) – robust ohne Modell. */
export function scoreGenomeHeuristic(g) {
  // erwartete Felder: TEM, GRO, EFF, SCH, MET (je 1..9)
  const TEM = g?.TEM ?? 5;
  const GRO = g?.GRO ?? 5;
  const EFF = g?.EFF ?? 5;
  const SCH = g?.SCH ?? 5;
  const MET = g?.MET ?? 5;

  // einfache, lesbare Mischung:
  const forage = (0.55 * TEM + 0.65 * EFF) * 6; // Nahrungssuche/Nutzung
  const surviv = (0.45 * SCH + 0.35 * GRO) * 6; // Überleben/Tragen
  const upkeepPenalty = (10 - Math.max(1, MET)) * 2.5; // zu niedriger MET -> höhere Kosten

  let score = forage + surviv - upkeepPenalty;
  score = Math.max(1, Math.min(99, Math.round(score)));
  return score;
}

/** Modellbewertung (fällt bei Fehler auf Heuristik zurück). */
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

/** Öffentliche Bewertung je nach Modus. */
export function scoreGenome(g) {
  return (mode === AdvisorMode.MODEL)
    ? scoreGenomeWithModel(g)
    : scoreGenomeHeuristic(g);
}

// ---------- Initialisierung (von engine.js aufgerufen) ----------

export function initAdvisor() {
  // aktuellen Status direkt einmal senden (Ticker/UI)
  emit(EVT.ADVISOR_MODE_CHANGED, { mode, modeLabel: getAdvisorModeLabel() });

  // Beispiel: Externe Änderungen des Modus (falls UI-Buttons eigene Events feuern)
  on(EVT.ADVISOR_MODE_CHANGED, ({ mode: m }) => { mode = m; });

  // Optional: automatischer, stiller Modell-Ladeversuch
  // (auskommentieren, falls unerwünscht)
  // loadAdvisorModel(modelUrl).then(r => {
  //   if (r?.ok) setAdvisorMode(AdvisorMode.MODEL);
  // });
}

// ---------- Zusätzliche (kompatible) Exporte ----------

export const initAI = initAdvisor; // Alias
export default {
  initAdvisor, initAI,
  AdvisorMode,
  getAdvisorMode, getAdvisorModeLabel, isModelLoaded,
  setAdvisorMode, toggleAdvisorMode,
  loadAdvisorModel, tryLoadTF,
  scoreGenome, scoreGenomeHeuristic, scoreGenomeWithModel
};