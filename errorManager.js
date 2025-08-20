// errorManager.js
let banner;
function showBanner(msg, detail='') {
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'err-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#c0392b;color:#fff;font:600 14px system-ui;padding:10px 14px;';
    document.body.appendChild(banner);
  }
  banner.textContent = `⚠️ ${msg}` + (detail ? ` — ${detail}` : '');
}

function parseImportMessage(message='') {
  // Beispiele:
  // "Importing binding name 'Advisor' is not found."
  // "Failed to fetch dynamically imported module: ..."
  const m = message.match(/Importing binding name '(.+?)' is not found/);
  if (m) {
    const name = m[1];
    return `Benannter Export „${name}“ wurde nicht gefunden. Prüfe:
- Existiert der Export in der Quelldatei (export const ${name} = … / export { ${name} })?
- Oder wird ein Default-Export irrtümlich als benannter importiert?  -> „import X from '…'“ statt „import { ${name} } …“`;
  }
  return '';
}

export function initErrorManager() {
  window.addEventListener('error', (ev) => {
    const friendly = parseImportMessage(ev.message);
    if (friendly) showBanner('Module-Import fehlgeschlagen', friendly);
  });

  window.addEventListener('unhandledrejection', (ev) => {
    const msg = String(ev.reason?.message || ev.reason || '');
    const friendly = parseImportMessage(msg);
    if (friendly) showBanner('Module-Import fehlgeschlagen', friendly);
  });
}