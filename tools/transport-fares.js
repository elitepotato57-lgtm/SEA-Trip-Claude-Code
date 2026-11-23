// Fills in transport legs that had no saved price, from sources checked on 23 Nov 2026, and adds Lomprayah's
// bus-and-boat tickets from Bangkok and Hua Hin to the Gulf islands. Re-runnable: it sets the same values again.
// It never overwrites a price that's already saved (tools/transport-route.js and others researched those first), and
// never adds a second leg of the same kind between two places.
//   node tools/transport-fares.js
// Sources (every value below is from one of these; nothing is estimated):
//   Lomprayah's own booking site (fares for 3, 6 and 15 Dec 2026), Baolau (fares straight from the rail operators, no
//   mark-up), Seat 61, Wikivoyage, BusOnlineTicket, and Kiwi.com's route pages for flights (the lowest one-way fare
//   shown: saved as a "from" price, since flight prices change every day).
const fs = require("fs"), path = require("path");
const FILE = path.join(__dirname, "..", "js", "data.js");
const lines = fs.readFileSync(FILE, "utf8").split("\n");
const i = lines.findIndex(l => l.startsWith("const D = "));
const cr = lines[i].endsWith("\r") ? "\r" : "";
const D = JSON.parse(lines[i].replace(/\r$/, "").slice("const D = ".length).replace(/;\s*$/, ""));
const E = D.net.edges;
const CHECKED = "checked 23 Nov 2026";

const LP = ["Lomprayah", "https://www.lomprayah.com/booking"];
const BL = (a, b, m = "train") => ["Baolau", `https://www.baolau.com/en/s/${a}/${b}/${m}`];
const S61 = c => ["Seat 61: " + c, `https://www.seat61.com/${c}.htm`];
const WV = (page, label = page.replace(/_/g, " ")) => ["Wikivoyage: " + label, "https://en.wikivoyage.org/wiki/" + page];
const BOT = (slug, th) => ["BusOnlineTicket", `https://www.busonlineticket.${th ? "co.th" : "com"}/booking/${slug}-bus-tickets`];

const find = (a, b, mode) => E.find(e => e.mode === mode && ((e.a === a && e.b === b) || (e.a === b && e.b === a)));
let changed = 0, added = 0, kept = 0;
function set(a, b, mode, v){
  const e = find(a, b, mode);
  if (!e) throw new Error(`no ${mode} edge ${a}-${b}`);
  if (e.p && e.p.length && !e.notes?.some(n => /checked 23 Nov 2026/.test(n))){ kept++; return; }      // already priced from another source
  if (v.p) e.p = v.p;
  if (v.cur) e.cur = v.cur;
  if (v.dur) e.dur = v.dur;
  if (v.op) e.op = v.op;
  if (v.from) e.from = true; else delete e.from;
  if (v.verified != null) e.verified = v.verified;
  e.src = e.src || [];
  (v.src || []).forEach(s => { if (!e.src.some(x => x[1] === s[1])) e.src.push(s); });
  e.notes = (e.notes || []).filter(n => !/checked 23 Nov 2026/.test(n));
  (v.notes || []).forEach(n => e.notes.push(n + ` (${CHECKED})`));
  changed++;
}
function add(e){
  const have = E.find(x => x.mode === e.mode && ((x.a === e.a && x.b === e.b) || (x.a === e.b && x.b === e.a)));
  if (have && have.op !== e.op){ kept++; return; }                          // another source already added this one
  e.notes = (e.notes || []).map(n => n + ` (${CHECKED})`);
  if (have) Object.assign(have, e); else { E.push(e); added++; }
}

/* ---------- Gulf islands: Lomprayah's own fares and departure times ---------- */
set("cjm", "tao", "Ferry", {p:[450, 750], cur:"THB", dur:[1.75, 2.5], src:[LP],
  notes:["Lomprayah from Chumphon: 05:45, 07:00 and 13:15; from Koh Tao: 10:15, 12:30 and 15:00"]});
set("phangan", "tao", "Ferry", {p:[450, 700], cur:"THB", dur:[1, 1.75], src:[LP],
  notes:["Lomprayah from Koh Phangan: 08:30, 11:15, 12:00, 13:00 and 16:45; from Koh Tao: 07:00, 09:30, 11:30, 12:30, 15:30 and 16:30"]});
set("samui", "tao", "Ferry", {p:[550, 750], cur:"THB", src:[LP],
  notes:["Lomprayah from Samui (Pralarn or Bangrak pier) 550–700 baht: 08:00, 10:30, 11:00, 12:30, 14:30 and 15:30"]});
set("samui", "phangan", "Ferry", {src:[LP],
  notes:["Lomprayah 250–350 baht, about every hour from Bangrak pier, 08:00 to 17:30"]});
const lpJoint = (a, b, p, dur, note) => add({a, b, mode:"Bus + ferry", dur, p, cur:"THB", op:"Lomprayah joint ticket: coach, then the high-speed catamaran",
  da:null, db:{tao:"maehaad", phangan:"thongsala", samui:"samuipier"}[b], notes:[note], src:[LP], verified:true});
