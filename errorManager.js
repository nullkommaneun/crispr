// errorManager.js — robustes Fehler-Overlay ohne Button-Duplikate
let breadcrumbs = [];

export function breadcrumb(tag, data){
  try{
    breadcrumbs.push({ t: performance.now(), tag, data });
    if (breadcrumbs.length > 50) breadcrumbs.shift();
  }catch{}
}

export function initErrorManager({ pauseOnError=true, captureConsole=true }={}){
  const ol = ensureOverlay();

  window.addEventListener("error", (e)=>{
    try{
      showError(formatError("promise", e?.error || e?.message || e));
      if(pauseOnError) window.dispatchEvent(new CustomEvent("error:panic"));
    }catch{}
  });
  window.addEventListener("unhandledrejection", (e)=>{
    try{
      showError(formatError("promise", e?.reason || e));
      if(pauseOnError) window.dispatchEvent(new CustomEvent("error:panic"));
    }catch{}
  });

  if (captureConsole){
    const orig = console.error;
    console.error = function(...args){
      try{ showError(formatError("console.error", args[0])); }catch{}
      return orig.apply(console, args);
    };
  }

  // Close → optional resume
  ol.querySelector("#errClose").onclick = ()=>{
    hideOverlay();
    if(pauseOnError) window.dispatchEvent(new CustomEvent("error:resume"));
  };
}

export function report(err, ctx){
  showError(formatError("report", err, ctx));
}

function formatError(where, err, ctx){
  const ts = new Date().toTimeString().slice(0,8);
  const msg = (err && err.message) ? err.message : String(err);
  const stack = (err && err.stack) ? String(err.stack) : "(kein Stack verfügbar)";
  return {
    title: "Fehler",
    text:
`[${ts}] ${where}

${msg}

Stack:
${stack}

Kontext:
${JSON.stringify(ctx || { where }, null, 2)}

Breadcrumbs (letzte ${Math.min(10, breadcrumbs.length)}):
${breadcrumbs.slice(-10).map((b,i)=>`#${i-breadcrumbs.length}  ${Math.round(b.t - breadcrumbs[0].t)}ms  ${b.tag}  ${JSON.stringify(b.data)}`).join("\n")}
`
  };
}

/* ---------- Overlay ---------- */
function ensureOverlay(){
  let el = document.getElementById("errorOverlay");
  if (el) {
    // ensure structure
    if (!el.querySelector("#errTitle")){
      el.innerHTML = overlayMarkup();
      wireOverlay(el);
    }
    return el;
  }
  el = document.createElement("div");
  el.id = "errorOverlay";
  el.className = "hidden";
  el.innerHTML = overlayMarkup();
  document.body.appendChild(el);
  wireOverlay(el);
  return el;
}

function overlayMarkup(){
  return `
    <div class="errorCard" style="max-width:840px;margin:8vh auto;background:#1a232b;border:1px solid #33414c;border-radius:12px;padding:16px;box-shadow:0 12px 30px rgba(0,0,0,.4)">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <h3 id="errTitle" style="margin:0;font-size:18px">Fehler</h3>
        <button id="errClose" style="background:#23313b;border:1px solid #3a4c5a;color:#d8f0ff;border-radius:8px;padding:6px 10px;cursor:pointer">Schließen</button>
      </div>
      <pre id="errorText" style="margin-top:8px;white-space:pre-wrap;color:#d1e7ff"></pre>
      <div id="errActions" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px"></div>
    </div>
  `;
}

function wireOverlay(el){
  // actions werden bei showError jedes Mal neu aufgebaut
  const closeBtn = el.querySelector("#errClose");
  closeBtn.onclick = hideOverlay;
}

function showError(obj){
  const el = ensureOverlay();
  el.classList.remove("hidden");
  el.style.display = "block";
  el.querySelector("#errorText").textContent = obj.text || String(obj);

  // Buttons **einmal pro Anzeige** bauen (vorher leeren)
  const bar = el.querySelector("#errActions");
  bar.innerHTML = ""; // ← verhindert Duplikate

  const mkBtn = (label, fn)=>{
    const b=document.createElement("button");
    b.textContent=label;
    b.style.cssText="background:#23313b;border:1px solid #3a4c5a;color:#d8f0ff;border-radius:8px;padding:6px 10px;cursor:pointer";
    b.onclick=fn; bar.appendChild(b);
  };

  mkBtn("Details kopieren", async()=>{
    try{ await navigator.clipboard.writeText(obj.text||""); }catch{}
  });
  mkBtn("Fehler-Code kopieren", async()=>{
    try{
      const payload = {
        where:"promise",
        msg: (obj.text||"").split("\n")[2] || obj.text || "",
        url: location.href,
        ua: navigator.userAgent,
        bc: breadcrumbs.slice(-6)
      };
      const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
      await navigator.clipboard.writeText(`MDC1-${Math.random().toString(16).slice(2)}-${b64}`);
    }catch{}
  });
  mkBtn("Neu laden", ()=> location.search = `?ts=${Date.now()}`);
  mkBtn("Weiterlaufen", ()=> hideOverlay());
}

function hideOverlay(){
  const el=document.getElementById("errorOverlay");
  if(!el) return;
  el.classList.add("hidden");
  el.style.display="none";
}