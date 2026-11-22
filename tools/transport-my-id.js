// Adds Malaysia and the rest of Indonesia (Java, northern and western Sumatra, Flores, Sulawesi, Kalimantan, Raja Ampat) to the
// journey planner's network (D.net in js/data.js): hubs, the links between them and the links across the borders to Thailand,
// Singapore and the parts of Indonesia already there. Researched 22 Nov 2026 from Seat 61 and Wikivoyage; each link carries
// its sources. Prices are only given where a source states one; where its price is years old it's in the notes instead, and
// the fare shows as "check live". Links marked verified:false are the planner's own estimates: flights (these routes are flown,
// but the time is worked out from the distance and the price is left to check live) and a few road links whose sources give
// no journey time (time worked out from the distance, as for the Chiang Rai–Huay Xai bus).
// Re-runnable: it removes what it added before and adds it again.     node tools/transport-my-id.js
// The new hubs have no 12Go page name: 12Go's address for a place couldn't be checked, so no 12Go button rather than a broken one.
const fs = require("fs"), path = require("path");
const FILE = path.join(__dirname, "..", "js", "data.js");
const lines = fs.readFileSync(FILE, "utf8").split("\n");
const i = lines.findIndex(l => l.startsWith("const D = "));
const cr = lines[i].endsWith("\r") ? "\r" : "";
const D = JSON.parse(lines[i].replace(/\r$/, "").slice("const D = ".length).replace(/;\s*$/, ""));
const N = D.net;

