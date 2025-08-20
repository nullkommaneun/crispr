import { getEnvState, setEnvState } from "../environment.js";

const el = document.getElementById("envPanel");

function row(label, input){
  const div=document.createElement("div");
  div.className="row";
  const l=document.createElement("span"); l.textContent=label;
  div.append(l,input);
  return div;
}
function slider(min,max,step,val,on){
  const i=document.createElement("input");
  i.type="range"; i.min=min; i.max=max; i.step=step; i.value=val;
  i.oninput=()=>on(parseFloat(i.value));
  return i;
}
function checkbox(checked,on){
  const i=document.createElement("input");
  i.type="checkbox"; i.checked=checked;
  i.oninput=()=>on(i.checked);
  return i;
}

export function openEnvPanel(){
  el.innerHTML="";
  el.classList.remove("hidden");
  const h=document.createElement("h2"); h.textContent="Umwelt";
  el.append(h);

  const current = getEnvState();

  for(const key of ["acid","barb","fence","nano"]){
    const box=document.createElement("div");
    box.style.border="1px solid #22303a"; box.style.padding="8px"; box.style.borderRadius="8px"; box.style.margin="8px 0";
    const title=document.createElement("div");
    title.innerHTML = `<b>${key.toUpperCase()}</b> <span class="badge">${current[key].enabled ? "aktiv" : "aus"}</span>`;
    box.append(title);

    // enabled
    box.append(row("aktiv", checkbox(current[key].enabled, v=>{
      const n = getEnvState(); n[key].enabled=v; setEnvState(n); title.querySelector(".badge").textContent=v?"aktiv":"aus";
    })));

    // parameters
    for(const p of Object.keys(current[key])){
      if(p==="enabled") continue;
      const val=current[key][p];
      const [min,max,step] = (()=>{
        if(p==="range") return [10,120,1];
        if(p==="dps") return [0,30,0.5];
        if(p==="impulse") return [0,400,10];
        if(p==="period") return [0.5,5,0.1];
        return [0,100,1];
      })();
      box.append(row(`${p}`, slider(min,max,step,val, v=>{
        const n=getEnvState(); n[key][p]=v; setEnvState(n);
      })));
    }
    el.append(box);
  }

  const close=document.createElement("button");
  close.textContent="Schließen";
  close.onclick=()=>el.classList.add("hidden");
  el.append(close);
}
export function closeEnvPanel(){ el.classList.add("hidden"); }