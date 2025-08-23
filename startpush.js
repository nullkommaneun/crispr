// startpush.js — sanfter Start-Push (optional)
// Delegiert, wenn reproduction.scheduleStartPush existiert; sonst no-op.

export async function scheduleStartPush(opts){
  try{
    const repro = await import("./reproduction.js");
    if (typeof repro.scheduleStartPush === "function"){
      repro.scheduleStartPush(opts || { perParent:5, interval:0.75 });
    }
  }catch{
    // robust no-op
  }
}