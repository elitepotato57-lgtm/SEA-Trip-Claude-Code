// Adds Cambodia, Vietnam, Laos and Singapore to the journey planner's network (D.net in js/data.js): hubs, links between them,
// and the links across the borders to Thailand and Indonesia. Researched 18 Nov 2026; each link carries its sources.
// Links marked verified:false are the planner's own estimates (flights: time worked out from the distance, price "check live").
// Re-runnable: it removes what it added before and adds it again.     node tools/transport-asia.js
// When a new country is loaded on the map, add its hubs and links here (or in a file like this one) as part of the job.
const fs = require("fs"), path = require("path");
const FILE = path.join(__dirname, "..", "js", "data.js");
const lines = fs.readFileSync(FILE, "utf8").split("\n");
const i = lines.findIndex(l => l.startsWith("const D = "));
const cr = lines[i].endsWith("\r") ? "\r" : "";
const D = JSON.parse(lines[i].replace(/\r$/, "").slice("const D = ".length).replace(/;\s*$/, ""));
const N = D.net;

// [id, name, lat, lng, group, island, 12Go slug]
const HUBS = [
  ["han", "Hanoi", 21.0285, 105.8542, "North Vietnam", false, "hanoi"],
  ["ninhbinh", "Ninh Binh", 20.2506, 105.9745, "North Vietnam", false, "ninh-binh"],
  ["sapa", "Sapa", 22.3364, 103.8438, "North Vietnam", false, "sapa"],
  ["hagiang", "Ha Giang", 22.8233, 104.9836, "North Vietnam", false, "ha-giang"],
  ["catba", "Cat Ba Island", 20.7270, 107.0480, "North Vietnam", true, "cat-ba-island"],
  ["hue", "Hue", 16.4637, 107.5909, "Central Vietnam", false, "hue"],
  ["dad", "Da Nang", 16.0544, 108.2022, "Central Vietnam", false, "da-nang"],
  ["hoian", "Hoi An", 15.8801, 108.3380, "Central Vietnam", false, "hoi-an"],
  ["nhatrang", "Nha Trang", 12.2388, 109.1967, "South Vietnam", false, "nha-trang"],
  ["dalat", "Da Lat", 11.9404, 108.4583, "South Vietnam", false, "da-lat"],
  ["muine", "Mui Ne", 10.9333, 108.2833, "South Vietnam", false, "mui-ne"],
  ["sgn", "Ho Chi Minh City", 10.7769, 106.7009, "South Vietnam", false, "ho-chi-minh-city"],
  ["pqc", "Phu Quoc", 10.2270, 103.9670, "South Vietnam", true, "phu-quoc"],
  ["rep", "Siem Reap", 13.3633, 103.8564, "Cambodia", false, "siem-reap"],
  ["pnh", "Phnom Penh", 11.5564, 104.9282, "Cambodia", false, "phnom-penh"],
  ["kampot", "Kampot", 10.6104, 104.1815, "Cambodia", false, "kampot"],
  ["kep", "Kep", 10.4829, 104.3167, "Cambodia", false, "kep"],
  ["ihk", "Sihanoukville", 10.6253, 103.5234, "Cambodia", false, "sihanoukville"],
  ["kohrong", "Koh Rong", 10.7155, 103.2397, "Cambodia", true, "koh-rong"],
  ["vte", "Vientiane", 17.9757, 102.6331, "Laos", false, "vientiane"],
  ["vangvieng", "Vang Vieng", 18.9235, 102.4478, "Laos", false, "vang-vieng"],
  ["lpq", "Luang Prabang", 19.8856, 102.1347, "Laos", false, "luang-prabang"],
  ["nongkhiaw", "Nong Khiaw", 20.5667, 102.6167, "Laos", false, "nong-khiaw"],
  ["huayxai", "Huay Xai", 20.2775, 100.4128, "Laos", false, "huay-xai"],
  ["pakse", "Pakse", 15.1202, 105.7999, "Laos", false, "pakse"],
  ["dondet", "Don Det (4,000 Islands)", 13.9667, 105.9167, "Laos", true, "don-det"],
  ["sin", "Singapore", 1.2903, 103.8519, "Singapore", false, "singapore"]
];
const STATIONS = {
  vtestn:["Vientiane railway station (Laos-China Railway), 14 km from the centre", 18.0393, 102.6735],
  lpqstn:["Luang Prabang railway station, 12 km from town", 19.8306, 102.2120],
  hanstn:["Hanoi railway station", 21.0245, 105.8412],
  huestn:["Hue railway station", 16.4565, 107.5776],
  dadstn:["Da Nang railway station", 16.0717, 108.2093],
  ntstn:["Nha Trang railway station", 12.2484, 109.1844],
  sgnstn:["Saigon railway station", 10.7820, 106.6772]
};
const S61L = ["Seat 61: Laos", "https://www.seat61.com/Laos.htm"], S61V = ["Seat 61: Vietnam", "https://www.seat61.com/Vietnam.htm"], S61C = ["Seat 61: Cambodia", "https://www.seat61.com/Cambodia.htm"];
const E = (a, b, mode, dur, p, cur, op, notes, src, extra = {}) => Object.assign({a, b, mode, dur, p, cur, op, da:null, db:null, notes, src, verified:true, asia:1}, extra);
const EDGES = [
  // Laos
  E("vte", "vangvieng", "Train", [0.9, 1.3], null, "LAK", "Laos-China Railway fast train", ["About 1 hour", "Vientiane station is 14 km from the centre: about $15 by taxi, or bus 28 (25,000 kip)"], [S61L], {da:"vtestn"}),
  E("vangvieng", "lpq", "Train", [0.8, 1.2], null, "LAK", "Laos-China Railway fast train", ["About 1 hour", "Luang Prabang station is 12 km from town, about 25 minutes by taxi"], [S61L], {db:"lpqstn"}),
  E("vte", "lpq", "Train", [1.8, 2.7], [330000, 522000], "LAK", "Laos-China Railway, 2nd or 1st class", ["Several trains a day", "Business class 975,000 kip"], [S61L], {da:"vtestn", db:"lpqstn"}),
  E("vte", "lpq", "Minivan", [6, 6.5], [280000], "LAK", "Chitpasong air-con minivan", ["Departures 08:00, 11:00, 13:00 and 16:00"], [S61L]),
  E("bkk", "vte", "Train", [12.5, 13.5], [784, 874], "THB", "Direct sleeper train, 2nd class berth", ["Upper berth 784 baht, lower 874", "Leaving Laos there's a 10,000 kip (or 40 baht) exit fee"], [S61L], {da:"aphiwat"}),
  E("han", "vte", "Bus", [22, 24], [30], "USD", "Sleeper bus via the Cau Treo border", ["About $30 online, or 550,000 dong bought locally in Hanoi"], [S61L]),
  E("han", "lpq", "Bus", [24, 26], [54], "USD", "Sleeper bus", ["About $54 online"], [S61L]),
  E("huayxai", "lpq", "Ferry", [30, 33], [23, 34], "USD", "Slow boat down the Mekong", ["Two days, with a night in Pakbeng (bed not included)", "Leaves Huay Xai about 08:30"], [["GoAsia", "https://goasia.cc/en/laos/huay-xai-to-luang-prabang"]]),
  E("lpq", "nongkhiaw", "Minivan", [3.5, 5], [8, 12], "USD", "Shared minivan", ["About 4 hours, sometimes 5", "Morning departures"], [["Bookaway", "https://bookaway.com/routes/laos/luang-prabang-to-nong-khiaw"], ["12Go", "https://www.12go.asia/en/travel/luang-prabang/nong-khiaw-minivan-station"]]),
  E("vte", "pakse", "Bus", [11.5, 13], [17, 33], "USD", "Overnight sleeper bus from the Southern Bus Station", ["Kriangkai sleeper leaves 20:30, arrives about 08:00", "Sleeper beds are often shared doubles"], [["A Social Nomad", "https://asocialnomad.com/?p=26272"], ["North Vietnam travel guide", "https://north-vietnam.com/how-to-get-from-vientiane-to-pakse-laos"]]),
  E("pakse", "dondet", "Bus + ferry", [2.5, 3.5], [155000], "LAK", "Minivan to Ban Nakasang, then boat", ["Leaves about 08:30, arrives about 11:00", "The boat to Don Det is 10–15 minutes"], [["We Are Lao", "https://wearelao.com/?p=8583"], ["GoAsia", "https://goasia.cc/en/laos/pakse-to-don-det"]]),
  E("cei", "huayxai", "Bus", [2.5, 3.5], null, "THB", "Bus to Chiang Khong, then over the Friendship Bridge", ["About 115 km to the border", "Not price-checked"], [], {verified:false}),
  // Vietnam
  E("han", "ninhbinh", "Train", [2.2, 2.5], null, "VND", "Reunification Express", ["About 2 hours 15 minutes"], [S61V], {da:"hanstn"}),
  E("han", "hue", "Train", [12.5, 13], [569000, 1218000], "VND", "Reunification Express (SE1, SE3)", ["Soft seat 569,000 dong; soft sleeper 1,139,000–1,218,000", "Overnight from Hanoi, arrives in the morning"], [S61V], {da:"hanstn", db:"huestn"}),
  E("hue", "dad", "Train", [2.5, 2.8], null, "VND", "Reunification Express", ["One of the most scenic stretches, over the Hai Van Pass"], [S61V], {da:"huestn", db:"dadstn"}),
  E("han", "dad", "Train", [15.5, 16.5], [651000, 1294000], "VND", "Reunification Express", ["Soft seat 651,000 dong; soft sleeper up to 1,294,000"], [S61V], {da:"hanstn", db:"dadstn"}),
  E("dad", "hoian", "Taxi", [0.5, 0.75], [350000], "VND", "Taxi (or the yellow bus no. 1, about 1 hour)", ["About 350,000 dong by taxi, depending on bargaining"], [S61V]),
  E("dad", "nhatrang", "Train", [10, 10.5], null, "VND", "Reunification Express", ["Daytime train"], [S61V], {da:"dadstn", db:"ntstn"}),
  E("nhatrang", "sgn", "Train", [8, 8.5], [404000, 869000], "VND", "Reunification Express", ["Soft seat 404,000 dong; soft sleeper up to 869,000"], [S61V], {da:"ntstn", db:"sgnstn"}),
  E("sgn", "muine", "Train", [3.7, 4.5], null, "VND", "Train to Binh Thuan (Phan Thiet), then a taxi", ["Binh Thuan station is for Phan Thiet; Mui Ne is about 25 km further"], [S61V], {da:"sgnstn"}),
  E("han", "sapa", "Bus", [5.5, 6.5], [13, 18], "USD", "Sleeper bus (Sapa Express and others)", ["Cabin sleepers cost more, about $18–33"], [["12Go", "https://12go.asia/en/travel/hanoi/sapa/?z=11296338"], ["Best Price Travel", "https://www.bestpricetravel.com/travel-guide/hanoi-to-sapa-bus-1575.html"]]),
  E("han", "sapa", "Train", [8.5, 9.5], null, "VND", "Overnight sleeper train SP1 to Lao Cai, then 38 km by bus or taxi", ["Leaves Hanoi 21:35, Lao Cai 05:15", "Private tourist sleeping cars are on the same train"], [S61V], {da:"hanstn"}),
  E("han", "hagiang", "Bus", [6.5, 8], [250000, 480000], "VND", "Sleeper bus or limousine van", ["Limousine vans are a little quicker"], [["Vietnam Tourism (prices checked 24 Oct 2026)", "https://vietnamtourism.com/en/hanoi-to-ha-giang-3-routes-compared-sleeper-bus-limousine-van-private-car"]]),
  E("han", "catba", "Bus + ferry", [3.5, 4], [10, 18], "USD", "Bus, speedboat and bus combo", ["Hotel pick-up is often included"], [["Vietnam Tourism (prices checked 27 Oct 2026)", "https://www.vietnamtourism.com/en/transport/hanoi-cat-ba"], ["Pelago", "https://www.pelago.com/en/activity/pvh2o3z45-hanoi-to-catba-transfer-or-return-hanoi"]]),
  E("sgn", "dalat", "Bus", [7, 9], [300000, 400000], "VND", "Phuong Trang (FUTA) and others", ["Sleeper, cabin or limousine; price depends on the vehicle"], [["Vietnam Tourism (prices checked 24 Oct 2026)", "https://www.vietnamtourism.com/en/transport/ho-chi-minh-city-da-lat"]]),
  E("nhatrang", "dalat", "Bus", [3, 4], [170000], "VND", "Phuong Trang (FUTA)", ["About 3–3½ hours up into the hills"], [["redBus", "https://www.redbus.vn/en/bus-tickets/routes/nha-trang-to-da-lat"]]),
  E("sgn", "pnh", "Bus", [6, 6.5], [14], "USD", "Mekong Express, Sapaco, Kumho Samco or Giant Ibis", ["Visa and passport checks at the Bavet border, about 3 hours in"], [S61C]),
  // Cambodia
  E("pnh", "rep", "Bus", [6, 6.5], [13, 18], "USD", "Mekong Express ($13), Giant Ibis ($15), Vireak Buntham ($18)", ["Buses from early morning to early afternoon", "Some are sleepers with flat bunks"], [S61C]),
  E("pnh", "ihk", "Train", [6.5, 6.5], [10], "USD", "Royal Railway", ["Buses are quicker: Mekong Express $12, PSD $9, Giant Ibis $11"], [S61C]),
  E("pnh", "kampot", "Train", [4.25, 4.5], [9], "USD", "Royal Railway", ["Buses cost about $4.50–5 (Capitol, Sorya)"], [S61C]),
  E("kampot", "ihk", "Train", [2.25, 2.5], [7], "USD", "Royal Railway", [], [S61C]),
  E("ihk", "kohrong", "Ferry", [0.75, 1], [22, 24], "USD", "Speed ferry", ["First boats from about 07:45; the last back about 16:45"], [["Openferry", "https://openferry.com/routes/sihanoukville-koh-rong-soksan-beach"], ["Direct Ferries", "https://directferries.com/sihanoukville_koh_rong_longset_beach_ferry.htm"]])
];
// flights: these routes are flown, but the time is worked out from the distance and the price is left to check live
const FLIGHTS = [["bkk", "han"], ["bkk", "sgn"], ["bkk", "rep"], ["bkk", "pnh"], ["bkk", "vte"], ["bkk", "lpq"], ["bkk", "sin"], ["sin", "dps"], ["sin", "jakarta"],
  ["sin", "sgn"], ["sin", "han"], ["sin", "pnh"], ["han", "sgn"], ["han", "dad"], ["sgn", "dad"], ["sgn", "pqc"], ["han", "pqc"], ["han", "lpq"], ["han", "rep"], ["sgn", "nhatrang"], ["han", "nhatrang"], ["cnx", "lpq"]];
