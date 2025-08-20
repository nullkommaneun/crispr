// errorManager.js – erweiterter Runtime-Diagnoser mit "Crash Capsule"
import { emit } from "./event.js";

let overlay, textEl, closeBtn, actionsEl;
let cfg = {
  pauseOnError: true,
  captureConsole: true,
  storeLocal: true,
  maxBreadcrumbs: 50,
  dedupeWindowMs: 2000,
  snapshot: null,           // <- Engine liefert hier eine Funktion zurück (State-Snapshot)
};

const breadcrumbs = [];      // {t, tag, data}
let lastSig = { key: "", t: 0, count: 0 };

/* ---------- Utils ---------- */
const nowStr = ()=> `[${new Date().toTimeString().slice(0,8)}]`;
function pushBreadcrumb(tag, data){
  const entry = { t: performance.now(), tag, data };
  breadcrumbs.push(entry);
  if(breadcrumbs.length > cfg.maxBreadcrumbs) breadcrumbs.shift();
  if(cfg.storeLocal){
    try{ localStorage.setItem("dbg_breadcrumbs", JSON.stringify(breadcrumbs.slice(-cfg.maxBreadcrumbs))); }catch{}
  }
}
function instrumentClicks(){
  document.addEventListener("click", (e)=>{
    const t = e.target;
    let label = t?.getAttribute?.("aria-label") || t?.textContent || t?.id || t?.className || t?.nodeName;
    pushBreadcrumb("ui:click", String(label||"").trim().slice(0,120));
  }, { capture:true });
}
function instrumentConsole(){
  if(!cfg.captureConsole) return;
  const orig = console.error;
  console.error = (...args)=>{
    pushBreadcrumb("console.error", args.map(a=>String(a)).join(" ").slice(0,300));
    try{ orig.apply(console, args); }catch{}
  };
}

function ensureDom(){
  overlay = document.getElementById("errorOverlay");
  textEl  = document.getElementById("errorText");
  closeBtn= document.getElementById("errorClose");
  if(!overlay || !textEl || !closeBtn){
    overlay = document.createElement("div");
    overlay.id="errorOverlay";
    overlay.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;z-index:4000";
    const card=document.createElement("div");
    card.className="errorCard";
    card.style.cssText="max-width:680px;margin:8vh auto;background:#151b22;border:1px solid #2f3d48;border-radius:10px;padding:16px;color:#fff;font:14px system-ui";
    const h=document.createElement("h3"); h.textContent="Fehler";
    textEl=document.createElement("pre"); textEl.id="errorText"; textEl.style.whiteSpace="pre-wrap";
    closeBtn=document.createElement("button"); closeBtn.id="errorClose"; closeBtn.textContent="Schließen";
    closeBtn.style.cssText="margin-top:8px;background:#23313b;border:1px solid #3a4c5a;color:#d8f0ff;border-radius:8px;padding:6px 10px;cursor:pointer";
    card.append(h,textEl,closeBtn);
    overlay.append(card);
    document.body.append(overlay);
  }
  const card = overlay.querySelector(".errorCard") || overlay.firstElementChild;
  actionsEl = document.createElement("div");
  actionsEl.style.cssText="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px";
  const mkBtn=(label,cb)=>{ const b=document.createElement("button"); b.textContent=label;
    b.style.cssText="background:#15222c;border:1px solid #2a3c4a;color:#d8f0ff;border-radius:8px;padding:6px 10px;cursor:pointer"; b.onclick=cb; return b; };

  // Buttons
  const btnCopyDetails = mkBtn("Details kopieren", async ()=>{
    try{ await navigator.clipboard.writeText(textEl.textContent||""); btnCopyDetails.textContent="Kopiert ✓"; setTimeout(()=>btnCopyDetails.textContent="Details kopieren", 1400);}catch{}
  });
  const btnCopyCode = mkBtn("Fehler-Code kopieren", async ()=>{
    const code = buildCrashCode(lastShownError.err, lastShownError.ctx);
    try{ await navigator.clipboard.writeText(code); btnCopyCode.textContent="Code kopiert ✓"; setTimeout(()=>btnCopyCode.textContent="Fehler-Code kopieren", 1400);}catch{}
  });
  const btnReload = mkBtn("Neu laden", ()=> location.reload());
  const btnResume = mkBtn("Weiterlaufen", ()=>{
    overlay.classList.add("hidden"); overlay.style.display="none";
    emit("error:resume", {});
  });
  actionsEl.append(btnCopyDetails, btnCopyCode, btnReload, btnResume);
  card.append(actionsEl);

  closeBtn.onclick = ()=>{
    overlay.classList.add("hidden");
    overlay.style.display="none";
  };
}

function buildReport(err, ctx={}){
  const ua = navigator.userAgent;
  const href = location.href;
  const message = (err && (err.message || err.toString())) || String(err);
  const stack = (err && err.stack) ? String(err.stack) : "(kein Stack verfügbar)";
  const ctxStr = ctx && Object.keys(ctx).length ? JSON.stringify(ctx, null, 2) : "(kein Kontext)";

  const tail = breadcrumbs.slice(-10).map((b,i)=>{
    const dt = (performance.now() - b.t).toFixed(0);
    return `#${breadcrumbs.length-10+i+1}  -${dt}ms  ${b.tag}  ${typeof b.data==="string"?b.data:JSON.stringify(b.data)}`;
  }).join("\n");

  return `${nowStr()} ${ctx.where || "runtime"}

${message}

Stack:
${stack}

Kontext:
${ctxStr}

Breadcrumbs (letzte ${Math.min(10, breadcrumbs.length)}):
${tail || "(leer)"}

URL: ${href}
UA:  ${ua}
`;
}

