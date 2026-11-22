// Adds two things to the built places databases (places/th, places/kh) without rebuilding them:
//   - luggage lockers and left-luggage desks (OpenStreetMap amenity=luggage_locker / left_luggage) into Essentials
//   - "gf" (gluten-free: 1 = options, 2 = only) on food places tagged diet:gluten_free
// It asks the free Overpass API for just those tags, so it's a few seconds, not a full rebuild.
// extract.py now does both itself, so a full rebuild keeps them; this is only for folders built before that.
//   node tools/osm/add-extras.js            (needs signal)
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..", "places");
// places/id was rebuilt for the whole country in Nov 2026 by extract.py, which keeps both already: don't add them again
const DBS = [{dir:"th", area:'area["ISO3166-1"="TH"][admin_level=2]'}, {dir:"kh", area:'area["ISO3166-1"="KH"][admin_level=2]'}];
const lng2tile = (lng, z) => Math.floor((lng + 180) / 360 * 2 ** z);
const lat2tile = (lat, z) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); };
const readJ = f => JSON.parse(fs.readFileSync(f, "utf8"));
const writeJ = (f, v) => fs.writeFileSync(f, JSON.stringify(v));

async function overpass(q){
  for (const url of ["https://overpass-api.de/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.private.coffee/api/interpreter",
                     "https://overpass-api.de/api/interpreter", "https://overpass-api.de/api/interpreter"]){
    try {
      const r = await fetch(url, {method:"POST", body:"data=" + encodeURIComponent(q), headers:{"Content-Type":"application/x-www-form-urlencoded", "User-Agent":"sea-trip-app-places/1.0"}});
      if (r.ok) return (await r.json()).elements;
      console.log("  ", url, r.status);
    } catch(e){ console.log("  ", url, e.message); }
    await new Promise(r => setTimeout(r, 20000));            // busy: wait and try the next one
  }
  throw new Error("Overpass didn't answer");
}
const oid = e => e.type[0] + e.id;

(async () => {
  for (const db of DBS){
    const dir = path.join(ROOT, db.dir), meta = readJ(path.join(dir, "meta.json"));
    const els = await overpass(`[out:json][timeout:180];${db.area}->.a;(nwr(area.a)["amenity"~"^(luggage_locker|left_luggage)$"];nwr(area.a)["diet:gluten_free"~"^(yes|only|limited)$"];);out center tags;`);
    const pos = e => e.type === "node" ? [e.lat, e.lon] : e.center ? [e.center.lat, e.center.lon] : null;
    // gluten-free: mark the food places already in the database
    const gf = new Map(els.filter(e => e.tags && e.tags["diet:gluten_free"]).map(e => [oid(e), e.tags["diet:gluten_free"] === "only" ? 2 : 1]));
    let marked = 0;
    for (const [z, x, y] of meta.groups.food.leaves){
      const f = path.join(dir, "food", `${z}-${x}-${y}.json`), t = readJ(f); let ch = false;
      for (const row of t.f) if (gf.has(row[0])){ if (!row[6] || typeof row[6] !== "object") row[6] = {}; if (row[6].gf !== gf.get(row[0])){ row[6].gf = gf.get(row[0]); ch = true; } marked++; }
      if (ch) writeJ(f, t);
    }
    // luggage: add to the Essentials tile that covers it (skipping any already there), named or not
    const lug = els.filter(e => e.tags && /^(luggage_locker|left_luggage)$/.test(e.tags.amenity)).map(e => ({e, p:pos(e)})).filter(x => x.p);
    const leaves = meta.groups.ess.leaves, sum = readJ(path.join(dir, "sum-ess.json"));
    if (!sum.kinds.includes("luggage")){
      const old = sum.kinds, kinds = old.concat("luggage").sort(), map = old.map(k => kinds.indexOf(k));
      sum.cells.forEach(c => { for (let i = 2; i < c.length; i += 2) c[i] = map[c[i]]; });
      sum.kinds = kinds;
    }
    const lk = sum.kinds.indexOf("luggage");
    let added = 0;
    for (const {e, p} of lug){
      const [lat, lng] = p;
      const leaf = leaves.find(([z, x, y]) => lng2tile(lng, z) === x && lat2tile(lat, z) === y);
      if (!leaf) continue;                                  // outside the covered provinces
      const f = path.join(dir, "ess", `${leaf[0]}-${leaf[1]}-${leaf[2]}.json`), t = readJ(f);
      if (t.f.some(r => r[0] === oid(e))) continue;
      // the area (town) of the nearest place already in that tile
      let best = 0, bd = Infinity; t.f.forEach(r => { const d = (r[1] - lat) ** 2 + (r[2] - lng) ** 2; if (d < bd){ bd = d; best = r[5]; } });
      const tg = e.tags, ex = {};
      if (tg.opening_hours) ex.oh = tg.opening_hours.slice(0, 120);
      if (tg.fee === "yes" || tg.fee === "no") ex.fee = tg.fee;
      if (tg.charge) ex.ch = tg.charge.slice(0, 40);
      if (tg.website || tg["contact:website"]) ex.w = (tg.website || tg["contact:website"]).slice(0, 200);
      if (tg.operator) ex.op = tg.operator.slice(0, 60);
      const row = [oid(e), +lat.toFixed(5), +lng.toFixed(5), "luggage", (tg["name:en"] || tg.name || "").slice(0, 80), best];
      if (Object.keys(ex).length) row.push(ex);
      t.f.push(row); writeJ(f, t); leaf[3]++; meta.groups.ess.n++; added++;
      const cx = lng2tile(lng, sum.z), cy = lat2tile(lat, sum.z);
      let cell = sum.cells.find(c => c[0] === cx && c[1] === cy);
      if (!cell){ cell = [cx, cy]; sum.cells.push(cell); }
      let i = 2; for (; i < cell.length; i += 2) if (cell[i] === lk){ cell[i + 1]++; break; }
      if (i >= cell.length) cell.push(lk, 1);
    }
    meta.kinds.luggage = meta.kinds.luggage || ["ess", "Luggage storage"];
    writeJ(path.join(dir, "meta.json"), meta); writeJ(path.join(dir, "sum-ess.json"), sum);
    console.log(`${db.dir}: ${added} luggage lockers or desks added (of ${lug.length} found), ${marked} food places marked gluten-free (of ${gf.size} tagged)`);
  }
})().catch(e => { console.error(e); process.exit(1); });