const km = (a, b) => { const r = Math.PI / 180, x = (b[3] - a[3]) * r * Math.cos((a[2] + b[2]) / 2 * r), y = (b[2] - a[2]) * r; return Math.sqrt(x * x + y * y) * 6371; };

// remove anything added before, then add
const ids = new Set(HUBS.map(h => h[0]));
N.hubs = N.hubs.filter(h => !ids.has(h[0]));
N.edges = N.edges.filter(e => !e.asia);
HUBS.forEach(h => { N.hubs.push(h.slice(0, 6)); N.go12[h[0]] = h[6]; });
Object.assign(N.stations, STATIONS);
const hub = id => N.hubs.find(h => h[0] === id);
EDGES.forEach(e => { if (!hub(e.a) || !hub(e.b)) throw new Error("no hub " + e.a + "/" + e.b); N.edges.push(e); });
for (const [a, b] of FLIGHTS){
  const A = hub(a), B = hub(b); if (!A || !B) throw new Error("no hub " + a + "/" + b);
  const h = km(A, B) / 760 + 0.35;
  N.edges.push({a, b, mode:"Flight", dur:[Math.round(h * 4) / 4, Math.round((h + 0.3) * 4) / 4], p:null, cur:"USD", op:"Flights (compare on Google Flights)", da:null, db:null,
    notes:[`About ${Math.round(km(A, B))} km; flying time estimated from the distance`, "Times and fares change by date: use the flight search button"], src:[], verified:false, asia:1});
}
lines[i] = "const D = " + JSON.stringify(D) + ";" + cr;
fs.writeFileSync(FILE, lines.join("\n"));
console.log(`${HUBS.length} hubs, ${EDGES.length} researched links and ${FLIGHTS.length} flight links added; network now ${N.hubs.length} hubs, ${N.edges.length} links`);
