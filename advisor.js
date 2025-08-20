// advisor.js
// Zentraler Berater: AUS | HEURISTIK | KI (TensorFlow.js) – einheitliche API.
// Liefert Score 0..100 und (für UI) einfache Erklärbeiträge je Trait.

import { emit, on } from './event.js';

const DEFAULT_MODEL_URL = 'models/model.json'; // kann im Editor überschrieben werden

const clamp = (v, lo=0, hi=100) => Math.max(lo, Math.min(hi, v));
const lerp = (a,b,t)=>a+(b-a)*t;
const norm01 = (v, min=1, max=9)=> clamp((v-min)/(max-min), 0, 1);

// Cache für Scores je Modus/Zustand
const scoreCache = new Map(); // key -> number

function cacheKey(mode, traits, energyRounded) {
  return `${mode}|${traits.TEM},${traits.GRO},${traits.EFF},${traits.SCH},${traits.MET}|${energyRounded}`;
}

// ---------- Heuristik -------------------------------------------------------

/**
 * Heuristische Bewertung 0..100
 * Berücksichtigt Nahrungserwerb (TEM/EFF/etwas GRO), Verbrauch (MET/TEM/GRO),
 * Schutz (SCH, kleiner Vorteil für kleinere GRO) und Reproduction-Basis.
 */
function heuristicScore(traits, energy=30) {
  const t = {
    TEM: norm01(traits.TEM),
    GRO: norm01(traits.GRO),
    EFF: norm01(traits.EFF),
    SCH: norm01(traits.SCH),
    MET: norm01(traits.MET)
  };

  // Nahrungserwerb: Suche + Effizienz + bisschen „Reichweite“ (Größe)
  const acquire = clamp(100 * (0.55*t.TEM + 0.35*t.EFF + 0.10*t.GRO), 0, 100);

  // Verbrauch: Grundumsatz (MET) + Laufkosten (TEM, GRO)
  const consumption = clamp(100 * (0.35*t.MET + 0.35*t.TEM + 0.30*t.GRO), 0, 100);

  // Gefahrenresistenz: vor allem SCH, sehr leichte Bevorzugung kleinerer Größe
  const defense = clamp(100 * (0.75*t.SCH + 0.10*(1 - t.GRO) + 0.15*t.EFF), 0, 100);

  // Reproduktion: Tempo hilft Begegnungen, Effizienz hält Energie, Größe leicht negativ
  const repro = clamp(100 * (0.50*t.TEM + 0.30*t.EFF + 0.20*(1 - 0.5*t.GRO)), 0, 100);

  // Energiefaktor (mehr Energie = leichteres Überleben)
  const e = clamp(energy, 0, 100) / 100;

  // Mischgewichtung
  const w1=0.50, w2=0.30, w3=0.20;
  const base = w1 * (acquire - consumption + 100)/200   // [-100..100] -> [0..1]
             + w2 * (defense/100)
             + w3 * (repro/100);

  const s = clamp(100 * lerp(base, Math.max(base, 0.5), e*0.3)); // Energie glättet
  return Math.round(s);
}

/** einfache „Erklärung“ via Finite-Differences (Δpp pro +1 Trait-Schritt) */
function explainHeuristic(traits, energy=30) {
  const base = heuristicScore(traits, energy);
  const out = {};
  for (const k of ['TEM','GRO','EFF','SCH','MET']) {
    const up = { ...traits, [k]: Math.min(9, traits[k] + 1) };
    const down = { ...traits, [k]: Math.max(1, traits[k] - 1) };
    const sUp = heuristicScore(up, energy);
    const sDn = heuristicScore(down, energy);
    // symmetrische Ableitung in „Prozentpunkten“
    const delta = ((sUp - sDn) / 2);
    out[k] = { delta: Math.round(delta), base };
  }
  return out;
}

// ---------- TensorFlow.js (optional) ---------------------------------------

let tf = null;
let model = null;

async function ensureTF() {
  if (window.tf) { tf = window.tf; return; }
  await new Promise((resolve, reject)=>{
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.18.0/dist/tf.min.js';
    s.onload = ()=>{ tf = window.tf; resolve(); };
    s.onerror = ()=>reject(new Error('TFJS konnte nicht geladen werden.'));
    document.head.appendChild(s);
  });
}

async function loadTFModel(url) {
  await ensureTF();
  model = await tf.loadLayersModel(url);
  return model;
}

