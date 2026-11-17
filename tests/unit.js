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

/* ---------- Design Lab look codes ---------- */
test("a look code round-trips", () => {
  A.S.design = {on:true, cols:{stay:"#FF6B57", food:"#2ECC71"}, accent:"#14B8A6", ts:1.1, layout:"side", fontHead:"fraunces"};
  const back = A.labImport(A.labExport());
  eq(back, {cols:{stay:"#FF6B57", food:"#2ECC71"}, accent:"#14B8A6", fontHead:"fraunces", layout:"side", ts:1.1});
});
test("a pasted look code can't sneak in odd values", () => {
  const d = A.labImport('SEALOOK:{"cols":{"stay":"red;}body{display:none","food":"#123456"},"accent":"url(x)","fontBody":"<script>","ts":99,"evil":1,"app":{"bg":"#000000"}}');
  eq(d, {cols:{food:"#123456"}, ts:1.35}, "only the safe parts survive, numbers are clamped, half-set app colours are dropped");
  eq(A.labImport("not a code"), null);
  eq(A.labImport("[1,2]"), null);
});
test("colour maths", () => {
  eq(A.cmix("#000000", "#ffffff", .5), "#808080");
  ok(A.clum("#ffffff") > .99 && A.clum("#000000") < .01);
  eq(A.asHex("#abc"), "#aabbcc");
});
test("map colour choices reach the right map layers", () => {
  A.S.design = {on:true, map:{water:"#112233", labels:"#EEEEEE"}};
  const p = A.labMapPaint();
  eq(p.water["fill-color"], "#112233");
  ok(p.place_city && p.place_city["text-color"] === "#EEEEEE", "city names recoloured");
  ok(!p.background, "land untouched when not chosen");
  A.S.design = {on:true};
});

/* ---------- food types and price estimates ---------- */
const P = (o) => Object.assign({g:"food", k:"restaurant", n:"Somewhere"}, o);
test("food type from the cuisine tag, the brand, or words in the name", () => {
  eq(A.foodType(P({cu:["noodle"]})), "Noodles");
  eq(A.foodType(P({n:"KFC Silom", br:"KFC", k:"fastfood"})), "Fried chicken");
  eq(A.foodType(P({n:"ร้านส้มตำป้าแดง"})), "Isaan & som tam");
  eq(A.foodType(P({n:"หมูกระทะ ชาบู"})), "BBQ & hotpot");
  eq(A.foodType(P({n:"Mama's Pizzeria"})), "Pizza & Italian");
  eq(A.foodType(P({n:"ร้านลุงชัย"})), "Thai", "a Thai-only name");
  eq(A.foodType(P({n:"Joe's", k:"cafe"})), "Café & coffee", "falls back on the kind of place");
});
test("every food place gets a price estimate, labelled as one", () => {
  const e = A.estPrice(P({cu:["noodle"]}));
  ok(e.est && e.cur === "THB" && e.lo < e.hi, JSON.stringify(e));
  eq(A.estText(e), "est. ฿50–120");
  ok(/^£\d+–\d+$|^<£1/.test(A.estGBP(e)), A.estGBP(e));
});
test("researched prices beat estimates", () => {
  const it = P({p:[500, 500], cur:"THB", cu:["noodle"]});
  eq(A.priceInfo(it).est, false);
  eq(A.priceBand(it), 3, "฿500 a head is £££ for food");
});
test("price bands per section", () => {
  eq(A.priceBand({g:"do", k:"temple", n:"Wat"}), 0, "temples are usually free");
  eq(A.priceBand({g:"do", k:"cooking", n:"Class"}), 2);
  eq(A.priceBand({g:"stay", k:"hostel", n:"Dorms"}), 1);
  eq(A.priceBand({g:"stay", k:"hotel", n:"Grand", st:5}), 3);
  eq(A.priceBand({g:"do", k:"tour", n:"Tours R Us"}), null, "too varied to guess");
});
test("known ratings: researched first, then Google ones kept on the phone", () => {
  eq(A.knownRating({r:8.6}), 8.6);
  A.G_RATINGS.set("o:1", 4.4);
  eq(A.knownRating({id:"o:1"}), 8.8);
  eq(A.knownRating({id:"o:2"}), null);
});

/* ---------- backup files ---------- */
test("a backup file is recognised and summarised", () => {
  const o = {app:"sea-trip", v:1, made:"2026-11-12T10:00:00Z", state:{saved:{a:{}, b:{}}, budget:{items:[{a:1}]}}, docs:[{}, {}, {}]};
  eq(A.readBackup(o), {saved:2, spend:1, docs:3, made:"2026-11-12T10:00:00Z"});
  eq(A.readBackup({app:"something-else", state:{}}), null);
  eq(A.readBackup(null), null);
});
/* ---------- Documents: naming and sorting ---------- */
test("a boarding pass goes in Flights, named by its airports and date", () => {
  const c = A.classifyDoc("AirAsia BOARDING PASS\nPassenger MR SMITH/JOHN\nFlight FD 3436  Gate 12  Seat 14A\nDMK Bangkok Don Mueang  to  CNX Chiang Mai\nDeparture 02 Dec 2026 07:15  Boarding time 06:35", "boardingpass.pdf");
  eq(c.section, "flight"); eq(c.name, "Flight DMK → CNX, 2 Dec"); eq(c.date, "2026-12-02");
});
test("a Booking.com confirmation goes in Accommodation, named after the hostel", () => {
  const c = A.classifyDoc("Booking.com\nYour booking is confirmed\nLub d Bangkok Siam Hostel\nCheck-in Sat 28 Nov 2026 from 14:00\nCheck-out Mon 30 Nov 2026\n2 nights, 1 room type: Bed in 8-Bed Dormitory", "Booking confirmation.pdf");
  eq(c.section, "stay"); eq(c.name, "Lub d Bangkok Siam Hostel, 28 Nov");
});
test("the TDAC goes in TDAC and visas", () => {
  const c = A.classifyDoc("Thailand Digital Arrival Card (TDAC)\nArrival date 27/11/2026\nNationality UNITED KINGDOM", "IMG_2041.PNG");
  eq(c.section, "entry"); eq(c.name, "TDAC arrival card, 27 Nov");
});
test("insurance, a 12Go bus ticket and a ferry ticket", () => {
  eq(A.classifyDoc("SafetyWing Nomad Insurance\nCertificate of cover\nPolicy number 123456", "cert.pdf").name, "Travel insurance (SafetyWing)");
  const bus = A.classifyDoc("12Go e-ticket\nGreen Bus Thailand\nChiang Mai Arcade Bus Terminal 2 to Pai\n5 Dec 2026 08:30 Minivan", "ticket.pdf");
  eq(bus.section, "bus"); eq(bus.name, "Bus Chiang Mai → Pai, 5 Dec");
  const ferry = A.classifyDoc("Lomprayah High Speed Catamaran\nKoh Tao Mae Haad Pier to Koh Phangan Thong Sala Pier\n12 Dec 2026", "lomprayah.pdf");
  eq(ferry.section, "ferry"); eq(ferry.name, "Ferry Koh Tao → Koh Phangan, 12 Dec");
});
test("a photo with no useful text keeps a tidy version of its file name", () => {
  const c = A.classifyDoc("", "my_holiday-photo.JPG");
  eq(c.section, "other"); eq(c.name, "my holiday photo");
});
test("dates in different formats", () => {
  eq(A.docDate("Departs Dec 3, 2026"), "2026-12-03");
  eq(A.docDate("on 2026-12-04"), "2026-12-04");
  eq(A.docDate("Date: 05.12.2026"), "2026-12-05");
  eq(A.docDate("no date here 99/99/9999"), null);
});

/* ---------- Camera translator ---------- */
test("the lines Google reads off a photo are cleaned up", () => {
  eq(A.visionLines({textAnnotations:[{description:"ข้าวผัดกุ้ง\n\n  Pad   Thai \n120\nข้าวผัดกุ้ง\n"}]}), ["ข้าวผัดกุ้ง", "Pad Thai"], "blank lines, prices on their own and repeats go");
  eq(A.visionLines({}), []);
  ok(A.hasThai("ข้าว") && !A.hasThai("rice"));
});
test("the camera allowance counts up and stops at the daily limit", () => {
  const before = A.gUse().vision || 0;
  ok(A.gAllow("vision"));
  A.gSpend("vision"); eq(A.gUse().vision, before + 1);
});

/* ---------- questions in the map search ---------- */
test("questions are understood", () => {
  const p = q => { const a = A.parseAsk(q); return a && [a.kind, a.ess || a.move || a.ft || (a.kinds || []).join("+") || null, a.cheap, a.best, a.open, a.maxKm]; };
  eq(p("where's the nearest toilet"), ["ess", "toilet", false, false, false, 25]);
  eq(p("what's the best cheap restaurant near me"), ["food", null, true, true, false, 5]);
  eq(p("what's a good activity to do today that isn't too far"), ["do", null, false, true, true, 5]);
  eq(p("cheap noodles within walking distance"), ["food", "Noodles", true, false, false, 1.5]);
  eq(p("thai massage nearby"), ["do", "massage", false, false, false, 5], "Thai massage isn't food");
  eq(p("is there an ATM near here"), ["ess", "atm", false, false, false, 5]);
  eq(p("where's the pier"), ["move", "ferry", false, false, false, 10]);
  eq(p("cheapest hostel"), ["stay", "hostel", true, false, false, 10]);
  eq(p("purple monkey dishwasher"), null);
});
test("place names aren't mistaken for questions", () => {
  eq(A.askOffer("Wat Pho"), null);
  eq(A.askOffer("Khao San Road"), null);
  ok(A.askOffer("atm") && !A.askOffer("atm").first, "a plain category word gets an answer row after the place matches");
  ok(A.askOffer("where can I get a drink?").first, "a question gets the answer row first");
});

