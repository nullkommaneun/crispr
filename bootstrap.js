// bootstrap.js — robuster App-Starter: UI-Wiring + Engine-Boot + Preflight-Hook
// Keine festen (statischen) ES-Imports, damit Importfehler nicht die Seite „still“ abbrechen.

(function(){
  /* ---------- kleines Fehler-Overlay ---------- */
  function showError(msg){
    let el = document.getElementById('boot-error');
    if(!el){
      el = document.createElement('div');
      el.id = 'boot-error';
      el.style.cssText = "position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,.65);display:flex;align-items:flex-start;justify-content:center;padding:32px;";
      el.innerHTML = `
        <div style="max-width:980px;width:94%;background:#10161d;color:#d6e1ea;border:1px solid #2a3b4a;border-radius:12px;box-shadow:0 30px 70px rgba(0,0,0,.45);padding:14px 14px 10px 14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;">
            <b>Fehler beim Start</b>
            <button id="boot-error-close" style="background:#182431;color:#cfe6ff;border:1px solid #2a3b4a;border-radius:8px;padding:6px 10px;cursor:pointer">Schließen</button>
          </div>
          <pre id="boot-error-text" style="white-space:pre-wrap;margin:0"></pre>
        </div>`;
      document.body.appendChild(el);
      el.querySelector('#boot-error-close').onclick = ()=> el.remove();
    }
    el.querySelector('#boot-error-text').textContent = msg;
  }

  /* ---------- Topbar-Höhe → CSS-Variable ---------- */
  function setTopbarVar(){
    try{
      const tb = document.getElementById('topbar');
      const h  = tb ? tb.offsetHeight : 56;
      document.documentElement.style.setProperty('--topbar-h', h + 'px');
    }catch{}
  }
  window.addEventListener('load', setTopbarVar, {once:true});
  window.addEventListener('resize', setTopbarVar);

  /* ---------- safe get ---------- */
  const $ = id => document.getElementById(id);

  /* ---------- Haupt-IIFE ---------- */
  (async function boot(){
    try{
      window.__BOOTSTRAP_OK = true;

      // URL-Parameter (?pf=1) → Diagnose-Modus
      const q  = new URLSearchParams(location.search);
      const wantPF = (q.get('pf') === '1') || (location.hash === '#pf');

      // Module SICHER laden (dynamisch!)
      const [engine, reproduction, food] = await Promise.all([
        import('./engine.js'),
        import('./reproduction.js'),
        import('./food.js')
      ]);

      // UI verkabeln (Buttons/Slider können in HTML vorhanden sein, müssen aber „wirken“)
      try{
        $('btnStart') && ($('btnStart').onclick = ()=> engine.start());
        $('btnPause') && ($('btnPause').onclick = ()=> engine.pause());
        $('btnReset') && ($('btnReset').onclick = ()=> engine.reset());

        $('t1')  && ($('t1').onclick  = ()=> engine.setTimescale(1));
        $('t5')  && ($('t5').onclick  = ()=> engine.setTimescale(5));
        $('t10') && ($('t10').onclick = ()=> engine.setTimescale(10));
        $('t50') && ($('t50').onclick = ()=> engine.setTimescale(50));

        $('chkPerf') && ($('chkPerf').onchange = (e)=> engine.setPerfMode(!!e.target.checked));

        $('sliderMutation') && ($('sliderMutation').oninput = (e)=> {
          const v = (+e.target.value)|0;
          try{ reproduction.setMutationRate(v); }catch{}
        });

        $('sliderFood') && ($('sliderFood').oninput = (e)=>{
          const v = (+e.target.value)||0;
          try{ food.setSpawnRate(v); }catch{}
        });

        // Tools (on-demand laden)
        $('btnEditor') && ($('btnEditor').onclick = async ()=>{
          try{ (await import('./editor.js')).openEditor(); }catch(err){ showError('Editor konnte nicht geladen werden:\n'+err); }
        });
        $('btnEnv') && ($('btnEnv').onclick = async ()=>{
          try{ (await import('./environment.js')).openEnvPanel(); }catch(err){ showError('Umwelt-Panel konnte nicht geladen werden:\n'+err); }
        });
        $('btnAppOps') && ($('btnAppOps').onclick = async ()=>{
          try{ (await import('./appops_panel.js')).openAppOps(); }catch(err){ showError('App-Ops konnte nicht geladen werden:\n'+err); }
        });
        $('btnDiag') && ($('btnDiag').onclick = async ()=>{
          try{ (await import('./preflight.js')).diagnose(); }catch(err){ showError('Preflight konnte nicht geladen werden:\n'+err); }
        });
      }catch(wireErr){
        showError('UI-Wiring fehlgeschlagen:\n'+wireErr);
      }

      // initiale Sliderwerte → Module
      try{
        if ($('sliderMutation')) reproduction.setMutationRate( +$('sliderMutation').value | 0 );
        if ($('sliderFood'))     food.setSpawnRate( +$('sliderFood').value || 0 );
      }catch{ /* robust */ }

      // Engine booten
      try{
        engine.boot();
      }catch(e){
        showError('engine.boot() fehlgeschlagen:\n'+e);
        return;
      }

      // Preflight (falls ?pf=1) – sofort Diagnostic öffnen
      if (wantPF){
        try{
          const pf = await import('./preflight.js');
          // Viele Geräte ruckeln, wenn Engine parallel läuft → kurz pausieren
          try{ engine.pause(); }catch{}
          pf.diagnose();
        }catch(err){
          showError('Preflight konnte nicht geladen werden:\n'+err);
        }
      }

    }catch(eTop){
      showError('Bootstrap-Fehler (import/parse):\n'+ (eTop?.message || eTop));
    }
  })();
})();