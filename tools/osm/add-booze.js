// Adds bottle shops (OpenStreetMap shop=alcohol / beverages / wine) to Activities in the built places databases, as kind "liquor",
// for the Boozer section, without a full rebuild. extract.py now keeps them itself, so this is only for folders built before that.
//   node tools/osm/add-booze.js            (needs signal; a minute or two per country)
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..", "places");
const DBS = (process.env.BOOZE_DBS || "th,kh,id,vn,la,sg").split(",").map(dir => ({dir, area:`area["ISO3166-1"="${dir === "kh" ? "KH" : dir.toUpperCase()}"][admin_level=2]`}));
const lng2tile = (lng, z) => Math.floor((lng + 180) / 360 * 2 ** z);
const lat2tile = (lat, z) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); };
const readJ = f => JSON.parse(fs.readFileSync(f, "utf8"));
const writeJ = (f, v) => fs.writeFileSync(f, JSON.stringify(v));
async function overpass(q){
  for (const url of ["https://overpass-api.de/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass-api.de/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass-api.de/api/interpreter"]){
    try {
      const r = await fetch(url, {method:"POST", body:"data=" + encodeURIComponent(q), headers:{"Content-Type":"application/x-www-form-urlencoded", "User-Agent":"sea-trip-app-places/1.0"}});
      if (r.ok) return (await r.json()).elements;
      console.log("  ", url, r.status);
    } catch(e){ console.log("  ", url, e.message); }
    await new Promise(r => setTimeout(r, 20000));
  }
  throw new Error("Overpass didn't answer");
}
const oid = e => e.type[0] + e.id;
(async () => {
  for (const db of DBS){
    const dir = path.join(ROOT, db.dir); if (!fs.existsSync(path.join(dir, "meta.json"))) continue;
    const meta = readJ(path.join(dir, "meta.json"));
    const els = await overpass(`[out:json][timeout:300];${db.area}->.a;nwr(area.a)["shop"~"^(alcohol|beverages|wine)$"];out center tags;`);
    const pos = e => e.type === "node" ? [e.lat, e.lon] : e.center ? [e.center.lat, e.center.lon] : null;
    const leaves = meta.groups.do.leaves, sum = readJ(path.join(dir, "sum-do.json"));
    if (!sum.kinds.includes("liquor")){
      const old = sum.kinds, kinds = old.concat("liquor").sort(), map = old.map(k => kinds.indexOf(k));
      sum.cells.forEach(c => { for (let i = 2; i < c.length; i += 2) c[i] = map[c[i]]; });
      sum.kinds = kinds;
    }
    const lk = sum.kinds.indexOf("liquor");
    let added = 0;
    for (const e of els){
      const p = pos(e); if (!p) continue;
      const [lat, lng] = p, tg = e.tags || {};
      const leaf = leaves.find(([z, x, y]) => lng2tile(lng, z) === x && lat2tile(lat, z) === y);
      if (!leaf) continue;                                  // outside the covered areas, or in a tile with nothing else in it
      const f = path.join(dir, "do", `${leaf[0]}-${leaf[1]}-${leaf[2]}.json`), t = readJ(f);
      if (t.f.some(r => r[0] === oid(e))) continue;
      let best = 0, bd = Infinity; t.f.forEach(r => { const d = (r[1] - lat) ** 2 + (r[2] - lng) ** 2; if (d < bd){ bd = d; best = r[5]; } });
      const ex = {};
      if (tg.opening_hours) ex.oh = tg.opening_hours.slice(0, 120);
      if (tg.website || tg["contact:website"]) ex.w = (tg.website || tg["contact:website"]).slice(0, 200);
      if (tg.brand) ex.br = tg.brand.slice(0, 40);
      const row = [oid(e), +lat.toFixed(5), +lng.toFixed(5), "liquor", (tg["name:en"] || tg.name || "").slice(0, 80), best];
      if (Object.keys(ex).length) row.push(ex);
      t.f.push(row); writeJ(f, t); leaf[3]++; meta.groups.do.n++; added++;
      const cx = lng2tile(lng, sum.z), cy = lat2tile(lat, sum.z);
      let cell = sum.cells.find(c => c[0] === cx && c[1] === cy);
      if (!cell){ cell = [cx, cy]; sum.cells.push(cell); }
      let i = 2; for (; i < cell.length; i += 2) if (cell[i] === lk){ cell[i + 1]++; break; }
      if (i >= cell.length) cell.push(lk, 1);
    }
    meta.kinds.liquor = meta.kinds.liquor || ["do", "Bottle shop"];
    writeJ(path.join(dir, "meta.json"), meta); writeJ(path.join(dir, "sum-do.json"), sum);
    console.log(`${db.dir}: ${added} bottle shops added (of ${els.length} found)`);
  }
})().catch(e => { console.error(e); process.exit(1); });