/* ---------- Indonesia ---------- */
test("Sumatra, Bali and Lombok are covered; Java and Bangkok's neighbours aren't mixed up", () => {
  ok(A.inPlaceDb(-2.9888, 104.7569), "Palembang");
  ok(A.inPlaceDb(-8.5069, 115.2625), "Ubud");
  ok(A.inPlaceDb(-8.3515, 116.0383), "Gili Trawangan");
  ok(A.inPlaceDb(13.7563, 100.5018), "Bangkok");
  ok(!A.inPlaceDb(-6.2, 106.85), "Jakarta isn't covered yet");
  ok(A.PLACE_DESTS.some(c => c[0] === "Palembang") && A.PLACE_DESTS.some(c => c[0] === "Gili Air"));
});
test("Indonesian food types, including Palembang's pempek", () => {
  const P = o => Object.assign({g:"food", k:"restaurant", cc:"ID", lng:104.7, lat:-3}, o);
  eq(A.foodType(P({n:"Pempek Candy"})), "Pempek");
  eq(A.foodType(P({n:"Rumah Makan Padang Sederhana"})), "Padang food");
  eq(A.foodType(P({n:"Warung Bakso Pak Kumis"})), "Noodles");
  eq(A.foodType(P({n:"Warung Makan Bu Siti"})), "Indonesian");
  eq(A.foodType(P({cu:["regional"], n:"RM X"})), "Indonesian", "regional food in Indonesia is Indonesian, not Thai");
  eq(A.foodType({g:"food", k:"restaurant", cc:"TH", cu:["regional"], n:"Y"}), "Thai");
});
test("Indonesian estimates are in rupiah, and dearer in Bali than Sumatra", () => {
  const w = {g:"food", k:"restaurant", cc:"ID", n:"Warung Makan", lng:104.7, lat:-3};
  const b = {g:"food", k:"restaurant", cc:"ID", n:"Warung Makan", lng:115.26, lat:-8.5};
  eq(A.estText(A.estPrice(w)), "est. Rp 15,000–40,000");
  ok(A.estPrice(b).lo > A.estPrice(w).lo, "Bali costs more");
  eq(A.estPrice({g:"food", k:"fastfood", cc:"ID", n:"KFC", br:"KFC", lng:104.7, lat:-3}).cur, "IDR", "global chains use Indonesian prices");
  eq(A.priceBand(w), 1);
  ok(/Rp/.test(A.bandLabels("food", "ID")[1]) && /฿150/.test(A.bandLabels("food", "TH")[1]));
});

/* ---------- Indonesia: the hand-researched layer ---------- */
const ID_DESTS = A.D.cities.filter(c => A.ccAt(c[1], c[2]) === "ID").map(c => c[0]);
test("all 17 Indonesian destinations are in the trip data", () => {
  eq(ID_DESTS.length, 17, ID_DESTS.join(", "));
});
test("every Indonesian destination has researched places, Bali and Lombok several of each kind", () => {
  const small = new Set(["Senaru", "Krui", "Pagar Alam"]);      // little exists there (or online) beyond a few stays and sights
  for (const d of ID_DESTS){
    const here = A.D.places.filter(p => p.cc === "ID" && p.city === d);
    ok(here.length >= 5, `${d}: only ${here.length} researched places`);
    ok(here.some(p => p.c === "gaff") && here.some(p => p.c === "cool"), `${d}: needs a gaff and an activity`);
    if (!small.has(d)) ok(here.some(p => p.c === "munch"), `${d}: needs somewhere to eat`);
  }
});
test("researched Indonesian places carry sources, sensible money and pins inside the covered area", () => {
  const id = A.D.places.filter(p => p.cc === "ID");
  ok(id.length >= 250, `only ${id.length}`);
  for (const p of id){
    if (p.verified) ok(p.src.length > 0 && p.src.every(s => /^https:\/\//.test(s[1])), `${p.id}: a researched place needs https sources`);
    if (p.p){ ok(["IDR", "GBP", "USD"].includes(p.cur), `${p.id}: currency ${p.cur}`); ok(p.p.every(x => x > 0) && (p.p.length < 2 || p.p[1] >= p.p[0]), `${p.id}: price range`); }
    ok(A.inPlaceDb(p.lat, p.lng), `${p.id}: pin ${p.lat},${p.lng} is outside Sumatra, Bali and Lombok`);
    ok(p.chk && p.t && p.t.length, `${p.id}: shape`);
  }
  eq(new Set(A.D.places.map(p => p.id)).size, A.D.places.length, "ids are unique");
});
test("Indonesian researched prices show in rupiah first, pounds alongside", () => {
  const ibuOka = A.D.places.find(p => p.id === "m-ubd-ibuoka");
  ok(/^Rp ?25,000/.test(A.itemLocal(ibuOka)), A.itemLocal(ibuOka));
  ok(/^£/.test(A.gbpRange(ibuOka.p, ibuOka.cur)));
  const camp = A.D.places.find(p => p.id === "g-kru-ksc");      // priced in pounds by the camp, shown in rupiah
  ok(/^Rp/.test(A.itemLocal(camp)), A.itemLocal(camp));
});
test("every Indonesian destination has its own photo with a credit", () => {
  const fs = require("fs"), path = require("path");
  for (const d of ID_DESTS){
    const f = A.DEST_IMG[d]; ok(f, `${d}: no photo`);
    ok(fs.existsSync(path.join(__dirname, "..", f)), `${f} is missing`);
    ok(A.PHOTO_CREDITS.some(c => c[3].includes("commons.wikimedia.org")), "credits point at Wikimedia Commons");
  }
  const credits = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "img", "credits.json"), "utf8"));
  for (const d of ID_DESTS){ const k = A.DEST_IMG[d].replace("img/", ""); ok(credits[k] && credits[k].lic && credits[k].by, `${k}: credit`); }
});

/* ---------- Indonesia: journey planner ---------- */
test("every leg joins real hubs and stations and has a time; priced legs have a currency", () => {
  for (const e of A.D.net.edges){
    ok(A.HUB[e.a] && A.HUB[e.b], `${e.a}–${e.b}: unknown hub`);
    for (const s of [e.da, e.db]) ok(!s || A.D.net.stations[s], `${e.a}–${e.b}: unknown station ${s}`);
    ok(e.dur[0] > 0 && e.dur[1] >= e.dur[0], `${e.a}–${e.b}: time`);
    if (e.p) ok(A.D.rates[e.cur], `${e.a}–${e.b}: currency ${e.cur}`);
    if (e.verified) ok(e.src.length > 0, `${e.a}–${e.b}: a checked leg needs a source`);
  }
});
test("every Indonesian destination can be reached from Bali airport and from Bangkok", () => {
  const hubFor = d => Object.values(A.HUB).find(h => h.n === d);
  for (const d of ID_DESTS){
    const h = hubFor(d); ok(h, `${d}: no hub`);
    ok(A.planTrips(A.hubNode("dps"), A.hubNode(h.id)).length > 0, `Bali airport to ${d}`);
  }
  ok(A.planTrips(A.hubNode("bkk"), A.hubNode("ubud")).length > 0, "Bangkok to Ubud");
  ok(A.planTrips(A.hubNode("bkk"), A.hubNode("plm")).length > 0, "Bangkok to Palembang");
});
test("Ubud to Gili Trawangan: taxi to Padang Bai, then the fast boat, totalled in rupiah", () => {
  const trips = A.planTrips(A.hubNode("ubud"), A.hubNode("gilit"));
  const t = trips.find(x => x.legs.some(L => L.from === "padangbai" && L.to === "gilit"));
  ok(t, "a Padang Bai fast-boat option");
  eq(A.tripCur(t), "IDR");
  ok(/^Rp/.test(A.tripFrom(t)), A.tripFrom(t));
  eq(A.tripCur(A.planTrips(A.hubNode("bkk"), A.hubNode("ubud"))[0]), "THB", "a trip from Bangkok totals in baht");
});
test("taxi hops between Indonesian hubs suggest Grab or Gojek and rupiah", () => {
  const hop = A.LEGS.find(o => (o.a === "ubud" && o.b === "canggu") || (o.a === "canggu" && o.b === "ubud"));
  ok(hop && /Gojek/.test(hop.op) && hop.cur === "IDR", JSON.stringify(hop));
  const th = A.LEGS.find(o => o.mode === "Taxi" && !o.src.length && A.nodeCc(A.HUB[o.a]) === "TH");
  ok(th && /Bolt/.test(th.op) && th.cur === "THB");
});
test("a searched place on Gili Meno or Nusa Penida links to its island, not the mainland", () => {
  const meno = A.connectors({n:"Gili Meno", lat:-8.35, lng:116.058}, "@x");
  eq(meno.length, 1); eq(meno[0].b, "gilit");
  const kelingking = A.connectors({n:"Kelingking", lat:-8.75, lng:115.474}, "@x");
  eq(kelingking.map(l => l.b), ["penida"]);
});

