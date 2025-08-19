// models/model.js
// Eingebettetes, leichtgewichtiges Standardmodell für den KI-Advisor.
// Input: 4 Features (TEM, GRO, EFF, SCH) ∈ [0..1]; Output: p ∈ [0..1].
// Architektur: Dense(8,relu) → Dense(1,sigmoid)
// Gewichte so gewählt, dass EFF & TEM positiv, GRO moderat, SCH leicht positiv wirken.

export async function buildModel(tf){
  const model = tf.sequential();
  model.add(tf.layers.dense({ units: 8, activation: 'relu', useBias: true, inputShape: [4], name: 'dense0' }));
  model.add(tf.layers.dense({ units: 1, activation: 'sigmoid', useBias: true, name: 'dense1' }));

  // dense0 kernel [4,8] – Spalten sind Neuronen
  const k0 = tf.tensor2d([
    /* TEM */  0.80, 0.10, 0.00, 0.00, 0.35, 0.25, 0.00, 0.10,
    /* GRO */ -0.10, 0.25, 0.00, 0.00, 0.00, 0.15, 0.05, 0.00,
    /* EFF */  0.00, 0.00, 0.90, 0.10, 0.55, 0.25, 0.10, 0.15,
    /* SCH */  0.00, 0.00, 0.10, 0.60, 0.30, 0.20, 0.05, 0.10,
  ], [4,8]);
  const b0 = tf.tensor1d([0,0,0,0,0,0,0,0]);

  // dense1 kernel [8,1]
  const k1 = tf.tensor2d([ 0.65, 0.30, 0.85, 0.50, 0.45, 0.22, 0.12, 0.12 ], [8,1]);
  const b1 = tf.tensor1d([-0.55]);

  model.layers[0].setWeights([k0, b0]);
  model.layers[1].setWeights([k1, b1]);

  return model;
}

export default buildModel;