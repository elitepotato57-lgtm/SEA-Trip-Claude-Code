// More photos, free (Dylan, 24 Nov 2026: "Boozas has no photos, beaches one in four, hiking three"). For places with no photo
// yet in the cities we're likely to visit in Thailand, Cambodia and Vietnam (the Wikivoyage researched places, and map places
// of the kinds people look at: beaches, waterfalls, viewpoints, peaks, parks, sights, museums, markets, bars and clubs), it asks
// Wikimedia Commons for the photos taken within 250 m and keeps one whose title names the place (every distinctive word of
// its name), so it's that place's own photo, never a "typical" one. The app's photo rules still apply on the phone (no temples
// unless checked, no file mentioning a Buddha). Writes places/photos-near.json {id: Commons file}; tools/photo-index.js output
// (places/photos.json) is then extended with it by:  node tools/photo-near.js --merge
//   node tools/photo-near.js            (needs signal; about half an hour)
const fs = require("fs"), path = require("path"), {execFile} = require("child_process");
const {load} = require("../tests/load");
const A = load();
const ROOT = path.join(__dirname, ".."), OUT = path.join(ROOT, "places", "photos-near.json");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get1 = url => new Promise((res, rej) => execFile("curl", ["-sfL", "-m", "40", "-A", "SEA-trip-app research tool (github.com/elitepotato57-lgtm/SEA-Trip-Claude-Code)", url],
  {maxBuffer:16 << 20}, (e, out) => e ? rej(e) : res(out)));
async function getJSON(url){ for (let k = 0; k < 5; k++){ try { return JSON.parse(await get1(url)); } catch(e){ await sleep(3000 * (k + 1)); } } return null; }
const fold = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// words that don't make a name distinctive on their own
const COMMON = new Set("the a an of and at in on by beach bay bar pub club cafe coffee restaurant hostel hotel resort market night temple wat park view viewpoint point waterfall falls mountain hill peak island koh ko lake river cave museum garden street road soi thanon square house home shop food city town old new big small north south east west central".split(" "));
const words = n => fold(n).split(" ").filter(w => w.length >= 3 && !COMMON.has(w));
const KINDS = new Set(["beach", "waterfall", "viewpoint", "peak", "park", "attraction", "museum", "market", "bar", "club", "nightlife", "cave", "hotspring", "zoo", "themepark", "historic", "culture"]);
const CITIES = {
  TH: [[13.7563, 100.5018, 25], [18.7883, 98.9853, 20], [19.3583, 98.4404, 15], [19.9105, 99.8406, 15], [7.88, 98.35, 25], [8.05, 98.85, 20], [7.74, 98.778, 8],
    [7.62, 99.08, 15], [9.51, 100.01, 18], [9.73, 100.02, 15], [10.096, 99.84, 8], [12.57, 99.96, 12], [12.92, 100.88, 15], [14.35, 100.57, 10], [14.02, 99.53, 15],
    [17.01, 99.82, 10], [12.06, 102.33, 12], [8.91, 98.53, 15], [6.49, 99.31, 6]],
  KH: [[11.5564, 104.9282, 15], [13.3633, 103.856, 15], [10.6104, 104.181, 12], [10.4829, 104.3167, 8], [10.6253, 103.5234, 12], [10.7146, 103.2401, 12], [13.0957, 103.2022, 10]],
  VN: [[21.0285, 105.8542, 15], [10.7769, 106.7009, 15], [15.8801, 108.338, 10], [16.0544, 108.2022, 15], [16.4637, 107.5909, 12], [12.2388, 109.1967, 12],
    [11.9404, 108.4583, 12], [20.2506, 105.9745, 15], [22.3364, 103.8438, 12], [20.9599, 107.0425, 20], [20.7268, 107.0478, 10], [10.9333, 108.2833, 12], [10.2899, 103.984, 25]]
};
const nearCity = (cc, p) => (CITIES[cc] || []).some(([lat, lng, r]) => A.dist({lat, lng}, p) <= r);

(async () => {
  if (process.argv.includes("--merge")){
    const pf = path.join(ROOT, "places", "photos.json"), j = JSON.parse(fs.readFileSync(pf, "utf8")), near = JSON.parse(fs.readFileSync(OUT, "utf8"));
    let n = 0; for (const [id, f] of Object.entries(near.f)) if (!j.f[id]){ j.f[id] = f; n++; }
    fs.writeFileSync(pf, JSON.stringify(j)); console.log(`photos.json: ${n} photos added (${Object.keys(j.f).length} in all)`); return;
  }
  const have = JSON.parse(fs.readFileSync(path.join(ROOT, "places", "photos.json"), "utf8")).f;
  const todo = [];
  // the Wikivoyage researched places without a photo of their own
  for (const cc of ["th", "kh", "vn"]){
    const f = path.join(ROOT, "places", "research", cc + ".json"); if (!fs.existsSync(f)) continue;
    for (const p of JSON.parse(fs.readFileSync(f, "utf8")).places) if (!p.img && !have[p.id] && !/Temples/.test((p.t || []).join())) todo.push(p);
  }
  // map places of the kinds people look at, near those cities
  for (const d of A.PLACE_DBS) if (CITIES[d.cc]) for (const g of ["do", "food"]){
    const dir = path.join(ROOT, "places", d.dir, g); if (!fs.existsSync(dir)) continue;
    const seen = new Set();
    for (const f of fs.readdirSync(dir)){
      const t = JSON.parse(fs.readFileSync(path.join(dir, f)));
      for (const r of t.f){ if (seen.has(r[0])) continue; seen.add(r[0]);
        const p = A.osmPlace(r, t.a, g, d.cc);
        if (have[p.id] || !(KINDS.has(p.k) || (g === "food" && p.k === "market")) || !A.photoPlaceOk(p) || !words(p.n).length || !nearCity(d.cc, p)) continue;
        todo.push(p);
      }
    }
  }
  console.log(`${todo.length} places to look for a photo of`);
  const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {f:{}, tried:{}};
  let found = 0, k = 0;
  for (const p of todo){
    k++; if (out.tried[p.id]) continue;
    const w = words(p.n); if (!w.length){ out.tried[p.id] = 1; continue; }
    const j = await getJSON(`https://commons.wikimedia.org/w/api.php?action=query&list=geosearch&gscoord=${p.lat}%7C${p.lng}&gsradius=250&gsnamespace=6&gslimit=60&format=json`);
    out.tried[p.id] = 1;
    const files = ((j && j.query && j.query.geosearch) || []).map(x => x.title.replace(/^File:/, "")).filter(t => /\.(jpe?g|png|webp)$/i.test(t) && !/buddha|map|plan|logo|diagram|sign\b/i.test(t));
    const hit = files.find(t => { const ft = " " + fold(t.replace(/\.\w+$/, "")) + " "; return w.every(x => ft.includes(" " + x + " ")); });
    if (hit){ out.f[p.id] = hit; found++; }
    if (k % 50 === 0){ fs.writeFileSync(OUT, JSON.stringify(out)); console.log(`  ${k}/${todo.length}, ${found} photos found`); }
    await sleep(120);
  }
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`done: ${Object.keys(out.f).length} photos (${found} new this run)`);
})();
