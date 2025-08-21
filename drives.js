/* ===== Snapshot-Export für Diagnose ===== */
export function getDrivesSnapshot(){
  try{
    return {
      misc: (typeof misc!=="undefined"? misc : {duels:0,wins:0}),
      w: (typeof w!=="undefined"? [...w] : []),
      bStamm: (typeof bStamm!=="undefined"? {...bStamm} : {}),
      cfg: {
        WIN_MIN: typeof WIN_MIN!=="undefined"?WIN_MIN:null,
        WIN_MAX: typeof WIN_MAX!=="undefined"?WIN_MAX:null,
        EPS:     typeof EPS!=="undefined"?EPS:null,
        HUNGER_GATE: typeof HUNGER_GATE!=="undefined"?HUNGER_GATE:null,
        EARLY_DE_ABS: typeof EARLY_DE_ABS!=="undefined"?EARLY_DE_ABS:null,
        K_DIST:  typeof K_DIST!=="undefined"?K_DIST:null
      },
      recent: (typeof trace!=="undefined"? [...trace].slice(-12) : [])
    };
  }catch(e){
    return { misc:{duels:0,wins:0}, w:[], bStamm:{}, cfg:{}, recent:[] };
  }
}