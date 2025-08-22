# CRISPR Genetics Lab (Browser-Simulation)

Eine leichte, modulare **Evolutions-/Ökologie-Simulation** für den Browser (reine ES-Module, kein Build-Step).
Zellen bewegen sich in einer 2D-Welt, konsumieren Nahrung, paaren sich (Genetik & Mutation), lernen Entscheidungen
(„Drives“) online, und werden per Diagnose-Panel & Stammbaum visualisiert.

**Live-Hosting:** für GitHub Pages optimiert (statische Site).

---

## Quickstart

**Lokal starten (ohne Build):**
```bash
# Variante A (Node)
npx serve .

# Variante B (Python)
python3 -m http.server 8080
# dann http://localhost:8080 aufrufen 

├── index.html               # Einstieg; lädt bootstrap.js, Styles, (optional) TF.js via CDN
├── style.css                # Post-apokalyptisches UI-Theme (Topbar, Panels, Editor, Ticker)
├── bootstrap.js             # Robuster Boot-Loader: importiert Engine; zeigt verständliche Fehler-Overlays
├── preflight.js             # Modul-Check (Exports / Importpfade); Diagnose-Overlay bei Startproblemen
├── config.js                # Zentrale Konfiguration (Welt, Zellen, Physik, Food, Farben, Langlebigkeit)
│
├── engine.js               # Orchestrierung: Loop (fixed dt), Timescale, UI-Bindings, Annealing der Mutation
├── event.js                # Minimaler Pub/Sub-Bus: on/off/emit
├── errorManager.js         # Fehler-Capture & Overlay (entwicklungsfreundlich)
│
├── entities.js             # "Quelle der Wahrheit" für Zellen & Food-Items; Physik/Steering; Energiehaushalt
│                           # - dynamische Altersgrenze (longevity in config.js)
│                           # - Umwelt ist neutralisiert (keine Hazards)
│
├── drives.js               # Entscheidungs-Policy (Food/Mate/Wander): Online-Lernen, Fensterlogik, Reward-Shaping
│                           # - K_DIST, R_PAIR, EPS konfigurierbar; Diagnose-Snapshot verfügbar
│
├── reproduction.js         # Paarungslogik; Gen-Rekombination; Mutation (mit Elternqualitäts-Drossel)
├── food.js                 # Food-Cluster (Gauß) flächenstabil; Spawns zählen für Ökonomie
├── renderer.js             # Canvas-Rendering (Spielwelt)
│
├── editor.js               # CRISPR-Editor: Gene per ±1 ändern; Prognose-Score (TensorFlow.js oder Heuristik)
├── advisor.js              # (optional) Ranking/Heuristik für Zellenliste im Editor
│
├── metrics.js              # Messwerte & Zeitreihen:
│                           #   Ökonomie (Intake/Base/Move/Net), Population, Paarungs-Funnel, Gen-Drift
├── diag.js                 # Diagnose-Panel (DRI/GEN/ECON/POP/DRFT) mit kopierbaren MDC-Codes
│
├── genealogy.js            # Stammbaum-Daten: Eltern/Kind, Generationen, Export; hört auf cells:born/died
├── genea.js                # Stammbaum-UI (Vollansicht): zwei Slider (oben/rechts) + Zentrieren + Export
│
├── environment.js          # Stub: Umwelt ist deaktiviert (keine Hazard-Effekte, neutrale Werte)
├── ticker.js               # Topbar-Metriken (FPS, Sim-dt, Zellen, Food, Scale, Drives-Parameter)
│
├── models/
│   └── model.json          # (optional) TensorFlow.js-Modell für Prognose im Editor (Graph/Layers)
│
└── .nojekyll               # Deaktiviert Jekyll auf GitHub Pages
