/**
 * reproduction.js — Paarung/Mutation (minimal), kompatible Platzhalter-Logik
 * Exports: step(dt), setMutationRate(v), getMutationRate(), scheduleStartPush(opts)
 *
 * Design:
 *  - Bewusst minimal gehalten (kein Zwangs-Spawn), UI-Slider steuert MutationRate
 *  - Hooks für spätere Erweiterung vorhanden (scheduleStartPush)
 *  - Engine ruft step(dt); hier keine teuren Operationen
 */

let _mutationRate = 8;   // % (UI-Default)
let _startPush = null;   // { perParent:number, interval:number, t:number, done:boolean } | null

export function setMutationRate(v){
  const n = Math.max(0, Math.min(100, (v|0)));
  _mutationRate = n;
}

export function getMutationRate(){ return _mutationRate|0; }

/**
 * Optionaler, sanfter „Start-Push“ für frühe Aktivität (kein Zwangs-Spawn).
 * opts: { perParent:number, interval:number (s) }
 */
export function scheduleStartPush(opts){
  const perParent = Math.max(0, opts?.perParent|0);
  const interval  = Math.max(0.1, +opts?.interval || 0.75);
  _startPush = { perParent, interval, t: 0, done:false };
}

/**
 * Repro-Tick (minimal): verwaltet nur optionale Start-Impulse/Timer.
 * Echte Paarungslogik kann später ergänzt oder modulweise ersetzt werden.
 */
export function step(dt){
  // 1) Start-Push verwalten (leichtgewichtige Timer-Logik)
  if (_startPush && !_startPush.done){
    _startPush.t += Math.max(0, +dt || 0);
    if (_startPush.t >= _startPush.interval){
      _startPush.t = 0;
      // Sanfter Nudge: Hebe die Mutationsrate minimal an (wenn darunter),
      // ohne Verhalten hart zu ändern.
      _mutationRate = Math.max(_mutationRate, 8);
      _startPush.perParent--;
      if (_startPush.perParent <= 0) _startPush.done = true;
    }
  }

  // 2) Platzhalter für echte Paarung/Mutation (später)
  //    (Nichts zu tun: diese Datei sichert API-Vertrag & UI-Slider.)
}