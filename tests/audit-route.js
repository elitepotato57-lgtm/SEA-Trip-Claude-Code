// Audit (not part of npm test): runs every leg of the trip route, and every pair of neighbouring stops, through the journey
// planner and prints what it offers: time, price, badges, unpriced legs and the legs themselves.   node tests/audit-route.js
const { load } = require("./load");
const A = load();
const ROUTE = ["bkk", "cnx", "pai", "tao", "phangan", "samui", "aonang", "phiphi", "phuket", "rep", "pnh", "sgn", "hoian", "han"];
const name = id => (A.HUB[id] || {}).n || id;
const missing = ROUTE.filter(id => !A.HUB[id]);
if (missing.length) console.log("NOT A HUB:", missing.join(", "), "\nhubs:", Object.keys(A.HUB).join(" "));
const pairs = [];
for (let i = 0; i < ROUTE.length - 1; i++) pairs.push([ROUTE[i], ROUTE[i + 1]]);
for (let i = 0; i < ROUTE.length - 2; i++) pairs.push([ROUTE[i], ROUTE[i + 2]]);
for (const [a, b] of pairs){
  if (!A.HUB[a] || !A.HUB[b]) continue;
  const trips = A.planTrips(A.hubNode(a), A.hubNode(b));
  console.log(`\n${name(a)} → ${name(b)}: ${trips.length} journeys`);
  trips.slice(0, 4).forEach(t => console.log(`  ${t.fastest ? "F" : " "}${t.cheapest ? "C" : " "} ${t.mid.toFixed(1)}h £${t.pmin.toFixed(0)}-${t.pmax.toFixed(0)} unpriced:${t.unpriced} | ` +
    t.legs.map(L => `${L.o.mode}${L.o.p ? "" : "(?)"} ${name(L.from)}>${name(L.to)}`).join(" | ")));
}
