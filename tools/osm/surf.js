// Builds the surf list (D.surf in js/data.js) from OpenStreetMap: everything tagged sport=surfing in the areas the app covers.
// Run from the repo root:  node tools/osm/surf.js      (needs signal; uses the free Overpass API, a few seconds)
// Each entry: [OpenStreetMap id, lat, lng, name, "spot" | "school", country]. Surf breaks are "spot"; schools, shops and
// board hire are "school". Kite and windsurf centres are left out. Data © OpenStreetMap contributors (ODbL).
const fs = require("fs");
const {load} = require("../../tests/load");
const A = load();
// rough boxes (south, west, north, east) round the place databases; the exact borders are applied afterwards
const BOXES = [[5.5, 97.3, 20.5, 105.7], [9.9, 102.3, 14.7, 107.7], [-6.2, 101.9, -1.6, 106.3], [-9.2, 114.3, -8.0, 116.8]];
const q = `[out:json][timeout:90];(${BOXES.map(b => `nwr["sport"~"surfing"](${b.join(",")});`).join("")});out center tags;`;
(async () => {
  const r = await fetch("https://overpass-api.de/api/interpreter", {method:"POST", body:"data=" + encodeURIComponent(q),
    headers:{"Content-Type":"application/x-www-form-urlencoded", "User-Agent":"SEA-trip-app-build/1.0"}});
  if (!r.ok) throw new Error("Overpass answered " + r.status);
  const out = [], seen = new Set();
  for (const e of (await r.json()).elements){
    const t = e.tags || {}, lat = e.lat != null ? e.lat : e.center && e.center.lat, lng = e.lon != null ? e.lon : e.center && e.center.lon;
    const name = (t["name:en"] || t.name || "").split(";")[0].trim();
    if (!name || lat == null) continue;
    if (/kite|wind ?surf|wake|sup\b|paddle/i.test(name + " " + (t.description || "")) || /kitesurfing|windsurfing/.test(t.sport) && !/(^|;)\s*surfing/.test(t.sport)) continue;
    const cc = A.placeDbCc(lat, lng); if (!cc) continue;
    const biz = t.amenity || t.shop || t.leisure || t.office || t.education || t.rental || t.building || (t.tourism && t.tourism !== "attraction") || /school|shop|store|brand|shack|rental|hire|camp|lesson|academy|rip curl|billabong|quiksilver|drifter|\bsurf$/i.test(name);
    const id = e.type[0] + e.id; if (seen.has(id)) continue; seen.add(id);
    out.push([id, +lat.toFixed(5), +lng.toFixed(5), name, biz ? "school" : "spot", cc]);
  }
  out.sort((a, b) => a[5].localeCompare(b[5]) || a[3].localeCompare(b[3]));
  const lines = fs.readFileSync("js/data.js", "utf8").split("\n");
  const i = lines.findIndex(l => l.startsWith("const D = "));
  const cr = lines[i].endsWith("\r") ? "\r" : "";
  const D = JSON.parse(lines[i].replace(/\r$/, "").slice("const D = ".length).replace(/;\s*$/, ""));
  D.surf = out; D.surfChecked = new Date().toISOString().slice(0, 10);
  lines[i] = "const D = " + JSON.stringify(D) + ";" + cr;
  fs.writeFileSync("js/data.js", lines.join("\n"));
  const n = k => out.filter(x => x[4] === k).length;
  console.log(`${out.length} surf places written: ${n("spot")} surf spots, ${n("school")} schools and hire. By country: ${["TH", "ID", "KH"].map(c => c + " " + out.filter(x => x[5] === c).length).join(", ")}`);
  console.log(out.filter(x => x[4] === "spot").map(x => x[3]).join(", "));
})();
