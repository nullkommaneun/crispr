export function initErrorManager() {
    window.onerror = (msg, url, line) => {
        console.error(`Error: ${msg} at ${url}:${line}`);
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '50%';
        overlay.style.left = '50%';
        overlay.style.background = 'red';
        overlay.style.padding = '10px';
        overlay.innerText = `Error: ${msg}`;
        document.body.appendChild(overlay);
    };
}

export function report(err, ctx) {
    console.error(err, ctx);
}