/* ---------- maximum-price filter (one rule for the map and the lists) ---------- */
test("a maximum price never lets an unknown price through, and checks estimates in their own currency", () => {
  A.ui.pf.munch = A.newPF(); eq(A.setPF("munch", 2), "");
  const unknown = {c:"munch", g:"food", k:"restaurant", cc:"TH", n:"Somewhere"};            // a restaurant with no food type: no estimate
  A.estPrice(unknown); unknown._ep = null;
  eq(A.pfReason(unknown, "munch"), "unknown");
  // a Sumatran warung: estimate about Rp 15,000–40,000, under £2 in rupiah (this failed before: the rupiah was read as baht)
  const warung = {c:"munch", g:"food", k:"restaurant", cc:"ID", n:"Warung Makan Bu Siti", lng:104.7, lat:-3};
  ok(A.passPF(warung, "munch"), "a cheap warung passes £2 a dish");
  ok(A.gbpOrEst(warung) < 3, "sorting by price reads rupiah as rupiah " + A.gbpOrEst(warung));
  A.ui.pf.munch = A.newPF();
  ok(A.passPF(unknown, "munch"), "with no maximum everything passes");
});
test("stays compare dorm beds with dorm beds and rooms with rooms", () => {
  A.ui.pf.gaff = A.newPF(); A.setPF("gaff", 15);
  const dorm = {c:"gaff", cur_:true, p:[300], cur:"THB", pu:"dorm bed, per night, from", t:["Hostel"]};
  const room = {c:"gaff", cur_:true, p:[300], cur:"THB", pu:"room, per night, from", t:["Guesthouse"]};
  eq(A.stayBasis(dorm), "bed"); eq(A.stayBasis(room), "room");
  ok(A.passPF(dorm, "gaff") && A.pfReason(room, "gaff") === "basis", "bed prices by default");
  A.ui.pf.gaff.basis = "room";
  ok(A.passPF(room, "gaff") && A.pfReason(dorm, "gaff") === "basis", "room prices when asked");
  A.ui.pf.gaff = A.newPF();
});
test("Free means known to be free (or usually free), never merely unpriced", () => {
  A.ui.pf.cool = A.newPF(); eq(A.setPF("cool", 0), "");
  ok(A.passPF({c:"cool", cur_:true, verified:true, cost:"Free", t:["Beaches"]}, "cool"), "a researched free beach");
  ok(A.passPF({c:"cool", g:"do", k:"beach", cc:"TH"}, "cool"), "a beach estimated as usually free");
  eq(A.pfReason({c:"cool", cur_:true, verified:true, cost:"Small entry fee (amount not listed)", t:["Views"]}, "cool"), "unknown");
  eq(A.pfReason({c:"cool", cur_:true, p:[50000], cur:"IDR", t:["Temples"]}, "cool"), "price");
  A.ui.pf.cool = A.newPF();
});
test("custom maximums are checked and converted at the app's rate", () => {
  ok(A.setPF("munch", "-3") !== "" && A.setPF("munch", "abc") !== "" && A.setPF("munch", "0") !== "", "nonsense is refused");
  ok(A.setPF("munch", "999999") !== "", "a typo of a million pounds is refused");
  eq(A.setPF("munch", "60", "THB"), "");
  near(A.ui.pf.munch.max, 60 / A.rate("THB"), 0.011);
  eq(A.setPF("munch", null), ""); eq(A.ui.pf.munch.max, null);
});

/* ---------- map counts ---------- */
test("zoomed-out transport counts follow the transport filter", () => {
  const cell = {counts:{airport:1, bus:40, taxi:300}, total:341};
  A.ui.mf.move.t = "all"; eq(A.cellWeight("move", cell, new Set()), 341);
  A.ui.mf.move.t = "airport"; eq(A.cellWeight("move", cell, new Set()), 1);
  A.ui.mf.move.t = "all";
  eq(A.cellWeight("ess", {counts:{atm:3, toilet:5}, total:8}, new Set(["toilet"])), 5);
});

/* ---------- "take me to the nearest ..." ---------- */
test("nearest-place requests are recognised in their everyday forms", () => {
  const kind = t => { const a = A.nearestIntent(t); return a ? (a.ess || a.move || (a.kinds || [])[0] || a.ft) : null; };
  eq(kind("Find me the nearest toilet."), "toilet");
  eq(kind("Where's the nearest pharmacy?"), "pharmacy");
  eq(kind("Where is the closest chemist"), "pharmacy");
  eq(kind("Bring me to the closest laundry"), "laundry");
  eq(kind("Take me to the nearest ATM"), "atm");
  eq(kind("nearest a t m"), "atm");
  eq(kind("take me to a laundromat"), "laundry");
  eq(kind("closest bus station"), "bus");
  eq(kind("take me to Wat Pho"), null, "a named place isn't a kind of place");
  eq(kind("best cheap restaurant near me"), null, "best/cheap gets a list, not one place");
  eq(kind("nearest things to do"), null, "too vague for one place");
});

/* ---------- heading ---------- */
test("compass smoothing turns the short way round past north", () => {
  A.Heading.sm = null;
  let d = A.Heading.smooth(358);
  for (let i = 0; i < 12; i++) d = A.Heading.smooth(4);
  ok(d < 6 || d > 354, "stays near north, got " + d);
  A.Heading.sm = null;
  for (let i = 0; i < 12; i++) d = A.Heading.smooth(90);
  near(d, 90, 0.5);
  A.Heading.sm = null;
});

/* ---------- booking links ---------- */
test("each leg books its own mode, in its own direction, with the date and group", () => {
  A.ui.tp.date = "2099-12-02"; A.ui.tp.people = 3;
  const f = A.go12Link("padangbai", "gilit", "Ferry");
  eq(f.url, "https://12go.asia/en/ferry/padang-bai/gili-trawangan?date=2099-12-02&people=3");
  eq(A.go12Link("gilit", "padangbai", "Ferry").url.split("?")[0], "https://12go.asia/en/ferry/gili-trawangan/padang-bai");
  eq(A.go12Link("bkk", "dps", "Flight").url.split("?")[0], "https://12go.asia/en/flights/bangkok/denpasar-airport");
  // 12Go lists no buses Koh Lanta → Krabi, so that leg opens the route's all-transport search, labelled as a search
  const l = A.go12Link("lanta", "krabi", "Minivan");
  eq(l.kind, "travel"); ok(/Search/.test(l.label));
  A.ui.tp.date = "2001-01-01"; ok(!/date=/.test(A.go12Link("padangbai", "gilit", "Ferry").url), "a past date isn't sent");
  A.ui.tp.date = ""; A.ui.tp.people = 1;
  eq(A.go12Link("padangbai", "gilit", "Ferry").url, "https://12go.asia/en/ferry/padang-bai/gili-trawangan");
});
test("multi-leg journeys get a link per leg that matches the leg", () => {
  const t = A.planTrips(A.hubNode("bkk"), A.hubNode("gilit")).find(x => x.legs.length === 3);
  ok(t, "Bangkok to Gili T in three legs");
  const urls = t.legs.map(L => (A.legBook(L) || {}).url || "");
  ok(/flights\/bangkok\/denpasar-airport/.test(urls[0]) && /\/denpasar-airport\/padang-bai/.test(urls[1]) && /ferry\/padang-bai\/gili-trawangan/.test(urls[2]), JSON.stringify(urls));
});

/* ---------- hidden tools and defaults ---------- */
test("Budget and the camera translator are hidden; Design Lab is off for a new phone", () => {
  ok(A.TOOLS.find(t => t.id === "budget").hidden && A.TOOLS.find(t => t.id === "camera").hidden);
  ok(!A.TOOLS.find(t => t.id === "wifi").hidden, "Wi-Fi finder still there");
  eq(load().S.design.on, false, "a fresh phone");
  ok(Array.isArray(A.S.budget.items), "Budget's data is kept");
});
test("the old pretend-Bangkok default is switched off once; a city someone picked is kept", () => {
  const withSaved = st => { const store = new Map([["sea-trip-app-v1", JSON.stringify(st)]]); return load(undefined, {localStorage:{getItem:k => store.has(k) ? store.get(k) : null, setItem:(k, v) => store.set(k, String(v)), removeItem:k => store.delete(k)}}); };
  eq(withSaved({testLoc:"Bangkok", country:"TH"}).S.testLoc, "off", "the old default");
  eq(withSaved({testLoc:"Krabi Town"}).S.testLoc, "Krabi Town", "a city picked on purpose");
  eq(withSaved({v:2, testLoc:"Bangkok"}).S.testLoc, "Bangkok", "Bangkok picked on purpose after the change");
  eq(withSaved({}).S.testLoc, "off", "a brand-new phone");
});

