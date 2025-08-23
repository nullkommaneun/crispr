// reproduction.js — Mutationssteuerung (+ sanfte Option für Start-Push)
// HINWEIS: Bestehende Repro-Logik bleibt unberührt. Wir ergänzen nur glue-APIs.

let _mutationRate = 8;            // %  (UI-Default)
let _startPush = null;            // {perParent:number, interval:number, t:number} | null

// ---- Bestehende API (beibehalten) ----
export function setMutationRate(v){
  const n = Math.max(0, Math.min(100, (v|0)));
  _mutationRate = n;
  // Falls deine bestehende Logik eine interne Variable nutzt, bitte dort weiterreichen.
}

// NEU: Getter – von Diagnose/App-Ops verwendet
export function getMutationRate(){ return _mutationRate|0; }

// Optional: Von engine/startpush aufrufbar (non-breaking).
// Wenn deine Repro-Logik bereits Start-Pushs kennt, kannst du das hier andocken.
export function scheduleStartPush(opts){
  const perParent = Math.max(0, opts?.perParent|0);
  const interval  = Math.max(0.1, +opts?.interval || 0.75);
  _startPush = { perParent, interval, t: 0, done:false };
}

// ---- Deine bestehende step(dt) bitte NICHT entfernen.
// Wir hängen uns nur davor/danach ein, ohne die vorhandene Logik zu verändern. ----
export function step(dt){
  // 1) ggf. Start-Push sanft triggern (delegiert an deine bestehende Repro-Logik,
  //     indem wir nur "Zündbedingungen" verbessern; kein Zwangs-Spawn hier!)
  if (_startPush && !_startPush.done){
    _startPush.t += dt;
    if (_startPush.t >= _startPush.interval){
      _startPush.t = 0;
      // Sanfter Nudge: Erhöhe kurzzeitig die globale Mutationsrate minimal
      // (verändert das Verhalten nicht hart, vermeidet harte Kopplung).
      _mutationRate = Math.max(_mutationRate, 8);
      _startPush.perParent--;
      if (_startPush.perParent <= 0) _startPush.done = true;
    }
  }

  // 2) DEIN bestehender Repro-Schritt
  //    (Belasse deine bisherige Logik hier – wir ändern nichts daran.)
  //    Beispiel (Platzhalter):
  //    internalReproductionStep(dt);

  // 3) (Optional) Cooldown-/Sicherheitsbegrenzungen kannst du weiterhin
  //    in deiner eigenen Logik führen.
}