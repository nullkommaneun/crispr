// errorManager.js
let banner;

export function initErrorManager() {
  banner = document.getElementById('error-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'error-banner';
    Object.assign(banner.style, {
      position:'fixed', top:'0', left:'0', right:'0', zIndex:'9999',
      padding:'10px 14px', background:'#d9534f', color:'#fff',
      fontFamily:'system-ui, sans-serif', fontSize:'14px', display:'none'
    });
    document.body.appendChild(banner);
  }
}

export function showError(msg) {
  if (!banner) initErrorManager();
  banner.textContent = `⚠️ ${msg}`;
  banner.style.display = 'block';
  console.error(msg);
}

export async function safeImport(path, required = []) {
  try {
    const m = await import(path);
    for (const name of required) {
      if (!(name in m)) throw new Error(`'${path}' exportiert '${name}' nicht.`);
    }
    return m;
  } catch (e) {
    showError(`Import fehlgeschlagen: ${path} — ${e.message}`);
    throw e;
  }
}