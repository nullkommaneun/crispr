// grid.js — Uniform-Grid Scaffold (Vorbereitung für schnelle Nachbarschafts-/Food-Queries)
//
// Stufe 1 (Scaffold): Datenstruktur + API, noch ohne produktive Nutzung.
// Stufe 2 (Switch): senseFood / Separation / Pairing rufen queryCircle(...) auf.
//
// createGrid(cellSize, width, height) liefert:
//   - clear():    alle Buckets leeren
//   - insert(x,y, payload): Objekt in passenden Bucket einfügen
//   - queryCircle(x,y,r):   Inhalte der Buckets im Umkreis sammeln (für exakte Distanzprüfung nachgelagert)

export function createGrid(cellSize, width, height){
  const cols = Math.max(1, Math.ceil(width  / cellSize));
  const rows = Math.max(1, Math.ceil(height / cellSize));

  const buckets = new Map();
  const key = (ix,iy) => ix + "," + iy;

  function clear(){ buckets.clear(); }

  function insert(x, y, payload){
    const ix = Math.floor(x / cellSize);
    const iy = Math.floor(y / cellSize);
    const k  = key(ix, iy);
    if(!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(payload);
  }

  function queryCircle(x, y, r){
    const minX = Math.floor((x - r) / cellSize);
    const maxX = Math.floor((x + r) / cellSize);
    const minY = Math.floor((y - r) / cellSize);
    const maxY = Math.floor((y + r) / cellSize);
    const out = [];
    for(let iy=minY; iy<=maxY; iy++){
      for(let ix=minX; ix<=maxX; ix++){
        const k = key(ix, iy);
        const arr = buckets.get(k);
        if(arr) out.push(...arr);
      }
    }
    return out;
  }

  return { cellSize, cols, rows, clear, insert, queryCircle };
}