/* ---------- Cambodia ---------- */
test("Cambodia is covered nationwide, islands included, without taking over Thailand", () => {
  ok(A.inPlaceDb(11.5683, 104.9224) && A.ccAt(11.5683, 104.9224) === "KH", "Phnom Penh");
  ok(A.ccAt(13.3618, 103.859) === "KH", "Siem Reap");
  eq(A.ccAt(10.674, 103.288), "KH", "Koh Rong");
  eq(A.ccAt(10.584, 103.2955), "KH", "Koh Rong Sanloem");
  eq(A.ccAt(13.7563, 100.5018), "TH", "Bangkok");
  eq(A.ccAt(12.2436, 102.5151), "TH", "Trat, on the Thai side of the border");
  for (const d of ["Phnom Penh", "Siem Reap", "Kampot", "Kep", "Battambang", "Sihanoukville", "Koh Rong", "Koh Rong Sanloem"])
    ok(A.KH_DESTS.some(c => c[0] === d), d + " is a Cambodian destination");
});
test("Cambodian estimates are in dollars, only for kinds a source covers, never Thai baht", () => {
  const P = o => Object.assign({cc:"KH", lat:11.57, lng:104.92, n:"X"}, o);
  const r = A.estPrice(P({g:"food", k:"restaurant", n:"Some restaurant"}));
  eq([r.cur, r.lo, r.hi], ["USD", 3, 10]);
  const h = A.estPrice(P({g:"stay", k:"hostel"})); eq([h.cur, h.lo, h.hi], ["USD", 5, 10]);
  eq(A.estPrice(P({g:"stay", k:"resort"})), null, "no sourced figure for resorts: no estimate");
  eq(A.estPrice(P({g:"do", k:"museum"})), null, "no sourced figure for museums: no estimate");
  eq(A.estPrice(P({g:"food", k:"fastfood", n:"KFC", br:"KFC"})), null, "no chain prices for Cambodia");
  eq(A.foodType(P({g:"food", k:"restaurant", n:"Lok Lak Corner"})), "Khmer");
  ok(A.foodType({g:"food", k:"restaurant", cc:"TH", n:"Amok Thai"}) !== "Khmer", "Khmer food is only Khmer in Cambodia");
});
test("Cambodia's phrasebook, guide name and emergency numbers", () => {
  const was = A.S.country; A.S.country = "KH";
  const pb = A.phrasebook(); eq(pb.name, "Khmer"); ok(pb.list.flatMap(g => g.p).some(p => p[1] === "អរគុណ"), "thank you");
  eq(A.TOOLS.find(t => t.id === "guide").l, "Cambodia guide");
  eq(A.SOS_KH.map(x => x[1]).slice(0, 3).sort(), ["117", "118", "119"]);
  A.S.country = was;
});

/* ---------- photos: no Buddha imagery ---------- */
test("temples get no photo unless that exact picture was checked; Buddha file names are skipped", () => {
  const P = id => A.D.places.find(p => p.id === id);
  ok(!A.photoPlaceOk(P("c-ks-bigbuddha")), "Big Buddha: no photo");
  ok(!A.photoPlaceOk(P("c-sk-sichum")), "an unchecked wat: no photo");
  ok(!A.photoPlaceOk({osm:1, k:"temple", n:"Wat Somewhere", id:"o1"}), "an OpenStreetMap wat: no photo");
  ok(A.photoPlaceOk({osm:1, k:"temple", n:"Pura Tirta Empul", id:"o2"}), "Bali's Hindu temples keep photos");
  ok(A.photoPlaceOk(P("c-bkk-watarun")) && A.photoFileOk(P("c-bkk-watarun"), "Wat_Arun_from_Chao_Phraya_River.jpg"), "the checked Wat Arun picture");
  ok(!A.photoFileOk(P("c-bkk-watarun"), "Some other Wat Arun picture.jpg"), "a different picture of a checked temple is not shown");
  ok(!A.photoFileOk({id:"x", n:"Beach"}, "Buddha statue on the beach.jpg"), "file name mentions a Buddha");
  ok(A.photoFileOk({id:"x", n:"Beach"}, "Melasti Beach.jpg"));
  ok(!A.photoSrcOk({id:"x", n:"Beach"}, "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Golden_Buddha.jpg/640px-Golden_Buddha.jpg"));
  ok(!A.googlePhotoFor({c:"cool", t:["Temples"], n:"White Temple (Wat Rong Khun)"}), "no Google photos for temples");
});
test("Commons picture addresses are worked out like MediaWiki does (standard sizes, no redirects)", () => {
  const crypto = require("crypto"), h = s => crypto.createHash("md5").update(s, "utf8").digest("hex");
  for (const s of ["", "a", "Lpnp_11.JPG", "วัดศรีชุม_เมืองเก่า_สุโขทัย.jpg", "x".repeat(55), "y".repeat(56), "z".repeat(64), "Café_Déjà_Vu_(2).png"]) eq(A.md5(s), h(s), "md5 of " + s.slice(0, 20));
  // seen in the browser: Special:FilePath redirected these to …/thumb/3/37/Lpnp_11.JPG/960px-Lpnp_11.JPG
  eq(A.commonsThumb("Lpnp 11.JPG", 500), "https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Lpnp_11.JPG/500px-Lpnp_11.JPG");
  ok(A.commonsThumb("Jim Thompson House spirit house.JPG", 500).includes("/thumb/5/5e/"));
  ok(A.commonsThumb("map.svg", 500).endsWith("500px-Map.svg.png"), "SVGs come as PNG and the first letter is a capital");
  eq(A.commonsThumb("scan.tif", 500), null, "TIFFs take the slow way round");
  eq(A.thumbFallback(A.commonsThumb("Lpnp 11.JPG", 500)), "https://commons.wikimedia.org/wiki/Special:FilePath/Lpnp_11.JPG?width=500");
  eq(A.bigPhoto(A.commonsThumb("Lpnp 11.JPG", 500)), "https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Lpnp_11.JPG/960px-Lpnp_11.JPG");
  eq(A.PH_CARD, 500, "a Wikimedia standard size");
});
test("researched places matched to Wikidata are the place itself", () => {
  const P = id => A.D.places.find(p => p.id === id);
  eq(P("c-ulw-melasti").wd, "Q116269439"); eq(P("c-kb-bridge").wd, "Q2282230");
  ok(!A.D.places.some(p => p.c === "gaff" && p.wd && !p.wp && /^Q(476320|375819|511957|1026424)$/.test(p.wd)), "no hostel shows its town's photo");
});