function shouldDedupe(sigKey){
  const t = performance.now();
  if(sigKey === lastSig.key && (t - lastSig.t) < cfg.dedupeWindowMs){
    lastSig.count++;
    return true;
  }
  lastSig = { key: sigKey, t, count: 1 };
  return false;
}

/* ---------- Crash Capsule (MDC) ---------- */
function roundNum(n){ return Math.abs(n) < 1e-6 ? 0 : Math.round(n*100)/100; }
function encode64(str){
  // UTF-8 → b64
  return btoa(unescape(encodeURIComponent(str)));
}
function decode64(b64){
  return decodeURIComponent(escape(atob(b64)));
}
// CRC32 (kompakt)
function crc32(str){
  let c=~0; for(let i=0;i<str.length;i++){
    c ^= str.charCodeAt(i);
    for(let k=0;k<8;k++) c = (c>>>1) ^ (0xEDB88320 & (-(c&1)));
  } return (~c>>>0);
}

// letzte Anzeige merken (für Code-Button)
let lastShownError = { err: null, ctx: null };

function buildCrashObj(err, ctx={}){
  // kompakter Replacer
  const replacer = (k,v)=>{
    if(typeof v === "number") return roundNum(v);
    return v;
  };

  // Snapshot (optional; engine liefert Funktion)
  let snap = null;
  try{ if(typeof cfg.snapshot === "function") snap = cfg.snapshot(); }catch{}

  // begrenzen (Snap darf nicht eskalieren)
  if(snap){
    // optional: weitere Kürzungen hier, falls notwendig
  }

  const obj = {
    v: 1,                                     // Schema-Version
    ts: Date.now(),
    where: ctx.where || "runtime",
    msg: (err && (err.message || String(err))) || String(err),
    stack: (err && err.stack) ? String(err.stack) : null,
    url: location.href,
    ua: navigator.userAgent,
    build: (window.__BUILD_ID || null),
    bc: breadcrumbs.slice(-20).map(b=>({t:roundNum(performance.now()-b.t), tag:b.tag, data:b.data})),
    snap
  };
  return JSON.parse(JSON.stringify(obj, replacer));
}

function buildCrashCode(err, ctx={}){
  const obj = buildCrashObj(err, ctx);
  const json = JSON.stringify(obj);
  const b64  = encode64(json);
  const crc  = crc32(json).toString(16).padStart(8,"0");
  return `MDC1-${crc}-${b64}`;
}

// Globaler Decoder (für Tests / Support)
window.debug_decode = function(code){
  try{
    const m = String(code||"").trim().match(/^MDC1-([0-9a-fA-F]{8})-(.+)$/);
    if(!m) return console.warn("MDC: ungültiges Format");
    const [, crcHex, b64] = m;
    const json = decode64(b64);
    const crc2 = crc32(json).toString(16).padStart(8,"0");
    if(crcHex.toLowerCase() !== crc2.toLowerCase()) console.warn("MDC: CRC stimmt nicht!");
    const obj = JSON.parse(json);
    console.log("MDC decode →", obj);
    return obj;
  }catch(e){ console.error("MDC decode Fehler", e); }
};

/* ---------- Public API ---------- */
export function initErrorManager(options={}){
  cfg = { ...cfg, ...options };
  ensureDom();
  instrumentClicks();
  instrumentConsole();

  window.addEventListener("error", (e)=>{
    report(e.error || e.message, { where: "window.onerror" });
  });
  window.addEventListener("unhandledrejection", (e)=>{
    report(e.reason || "Unhandled Promise rejection", { where: "promise" });
  });

  pushBreadcrumb("app:init", { ts: Date.now() });
}

export function report(err, ctx={}){
  try{
    ensureDom();
    const message = (err && (err.message || String(err))) || String(err);
    const firstLine = (message.split("\n")[0] || "").slice(0,140);
    const signature = `${ctx.where || "?"}::${firstLine}`;
    if(shouldDedupe(signature)) return;

    lastShownError = { err, ctx };

    const txt = buildReport(err, ctx);
    textEl.textContent = txt;
    overlay.classList.remove("hidden");
    overlay.style.display = "block";

    if(cfg.storeLocal){
      try{
        const log = JSON.parse(localStorage.getItem("dbg_errors")||"[]");
        log.push({ t: Date.now(), ctx, message, stack: err?.stack || null });
        while(log.length>20) log.shift();
        localStorage.setItem("dbg_errors", JSON.stringify(log));
      }catch{}
    }

    if(cfg.pauseOnError){
      emit("error:panic", { err, ctx, time: performance.now() });
    }
  }catch(e){
    console.warn("errorManager.report failed", e);
  }
}

/** Breadcrumb-API */
export function breadcrumb(tag, data){ pushBreadcrumb(tag, data); }

/** Guard-Wrapper */
export function guard(fn, ctxWhere="guard"){
  return (...args)=>{
    try{
      const r = fn(...args);
      if(r && typeof r.then==="function") return r.catch(e=>report(e,{ where: ctxWhere }));
      return r;
    }catch(e){
      report(e, { where: ctxWhere });
    }
  };
}