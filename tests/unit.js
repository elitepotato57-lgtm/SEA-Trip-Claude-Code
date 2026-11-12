// Unit tests for the app's logic, run in Node with no browser:  node tests/unit.js   (or npm run test:unit)
// The app's code files are loaded into a pretend browser by tests/load.js.
const { load } = require("./load");
const A = load();

let failed = 0, passed = 0;
function test(name, fn){
  try { fn(); passed++; console.log("PASS " + name); }
  catch (e){ failed++; console.log("FAIL " + name + "\n     " + e.message); }
}
function eq(a, b, msg){ if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg || "values differ"}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`); }
function ok(c, msg){ if (!c) throw new Error(msg || "expected true"); }
function near(a, b, tol, msg){ if (!(Math.abs(a - b) <= tol)) throw new Error(`${msg || "not close"}: got ${a}, wanted ${b} ± ${tol}`); }

/* ---------- text ---------- */
test("search folding drops accents, case and punctuation", () => {
  eq(A.foldText("Café Déjà Vu!"), "cafe deja vu");
  eq(A.foldText("  Khao   San  Rd. "), "khao san rd");
});
test("HTML escaping", () => eq(A.esc(`<a href="x">&'</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;"));

/* ---------- Thai to English letters ---------- */
test("road names come out in road-sign spelling", () => {
  eq(A.thaiRom.text("ถนนราชวิถี"), "Thanon Ratchawithi");
  eq(A.thaiRom.text("ถนนสุขุมวิท ซอย 11"), "Thanon Sukhumvit Soi 11");
});
test("well-known places use their usual English names", () => {
  eq(A.thaiRom.text("เชียงใหม่"), "Chiang Mai");
  eq(A.thaiRom.text("กรุงเทพมหานคร"), "Bangkok");
});
test("say-it-like-it-looks style for phrases", () => {
  eq(A.thaiRom.text("สวัสดีครับ", "easy"), "sa-wat-dee-krap");
  eq(A.thaiRom.text("ขอบคุณ", "easy"), "kawp-kun");
});
test("English text is left alone", () => {
  ok(!A.thaiRom.has("Khao San Road"));
  eq(A.thaiRom.text("7-Eleven"), "7-Eleven");
});

/* ---------- opening hours ---------- */
// days: 0 = Monday ... 6 = Sunday; min = minutes after midnight (Thai time)
test("open past midnight counts as open the next early morning", () => {
  const h = "Mo-Su 10:00-03:00";
  eq(A.ohState(h, {day:1, min:23 * 60}).open, true, "Tue 23:00");
  eq(A.ohState(h, {day:2, min:2 * 60}).open, true, "Wed 02:00 (still Tuesday night)");
  eq(A.ohState(h, {day:2, min:5 * 60}).open, false, "Wed 05:00");
  ok(/03:00/.test(A.ohState(h, {day:1, min:23 * 60}).text), "says when it closes");
});
test("24/7 and day-specific rules", () => {
  eq(A.ohState("24/7", {day:3, min:400}).open, true);
  const h = "Mo-Fr 08:00-17:00; Sa 09:00-12:00; Su off";
  eq(A.ohState(h, {day:5, min:10 * 60}).open, true, "Sat 10:00");
  eq(A.ohState(h, {day:5, min:13 * 60}).open, false, "Sat 13:00");
  eq(A.ohState(h, {day:6, min:10 * 60}).open, false, "Sun closed");
});
test("hours it can't read are ignored rather than guessed", () => {
  eq(A.ohParse("sunrise-sunset"), null);
  eq(A.ohParse(""), null);
});

/* ---------- distance and map tiles ---------- */
test("Bangkok to Chiang Mai is about 580 km in a straight line", () => {
  near(A.dist({lat:13.7563, lng:100.5018}, {lat:18.7883, lng:98.9853}), 582, 5);
});
test("map tile maths round-trips", () => {
  for (const z of [6, 11, 14]){
    const x = A.lng2tile(100.5, z), y = A.lat2tile(13.75, z);
    eq(A.lng2tile(A.tile2lng(x, z) + 1e-9, z), x, "x at z" + z);
    eq(A.lat2tile(A.tile2lat(y, z) - 1e-9, z), y, "y at z" + z);
  }
});

/* ---------- money ---------- */
test("baht shows with pounds alongside", () => {
  ok(/^฿250/.test(A.money(250, "THB")), A.money(250, "THB"));
  ok(/£\d/.test(A.thbGBP(250)), A.thbGBP(250));
});

/* ---------- journey planner ---------- */
test("Bangkok to Chiang Mai has options, and none is beaten on both time and price", () => {
  const trips = A.planTrips(A.HUB.bkk, A.HUB.cnx);
  ok(trips.length >= 1, "at least one way to get there");
  for (const t of trips){
    ok(t.dmin > 0 && t.dmax >= t.dmin, "sensible journey time");
    ok(t.legs.length >= 1, "has legs");
  }
  for (const a of trips) for (const b of trips){
    if (a === b || a.unpriced || b.unpriced) continue;
    ok(!(b.mid < a.mid && b.pmax < a.pmin), "one option is strictly worse than another and should have been hidden");
  }
});
test("no trip from a place to itself", () => eq(A.planTrips(A.HUB.bkk, A.HUB.bkk), []));

/* ---------- list filters ---------- */
test("rating filter: 4+ keeps 4.5 stars, drops 3.5 and unrated", () => {
  ok(A.passRating({r:9}, 4));          // ratings are stored out of 10
  ok(!A.passRating({r:7}, 4));
  ok(!A.passRating({}, 4));
  ok(A.passRating({}, 0), "no filter keeps everything");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
