import { on } from "../event.js";
import { getStammCounts } from "../entities.js";

const panel = document.getElementById("dailyPanel");
let stories = [];
let lastFlush = 0;

function addStory(kind, text){
  stories.push({ kind, text, t: performance.now() });
  // throttle: max alle 2s UI push
  if(performance.now() - lastFlush > 2000) render();
}
function storyHTML(s){
  const d=document.createElement("div"); d.className="story";
  d.innerHTML = `<div class="time">${new Date().toLocaleTimeString()}</div><div>${s.text}</div>`;
  return d;
}
function render(){
  panel.innerHTML="";
  panel.classList.remove("hidden");
  const h=document.createElement("h2"); h.textContent="DNA Daily";
  panel.append(h);
  if(stories.length===0){
    const p=document.createElement("div"); p.className="muted"; p.textContent="Keine Meldungen.";
    panel.append(p);
  }else{
    for(const s of stories.slice(-60)){ panel.append(storyHTML(s)); }
  }
  const cnts = getStammCounts();
  const foot=document.createElement("div");
  foot.style.marginTop="8px"; foot.innerHTML = `<span class="badge">Stämme: ${Object.keys(cnts).length}</span>`;
  panel.append(foot);

  const close=document.createElement("button");
  close.textContent="Schließen";
  close.onclick=()=>panel.classList.add("hidden");
  panel.append(close);

  lastFlush = performance.now();
}

export function initNarrative(){
  on("env:changed", (e)=> addStory("env", `Umwelt geändert: ${Object.keys(e).filter(k=>e[k].enabled).join(", ")||"alles aus"}`));
  on("cells:born", (c)=> addStory("birth", `Geburt: ${c.name} (Stamm ${c.stammId})`));
  on("cells:died", (c)=> addStory("death", `Tod: ${c.name} (Alter ${c.age.toFixed(0)}s)`));
  on("food:crisis", (d)=> addStory("food", `Nahrungsengpass (${d.available} verfügbar)`));
}
export function openDaily(){ render(); }
export function closeDaily(){ panel.classList.add("hidden"); }
export function pushStory(evt){ addStory("custom", evt); }