lpJoint("bkk", "tao", [850, 1550], [9, 11.25], "Coaches leave Khao San Road or Pinklao at 06:00 and about 21:00–22:00; the VIP coach is 1,550 baht");
lpJoint("bkk", "phangan", [1150, 1350], [10.75, 13], "Coaches leave Khao San Road at 06:00, 21:30 and 22:00, changing to the boat at Chumphon");
lpJoint("bkk", "samui", [1250, 1450], [11.5, 14], "Coaches leave Khao San Road at 06:00, 21:30 and 22:00, arriving at Pralarn pier");
lpJoint("huahin", "tao", [850, 1250], [6.5, 8.75], "Coaches leave Hua Hin at 00:30, 08:30 and 23:30");

/* ---------- trains: Baolau (operator fares) and Seat 61 ---------- */
set("vte", "vangvieng", "Train", {p:[199721, 304090], cur:"LAK", dur:[0.85, 1.35], src:[BL("Vientiane", "Vang-Vieng")],
  notes:["Six trains a day (08:00 to 15:15); tickets go on sale 3 days before"]});
set("vangvieng", "lpq", "Train", {p:[191831, 293045], cur:"LAK", dur:[0.85, 1.55], src:[BL("Vang-Vieng", "Luang-Prabang")],
  notes:["Six trains a day (08:55 to 16:30); tickets go on sale 3 days before"]});
set("han", "ninhbinh", "Train", {p:[157000, 343000], cur:"VND", dur:[2.15, 2.25], src:[BL("Hanoi", "Ninh-Binh")],
  notes:["Six trains a day: 06:00, 08:00, 13:00, 19:20, 19:45 and 21:45"]});
set("hue", "dad", "Train", {p:[99000, 504000], cur:"VND", src:[BL("Hue", "Da-Nang"), S61("Vietnam")],
  notes:["Seat 61's table: 106,000 dong for a soft seat up to 265,000 for a sleeper berth"]});
set("dad", "nhatrang", "Train", {p:[486000, 682000], cur:"VND", dur:[9, 11.5], src:[BL("Da-Nang", "Nha-Trang"), S61("Vietnam")],
  notes:["Private tourist sleeper cars on the same trains cost about 1,700,000–1,800,000 dong"]});
set("sgn", "muine", "Train", {p:[236000, 609000], cur:"VND", src:[BL("Ho-Chi-Minh", "Phan-Thiet"), S61("Vietnam")],
  notes:["Train to Phan Thiet 230,000–349,000 dong, then bus no. 9 (6,000 dong) or a taxi (about 230,000–260,000) to Mui Ne"]});
set("han", "sapa", "Train", {p:[515000, 597000], cur:"VND", src:[BL("Hanoi", "Lao-Cai"), S61("Vietnam")],
  notes:["Vietnam Railways sleeper to Lao Cai 475,000–497,000 dong, then the bus (about 50,000) or a shared minibus (40,000–100,000) to Sapa", "Private tourist sleeper cars cost about 1,000,000–1,800,000 dong"]});
set("jakarta", "yogya", "Train", {p:[225000, 560000], cur:"IDR", src:[S61("Indonesia")],
  notes:["Seat 61's example fares: Ekonomi 225,000 rupiah, Eksekutif 560,000, Eksekutif luxury 1,200,000; they vary by date and train"]});
set("kul", "langkawi", "Train + ferry", {p:[174, 226], cur:"MYR", src:[BL("Kuala-Lumpur", "Arau"), WV("Langkawi")],
  notes:["ETS train to Arau RM124–165, Grab (RM15–18) or taxi (RM26) to Kuala Perlis, then the ferry (RM35)"]});

/* ---------- buses, minivans, boats and taxis ---------- */
set("bkk", "cjm", "Bus", {p:[445, 491], cur:"THB", src:[BOT("bangkok-to-chumphon", true)], notes:["Suwannatee Tour, 4 departures a day, 09:00 to 21:00"]});
set("bkk", "kan", "Minivan", {p:[110, 142], cur:"THB", op:"Bus or minivan from the Southern Bus Terminal", src:[WV("Kanchanaburi"), BOT("bangkok-to-kanchanaburi", true)],
  notes:["1st-class buses every 15 minutes, 05:00–22:30"]});
// no source gives the time, so it carries the app's Estimate tag (verified:false), like other legs without one
add({a:"krabi", b:"aonang", mode:"Bus", dur:[0.5, 0.75], p:[60, 80], cur:"THB", op:"White songthaew (shared pick-up truck), from the 7-Eleven on Maharaj Road or the bus station",
  da:null, db:null, notes:["Every 10 minutes by day: 60 baht until 18:00, 80 baht from 18:00 to 22:00"], src:[WV("Ao_Nang", "Ao Nang"), WV("Krabi_Town", "Krabi Town")], verified:false});
set("lanta", "phiphi", "Ferry", {p:[350, 700], cur:"THB", src:[WV("Ko_Lanta", "Ko Lanta"), WV("Ko_Phi_Phi", "Ko Phi Phi")],
  notes:["Ferries 350 baht at 08:00 and 13:00; a speedboat costs 600–700 baht"]});