// [id, name, lat, lng, group, island] — coordinates are the town's node in OpenStreetMap (or the jetty / station for ports)
const HUBS = [
  // Malaysia
  ["kul", "Kuala Lumpur", 3.1517, 101.6942, "Malaysia", false],
  ["penang", "George Town", 5.4142, 100.3287, "Malaysia", true],
  ["langkawi", "Langkawi", 6.2913, 99.7289, "Malaysia", true],
  ["malacca", "Malacca", 2.1943, 102.2487, "Malaysia", false],
  ["ipoh", "Ipoh", 4.5987, 101.09, "Malaysia", false],
  ["cameron", "Cameron Highlands", 4.4707, 101.3777, "Malaysia", false],
  ["kualabesut", "Kuala Besut jetty", 5.8308, 102.5577, "Malaysia", false],
  ["perhentian", "Perhentian Islands", 5.915, 102.735, "Malaysia", true],
  ["mersing", "Mersing jetty", 2.4346, 103.8388, "Malaysia", false],
  ["tioman", "Tioman", 2.8187, 104.1586, "Malaysia", true],
  ["kotabharu", "Kota Bharu", 6.1248, 102.2378, "Malaysia", false],
  ["jerantut", "Jerantut", 3.9367, 102.372, "Malaysia", false],
  ["tamannegara", "Taman Negara", 4.383, 102.4012, "Malaysia", false],
  ["cherating", "Cherating", 4.1265, 103.3925, "Malaysia", false],
  ["kuantan", "Kuantan", 3.7974, 103.3219, "Malaysia", false],
  ["padangbesar", "Padang Besar (border station)", 6.6627, 100.3202, "Malaysia", false],
  ["kuching", "Kuching", 1.5598, 110.3454, "Malaysian Borneo", false],
  ["kk", "Kota Kinabalu", 5.978, 116.0729, "Malaysian Borneo", false],
  ["semporna", "Semporna", 4.4791, 118.6119, "Malaysian Borneo", false],
  // Indonesia
  ["bandung", "Bandung", -6.9218, 107.6071, "Java", false],
  ["yogya", "Yogyakarta", -7.8013, 110.3647, "Java", false],
  ["surabaya", "Surabaya", -7.2463, 112.7378, "Java", false],
  ["malang", "Malang", -7.9771, 112.634, "Java", false],
  ["bromo", "Mount Bromo", -7.9219, 112.9652, "Java", false],
  ["banyuwangi", "Banyuwangi", -8.2095, 114.3737, "Java", false],
  ["gilimanuk", "Gilimanuk port", -8.1609, 114.4369, "Bali", false],
  ["medan", "Medan", 3.5895, 98.6742, "Sumatra", false],
  ["bukitlawang", "Bukit Lawang", 3.548, 98.1272, "Sumatra", false],
  ["laketoba", "Lake Toba", 2.6706, 98.8608, "Sumatra", true],
  ["padang", "Padang", -0.9248, 100.3633, "Sumatra", false],
  ["bukittinggi", "Bukittinggi", -0.3052, 100.3695, "Sumatra", false],
  ["bandaaceh", "Banda Aceh", 5.5528, 95.3193, "Sumatra", false],
  ["pulauweh", "Pulau Weh", 5.8706, 95.2581, "Sumatra", true],
  ["labuanbajo", "Labuan Bajo", -8.496, 119.8936, "Flores", false],
  ["ende", "Ende", -8.8453, 121.6456, "Flores", false],
  ["moni", "Moni", -8.7502, 121.8499, "Flores", false],
  ["makassar", "Makassar", -5.1343, 119.4124, "Sulawesi", false],
  ["rantepao", "Rantepao", -2.9705, 119.8987, "Sulawesi", false],
  ["manado", "Manado", 1.49, 124.8408, "Sulawesi", false],
  ["sorong", "Sorong", -0.8806, 131.2879, "Papua", false],
  ["rajaampat", "Raja Ampat", -0.4211, 130.823, "Papua", true],
  ["pangkalanbun", "Pangkalan Bun", -2.6766, 111.6316, "Kalimantan", false],
  ["pontianak", "Pontianak", -0.0227, 109.3447, "Kalimantan", false]
];
// stations, from OpenStreetMap
const STATIONS = {
  klsentral:["KL Sentral station", 3.1341, 101.6865],
  jbsentral:["JB Sentral station (Johor Bahru), over the causeway from Woodlands", 1.463, 103.7646],
  butterworth:["Butterworth station, then the 10-minute ferry to George Town", 5.3934, 100.3666],
  ipohstn:["Ipoh railway station", 4.5982, 101.0734],
  pbstn:["Padang Besar station (border checks for both countries are in the station)", 6.6627, 100.3202],
  jerantutstn:["Jerantut station", 3.9371, 102.3577],
  bdgstn:["Bandung station", -6.9143, 107.6021],
  halim:["Halim high-speed station, 14 km from Gambir", -6.2456, 106.8845],
  yogyastn:["Yogyakarta (Tugu) station", -7.7892, 110.3635],
  sgustn:["Surabaya Gubeng station", -7.2653, 112.7522],
  pbgstn:["Probolinggo station", -7.7427, 113.216],
  ktgstn:["Ketapang station (Banyuwangi), 350 m from the Bali ferry", -8.1412, 114.3971],
  mlgstn:["Malang station", -7.9778, 112.6374]
};
const S61M = ["Seat 61: Malaysia", "https://www.seat61.com/Malaysia.htm"], S61I = ["Seat 61: Indonesia", "https://www.seat61.com/Indonesia.htm"];
const WV = (page, label = page.replace(/_/g, " ").replace(/ \(.*\)$/, "")) => ["Wikivoyage: " + label, "https://en.wikivoyage.org/wiki/" + page];
const E = (a, b, mode, dur, p, cur, op, notes, src, extra = {}) => Object.assign({a, b, mode, dur, p, cur, op, da:null, db:null, notes, src, verified:true, myid:1}, extra);
const km = (a, b) => { const r = Math.PI / 180, x = (b[3] - a[3]) * r * Math.cos((a[2] + b[2]) / 2 * r), y = (b[2] - a[2]) * r; return Math.sqrt(x * x + y * y) * 6371; };
// a road link with no journey time in its sources: the time is worked out from the distance (1.3 × straight line at 50 km/h)
const ROAD = (a, b, mode, p, cur, op, notes, src) => ({a, b, mode, p, cur, op, notes, src, road:true});
const EDGES = [
  // ---- Malaysia: trains (Seat 61 timetables and fares)
  E("sin", "kul", "Train", [5.5, 6.5], [88, 156], "MYR", "Shuttle train to JB Sentral, then the ETS electric train", ["Woodlands to JB Sentral: 5 minutes, RM16.10 bought online", "ETS from JB Sentral to KL Sentral about 4h40: RM88 Platinum, RM156 Business"], [S61M], {db:"klsentral"}),
  E("kul", "penang", "Train", [4.25, 4.75], [63, 94], "MYR", "ETS electric train to Butterworth, then the ferry", ["About 4 hours to Butterworth: RM63 Gold, RM94 Platinum (RM168 Business)", "Ferry to George Town every 20–30 minutes, 10 minutes, RM2 (cards only)"], [S61M], {da:"klsentral", db:"butterworth"}),
  E("kul", "ipoh", "Train", [2, 2.5], [29, 44], "MYR", "ETS electric train", ["From RM29 on a stopping train (about 2½ hours) to RM44 non-stop (about 2 hours)"], [WV("Ipoh"), S61M], {da:"klsentral", db:"ipohstn"}),
  E("ipoh", "penang", "Train", [2, 2.5], [22, 33], "MYR", "ETS electric train to Butterworth, then the ferry", ["About 2 hours, RM22–33", "Ferry to George Town 10 minutes, RM2"], [WV("Ipoh")], {da:"ipohstn", db:"butterworth"}),
  E("kul", "padangbesar", "Train", [5.25, 5.5], [79, 116], "MYR", "ETS electric train", ["RM79 Gold, RM116 Platinum (RM190 Business)"], [S61M], {da:"klsentral", db:"pbstn"}),
  E("penang", "padangbesar", "Train", [2, 2.5], [12], "MYR", "Ferry to Butterworth, then the KTM Komuter train", ["Butterworth to Padang Besar about 1h50, RM12"], [S61M], {da:"butterworth", db:"pbstn"}),
  E("bkk", "padangbesar", "Train", [15.5, 16.5], [958], "THB", "International Express sleeper (trains 45/46)", ["958 baht for a lower berth, upper berths about 14% less", "Sleepers can sell out a week or two ahead", "Padang Besar is an hour ahead of Thailand"], [S61M], {da:"aphiwat", db:"pbstn"}),
  // ---- Malaysia: islands
  E("kul", "langkawi", "Train + ferry", [7, 8], null, "MYR", "ETS train to Arau, taxi to Kuala Perlis, then the ferry", ["ETS to Arau about 5 hours", "Taxi to the Kuala Perlis jetty 20 minutes, about RM25", "Langkawi Ferry Line: 1h15, RM35 for foreigners"], [S61M], {da:"klsentral"}),
  E("penang", "langkawi", "Train + ferry", [3.5, 4.5], null, "MYR", "Ferry to Butterworth, train to Arau, taxi, then the ferry from Kuala Perlis", ["The direct Penang–Langkawi ferry was discontinued", "Butterworth to Arau about 1½ hours; taxi to Kuala Perlis about RM25; ferry 1h15, RM35"], [S61M]),
  E("langkawi", "lipe", "Ferry", [1.25, 2], [100, 128], "MYR", "Tropical Charters, Telaga Terminal speedboats and others, from Kuah jetty", ["Tropical Charters RM118 one way (RM100 online), with the longtail transfer and Thai customs fee", "Telaga speedboats RM128, 75 minutes"], [WV("Langkawi")]),
  E("kotabharu", "kualabesut", "Bus", [1.5, 2], [6, 7.5], "MYR", "City Liner 639 (hourly) or SKMK express", ["City Liner RM6, 1h40; SKMK express RM7.50, 3 or 4 a day", "A shared taxi is about RM80"], [WV("Kuala_Besut")]),
  E("kualabesut", "perhentian", "Ferry", [0.5, 1.5], null, "MYR", "Speedboat (or slow boat) from Kuala Besut jetty", ["Speedboats about 30 minutes, about RM70 return, 4–5 times a day 09:00–17:00", "Slow boats 1½ hours, about RM45 return", "Plus a RM30 marine park charge", "Most boats and dive shops stop in the monsoon, about November to February"], [S61M, WV("Perhentian_Islands")]),
  E("mersing", "tioman", "Ferry", [1.5, 2], [75], "MYR", "Bluewater or Cataferry", ["Bluewater RM75 (2025), more on public holidays", "Plus a RM30 marine park fee", "Boats leave on the tide, so allow a buffer; if the 4:30 pm boat doesn’t run, you sleep in Mersing"], [WV("Tioman")]),
  // ---- Malaysia: buses
  E("kul", "malacca", "Bus", [2.5, 3], [10, 14], "MYR", "Several companies, 2 or 3 an hour, from TBS (Bandar Tasik Selatan)", ["Just under 3 hours"], [S61M]),
  E("sin", "malacca", "Bus", [4.5, 5.5], null, "SGD", "Several companies", ["About 5 hours"], [S61M]),
  E("ipoh", "cameron", "Bus", [2.25, 3], [25, 28], "MYR", "From Ipoh’s Aman Jaya bus station to Tanah Rata", ["Several a day, e.g. 08:00, 11:00, 15:00, 18:00", "The station is 10–16 km from the centre: about RM35 by taxi"], [S61M, WV("Cameron_Highlands")]),
  E("kul", "cameron", "Bus", [4.5, 5], [48], "MYR", "From TBS (Terminal Bersepadu Selatan) to Tanah Rata", ["08:30 to 15:30", "One slow daily bus via Raub, RM23"], [WV("Cameron_Highlands")]),
  E("kul", "jerantut", "Bus", [3.5, 3.5], [19], "MYR", "Bus or train to Jerantut", ["The NKS coach leaves Kuala Lumpur 08:30 and reaches Jerantut about noon"], [WV("Taman_Negara")]),
  E("jerantut", "tamannegara", "Bus", [1, 3], [7], "MYR", "Public bus to Kuala Tahan, or the river boat from Kuala Tembeling", ["Bus 2 hours, RM7, 8 am and 3 pm", "Or taxi to Kuala Tembeling (RM16) and the 2–3 hour river boat (RM35) at 9 am or 2 pm", "Taxi direct about 1 hour, RM70"], [WV("Taman_Negara")]),
  E("kotabharu", "penang", "Bus", [6.25, 7.5], [34.7], "MYR", "Express bus to Penang", ["6 hours 15 minutes with a long stop at Gerik", "09:00 and evening departures"], [WV("Kota_Bharu")]),
  E("kualabesut", "cherating", "Bus", [5, 6], null, "MYR", "Express bus from Jerteh towards Kuantan, stopping at Cherating", ["Jerteh is 17 km from Kuala Besut: local bus or shared taxi (RM20)", "RM30–35 and at least 5 hours (2017): ask the driver to stop at Cherating"], [WV("Cherating"), WV("Kuala_Besut")]),
  E("kuantan", "cherating", "Bus", [1.5, 2.25], [6], "MYR", "rapidKuantan bus 600 or 602 to Balok Makmur, then bus 604", ["RM4 then RM2; the 604 takes about an hour", "A taxi is about RM80"], [WV("Cherating")]),
  E("kuching", "pontianak", "Bus", [9, 12], [243000, 315000], "IDR", "DAMRI cross-border bus", ["9 hours by day, 12 overnight", "Rp 243,000 regular, Rp 315,000 deluxe (2025)"], [WV("Kuching")]),
  E("kk", "semporna", "Bus", [8, 10], [75], "MYR", "Direct bus from Inanam station", ["07:30 and 19:30", "Or fly to Tawau and take a taxi (about RM95)"], [WV("Semporna")]),
  // ---- Indonesia: Java by train (Seat 61) and road (Wikivoyage)
  E("jakarta", "bandung", "Train", [3.1, 3.3], [80000, 100000], "IDR", "KAI train from Gambir, city centre to city centre", ["Every hour or two; about 100,000 rupiah in Eksekutif, 80,000 in Ekonomi"], [S61I], {da:"gambir", db:"bdgstn"}),
  E("jakarta", "bandung", "Train", [1.75, 2.5], null, "IDR", "Whoosh high-speed train, Halim to Tegalluar", ["46 minutes on the train, but both stations are out of town: Halim is 14 km from Gambir and Tegalluar a 52-minute taxi ride from Bandung station", "A feeder train runs from Padalarang into central Bandung"], [S61I], {da:"halim"}),
  E("jakarta", "yogya", "Train", [6, 6.5], null, "IDR", "KAI express trains from Gambir (Argo Semeru, Taksaka, Argo Dwipangga and others)", ["Several a day, e.g. 06:20, 07:45, 08:50", "Fares vary by date and train: check live"], [S61I], {da:"gambir", db:"yogyastn"}),
  E("jakarta", "surabaya", "Train", [9, 9.5], [670000], "IDR", "Argo Bromo Anggrek, Eksekutif class", ["Ekonomi seats from about 100,000, luxury sleepers 1,555,000", "Cheaper if booked ahead, e.g. Eksekutif from 400,000"], [S61I], {da:"gambir", db:"sgustn"}),
  E("surabaya", "banyuwangi", "Train", [6, 6.25], [88000, 290000], "IDR", "Train to Ketapang (for the Bali ferry)", ["09:24 arriving 15:30, or overnight", "About 290,000 rupiah Eksekutif, 88,000 Ekonomi"], [S61I], {da:"sgustn", db:"ktgstn"}),
  E("yogya", "banyuwangi", "Train", [13, 13.5], null, "IDR", "One train a day", ["About 13 hours"], [WV("Banyuwangi")], {da:"yogyastn", db:"ktgstn"}),
  E("banyuwangi", "gilimanuk", "Ferry", [0.5, 1], null, "IDR", "Ketapang–Gilimanuk ferry", ["Every 15–20 minutes, 24 hours a day; the crossing is 30–45 minutes, loading takes longer"], [S61I, WV("Gilimanuk")], {da:"ktgstn"}),
  E("gilimanuk", "dps", "Bus", [3, 3.5], [30000, 50000], "IDR", "Bus or bemo to Ubung terminal, Denpasar", ["About 3 hours; buses get irregular late in the day", "A private car from south Bali is about 600,000 rupiah"], [WV("Gilimanuk")]),
  E("surabaya", "bromo", "Train", [3.5, 5], null, "IDR", "Train to Probolinggo, then the shared minibus up to Cemoro Lawang", ["Surabaya Gubeng to Probolinggo about 2 hours", "Green minibuses (‘bison’) leave Bayuangga terminal when full: about Rp 35,000 each, Rp 500,000–525,000 for the whole bus; about 1½ hours"], [WV("Probolinggo"), WV("Bromo-Tengger-Semeru_National_Park")], {da:"sgustn"}),
  E("surabaya", "malang", "Bus", [2, 4], null, "IDR", "Bus from Bungurasih terminal to Arjosari", ["2–3 hours, often 4", "Trains run all day too"], [WV("Malang")]),
  // ---- Indonesia: Sumatra
  E("medan", "bukitlawang", "Bus", [3, 4], null, "IDR", "Bus or minibus from Pinang Baris terminal", ["Big non-air-con buses were Rp 20,000 in 2015; minibuses and tourist vans cost more", "From the Belawan ferry, vans go direct for about Rp 60,000–70,000"], [WV("Gunung_Leuser_National_Park")]),
  E("medan", "laketoba", "Bus + ferry", [4.75, 6], null, "IDR", "Bus from Amplas terminal to Parapat, then the ferry to Tuktuk", ["Local bus about 5 hours, tourist minibus about 4 hours (Rp 39,000 and Rp 65,000 in 2016)", "Ferry from Tiga Raja dock, Parapat, to Tuktuk: 45–60 minutes, about Rp 25,000"], [WV("Lake_Toba")]),
  E("laketoba", "bukittinggi", "Bus", [15, 20], [250000, 300000], "IDR", "ALS and other buses from Parapat", ["A winding, rough ride; air-con buses with toilets, stopping every 2–4 hours"], [WV("Bukittinggi")]),
  E("padang", "bukittinggi", "Bus", [2, 2], null, "IDR", "DAMRI bus, or a shared ‘travel’ minivan", ["About 2 hours (Rp 20,000 in 2017)", "Taxis from Padang airport ask about Rp 300,000"], [WV("Bukittinggi")]),
  E("bandaaceh", "pulauweh", "Ferry", [1, 2.5], [100000], "IDR", "Express Bahari fast ferry from Ulee Lheue", ["About 1 hour; 10:00 and 16:00 from Banda Aceh", "Slow ferry about 2½ hours, Rp 18,000–32,000, at 14:00"], [WV("Sabang_(Indonesia)", "Sabang")]),
  // ---- Indonesia: Flores, Sulawesi, Papua
  E("ende", "moni", "Minivan", [2, 2.5], [20000, 40000], "IDR", "Shared public car, bemo or bus", ["Public cars about 2 hours, Rp 40,000; bemos and buses about 2½ hours, Rp 20,000–30,000"], [WV("Moni")]),
  E("makassar", "rantepao", "Bus", [8, 10], null, "IDR", "Overnight buses (Bintang Prima, Litha and others)", ["8–10 hours; Rp 185,000–200,000 in 2016", "Or fly to Toraja airport, about 1 hour from Rantepao"], [WV("Rantepao"), WV("Tana_Toraja")]),
  E("sorong", "rajaampat", "Ferry", [2, 4], [120000, 240000], "IDR", "Daily ferries to Waisai", ["Express about 2 hours, slow ferry about 4", "Rp 120,000 economy, Rp 240,000 VIP", "From Sorong 09:00 and 14:00; no ferries on public holidays"], [WV("Raja_Ampat")]),
  // ---- road links whose sources give no journey time
  ROAD("kul", "kualabesut", "Bus", [40], "MYR", "Mutiara, Perdana, Sani or Mahligai from TBS (Terminal Bersepadu Selatan)", ["Usually RM40, 9 am and 9 pm, dropping you near the jetty"], [WV("Kuala_Besut")]),
  ROAD("sin", "mersing", "Bus", null, "SGD", "Bus to Larkin terminal (Johor Bahru), then a bus to Mersing", ["Larkin to Mersing about RM11.70; early buses (8:30, 9, 10, 11:30 am) make the last ferry, 2:30 pm often doesn’t"], [WV("Mersing")]),
  ROAD("kul", "kuantan", "Bus", null, "MYR", "Express buses along the East Coast Expressway", ["Kuantan has buses to Kuala Lumpur, Singapore, Johor Bahru, Mersing and Jerantut"], [WV("Cherating")]),
  ROAD("kul", "mersing", "Bus", null, "MYR", "Transnasional and others", ["Some buses stop next to the ferry terminal"], [WV("Mersing")])
];
// flights: these routes are flown, but the time is worked out from the distance and the price is left to check live
const FLIGHTS = [["bkk", "kul"], ["bkk", "penang"], ["sin", "kul"], ["sin", "penang"], ["kul", "penang"], ["kul", "langkawi"], ["kul", "kotabharu"], ["kul", "kuching"],
  ["kul", "kk"], ["kuching", "kk"], ["kul", "jakarta"], ["kul", "dps"], ["kul", "medan"], ["penang", "medan"], ["kul", "surabaya"], ["kul", "yogya"], ["kul", "padang"],
  ["jakarta", "medan"], ["jakarta", "yogya"], ["jakarta", "surabaya"], ["jakarta", "padang"], ["jakarta", "bandaaceh"], ["medan", "bandaaceh"], ["jakarta", "makassar"],
  ["jakarta", "manado"], ["makassar", "manado"], ["jakarta", "sorong"], ["makassar", "sorong"], ["manado", "sorong"], ["jakarta", "pangkalanbun"], ["surabaya", "pangkalanbun"],
  ["jakarta", "pontianak"], ["jakarta", "labuanbajo"], ["dps", "labuanbajo"], ["lop", "labuanbajo"], ["dps", "ende"], ["labuanbajo", "ende"], ["dps", "makassar"],
  ["dps", "surabaya"], ["jakarta", "malang"]];

