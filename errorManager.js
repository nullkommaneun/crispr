export function initErrorManager() {
    window.onerror = (err) => {
        console.error(err);
        // Overlay error message
        const overlay = document.createElement('div');
        overlay.innerText = `Error: ${err}`;
        document.body.appendChild(overlay);
    };
}

export function report(err, ctx) {
    console.error(err, ctx);
}