// errorManager.js
// Zentrales Fehler-/Status-Banner und sichere Modul-Imports.
// API: bannerError, bannerWarn, bannerInfo, hideBanner, showBanner,
//      assertModule, safeImport, guard, setBannerHost

let host, box;

function ensureHost() {
  if (host) return;
  host = document.createElement('div');
  host.id = 'err-banner-host';
  host.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:99999;pointer-events:none';
  document.body.appendChild(host);

  box = document.createElement('div');
  host.appendChild(box);
  hideBanner();
}

function paint(kind, msg, details) {
  ensureHost();
  const bg =
    kind === 'error' ? '#c54a4a' :
    kind === 'warn'  ? '#ce9b2f' :
                       '#2f6bb2';
  box.style.cssText = `
    margin:0; padding:10px 14px;
    font:600 14px/1.35 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    color:#000; background:${bg}; opacity:.95;
    box-shadow:0 2px 10px rgba(0,0,0,.25);
    border-bottom:1px solid rgba(0,0,0,.25);
    pointer-events:auto; display:block;
  `;
  box.textContent = msg + (details ? ` — ${details}` : '');
}

export function bannerError(msg, details){ paint('error', `⚠️ ${msg}`, details); }
export function bannerWarn (msg, details){ paint('warn',  `⚠️ ${msg}`, details); }
export function bannerInfo (msg, details){ paint('info',  `ℹ️ ${msg}`, details); }

export function hideBanner(){ ensureHost(); box.style.display='none'; }
export function showBanner(){ ensureHost(); box.style.display='block'; }

/**
 * Verifiziert ein dynamisch geladenes Modul und (optional) notwendige Exporte.
 */
export function assertModule(mod, label='(unknown module)', requiredExports=[]) {
  if (!mod) {
    bannerError(`Module konnten nicht geladen werden: ${label}`,
      'Pfad/Dateinamen prüfen (Groß/Kleinschreibung, GitHub Pages Cache).');
    throw new Error(`assertModule: ${label} is null/undefined`);
  }
  if (requiredExports && requiredExports.length) {
    const missing = requiredExports.filter(k => !(k in mod));
    if (missing.length) {
      bannerError(`Import fehlgeschlagen: ${label}`, `Es fehlen Exporte: ${missing.join(', ')}`);
      throw new Error(`assertModule: missing exports [${missing.join(', ')}] in ${label}`);
    }
  }
  return true;
}

/**
 * Sicheres dynamisches Importen mit Banner-Fehlerbildschirm.
 */
export async function safeImport(path, label=path, requiredExports=[]) {
  try {
    const m = await import(path);
    assertModule(m, label, requiredExports);
    return m;
  } catch (e) {
    bannerError(`Import fehlgeschlagen: ${label}`, e?.message ?? String(e));
    console.error(`[errorManager] safeImport(${label})`, e);
    throw e;
  }
}

/** Guard: führt fn aus und zeigt Banner bei Fehlern (bricht UI nicht ab). */
export function guard(fn, label='guarded block') {
  try { return fn(); }
  catch(e) {
    bannerError(`Laufzeitfehler in ${label}`, e?.message ?? String(e));
    console.error(`[errorManager] ${label}`, e);
    return undefined;
  }
}

/** Optional: Banner in anderen Container einhängen. */
export function setBannerHost(element){
  if (!element) return;
  ensureHost();
  host.remove();
  element.appendChild(host);
}

// Optionaler Default-Export (falls irgendwo default import benutzt wurde)
const ErrorManager = {
  bannerError, bannerWarn, bannerInfo, hideBanner, showBanner,
  assertModule, safeImport, guard, setBannerHost
};
export default ErrorManager;