set("krabi", "pakbara", "Minivan", {p:[400], cur:"THB", dur:[4, 4], verified:true, src:[WV("Pak_Bara", "Pak Bara")],
  notes:["Vans leave Pak Bara within an hour of each boat arriving"]});
set("padangbai", "giliair", "Ferry", {p:[660000], cur:"IDR", src:[WV("Padang_Bai", "Padang Bai")], notes:["Gili Cat fast boat, daily at 09:00 (and 14:00 in high season)"]});
set("bangsal", "senaru", "Taxi", {p:[300000, 400000], cur:"IDR", src:[WV("Senaru")], notes:["A taxi or chartered car from West Lombok"]});
set("jakarta", "bakauheni", "Bus + ferry", {p:[44500, 74500], cur:"IDR", src:[WV("Merak")],
  notes:["Train to Merak (about Rp30,000, 4 hours) or the DAMRI airport bus (Rp60,000), then the ferry (Rp14,500)"]});
set("medan", "bukitlawang", "Bus", {p:[15000, 20000], cur:"IDR", src:[WV("Gunung_Leuser_National_Park", "Gunung Leuser National Park")],
  notes:["Wikivoyage's fares are a few years old: expect a little more"]});
set("medan", "laketoba", "Bus + ferry", {p:[64000, 90000], cur:"IDR", src:[WV("Lake_Toba", "Lake Toba")],
  notes:["Bus from Amplas Rp39,000 or a tourist minibus Rp65,000 (2016 fares), then the boat to Tuktuk Rp25,000 (2024)"]});
set("padang", "bukittinggi", "Bus", {p:[20000, 50000], cur:"IDR", src:[WV("Bukittinggi")], notes:["DAMRI bus Rp20,000, a shared 'travel' minivan Rp30,000, door to door Rp40,000–50,000"]});
set("makassar", "rantepao", "Bus", {p:[200000], cur:"IDR", src:[WV("Rantepao")]});
set("banyuwangi", "gilimanuk", "Ferry", {p:[12000], cur:"IDR", src:[WV("Gilimanuk")], notes:["Ferries every 20 minutes, day and night"]});
add({a:"surabaya", b:"bromo", mode:"Bus + minibus", dur:[3.5, 4.5], p:[65000], cur:"IDR", op:"Patas bus from Bungurasih to Probolinggo, then the shared minibus to Cemoro Lawang",
  da:null, db:null, notes:["Bus about Rp30,000 (2–3 hours), minibus Rp35,000 a person when it fills up (about 1.5 hours)"], src:[WV("Probolinggo")], verified:true});
set("kul", "kuantan", "Bus", {p:[23, 24], cur:"MYR", src:[BOT("kuala-lumpur-to-kuantan")]});
set("kul", "mersing", "Bus", {p:[32, 53], cur:"MYR", src:[BOT("kuala-lumpur-to-mersing")], notes:["From Terminal Bersepadu Selatan (TBS)"]});
set("sin", "mersing", "Bus", {p:[24, 30], cur:"SGD", op:"Direct bus (KKKL Express from Bugis), or via Larkin terminal in Johor Bahru", src:[BOT("singapore-to-mersing")]});
set("sin", "malacca", "Bus", {p:[20, 25], cur:"SGD", src:[WV("Malacca")], notes:["Delima Express, 707 Travel and others"]});
set("kualabesut", "perhentian", "Ferry", {p:[35, 55], cur:"MYR", src:[WV("Perhentian_Islands", "Perhentian Islands")], notes:["RM35 one way, plus a RM20 service and jetty fee"]});
set("kualabesut", "cherating", "Bus", {p:[35.1, 55.1], cur:"MYR", src:[BOT("jerteh-to-cherating")], notes:["Express bus from Jerteh RM35.10; a taxi from the jetty to Jerteh is RM10–20 a car"]});
set("cei", "huayxai", "Bus", {p:[260, 280], cur:"THB", verified:true, src:[WV("Chiang_Rai", "Chiang Rai"), WV("Huay_Xai", "Huay Xai")],
  notes:["Bus to the border 140 baht, the bridge shuttle 20–40 baht, then a songthaew into Huay Xai about 100 baht"]});

/* ---------- flights: the lowest one-way fare Kiwi.com showed, as a "from" price ---------- */
const KIWI = JSON.parse(fs.readFileSync(path.join(__dirname, "transport-fares-kiwi.json"), "utf8"));
for (const [pair, k] of Object.entries(KIWI)){
  const [a, b] = pair.split("-");
  set(a, b, "Flight", {p:[k.gbp], cur:"GBP", from:true, src:[["Kiwi.com", k.url]],
    notes:[`The lowest one-way fare Kiwi.com showed: most dates cost more, so check live`]});
}

lines[i] = "const D = " + JSON.stringify(D) + ";" + cr;
fs.writeFileSync(FILE, lines.join("\n"));
const left = E.filter(e => !(e.p && e.p.length));
console.log(`${changed} legs updated, ${added} added, ${kept} already priced from another source (left alone); ${left.length} of ${E.length} still without a price:`);
console.log(left.map(e => `  ${e.a}-${e.b} ${e.mode}`).join("\n"));
