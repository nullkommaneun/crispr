// config.js — zentrale Parameter

export const CONFIG = {
  world: { width: 1024, height: 640, marginWall: 18 },

  cell: {
    baseSpeed: 35,            // px/s bei TEM=5
    baseMetabolic: 0.6,       // energy/s bei MET=5 (Leerlauf)
    radius: 7,                // bei GRÖ=5
    senseFood: 110,           // bei EFF=5 (wird auflösungs-skaliert)
    senseMate: 120,
    energyMax: 120,
    eatPerSecond: 34,         // Menge/s wenn im Food
    pairDistance: 16,         // Annäherung für Reproduktion
    energyCostPair: 30,
    cooldown: 8,              // s
    ageMax: 600               // s
  },

  physics: {
    // Limits (werden mit TEM skaliert und zusätzlich auflösungs-skaliert)
    maxForceBase: 140,        // px/s^2 bei TEM=5
    slowRadius: 120,
    stopRadius: 16,
    wallAvoidRadius: 48,

    // Nachbarschaft
    separationRadius: 28,
    alignmentRadius: 72,
    cohesionRadius: 80,

    // Wander-Noise
    wanderTheta: 1.6,
    wanderSigma: 0.45,

    // Bewegungs-Energiekosten (wird in entities.js durch sMin geteilt)
    moveCostK: 0.0006
  },

  food: {
    itemEnergy: 18,
    itemRadius: 4,
    clusterCount: 5,
    clusterDrift: 20,
    clusterSigma: 55,
    wallBiasRadius: 160,
    maxItems: 180,
    baseSpawnRate: 6
  },

  envDefaults: {
    acid:  { enabled:false, range: 24, dps: 10 },
    barb:  { enabled:false, range: 40, dps: 5 },
    fence: { enabled:false, range: 36, impulse: 200, period: 2.2 },
    nano:  { enabled:false, dps: 1.2 }
  },

  colors: {
    // bestehende Farben (Renderer-Overlays etc.)
    food:  "#2ee56a",
    acid:  "rgba(0,255,128,0.10)",
    fence: "rgba(170,200,255,0.08)",
    barb:  "rgba(255,120,120,0.12)",
    nano:  "rgba(120,180,255,0.06)",

    // NEU: Geschlechterfarben
    sexMale:   "#27c7ff",  // kaltes Neonblau
    sexFemale: "#ff6bd6"   // neon-magenta
  }
};