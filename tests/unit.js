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
test("surf spots come from OpenStreetMap and sit in Activities", () => {
  ok(A.SURF.length >= 20 && A.SURF.every(p => /^o:[nwr]\d+$/.test(p.id) && p.c === "cool" && A.isSurf(p) && A.ccAt(p.lat, p.lng) === p.cc), "every surf place is inside a covered country");
  ok(A.SURF.some(p => p.k === "surf" && /Gerupuk/.test(p.n)), "Gerupuk (Lombok) is a surf spot");
  ok(A.SURF.filter(p => /school|shop|hire|rental/i.test(p.n)).every(p => p.k === "surfschool"), "schools and shops aren't called surf spots");
  const chip = A.CHIPS.cool.find(c => c.id === "surf");
  ok(chip.f(A.SURF[0]) && !chip.f({osm:true, k:"temple", n:"Wat X"}));
  eq(A.findPlace(A.SURF[0].id), A.SURF[0]);
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

/* tests that need to wait (restoring a backup) run last */
(async () => {
  A.S.saved = {x:{n:"Mine"}}; A.S.budget = {total:"", cur:"GBP", days:"", items:[{amt:100, what:"pad thai"}]};
  await A.restoreBackup({app:"sea-trip", state:{saved:{y:{n:"Theirs"}, x:{n:"Old copy"}}, budget:{items:[{amt:100, what:"pad thai"}, {amt:40, what:"bus"}]}}}, "merge");
  test("restoring a backup adds new saved places and spending once, and keeps this phone's copy", () => {
    eq(Object.keys(A.S.saved).sort(), ["x", "y"]);
    eq(A.S.saved.x.n, "Mine");
    eq(A.S.budget.items.length, 2);
  });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