/* ---------- list polish and surf ---------- */
test("the list opens on a place with a photo and keeps the rest in order", () => {
  const a = {id:"a", n:"A"}, b = {id:"b", n:"B"}, c = {id:"c", n:"Melasti", wd:"Q116269439"}, d = {id:"d", n:"D", wd:"Q1"};
  eq(A.photoFirst([a, b, c, d]).map(x => x.id), ["c", "a", "b", "d"]);
  eq(A.photoFirst([c, a]).map(x => x.id), ["c", "a"], "already first: untouched");
  eq(A.photoFirst([a, b]).map(x => x.id), ["a", "b"], "nothing with a photo: untouched");
  ok(!A.likelyPhoto({id:"t", osm:1, k:"temple", n:"Wat X", wd:"Q5"}), "a temple's held-back photo doesn't count");
});
test("the distance slider's far end means any distance", () => {
  eq(A.radiusLabel(7), "Within 7 km"); ok(/50\+/.test(A.radiusLabel(0))); eq(A.RADIUS_MAX, 50);
});
test("your own maximum price is typed in pounds", () => {
  eq(A.setPF("munch", "3.5"), ""); eq([A.ui.pf.munch.max, A.ui.pf.munch.cur], [3.5, "GBP"]);
  ok(A.setPF("munch", "-3") !== "", "a negative amount is refused"); ok(A.setPF("munch", "abc") !== "");
  const html = A.pfControls("munch");
  ok(/class="chip pf-in on"/.test(html) && !/data-pfset|data-pfcur|Custom/.test(html), "one chip-sized box, no Set button, no currency menu");
  A.setPF("munch", null);
});
test("surf spots are researched breaks with sources, no schools or shops, each in a covered country", () => {
  ok(A.SURF.length >= 18, "enough spots");
  // a beach break can sit a little off the app's simplified coastline: then the land within about 5 km must be its own country
  const landNear = p => { const out = new Set(); for (let k = 0; k < 16; k++) for (const r of [0.017, 0.033, 0.05]){ const c = A.ccAt(p.lat + r * Math.sin(k * Math.PI / 8), p.lng + r * Math.cos(k * Math.PI / 8)); if (c) out.add(c); } return [...out]; };
  const inCountry = p => A.ccAt(p.lat, p.lng) === p.cc || (A.ccAt(p.lat, p.lng) == null && landNear(p).join() === p.cc);
  const bad = A.SURF.filter(p => !(p.k === "surf" && p.src.length && p.src.every(s => /^https:\/\//.test(s[1])) && inCountry(p)));
  ok(!bad.length, "every spot has a source and sits in (or just off the coast of) its country: " + bad.map(p => p.n).join(", "));
  ok(!A.SURF.some(p => /school|shop|hire|rental|surf camp|indoor|flow|wave pool|artificial/i.test(p.n)), "no schools, shops or artificial waves");
  ok(["Uluwatu", "Padang Padang", "Gerupuk Inside", "Kata Beach", "Medewi"].every(n => A.SURF.some(p => p.n === n)));
  ok(A.SURF.filter(p => p.pic).every(p => /^img\/surf\/[a-z]+\.jpg$/.test(p.pic[0]) && require("fs").existsSync(require("path").join(__dirname, "..", p.pic[0])) && /Wikimedia Commons/.test(p.pic[2])), "photos are stored with the app, with credits");
  ok(A.SURF.filter(p => p.pic).length >= 10);
  const chip = A.CHIPS.cool.find(c => c.id === "surf"); eq(chip.go, "surf"); ok(chip.f(A.SURF[0]) && !chip.f({osm:true, k:"beach", n:"Some beach"}));
  eq(A.findPlace(A.SURF[0].id), A.SURF[0]);
  ok(A.surfNear({lat:-8.8853, lng:116.2757}, "ID").every(p => A.dist({lat:-8.8853, lng:116.2757}, p) <= 250), "near Kuta Lombok: the Lombok and Bali spots");
  ok(A.surfNear({none:true}, "TH").every(p => p.cc === "TH") && A.surfNear({none:true}, "TH").length >= 2);
  eq(A.surfNear({lat:11.57, lng:104.92}, "KH").length, 0, "no surf researched in Cambodia: nothing shown");
});
test("surf mode puts only the surf spots on the map", () => {
  A.ui.mapSurf = true; eq(A.activeGroups().length, 0); eq(A.curatedForMap().length, A.SURF.length);
  A.ui.mapSurf = false; ok(!A.curatedForMap().some(p => p.k === "surf"), "surf spots aren't mixed into Activities otherwise");
});
test("the wave forecast is turned into feet and plain words, never a guess when the sea model has nothing", () => {
  const f = A.surfRead({current:{wave_height:1.4, wave_period:11, wave_direction:208, swell_wave_height:1.36, swell_wave_period:9.3}}, {current:{wind_speed_10m:9, wind_direction_10m:95}});
  near(f.ft, 4.59, 0.01); eq(f.size, "Solid"); eq(A.surfShort(f), "4.6 ft @ 11 s · Solid");
  eq([A.surfSize(0.5), A.surfSize(1.5), A.surfSize(3), A.surfSize(7), A.surfSize(12)], ["Flat", "Small", "Fun-size", "Big", "Very big"]);
  eq(A.surfRead({current:{wave_height:null}}, null), null, "inland or no data: nothing shown");
  eq([A.compass(208), A.compass(0), A.compass(359)], ["SW", "N", "N"]);
  ok(/^https:\/\/www\.surfline\.com\/search\/Gerupuk%20Inside$/.test(A.surfLink({n:"Gerupuk Inside"})));
  ok(A.wantsSurf({osm:true, k:"beach"}) && A.wantsSurf(A.SURF[0]) && !A.wantsSurf({osm:true, k:"museum"}));
});

/* ---------- split costs ---------- */
test("split costs: equal shares, a running tally and the fewest payments to settle", () => {
  A.S.split = {people:["Dylan", "Sam", "Jo"], items:[], del:[]};
  eq(A.splitAdd({what:"Taxi", amount:"30", cur:"GBP", by:"Dylan", to:["Dylan", "Sam", "Jo"]}), "");
  eq(A.splitAdd({what:"Beers", amount:"12", cur:"GBP", by:"Sam", to:["Sam", "Jo"]}), "");
  const b = A.splitBalances(); eq([b.Dylan, b.Sam, b.Jo], [20, -4, -16]);
  const plan = A.splitSettle(b); eq(plan.map(t => [t.from, t.to, t.gbp]), [["Jo", "Dylan", 16], ["Sam", "Dylan", 4]]);
  A.splitPaid("Jo", "Dylan", 16); A.splitPaid("Sam", "Dylan", 4);
  const after = A.splitBalances(); ok(Object.values(after).every(v => Math.abs(v) < 0.02), "settled: everyone square " + JSON.stringify(after));
  ok(A.splitAdd({what:"x", amount:"-5", cur:"GBP", by:"Dylan", to:["Sam"]}) !== "", "no negative amounts");
  ok(A.splitAdd({what:"x", amount:"5", cur:"GBP", by:"Nobody", to:["Sam"]}) !== "", "the payer must be in the group");
  ok(A.splitAdd({what:"x", amount:"5", cur:"GBP", by:"Sam", to:[]}) !== "", "someone must share it");
  const baht = A.S.split.items.length; A.splitAdd({what:"Dinner", amount:"600", cur:"THB", by:"Jo", to:["Jo", "Sam"]});
  near(A.splitBalances().Jo, A.toGBP(300, "THB"), 0.02, "other money is converted at the app's rate");
  const id = A.S.split.items[baht].id; A.splitDelete(id); ok(!A.S.split.items.some(x => x.id === id) && A.S.split.del.includes(id));
});
test("split costs: merging another phone's tally adds new payments once and keeps deletions", () => {
  A.S.split = {people:["Dylan", "Sam"], items:[{id:"a", w:"Taxi", a:10, c:"GBP", by:"Dylan", to:["Dylan", "Sam"], t:1}], del:["gone"]};
  const n = A.splitMerge({people:["Sam", "Jo"], items:[{id:"a", w:"Taxi", a:10, c:"GBP", by:"Dylan", to:["Dylan", "Sam"], t:1}, {id:"b", w:"Boat", a:20, c:"GBP", by:"Jo", to:["Jo", "Sam"], t:2}, {id:"gone", w:"Old", a:5, c:"GBP", by:"Sam", to:["Sam"], t:0}], del:[]});
  eq(n, 1); eq(A.S.split.people, ["Dylan", "Sam", "Jo"]); eq(A.S.split.items.map(x => x.id), ["a", "b"]);
  eq(A.splitMerge({people:[], items:[], del:["a"]}), 0); eq(A.S.split.items.map(x => x.id), ["b"], "a payment deleted on another phone goes here too");
  A.S.split = {people:[], items:[], del:[]};
});

test("hostel cards: a Google review is shown only if it's 30 characters or fewer, never cut down", () => {
  eq(A.shortReview([{text:"This hostel was absolutely brilliant, the staff were lovely", rating:5}, {text:{text:"Great vibes, great staff!"}, rating:5, authorAttribution:{displayName:"Jo"}}]), {t:"Great vibes, great staff!", by:"Jo", r:5});
  eq(A.shortReview([{text:"x".repeat(31)}]), null); eq(A.shortReview(null), null); eq(A.shortReview([{text:"  Clean   and quiet  "}]).t, "Clean and quiet");
});

test("split costs: your own tally only counts what's between you and each person", () => {
  const m = {me:"a", people:["a", "b", "c"], items:[{by:"a", to:["a", "b", "c"], a:30, c:"GBP"}, {by:"b", to:["a", "b"], a:10, c:"GBP"}, {by:"c", to:["b", "c"], a:8, c:"GBP"}, {by:"c", to:["c", "a"], a:40, c:"GBP"}]};
  eq(A.splitPairs(m), {b:5, c:-10}, "b owes you 10 less the 5 you owe b; you owe c 20 less the 10 c owes you");
  m.items.push({by:"b", to:["a"], a:5, c:"GBP", s:1}, {by:"a", to:["c"], a:10, c:"GBP", s:1});
  eq(A.splitPairs(m), {b:0, c:0}, "both settled up");
});

test("split costs: custom amounts must add up to the total, and they change who owes what", () => {
  eq(A.splitCustom(30, ["a", "b"], {a:"20", b:"10"}), {sh:{a:20, b:10}});
  ok(/add up to 25/.test(A.splitCustom(30, ["a", "b"], {a:"20", b:"5"}).err));
  ok(A.splitCustom(30, ["a", "b"], {a:"30"}).err, "everyone needs an amount");
  const m = {me:"a", people:["a", "b", "c"], items:[{by:"a", to:["a", "b", "c"], a:30, c:"GBP", sh:{a:0, b:20, c:10}}]};
  eq(A.splitPairs(m), {b:20, c:10}); eq(A.splitBalances({people:m.people, items:m.items}), {a:30, b:-20, c:-10});
});
test("Tools: the order Dylan asked for, and Split costs only in Friends", () => {
  eq(A.toolsInOrder().map(t => t.id), ["friends", "translate", "currency", "emergency", "docs", "wifi", "weather", "deals", "guide", "assistant", "transport"]);
});
test("questions: costs, journey times, distances", () => {
  const f = A.moreIntent("How much should a tuk-tuk cost from where I am to MBK market?");
  eq([f.type, f.veh, f.dest], ["fare", "tuktuk", "MBK Market"]);
  eq(A.moreIntent("how long does it take to get to chiang mai").dest, "Chiang Mai");
  eq(A.moreIntent("how far is khao san road").type, "far");
  eq(A.moreIntent("nearest toilet"), null); eq(A.moreIntent("cheap noodles near me"), null);
});
test("questions: tuk-tuk and taxi estimates come from the meter rules (Bangkok) or researched app fares (Cambodia), elsewhere check the app", () => {
  const bkk = A.fareEstimates(5, {lat:13.745, lng:100.53}), m = A.meterFare(5);
  const tuk = bkk.find(x => x.k === "tuktuk"), taxi = bkk.find(x => x.k === "taxi");
  ok(taxi.lo >= m && tuk.lo >= 50 && tuk.hi >= tuk.lo && tuk.src.length, JSON.stringify(bkk));
  const pp = A.fareEstimates(6, {lat:11.56, lng:104.92}).find(x => x.k === "tuktuk");
  ok(pp.cur === "USD" && pp.lo >= 1 && pp.hi <= 5, JSON.stringify(pp));
  ok(A.fareEstimates(5, {lat:-8.65, lng:115.13}).every(x => x.lo == null), "Bali: no made-up numbers, check Grab or Gojek");
});
test("feeling rough: hangover and the shits get the right list for the country, each with sources and whether you need a prescription", () => {
  eq(A.moreIntent("I'm hungover, what would cure me?").topic, "hangover");
  eq(A.moreIntent("I've got diarrhoea, what should I buy?").topic, "stomach");
  eq(A.moreIntent("got the shits").topic, "stomach");
  eq(A.moreIntent("I'm not feeling great, what's the best thing?").topic, "general");
  for (const cc of ["TH", "ID", "KH"]){
    const all = A.REMEDIES[cc];
    ok(all.every(r => r.src.length && r.src.every(k => A.RX_SRC[k]) && r.rx && r.at && r.price), cc + " remedies need sources, where, price (or 'not checked') and prescription");
    ok(A.remedyList(cc, "stomach")[0].best && /ORS|Oralit/.test(A.remedyList(cc, "stomach")[0].n), cc + ": ORS first for the shits");
    ok(!A.remedyList(cc, "hangover").some(r => /loperamide|Imodium/i.test(r.n)), cc + ": no diarrhoea tablets for a hangover");
  }
  ok(/Prescription/.test(A.REMEDIES.ID.find(r => /Imodium/.test(r.n)).rx), "Imodium needs a prescription in Indonesia");
});

/* ---------- games (js/games.js) ---------- */
test("Four in a row: four across, up or diagonal wins; a counter drops to the lowest free row", () => {
  const W = A.C4_W, b = r => ".".repeat(42).split("");
  const across = b(); [0, 1, 2, 3].forEach(c => across[5 * W + c + 2] = "a"); eq(A.c4Win(across.join("")).v, "a");
  const up = b(); [2, 3, 4, 5].forEach(r => up[r * W] = "b"); eq(A.c4Win(up.join("")).v, "b");
  const diag = b(); [0, 1, 2, 3].forEach(k => diag[(5 - k) * W + k] = "a"); eq(A.c4Win(diag.join("")).cells.length, 4);
  const three = b(); [0, 1, 2].forEach(c => three[5 * W + c] = "a"); eq(A.c4Win(three.join("")), null);
  eq(A.c4Drop(".".repeat(42), 3), 5 * W + 3);
  const full = b(); for (let r = 0; r < 6; r++) full[r * W] = r % 2 ? "a" : "b"; eq(A.c4Drop(full.join(""), 0), -1);
  eq(A.GAMES.c4.result({p:["x", "y"], b:across.join("")}).w, ["x"]);
  eq(A.GAMES.c4.result({p:["x", "y"], b:"bbabbbaabaaabbbaaababaababbabbabaaabababba"}), {w:[]}, "a full board with no line is a draw");
});
test("Sink the fleet: 4 boats (4, 3, 3, 2) that never touch, hits, sinking and winning", () => {
  for (let n = 0; n < 30; n++){
    const f = A.sfRandomFleet(), N = A.SF_N;
    eq(f.length, 64); eq([...f].filter(v => v !== ".").length, 12);
    for (let i = 0; i < 64; i++){ if (f[i] === ".") continue; const y = Math.floor(i / N), x = i % N;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){ const yy = y + dy, xx = x + dx; if (yy < 0 || yy >= N || xx < 0 || xx >= N) continue; const v = f[yy * N + xx]; ok(v === "." || v === f[i], "boats never touch"); } }
  }
  const f = A.sfRandomFleet(), shots = [...f].map(v => v === "3" ? "x" : ".").join("");
  eq(A.sfShipsLeft(f, shots), 3); eq(A.sfSunkCells(f, shots).size, 2); eq(A.sfAllSunk(f, shots), false);
  const all = [...f].map(v => v === "." ? "o" : "x").join("");
  ok(A.sfAllSunk(f, all)); eq(A.GAMES.fleet.result({p:["x", "y"], f:{x:f, y:f}, h:{y:all}}).w, ["x"]);
});
test("Liar's dice: guesses must go up, turns skip anyone who's out, last one with dice wins", () => {
  const s = {p:["a", "b", "c"], n:{a:5, b:0, c:3}, r:2, t:"a"};
  eq(A.ldAlive(s), ["a", "c"]); eq(A.ldNext(s, "a"), "c"); eq(A.ldNext(s, "c"), "a"); eq(A.ldTotal(s), 8);
  ok(A.ldOk(s, 2, 4)); ok(!A.ldOk(s, 9, 4), "never more dice than are on the table");
  const bid = Object.assign({}, s, {bid:{q:3, f:4, by:"c"}});
  ok(A.ldOk(bid, 3, 5) && A.ldOk(bid, 4, 1)); ok(!A.ldOk(bid, 3, 4) && !A.ldOk(bid, 3, 2) && !A.ldOk(bid, 2, 6));
  eq(A.ldTurn(bid), "a"); eq(A.ldBidText({q:1, f:6}), "one 6"); eq(A.ldBidText({q:4, f:2}), "four 2s");
  eq(A.GAMES.dice.result(s), null); eq(A.GAMES.dice.result({p:["a", "b"], n:{a:0, b:2}}).w, ["b"]);
  eq(A.ldRoll(5).length, 5); ok(/^[1-6]{5}$/.test(A.ldRoll(5)));
});
test("Guess the price uses only researched prices (never estimates), and the closest guess wins each round", () => {
  for (let n = 0; n < 10; n++){
    const q = A.gpQuestions(); eq(q.length, 5);
    q.forEach(k => { const it = A.gpItem(k); ok(it && it.p.length && it.cur && it.cur !== "GBP" && it.q, k); });
  }
  const it = {p:[100, 200]};
  eq(A.gpOff(it, 150), 0); eq(A.gpOff(it, 50), 0.5); eq(A.gpOff(it, 300), 0.5);
  const s = {p:["a", "b"], q:["p:x", "p:y"], i:2, g:{0:{a:1, b:5}, 1:{a:9, b:9}}};
  const fake = {off:(key, v) => Math.abs(+v - 4)};
  eq(A.quizScores(fake, s), {a:1, b:2}, "round 1 to b (closest), round 2 a tie: both score");
  const done = {p:["a", "b"], q:["p:x"], i:1, g:[{a:100, b:1000}]};
  const key = A.gpQuestions()[0], item = A.gpItem(key), lo = Math.min(...item.p);
  eq(A.GAMES.price.result(Object.assign({}, done, {q:[key], g:[{a:lo, b:lo * 10}]})).w, ["a"]);
  eq(A.GAMES.price.result(Object.assign({}, done, {i:0})), null, "not over until every round is played");
});
test("Where in the world: a trip destination photo, scored by how far your pin is from it", () => {
  const q = A.wwQuestions(); eq(q.length, 5); ok(q.every(n => A.DEST_IMG[n] && A.wwCity(n)), q.join());
  const bkk = A.wwCity("Bangkok");
  ok(A.GAMES.where.off("Bangkok", `${bkk.lat},${bkk.lng}`) < 0.01); near(A.GAMES.where.off("Bangkok", "18.7883,98.9853"), 580, 30, "Chiang Mai is about 580 km away");
  eq(A.GAMES.where.off("Bangkok", "nonsense"), Infinity);
});
test("every game has a name, rules and a player range; the order on the Play page", () => {
  eq(A.GAME_ORDER, ["c4", "fleet", "dice", "price", "where"]);
  A.GAME_ORDER.forEach(id => { const g = A.GAMES[id]; ok(g.n && g.rules.length >= 2 && g.min >= 1 && g.max >= g.min && typeof g.init === "function", id); });
  const s = A.GAMES.dice.init(["a", "b"]); eq(Object.values(s.n), [5, 5]); ok(s.p.includes(s.t));
});
test("Friends aren't on the map until you switch them on; funny mode is off for a new phone", () => {
  eq(A.ui.mapFriends, false); eq(A.frOnMap(), false); eq(A.S_DEFAULTS.funny, false); eq(A.S.funny, false);
  eq(A.funnyMapTap({lat:39.9, lng:116.4}, false), false, "funny mode off: tapping China does nothing");
});
test("funny mode: China is found from the built-in outline; only a tap inside China (not on a place) plays the sound", () => {
  ok(A.funnyInChina(39.9, 116.4), "Beijing"); ok(A.funnyInChina(30.66, 104.07), "Chengdu"); ok(A.funnyInChina(43.8, 87.6), "Urumqi");
  ok(!A.funnyInChina(13.75, 100.5), "Bangkok"); ok(!A.funnyInChina(21.03, 105.85), "Hanoi"); ok(!A.funnyInChina(-8.65, 115.2), "Bali");
  A.S.funny = true;
  try {
    eq(A.funnyMapTap({lat:39.9, lng:116.4}, false), true); eq(A.funnyMapTap({lat:39.9, lng:116.4}, true), false, "a tap on a place pin");
    eq(A.funnyMapTap({lat:13.75, lng:100.5}, false), false);
  } finally { A.S.funny = false; }
});

/* tests that need to wait (restoring a backup) run last */
(async () => {
  A.S.saved = {x:{n:"Mine"}}; A.S.budget = {total:"", cur:"GBP", days:"", items:[{amt:100, what:"pad thai"}]};
  await A.restoreBackup({app:"sea-trip", state:{saved:{y:{n:"Theirs"}, x:{n:"Old copy"}}, budget:{items:[{amt:100, what:"pad thai"}, {amt:40, what:"bus"}]}}}, "merge");
  test("restoring a backup adds new saved places and spending once, and keeps this phone's copy", () => {
    eq(Object.keys(A.S.saved).sort(), ["x", "y"]);
    eq(A.S.saved.x.n, "Mine");
    eq(A.S.budget.items.length, 2);
  });
  A.S.split = {people:["A", "B"], items:[{id:"x1", w:"Bus", a:7.5, c:"GBP", by:"A", to:["A", "B"], t:5}], del:["old"]};
  const code = await A.splitEncode(); A.S.split = {people:[], items:[], del:[]};
  const back = await A.splitDecode(code);
  test("split costs: the shared link carries the whole tally and reads back the same", () => {
    ok(/^[zj][A-Za-z0-9_-]+$/.test(code), "link-safe: " + code.slice(0, 20));
    eq(back, {people:["A", "B"], items:[{id:"x1", w:"Bus", a:7.5, c:"GBP", by:"A", to:["A", "B"], t:5}], del:["old"]});
  });
  // Friends: two phones and a pretend Firebase that applies the same rules as firebase/database.rules.json
  {
    const {makeFake, DB_URL, API_KEY} = require("./fakefirebase");
    const fb = makeFake(), cfg = {SEA_FIREBASE:{apiKey:API_KEY, databaseURL:DB_URL}, fetch:fb.fetch};
    const P1 = load(undefined, cfg), P2 = load(undefined, cfg), P3 = load(undefined, cfg);
    P1.S.friends.name = "Dylan"; P2.S.friends.name = "Sam"; P3.S.friends.name = "Stranger";
    const me1 = await P1.frMe(), me2 = await P2.frMe(), me3 = await P3.frMe();
    test("friends: every phone gets its own private ID and a 6-letter code", () => {
      ok(me1.uid !== me2.uid && /^[A-Z2-9]{6}$/.test(me1.code) && me1.code !== me2.code);
      eq(fb.root.codes[me1.code], me1.uid); eq(fb.root.users[me2.uid].n, "Sam");
    });
    const added = await P1.frAdd(me2.code.toLowerCase().split("").join(" "));        // typed sloppily: lower case, spaces
    let reqs = await P2.frRequests();
    test("friends: adding by code finds them and asks them to add you back", () => {
      eq(added, "Sam"); eq(P1.S.friends.list[me2.uid].share, true);
      eq(reqs.map(r => [r.n, r.c]), [["Dylan", me1.code]]);
    });
    await P2.frAdd(reqs[0].c, false);                      // Sam adds Dylan back but keeps himself hidden
    let err = ""; try { await P1.frAdd("ZZZZZZ"); } catch(e){ err = e.message; }
    let err2 = ""; try { await P1.frAdd(me1.code); } catch(e){ err2 = e.message; }
    test("friends: an unknown code or your own code is refused", () => { ok(/No one has that code/.test(err), err); ok(/your own/.test(err2), err2); });
    const ubud = {lat:-8.50691234, lng:115.26251234, acc:12};
    const off = await P1.frSendNow(true, ubud, "ok");                 // sharing is off until turned on
    await P1.frSetOn(true);
    const fake = await P1.frSendNow(true, ubud, "test");               // the pretend test location is never sent
    const sent = await P1.frSendNow(true, ubud, "ok");
    const again = await P1.frSendNow(false, ubud, "ok");               // nothing new to send a moment later
    await P2.frPoll(); await P3.frPoll();
    test("friends: your position goes only to friends you share with, only once you switch sharing on (for now, a pretend test location counts)", () => {
      eq([off, fake, sent, again], [false, true, true, false]);
      eq([fb.root.loc[me1.uid].lat, fb.root.loc[me1.uid].lng, fb.root.loc[me1.uid].t], [-8.50691, 115.26251, fb.now]);
      eq(P2.frLocs[me1.uid].lat, -8.50691, "Sam sees Dylan");
    });
    let strangerErr = 0; try { await P3.frDb("GET", `loc/${me1.uid}`); } catch(e){ strangerErr = e.status; }
    let samLoc = null; await P1.frPoll(); samLoc = P1.frLocs[me2.uid];
    test("friends: someone you haven't shared with can't read your location, even with your ID", () => {
      eq(strangerErr, 401); ok(samLoc && samLoc.hidden, "Sam chose to stay hidden, so Dylan can't see him " + JSON.stringify(samLoc));
    });
    await P1.frSetShare(me2.uid, false); await P2.frPoll();
    const hiddenNow = P2.frLocs[me1.uid];
    await P1.frSetShare(me2.uid, true); await P1.frSetOn(false);
    test("friends: hiding from a friend, or turning sharing off, stops them seeing you (and deletes your last position)", () => {
      ok(hiddenNow && hiddenNow.hidden, JSON.stringify(hiddenNow));
      ok(!fb.root.loc || !fb.root.loc[me1.uid], "position deleted when sharing is switched off");
    });
    let forged = 0; try { await P3.frDb("PUT", `loc/${me1.uid}`, {lat:0, lng:0, t:1}); } catch(e){ forged = e.status; }
    let stolen = 0; try { await P3.frDb("PUT", `codes/${me1.code}`, me3.uid); } catch(e){ stolen = e.status; }
    test("friends: nobody can write someone else's location or take their code", () => eq([forged, stolen], [401, 401]));
    const P1b = load(undefined, cfg);                                  // a new phone (or cleared data) is a new person
    test("friends: with Firebase not set up the page explains instead of failing", () => {
      const P0 = load(); eq(P0.frCfg(), null);
      eq(P1b.frCfg().databaseURL, DB_URL);
      eq(load(undefined, {SEA_FIREBASE:{apiKey:"x", databaseURL:"https://evil.example.com"}}).frCfg(), null, "only a Firebase database address is accepted");
    });
    // developer phone: the first to claim it gets it, nobody else; only it can set faces, and only small JPEGs
    const claim3 = await P3.frClaimAdmin().then(() => "ok", e => e.message);
    const claim1 = await P1.frClaimAdmin().then(() => "ok", e => e.message);
    const jpeg = "data:image/jpeg;base64," + "A".repeat(200);
    const set3 = await P3.frSetPhoto(me2.uid, jpeg).then(() => "ok", e => e.message);
    const set1 = await P1.frSetPhoto(me1.uid, "data:image/png;base64,AAAA").then(() => "ok", e => e.message);
    test("friends: only the first phone to claim developer gets it, and photos can only be set by it", () => {
      eq(claim3, "ok", "the stranger's phone claimed first in this test"); eq(claim1, "permission");
      eq(set3, "ok"); eq(set1, "permission", "a non-developer can't set photos");
      eq(fb.root.photos[me2.uid], jpeg);
    });
    const big = await P3.frSetPhoto(me1.uid, "data:image/jpeg;base64," + "A".repeat(50000)).then(() => "ok", e => e.message);
    const ph1 = await P1.frLoadPhotos(true);
    test("friends: photos are small JPEGs, and every friend's phone loads them", () => { eq(big, "permission"); eq(ph1[me2.uid], jpeg); ok(/<img src="data:image\/jpeg/.test(P1.frAvatar(me2.uid, 24))); });
    test("friends: each friend gets their own colour, you are blue", () => {
      P1.S.friends.list = {a:{n:"A", at:1}, b:{n:"B", at:2}, c:{n:"C", at:3}};
      const cs = ["a", "b", "c"].map(P1.frColor); eq(new Set(cs).size, 3); eq(P1.frColor(me1.uid), "#7FB2D2");
    });
    // the location bug: with the pretend test location on, the app's own GPS position is what's sent
    P1.S.friends.list = {[me2.uid]:{n:"Sam", share:true, at:1}}; P1.S.friends.on = true;
    const sentFake = await P1.frSendNow(true, {lat:13.7, lng:100.5}, "test");
    test("friends: while testing, the pretend location is what friends see", () => { eq(sentFake, true); eq(fb.root.loc[me1.uid].lat, 13.7); });
    // games: Dylan starts Four in a row with Sam (parties/{pid}); only the people in it can see or change it
    const pid = "ptest1";
    const made = await P1.frDb("PUT", `parties/${pid}`, {g:"c4", h:me1.uid, m:{[me1.uid]:"Dylan", [me2.uid]:"Sam"}, j:{[me1.uid]:true}, k:1}).then(() => "ok", e => e.message);
    await P1.frDb("PUT", `invites/${me2.uid}/${me1.uid}`, {g:"c4", n:"Dylan", t:{".sv":"timestamp"}, p:pid});
    const inv = await P2.frDb("GET", `invites/${me2.uid}`);
    const joined = await P2.frDb("PUT", `parties/${pid}/j/${me2.uid}`, true).then(() => "ok", e => e.message);
    const st = {p:[me1.uid, me2.uid], b:".".repeat(42), t:0, last:-1};
    const moved = await P1.frDb("PATCH", `parties/${pid}`, {k:1, s:st}).then(() => "ok", e => e.message);
    const seen2 = await P2.frDb("GET", `parties/${pid}`);
    const status = async p => { try { await p; return "ok"; } catch(e){ return e.status; } };
    const peekParty = await status(P3.frDb("GET", `parties/${pid}`)), peekState = await status(P3.frDb("GET", `parties/${pid}/s`));
    const cheat = await status(P3.frDb("PUT", `parties/${pid}/s/t`, 1)), joinIn = await status(P3.frDb("PUT", `parties/${pid}/m/${me3.uid}`, "Stranger"));
    const takeOver = await status(P3.frDb("PUT", `parties/${pid}`, {g:"c4", h:me3.uid, m:{[me3.uid]:"Stranger"}}));
    const forgeNew = await status(P3.frDb("PUT", `parties/pforged`, {g:"c4", h:me1.uid, m:{[me1.uid]:"Dylan", [me2.uid]:"Sam"}}));
    const ownNew = await status(P3.frDb("PUT", `parties/pown`, {g:"price", h:me3.uid, m:{[me3.uid]:"Stranger"}}));
    test("games: a game is made with yourself in it; the friends invited can join and play; nobody else can see, join or change it", () => {
      eq([made, joined, moved], ["ok", "ok", "ok"]); eq(inv[me1.uid].p, pid); eq(seen2.s.b, st.b);
      eq([peekParty, peekState, cheat, joinIn, takeOver, forgeNew], [401, 401, 401, 401, 401, 401]); eq(ownNew, "ok");
    });
    // the Trip tally: your own row only, but everyone signed in can read it; each finished game counts once, games alone don't
    const ctx = {pid, me:me1.uid, party:{g:"c4", k:1, s:st}};
    await P1.gmRecord(ctx, P1.GAMES.c4, {w:[me1.uid]}); await P1.gmRecord(ctx, P1.GAMES.c4, {w:[me1.uid]});
    const ctx2 = {pid, me:me2.uid, party:{g:"c4", k:1, s:st}};
    await P2.gmRecord(ctx2, P2.GAMES.c4, {w:[me1.uid]});
    await P1.gmRecord({pid:"psolo", me:me1.uid, party:{g:"price", k:1, s:{p:[me1.uid]}}}, P1.GAMES.price, {w:[me1.uid]});
    const t1 = await P3.frDb("GET", `tally/${me1.uid}`), forgeTally = await status(P3.frDb("PUT", `tally/${me1.uid}/c4`, {w:99, p:99}));
    test("games: the Trip tally counts each game once per phone, only against someone, and nobody can change another's", () => {
      eq(t1, {c4:{w:1, p:1}}); eq(fb.root.tally[me2.uid], {c4:{w:0, p:1}}); eq(forgeTally, 401);
    });
    test("frListen falls back to checking every second when there's no live stream", () => {
      eq(P1.frSetIn({a:{b:1}}, "/a/c", 2), {a:{b:1, c:2}}); eq(P1.frSetIn({a:{b:1}}, "/", {z:1}), {z:1}); eq(P1.frSetIn({a:{b:1}}, "/a/b", null), {a:{}});
    });
    // live split groups: Dylan starts one with Sam; both add payments and see the same tally; a stranger can't get in
    const gid = await P1.liveCreateGroup("Bali crew", [me2.uid]);
    const m1 = await P1.liveSplitModel(gid);
    eq(await m1.add({what:"Taxi", amount:"300000", cur:"IDR", by:me1.uid, to:[me1.uid, me2.uid]}), "");
    const g2 = await P2.liveListGroups(), m2 = await P2.liveSplitModel(gid);
    eq(await m2.add({what:"Dinner", amount:"200000", cur:"IDR", by:me2.uid, to:[me1.uid, me2.uid]}), "");
    const m1b = await P1.liveSplitModel(gid), bal = P1.splitBalances({people:m1b.people, items:m1b.items});
    test("live split: a group started with a friend shows up on their phone, and both add to one tally", () => {
      eq(g2.map(g => g.n), ["Bali crew"]);
      eq(m1b.people.map(m1b.name), ["You", "Sam"], "you first, shown as You");
      eq(m1b.items.length, 2); ok(m1b.items.some(x => x.w === "Dinner" && x.add === me2.uid), "Sam's payment is on Dylan's phone");
      near(bal[me1.uid], P1.toGBP(50000, "IDR"), 0.02, "Dylan is owed half the difference");
      near(bal[me2.uid], -P1.toGBP(50000, "IDR"), 0.02);
    });
    const solo = await m1b.add({what:"Snack", amount:"10", cur:"GBP", by:me1.uid, to:[me1.uid]});
    const forOthers = await m1b.add({what:"Gift", amount:"10", cur:"GBP", by:me1.uid, to:[me2.uid]});
    const m1g = await P1.liveSplitModel(gid), gift = m1g.items.find(x => x.w === "Gift");
    test("live split: you're always in your own split, with at least one other person", () => {
      ok(/at least one person/.test(solo), solo); eq(forOthers, ""); eq(gift.to.sort(), [me1.uid, me2.uid].sort());
    });
    await m1g.del(gift.id);
    const plan = P1.splitSettle(bal); await m1b.paid(plan[0].from, plan[0].to, plan[0].gbp);
    const m2b = await P2.liveSplitModel(gid), bal2 = P2.splitBalances({people:m2b.people, items:m2b.items});
    test("live split: Paid settles it for everyone", () => ok(Object.values(bal2).every(v => Math.abs(v) < 0.02), JSON.stringify(bal2)));
    const bad = await m2b.add({what:"x", amount:"5", cur:"GBP", by:me3.uid, to:[me1.uid]});
    let peek = 0; try { await P3.frDb("GET", `groups/${gid}`); } catch(e){ peek = e.status; }
    let sneak = 0; try { await P3.frDb("PUT", `groups/${gid}/members/${me3.uid}`, "Stranger"); } catch(e){ sneak = e.status; }
    let post = 0; try { await P3.frDb("PUT", `groups/${gid}/items/zz`, {w:"x", a:1, c:"GBP", by:me3.uid, to:{}, t:1}); } catch(e){ post = e.status; }
    test("live split: only members can see or add to a group, and only members can be the payer", () => {
      ok(/who paid/.test(bad), bad); eq([peek, sneak, post], [401, 401, 401]);
    });
    await m2b.del(m2b.items.find(x => x.w === "Taxi").id);
    const m1c = await P1.liveSplitModel(gid);
    test("live split: a deleted payment goes from everyone's phone, and the last copy is kept for no signal", () => {
      ok(!m1c.items.some(x => x.w === "Taxi")); ok(P1.liveStore()[gid].items && Object.keys(P1.liveStore()[gid].items).length === 2);
    });
    // messages: a developer adds a sticker; anyone sends it to a friend; only the friend can read it, and only as themselves
    const stk = await P3.frAddSticker("Cooked", "data:image/png;base64,AAAA").then(x => x, e => "ERR " + e.message);
    const notDev = await P2.frAddSticker("Nope", "data:image/png;base64,AAAA").then(() => "ok", e => e.message);
    const stickers2 = await P2.frLoadStickers(true);
    const mid = await P2.frSendSticker(me1.uid, stk);
    let forgedMsg = 0; try { await P3.frDb("PUT", `msgs/${me1.uid}/zz`, {f:me2.uid, s:stk, t:1}); } catch(e){ forgedMsg = e.status; }
    let peekMsg = 0; try { await P3.frDb("GET", `msgs/${me1.uid}`); } catch(e){ peekMsg = e.status; }
    const inbox = await P1.frDb("GET", `msgs/${me1.uid}`);
    test("messages: stickers come from a developer phone, friends send them, only the receiver reads them", () => {
      ok(/^k/.test(stk), stk); eq(notDev, "permission"); eq(stickers2[stk].n, "Cooked");
      eq(inbox[mid].f, me2.uid); eq(inbox[mid].s, stk); eq([forgedMsg, peekMsg], [401, 401]);
    });
    test("developer mode: typing ELITE POTATO in the map search switches it on and off", () => {
      eq(P1.frDevCode("elite potato"), false); eq(P1.frDevCode(" ELITE  POTATO "), true); eq(P1.S.dev, true); eq(P1.toolsInOrder().slice(-1)[0].id, "developer");
      eq(P1.frDevCode("ELITE POTATO"), true); eq(P1.S.dev, false); ok(!P1.toolsInOrder().some(t => t.id === "developer"), "the Developer tool hides again");
    });
    // a developer renames a sticker: friends' phones show the new name
    await P3.frRenameSticker(stk, "Sent it");
    let renameNo = 0; try { await P2.frDb("PUT", `stickerIndex/${stk}`, "Hacked"); } catch(e){ renameNo = e.status; }
    const stickers2b = await P2.frLoadStickers(true);
    test("messages: a developer can rename a sticker, nobody else can", () => { eq(stickers2b[stk].n, "Sent it"); eq(renameNo, 401); });
    // deleting a live split group: gone for every member
    await P1.liveDeleteGroup(gid);
    const after2 = await P2.liveListGroups(), raw = fb.root.groups && fb.root.groups[gid];
    test("live split: deleting a group removes it, and its payments, for everyone in it", () => {
      eq(after2.map(g => g.id).includes(gid), false); ok(!raw || (!Object.keys(raw.items || {}).length && !Object.keys(raw.members || {}).length && !raw.n), JSON.stringify(raw)); ok(!P1.liveStore()[gid]);
    });
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
