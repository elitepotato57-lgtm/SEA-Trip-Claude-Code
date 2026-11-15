// Builds places/photos.json: for every place with a Wikipedia or Wikidata link (researched places and OpenStreetMap ones),
// the Wikimedia Commons file of its photo, worked out now instead of on the phone. The phone then asks the image server
// for the picture straight away (no lookup first), which is most of the wait. Same rules as the app: English Wikipedia's
// main picture if it's on Commons and free, otherwise the Wikidata picture; temples only when checked (PHOTO_CHECKED).
// Run from the repo root:  node tools/photo-index.js     (needs signal; a few minutes; re-run after rebuilding places)
const fs = require("fs"), path = require("path");
const {load} = require("../tests/load");
const A = load();
const UA = {"User-Agent": "SEA-trip-app-build/1.0 (personal travel app)"};
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(url, opts = {}){
  for (let i = 0; i < 6; i++){
    try { const r = await fetch(url, {...opts, headers:{...UA, ...(opts.headers || {})}}); if (r.ok) return await r.json(); console.error("  status " + r.status); }
    catch(e){ console.error("  " + e.message); }
    await sleep(3000 * (i + 1));
  }
  throw new Error("gave up on " + url.slice(0, 80));
}
(async () => {
  const places = [];
  A.D.places.forEach(p => { if (p.wp || p.wd) places.push(p); });
  for (const d of A.PLACE_DBS) for (const g of ["stay", "food", "do", "ess", "move"]){
    const dir = path.join("places", d.dir, g); if (!fs.existsSync(dir)) continue;
    const seen = new Set();
    for (const f of fs.readdirSync(dir)){
      const t = JSON.parse(fs.readFileSync(path.join(dir, f)));
      for (const r of t.f){ if (seen.has(r[0])) continue; seen.add(r[0]); const p = A.osmPlace(r, t.a, g, d.cc); if (p.wp || p.wd) places.push(p); }
    }
  }
  const todo = places.filter(p => A.photoPlaceOk(p));
  console.log(`${places.length} places with a photo link, ${todo.length} after the temple rule`);
  // 1. English Wikipedia: the page's main picture, only if it is free and on Commons
  const wpPic = {}, titles = [...new Set(todo.filter(p => p.wp).map(p => String(p.wp).replace(/_/g, " ")))];
  for (let i = 0; i < titles.length; i += 50){
    const batch = titles.slice(i, i + 50);
    const j = await getJSON(`https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages&piprop=thumbnail|name&pithumbsize=500&pilicense=free&titles=${encodeURIComponent(batch.join("|"))}`);
    const q = j.query || {}, map = {}; (q.normalized || []).concat(q.redirects || []).forEach(n => map[n.from] = n.to);
    const byT = {}; Object.values(q.pages || {}).forEach(pg => { if (pg.pageimage && pg.thumbnail && /\/wikipedia\/commons\//.test(pg.thumbnail.source)) byT[pg.title] = pg.pageimage; });
    batch.forEach(t => { let k = t; for (let n = 0; n < 4 && map[k]; n++) k = map[k]; if (byT[k]) wpPic[t] = byT[k]; });
    await sleep(400);
  }
  console.log(`Wikipedia: ${Object.keys(wpPic).length} of ${titles.length} pages have a free Commons picture`);
  // 2. Wikidata: the item's picture (P18), for places Wikipedia didn't answer
  const need = [...new Set(todo.filter(p => p.wd && !(p.wp && wpPic[String(p.wp).replace(/_/g, " ")])).map(p => p.wd).filter(x => /^Q\d+$/.test(x)))];
  const p18 = {};
  for (let i = 0; i < need.length; i += 250){
    const q = `SELECT ?i ?img WHERE { VALUES ?i { ${need.slice(i, i + 250).map(x => "wd:" + x).join(" ")} } ?i wdt:P18 ?img }`;
    const j = await getJSON("https://query.wikidata.org/sparql", {method:"POST", body:"query=" + encodeURIComponent(q), headers:{"Content-Type":"application/x-www-form-urlencoded", "Accept":"application/sparql-results+json"}});
    j.results.bindings.forEach(b => { const id = b.i.value.split("/").pop(); if (!p18[id]) p18[id] = decodeURIComponent(b.img.value.split("/").pop()).replace(/_/g, " "); });
    await sleep(1200);
  }
  console.log(`Wikidata: ${Object.keys(p18).length} of ${need.length} items have a picture`);
  const out = {}; let held = 0;
  for (const p of todo){
    const f = (p.wp && wpPic[String(p.wp).replace(/_/g, " ")]) || (p.wd && p18[p.wd]);
    if (!f) continue;
    const name = String(f).replace(/_/g, " ");
    if (!A.photoFileOk(p, name)){ held++; continue; }
    out[p.id] = name;
  }
  fs.writeFileSync("places/photos.json", JSON.stringify({v:1, built:new Date().toISOString().slice(0, 10), f:out}));
  console.log(`places/photos.json: ${Object.keys(out).length} places with a photo (${held} skipped by the photo rules), ${Math.round(fs.statSync("places/photos.json").size / 1024)} KB`);
})();
