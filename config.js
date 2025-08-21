// config.js — zentrale Parameter

export const CONFIG = {
  world: { width: 1024, height: 640, marginWall: 18 },

  cell: {
    baseSpeed: 35,            // px/s bei TEM=5
    baseMetabolic: 0.6,       // energy/s bei MET=5 (Leerlauf)
    radius: 7,                // bei GRÖ=5
    senseFood: 110,           // wird in entities.js mit sMin skaliert
    senseMate: 120,
    energyMax: 120,
    eatPerSecond: 34,         // Menge/s wenn im Food
    pairDistance: 16,         // Annäherung für Reproduktion
    energyCostPair: 30,
    cooldown: 8,              // s
    ageMax: 600               // Basis-Lebenszeit (nur Fallback)
  },

  // NEU: Langlebigkeit — dynamische Altersgrenze
  longevity: {
    // Baseline (wenn gesetzt, überschreibt cell.ageMax intern)
    baseAge: 600,

    // Deckel/Keller auf den Boost: finalAge = baseAge * (1 + boost)
    maxBoost: 0.50,   // +50 % maximal
    minBoost: -0.30,  // -30 % minimal

    // Gen-Gewichte (z-Score um 5): gutes EFF/SCH/TEM leicht +, hohes MET −
    geneWeights: { EFF: 0.50, MET: -0.50, SCH: 0.30, TEM: 0.10, "GRÖ": 0.00 },

    // Vitalität = integrierte „Lebensstil“-Komponente:
    // gut ernährt & wenig Hazard -> steigt, sonst fällt
    vitalityRate: 0.6,   // s^-1 Integrationsrate
    hazardK: 0.4,        // Hazard-Abzug in Vitalität
    nutritionK: 0.15,    // Einfluss der Vitalität auf Boost
    energyGood: 0.60,    // ab diesem Energie-Füllstand (relativ) +Vitalität
    energyBad:  0.25     // unter diesem Füllstand −Vitalität
  },

  physics: {
    maxForceBase: 140,
    slowRadius: 120,
    stopRadius: 16,
    wallAvoidRadius: 48,

    separationRadius: 28,
    alignmentRadius: 72,
    cohesionRadius: 80,

    wanderTheta: 1.6,
    wanderSigma: 0.45,

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
    food:  "#2ee56a",
    acid:  "rgba(0,255,128,0.10)",
    fence: "rgba(170,200,255,0.08)",
    barb:  "rgba(255,120,120,0.12)",
    nano:  "rgba(120,180,255,0.06)",

    // Geschlechterfarben
    sexMale:   "#27c7ff",  // M
    sexFemale: "#ff6bd6"   // F
  }
};