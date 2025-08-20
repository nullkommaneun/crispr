export const CONFIG = {
  world: { width: 1024, height: 640, marginWall: 18 },

  cell: {
    baseSpeed: 35,            // px/s bei TEM=5
    baseMetabolic: 0.6,       // ↓ vorher 0.8 → weniger Grundverbrauch
    radius: 7,                // bei GRÖ=5
    senseFood: 110,           // ↑ bessere Foodsuche (skaliert mit EFF)
    senseMate: 120,
    energyMax: 120,
    eatPerSecond: 34,         // ↑ etwas schnelleres Fressen
    pairDistance: 16,
    energyCostPair: 30,
    cooldown: 8,
    ageMax: 600
  },

  physics: {
    // Limits (skaliert mit TEM)
    maxForceBase: 140,
    slowRadius: 120,
    stopRadius: 16,
    wallAvoidRadius: 48,

    // Nachbarschaft
    separationRadius: 28,
    alignmentRadius: 72,
    cohesionRadius: 80,

    // Gewichte
    wFood: 1.30,              // ↑ Food bevorzugen
    wMate: 0.90,
    wAvoid: 1.10,
    wSep:  1.00,
    wAli:  0.30,
    wCoh:  0.22,
    wWander: 0.18,            // ↓ weniger „Zittern“

    // Sekundärziel (wenn Food vs. Mate)
    secondaryGoalScale: 0.5,

    // Wander-Noise
    wanderTheta: 1.6,
    wanderSigma: 0.45,
    wanderWhenTarget: 0.15,   // ↓ bei aktivem Ziel

    // Schalter
    enableSep: true,
    enableAli: true,
    enableCoh: true,
    enableWander: true,

    // Paarungs-Lock
    mateLockSec: 1.5,

    // Bewegungs-Energiekosten
    moveCostK: 0.0006,        // ↓ vorher 0.0009
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
    food: "#2ee56a",
    acid: "rgba(0,255,128,0.10)",
    fence: "rgba(170,200,255,0.08)",
    barb: "rgba(255,120,120,0.12)",
    nano: "rgba(120,180,255,0.06)"
  }
};