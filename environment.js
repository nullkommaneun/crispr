// environment.js — robuste Mini-Panel-Version (verhindert 404/Parse-Fehler)
export function openEnvPanel(){
  try{
    let w = document.getElementById("env-overlay");
    if (!w){
      w = document.createElement("div");
      w.id = "env-overlay";
      w.style.cssText="position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;";
      const card = document.createElement("div");
      card.style.cssText="min-width:280px;max-width:420px;background:#10161d;border:1px solid #2a3b4a;border-radius:12px;color:#d6e1ea;padding:14px;";
      card.innerHTML = `
        <h3 style="margin:0 0 8px 0;">Umwelt</h3>
        <div class="muted">Platzhalter-Panel — kann später erweitert werden.</div>
        <div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end;">
          <button id="envClose" class="ghost">Schließen</button>
        </div>`;
      w.appendChild(card);
      document.body.appendChild(w);
      card.querySelector("#envClose").onclick = ()=> w.remove();
    }
  }catch{}
}