export const CONFIG = {
  world: { width: 1024, height: 640, marginWall: 18 },

  cell: {
    baseSpeed: 35,            // px/s bei TEM=5
    baseMetabolic: 0.8,       // energy/s bei MET=5 (Leerlauf)
    radius: 7,                // bei GRÖ=5
    senseFood: 90,            // bei EFF=5
    senseMate: 120,
    energyMax: 120,
    eatPerSecond: 30,         // Menge/s wenn im Food
    pairDistance: 16,         // Annäherung für Reproduktion
    energyCostPair: 30,
    cooldown: 8,              // s
    ageMax: 600               // s
  },

  /* Natürlichere Bewegungsphysik + Schalter */
  physics: {
    // Limits (werden mit TEM skaliert)
    maxForceBase: 140,        // px/s^2 bei TEM=5
    slowRadius: 120,          // Ab hier „Arrive“ (Abbremsen)
    stopRadius: 16,           // generischer Stoppwert

    wallAvoidRadius: 48,      // Abstoßung vom Rand

    // Nachbarschaft (werden mit GRÖ/EFF skaliert)
    separationRadius: 28,
    alignmentRadius: 72,
    cohesionRadius: 80,

    // Gewichte (Blended Steering, werden dynamisch gedrosselt)
    wFood: 1.20,
    wMate: 0.95,
    wAvoid: 1.15,
    wSep:  1.10,
    wAli:  0.35,
    wCoh:  0.25,
    wWander: 0.22,            // bewusst klein

    // „Restbudget“ für das sekundäre Hauptziel (Food/Mate)
    secondaryGoalScale: 0.6,

    // Korrelierter Noise (Ornstein–Uhlenbeck)
    wanderTheta: 1.6,
    wanderSigma: 0.45,
    wanderWhenTarget: 0.2,    // Dämpfung, wenn Food ODER Mate aktiv

    // Flocking-Schalter (Debug/Feintuning)
    enableSep: true,
    enableAli: true,
    enableCoh: true,
    enableWander: true,

    // Paarungs-Toleranz
    mateLockSec: 1.5,         // Partner 1.5 s „gelockt“, kein Wechsel
  },

  food: {
    itemEnergy: 18,
    itemRadius: 4,
    clusterCount: 5,
    clusterDrift: 20,         // px/s
    clusterRadius: 120,
    // optional: clusterSigma: 55
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