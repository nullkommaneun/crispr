// diag.js — Diagnosefenster (robust gegen fehlende Getter/Module)

import { diagnose as pfDiagnose } from "./preflight.js";

export async function openDiagPanel(){
  try{
    await pfDiagnose();
  }catch(e){
    alert("Diagnose konnte nicht geladen werden:\n"+String(e?.message||e));
  }
}

// OPTIONAL: Falls du irgendwo Mutationswert anzeigen willst:
export async function safeGetMutation(){
  try{
    const m = await import("./reproduction.js");
    if (typeof m.getMutationRate === "function") return m.getMutationRate();
  }catch{}
  return null; // robust: kein harter Fail
}