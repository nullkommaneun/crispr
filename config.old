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
    energyCostPair: 30,       // Kosten je Elternteil
    cooldown: 8,              // Sekunden
    ageMax: 600               // s, simple Mortalität
  },
  food: {
    itemEnergy: 18,
    itemRadius: 4,
    clusterCount: 5,
    clusterDrift: 20,         // px/s
    clusterRadius: 120
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