// remove anything added before, then add
const ids = new Set(HUBS.map(h => h[0]));
N.hubs = N.hubs.filter(h => !ids.has(h[0]));
N.edges = N.edges.filter(e => !e.myid);
for (const id of ids) delete N.go12[id];
HUBS.forEach(h => N.hubs.push(h));
Object.assign(N.stations, STATIONS);
const hub = id => N.hubs.find(h => h[0] === id);
for (const e of EDGES){
  if (!hub(e.a) || !hub(e.b)) throw new Error("no hub " + e.a + "/" + e.b);
  if (!e.road){ N.edges.push(e); continue; }
  const h = km(hub(e.a), hub(e.b)) * 1.3 / 50;
  N.edges.push({a:e.a, b:e.b, mode:e.mode, dur:[Math.round(h * 4) / 4, Math.round(h * 1.25 * 4) / 4], p:e.p, cur:e.cur, op:e.op, da:null, db:null,
    notes:e.notes.concat(["Journey time estimated from the distance"]), src:e.src, verified:false, myid:1});
}
for (const [a, b] of FLIGHTS){
  const A = hub(a), B = hub(b); if (!A || !B) throw new Error("no hub " + a + "/" + b);
  const h = km(A, B) / 760 + 0.35;
  N.edges.push({a, b, mode:"Flight", dur:[Math.round(h * 4) / 4, Math.round((h + 0.3) * 4) / 4], p:null, cur:"USD", op:"Flights (compare on Google Flights)", da:null, db:null,
    notes:[`About ${Math.round(km(A, B))} km; flying time estimated from the distance`, "Times and fares change by date: use the flight search button"], src:[], verified:false, myid:1});
}
lines[i] = "const D = " + JSON.stringify(D) + ";" + cr;
fs.writeFileSync(FILE, lines.join("\n"));
console.log(`${HUBS.length} hubs, ${EDGES.length} researched links and ${FLIGHTS.length} flight links added; network now ${N.hubs.length} hubs, ${N.edges.length} links`);
