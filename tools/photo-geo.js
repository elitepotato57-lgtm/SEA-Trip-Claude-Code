// More photos for places that OpenStreetMap doesn't link to Wikipedia or Wikidata: finds the Wikidata item with a photo that has
// the same name and stands at the same spot (within 300 m, or 2 km for big things like beaches, parks and waterfalls), and adds
// its picture to places/photos.json. Same photo rules as the app (temples only when checked, no Buddha file names).
// Run from the repo root after tools/photo-index.js:   node tools/photo-geo.js      (needs signal; a few minutes)
const fs = require("fs"), path = require("path");
const {load} = require("../tests/load");
const A = load();
const UA = {"User-Agent": "SEA-trip-app-build/1.0 (personal travel app)"};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CC = {TH:["Q869", "th"], KH:["Q424", "km"], VN:["Q881", "vi"], LA:["Q819", "lo"], SG:["Q334", "zh"], ID:["Q252", "id"], MY:["Q833", "ms"]};
const BIG = new Set(["beach", "park", "nationalpark", "waterfall", "peak", "cave", "hotspring", "zoo", "themepark", "mall", "market", "airport", "attraction", "historic"]);
const GENERIC = /\b(the|of|and|beach|pantai|bai|hat|haad|had|waterfall|falls?|air terjun|thac|nam tok|national park|park|taman|island|koh|ko|pulau|hon|mount|mt|gunung|nui|doi|phu|cave|goa|gua|hang|tham|museum|muzium|bao tang|market|pasar|cho|talat|station|stasiun|ga|airport|bandara|san bay|hotel|resort|temple|wat|chua|pura)\b/g;
const fold = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();
const core = s => fold(s).replace(GENERIC, " ").replace(/\s+/g, " ").trim();
// what sort of thing a name says it is ("Chợ …" and "… Market" are both a market): two names only match on their other words
// when they say the same sort of thing, so "Pasar Tabanan" (a market) can't take the photo of a statue in Tabanan
const SORTS = {beach:/\b(beach|pantai|bai|hat|haad|had)\b/, falls:/\b(waterfall|falls?|air terjun|thac|nam tok)\b/, park:/\b(national park|park|taman)\b/,
  island:/\b(island|koh|ko|pulau|hon)\b/, hill:/\b(mount|mt|gunung|nui|doi|phu)\b/, cave:/\b(cave|goa|gua|hang|tham)\b/, museum:/\b(museum|muzium|bao tang)\b/,
  market:/\b(market|pasar|cho|talat)\b/, station:/\b(station|stasiun|ga)\b/, airport:/\b(airport|bandara|san bay)\b/, temple:/\b(temple|wat|chua|pura)\b/};
const sorts = s => { const x = fold(s); return Object.keys(SORTS).filter(k => SORTS[k].test(x)).sort().join(","); };
const km = (a, b) => { const r = Math.PI / 180, x = (b.lng - a.lng) * r * Math.cos((a.lat + b.lat) / 2 * r), y = (b.lat - a.lat) * r; return Math.sqrt(x * x + y * y) * 6371; };
async function wikidata(cc){
  const [q, lang] = CC[cc];
  // every country is covered in full now (Indonesia too, since Nov 2026)
  const where = `?i wdt:P17 wd:${q}; wdt:P625 ?c; wdt:P18 ?img.`;
  const sparql = `SELECT ?i ?c ?img ?en ?loc WHERE { ${where} OPTIONAL{?i rdfs:label ?en FILTER(lang(?en)="en")} OPTIONAL{?i rdfs:label ?loc FILTER(lang(?loc)="${lang}")} }`;
  for (let k = 0; k < 5; k++){
    try {
      const r = await fetch("https://query.wikidata.org/sparql", {method:"POST", body:"query=" + encodeURIComponent(sparql), headers:{...UA, "Content-Type":"application/x-www-form-urlencoded", "Accept":"application/sparql-results+json"}});
      if (r.ok){ const j = await r.json(); return j.results.bindings.map(b => { const m = b.c.value.match(/Point\(([-\d.]+) ([-\d.]+)\)/); return m && {q:b.i.value.split("/").pop(), lat:+m[2], lng:+m[1], img:decodeURIComponent(b.img.value.split("/").pop()).replace(/_/g, " "), names:[b.en && b.en.value, b.loc && b.loc.value].filter(Boolean)}; }).filter(Boolean); }
      console.error("  status " + r.status);
    } catch(e){ console.error("  " + e.message); }
    await sleep(8000 * (k + 1));
  }
  throw new Error("Wikidata didn't answer for " + cc);
}
(async () => {
  const file = path.join("places", "photos.json"), out = JSON.parse(fs.readFileSync(file, "utf8"));
  const have = new Set(Object.keys(out.f));
  let added = 0, held = 0;
  for (const d of A.PLACE_DBS){
    const items = await wikidata(d.cc); await sleep(1500);
    // a coarse grid of the items, so each place only looks at the ones near it
    const grid = new Map(), key = (la, ln) => Math.floor(la * 20) + ":" + Math.floor(ln * 20);
    for (const it of items){ it.cores = it.names.map(n => [core(n), sorts(n)]).filter(x => x[0].length >= 3 && x[1]); it.folds = it.names.map(fold); const k = key(it.lat, it.lng); (grid.get(k) || grid.set(k, []).get(k)).push(it); }
    let n = 0;
    for (const g of ["do", "stay", "food", "ess", "move"]){
      const dir = path.join("places", d.dir, g); if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)){
        const t = JSON.parse(fs.readFileSync(path.join(dir, f)));
        for (const r of t.f){
          const p = A.osmPlace(r, t.a, g, d.cc);
          if (!p.n || have.has(p.id) || !A.photoPlaceOk(p)) continue;
          const pn = [p.n, p.nt].filter(Boolean), pf = pn.map(fold), pc = pn.map(n => [core(n), sorts(n)]).filter(x => x[0].length >= 3 && x[1]);
          // places to stay, eat and the essentials: the very same name, right there (a restaurant named after an island isn't the island)
          const strict = g === "stay" || g === "food" || g === "ess";
          const lim = strict ? 0.08 : BIG.has(p.k) ? 2 : 0.3;
          let best = null, bd = 9;
          for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const it of grid.get(key(p.lat + a / 20, p.lng + b / 20)) || []){
            const dd = km(p, it); if (dd > lim || dd >= bd) continue;
            // the same name: exactly, or the same distinctive words once "beach", "wat", "museum" and so on are taken off
            const same = it.folds.some(x => pf.includes(x)) || (!strict && pc.length && it.cores.some(([c, so]) => pc.some(([c2, so2]) => c === c2 && so === so2)));
            if (same){ best = it; bd = dd; }
          }
          if (!best) continue;
          if (!A.photoFileOk(p, best.img)){ held++; continue; }
          out.f[p.id] = best.img; have.add(p.id); added++; n++;
        }
      }
    }
    console.log(`${d.dir}: ${items.length} Wikidata places with photos, ${n} matched to the map`);
  }
  out.built = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(file, JSON.stringify(out));
  console.log(`places/photos.json: ${added} more places with a photo (${held} skipped by the photo rules), ${Object.keys(out.f).length} in all, ${Math.round(fs.statSync(file).size / 1024)} KB`);
})().catch(e => { console.error(e); process.exit(1); });
