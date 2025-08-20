import { emit } from "./event.js";

let overlay, text, closeBtn;
export function initErrorManager(){
  overlay = document.getElementById("errorOverlay");
  text = document.getElementById("errorText");
  closeBtn = document.getElementById("errorClose");
  closeBtn.onclick = () => overlay.classList.add("hidden");

  window.addEventListener("error", (e)=>{
    report(e.error || e.message, { where: "window.onerror" });
  });
  window.addEventListener("unhandledrejection",(e)=>{
    report(e.reason || "Unhandled Promise rejection", { where:"promise" });
  });
}
export function report(err, ctx={}){
  console.error("ERROR", ctx, err);
  if(text){
    const msg = (err && err.stack) ? err.stack : String(err);
    text.textContent = `[${new Date().toLocaleTimeString()}] ${ctx.where||"runtime"}\n\n${msg}`;
    overlay.classList.remove("hidden");
  }
  emit("error", { err, ctx, time: performance.now() });
}