function predictWithModel(traits, energy=30) {
  if (!model || !tf) return null;
  // Feature-Vektor (passend zur Heuristik; Energie als Feature hilft)
  const x = [traits.TEM, traits.GRO, traits.EFF, traits.SCH, traits.MET, energy];
  const inp = tf.tensor([x.map(v => (v-1)/8)]); // 1..9 -> 0..1 (Energie ca. 0..1 skaliert mit/8 ok)
  const y = model.predict(inp);
  const val = y.dataSync()[0];
  tf.dispose([inp, y]);
  // Modell liefert 0..1 -> skaliere 0..100
  return clamp(Math.round(val * 100));
}

// ---------- Öffentliche API ------------------------------------------------

export const Advisor = {
  mode: /** @type {'off'|'heuristic'|'model'} */ (localStorage.getItem('advisor:mode') || 'off'),
  status: /** @type {'idle'|'loading'|'ready'|'error'} */ ('idle'),
  modelName: localStorage.getItem('advisor:modelUrl') || DEFAULT_MODEL_URL,

  setMode(next) {
    if (next === 'model' && this.status !== 'ready') {
      // Model noch nicht geladen -> Ladevorgang anstoßen
      this.mode = 'heuristic'; // bis Model ready
      emit('advisor:modeChanged', {mode: this.mode});
      this.loadModel(this.modelName).catch(()=>{}); // Fehlerbehandlung in loadModel
      return;
    }
    this.mode = next;
    localStorage.setItem('advisor:mode', this.mode);
    emit('advisor:modeChanged', {mode: this.mode});
  },

  toggleMode() {
    const order = ['off', 'heuristic', 'model'];
    const i = order.indexOf(this.mode);
    const next = order[(i+1)%order.length];
    this.setMode(next);
  },

  async loadModel(url=DEFAULT_MODEL_URL) {
    this.status = 'loading';
    emit('advisor:status', {status:this.status});
    try {
      await loadTFModel(url);
      this.status = 'ready';
      this.modelName = url;
      localStorage.setItem('advisor:modelUrl', url);
      emit('advisor:status', {status:this.status, model:url});
      // wenn der Nutzer direkt „KI“ gewählt hatte, automatisch umschalten
      this.mode = 'model';
      localStorage.setItem('advisor:mode', this.mode);
      emit('advisor:modeChanged', {mode: this.mode});
    } catch (e) {
      console.error(e);
      this.status = 'error';
      emit('advisor:status', {status:this.status, error:String(e)});
      // Sicher zurück auf Heuristik
      this.mode = 'heuristic';
      localStorage.setItem('advisor:mode', this.mode);
      emit('advisor:modeChanged', {mode: this.mode});
    }
  },

  /** Score für reale Zelle (Traits + Energie). Null wenn AUS. */
  predict(cell) {
    const traits = cell.genes || cell.traits || cell;
    const energy = Math.round(cell.energy ?? 30);
    if (this.mode === 'off') return null;

    const key = cacheKey(this.mode, traits, energy);
    if (scoreCache.has(key)) return scoreCache.get(key);

    let s = null;
    if (this.mode === 'heuristic') s = heuristicScore(traits, energy);
    else if (this.mode === 'model') s = predictWithModel(traits, energy) ?? heuristicScore(traits, energy);

    scoreCache.set(key, s);
    return s;
  },

  /** Score für hypothetische Traits (What-if) */
  predictTraits(traits, energy=30) {
    if (this.mode === 'off') return null;
    if (this.mode === 'heuristic') return heuristicScore(traits, energy);
    const s = predictWithModel(traits, energy);
    return (s==null) ? heuristicScore(traits, energy) : s;
  },

  /** Beiträge je Trait – für die UI-Chips */
  explain(cell) {
    const traits = cell.genes || cell.traits || cell;
    const energy = Math.round(cell.energy ?? 30);
    if (this.mode === 'model') {
      // einfache numerische Approximation auch für KI
      return explainHeuristic(traits, energy);
    }
    if (this.mode === 'heuristic') {
      return explainHeuristic(traits, energy);
    }
    return null; // bei AUS keine Erklärung
  },

  explainTraits(traits, energy=30) {
    if (this.mode === 'off') return null;
    return explainHeuristic(traits, energy);
  },

  invalidateCache() {
    scoreCache.clear();
    emit('advisor:scoresInvalidated', {});
  }
};

// periodischer Cache-Reset, damit Werte nicht veralten
setInterval(()=>Advisor.invalidateCache(), 1500);

// Wenn Ticks laufen, bitte nicht jedes Frame sortieren – UI macht 1 Hz Refresh.
on('tick', ()=>{ /* noop, Platzhalter falls später nötig */ });