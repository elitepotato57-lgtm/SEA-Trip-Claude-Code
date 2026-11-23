// Our route through Thailand (Bangkok, Chiang Mai, Pai, the Gulf islands, Krabi, Phi Phi, Phuket): prices that were missing,
// saved departure times (a baseline from the sources, not live) and what to know on the day (pier or station, how early, luggage).
// Researched 23 Nov 2026; every fact carries its source. Re-runnable: it sets the same fields again and re-adds its own links.
// Run after tools/transport-asia.js (which re-creates its own links).      node tools/transport-route.js
const fs = require("fs"), path = require("path");
const FILE = path.join(__dirname, "..", "js", "data.js");
const lines = fs.readFileSync(FILE, "utf8").split("\n");
const i = lines.findIndex(l => l.startsWith("const D = "));
const cr = lines[i].endsWith("\r") ? "\r" : "";
const D = JSON.parse(lines[i].replace(/\r$/, "").slice("const D = ".length).replace(/;\s*$/, ""));
const N = D.net;

const ST = slug => ["SiamTickets (timetable and fares, seen 23 Nov 2026)", "https://siamtickets.com/" + slug + "/"];
const S61 = ["Seat 61: Thailand (2026 timetable)", "https://www.seat61.com/Thailand.htm"];
const AA = r => ["AirAsia: lowest fare each day, Dec 2026–Jan 2027 (seen 23 Nov 2026)", "https://www.airasia.com/flights/from-" + r];
const edge = (a, b, mode) => {
  const e = N.edges.find(x => x.mode === mode && ((x.a === a && x.b === b) || (x.a === b && x.b === a)));
  if (!e) throw new Error(`no ${mode} link ${a}–${b}`);
  return e;
};
const addSrc = (e, s) => { e.src = e.src || []; if (!e.src.some(x => x[1] === s[1])) e.src.push(s); };

// Koh Tao → Koh Phangan: the direct boats (the planner had no price for this one)
{
  const e = edge("phangan", "tao", "Ferry"), tao = ST("lomprayah-ferry-from-koh-tao-to-koh-phangan");
  Object.assign(e, {p:[450, 600], dur:[0.85, 1.75], op:"Lomprayah or Songserm",
    notes:["Lomprayah catamaran 600 baht (about 1 hour), Lomprayah Laemsor ferry 450 baht (1 h 40), Songserm 500 baht (1 h 45)", "Mae Haad Pier on Koh Tao to Thong Sala Pier on Koh Phangan"],
    da:null, db:null, verified:true,
    dep:{tao:[["07:00","07:50",0,"Lomprayah speedboat"], ["09:30","10:30",0,"Lomprayah catamaran"], ["09:30","11:15",0,"Songserm"], ["15:30","16:30",0,"Lomprayah catamaran"], ["17:00","18:40",0,"Lomprayah Laemsor ferry"]]},
    depSrc:tao,
    day:{tao:{at:"Mae Haad Pier, Koh Tao", to:"Thong Sala Pier, Koh Phangan", early:"Check in at least 30 minutes before; boarding closes 5–10 minutes before and missed boats aren’t refunded", bag:"Up to 20 kg each; 20 baht a kilo over", src:[ST("koh-tao-to-koh-phangan"), tao]}}});
  e.src = [ST("koh-tao-to-koh-phangan"), tao, ["Bus Online Ticket", "https://www.busonlineticket.co.th/booking/koh-tao-to-koh-phangan-ferry-tickets"]];
}
// Koh Phangan → Koh Samui
{
  const e = edge("samui", "phangan", "Ferry"), lp = ST("lomprayah-ferry-koh-phangan-to-koh-samui"), sd = ST("seatran-discovery-ferry-koh-phangan-to-koh-samui");
  e.dep = {phangan:[["08:00",null,0,"Lomprayah to Na Thon"], ["10:30",null,0,"Lomprayah speedboat to Bangrak"], ["10:30","11:15",0,"Seatran Discovery to Bangrak"], ["11:00",null,0,"Lomprayah to Na Thon or Maenam"],
    ["12:30",null,0,"Lomprayah to Maenam"], ["15:00",null,0,"Lomprayah to Bangrak"], ["16:00",null,0,"Lomprayah to Bangrak"], ["16:00","16:45",0,"Seatran Discovery to Bangrak"],
    ["17:00",null,0,"Lomprayah to Na Thon or Maenam"], ["18:00",null,0,"Lomprayah to Maenam"], ["19:00",null,0,"Lomprayah Laemsor ferry to Maenam"]]};
  e.depSrc = lp;
  e.day = {phangan:{at:"Thong Sala Pier, Koh Phangan", to:"Na Thon, Maenam or Bangrak pier on Koh Samui, depending on the boat: check your ticket", early:"Check in at least 30 minutes before; Seatran’s counters close 15 minutes before", bag:"Luggage storage at most Seatran piers for a small fee", src:[lp, sd]}};
  e.notes = Array.from(new Set((e.notes || []).concat(["Lomprayah speedboat 200–350 baht, Laemsor ferry 250; Seatran Discovery 360"])));
  addSrc(e, lp); addSrc(e, sd);
}
// Chiang Mai → Pai minivans
{
  const e = edge("cnx", "pai", "Minivan"), s = ST("bus-from-chiang-mai-to-pai");
  const pp = []; for (let h = 6; h <= 17; h++) pp.push([`${String(h).padStart(2, "0")}:30`, `${String(h + 4).padStart(2, "0")}:50`, 0, "Prem Pracha"]);
  const aya = ["09:30", "10:30", "12:30", "13:30", "14:30"].map(t => [t, String(+t.slice(0, 2) + 4).padStart(2, "0") + ":30", 0, "Aya Service (hotel pick-up)"]);
  e.dep = {cnx:pp.concat(aya).sort((x, y) => x[0].localeCompare(y[0]))};
  e.depSrc = s;
  e.day = {cnx:{at:"Chiang Mai Arcade 2 bus station (Prem Pracha); Aya Service picks up from hotels in town", to:"Pai centre, near the Walking Street", early:null, bag:null,
    tips:["About 4 hours on a road with hundreds of bends: take travel-sickness tablets before you go if you need them"], src:[s]}};
  e.notes = Array.from(new Set((e.notes || []).concat(["Prem Pracha 240 baht, Aya Service 250 (SiamTickets)"])));
  addSrc(e, s);
}
// Bangkok ⇄ Chiang Mai trains and the Nakhonchai Air bus
{
  const e = edge("bkk", "cnx", "Train");
  e.night = true;
  e.dep = {bkk:[["07:30","17:50",0,"Special express 7 (seats only)"], ["14:15","04:05",1,"Express 109"], ["18:40","07:15",1,"Special express 9 (sleeper)"], ["20:05","08:45",1,"Special express 13 (sleeper)"], ["22:30","11:40",1,"Express 51"]],
           cnx:[["06:30","20:25",0,"Express 102"], ["07:30","17:40",0,"Special express 8 (seats only)"], ["15:30","05:10",1,"Express 52"], ["17:05","05:55",1,"Special express 14 (sleeper)"], ["18:20","06:30",1,"Special express 10 (sleeper)"]]};
  e.depSrc = S61;
  e.day = {bkk:{at:"Krung Thep Aphiwat Central Terminal, long-distance trains on Level 2", to:"Chiang Mai station, about 3 km east of the old city", early:"The platforms open only about 20 minutes before departure. Departure screens don’t show the platform: listen for the announcement", bag:null,
    tips:["The restaurant car sells set meals for about 210 baht; you’re free to go there even if an attendant says there isn’t one"], src:[S61]},
    cnx:{at:"Chiang Mai station, about 3 km east of the old city", to:"Krung Thep Aphiwat Central Terminal, Bangkok", early:null, bag:null, tips:[], src:[S61]}};
  addSrc(e, S61);
  const b = edge("bkk", "cnx", "Bus"), nca = ST("nakhonchai-air-bangkok-to-chiang-mai");
  b.night = true;
  b.dep = {bkk:[["08:30",null,0,"Nakhonchai Air Gold"], ["10:00",null,0,"Nakhonchai Air First"], ["18:30",null,1,"Nakhonchai Air Gold"], ["20:01",null,1,"Nakhonchai Air First"],
    ["20:31",null,1,"Nakhonchai Air Gold"], ["21:15",null,1,"Nakhonchai Air First"], ["21:30",null,1,"Nakhonchai Air First"], ["22:20",null,1,"Nakhonchai Air Gold"]]};
  b.depSrc = nca;
  b.day = {bkk:{at:"Nakhonchai Air’s own bus station in Bangkok; the same buses call at Mo Chit Bus Terminal about 15 minutes later", to:"Chiang Mai", early:null, bag:"About 20 kg each; over that is charged", src:[nca]}};
  addSrc(b, nca);
}
// Krabi → Koh Phi Phi and Koh Phi Phi → Phuket (Andaman Wave Master)
{
  const e = edge("krabi", "phiphi", "Ferry"), s = ST("andaman-wave-master-ferry-krabi-to-koh-phi-phi");
  e.dep = {krabi:[["09:00","10:00",0,"Speedboat to Ton Sai"], ["09:00","11:00",0,"Ferry to Ton Sai"], ["12:00","13:00",0,"Speedboat to Ton Sai"], ["13:30","14:30",0,"Speedboat to Ton Sai"], ["13:30","15:30",0,"Ferry to Ton Sai"]]};
  e.depSrc = s;
  e.day = {krabi:{at:"Klong Jilad Pier, Krabi Town", to:"Ton Sai Pier (some boats go on to Laem Tong Beach)", early:"Boarding ends 5–10 minutes before departure", bag:"One bag and one small bag each, 25 kg in all", src:[s]}};
  e.notes = Array.from(new Set((e.notes || []).concat(["Andaman Wave Master: ferry 450 baht (standard), 1,000 (first class); speedboat 1,250"])));
  addSrc(e, s);
  const f = edge("phuket", "phiphi", "Ferry"), t = ST("andaman-wave-master-ferry-koh-phi-phi-to-phuket");
  f.dep = {phiphi:[["09:00","10:00",0,"Speedboat"], ["09:00","11:00",0,"Ferry"], ["11:00","12:00",0,"Speedboat"], ["11:00","13:00",0,"Ferry"], ["14:30","15:30",0,"Speedboat"], ["14:30","16:30",0,"Ferry"], ["15:45","16:45",0,"Speedboat"], ["16:00","17:00",0,"Speedboat"]]};
  f.depSrc = t;
  f.day = {phiphi:{at:"Ton Sai Pier, Koh Phi Phi (some boats leave from Laem Tong Beach instead, and cost more)", to:"Rassada Pier, Phuket", early:"Boarding ends 5–10 minutes before departure", bag:"One bag and one small bag each, 25 kg in all", src:[t]}};
  f.notes = Array.from(new Set((f.notes || []).concat(["From Ton Sai: ferry 500–550 baht, speedboat 850"])));
  addSrc(f, t);
}
// Koh Phangan → Ao Nang joint tickets
{
  const e = edge("phangan", "aonang", "Bus + ferry"), s = ST("koh-phangan-to-ao-nang");
  e.dep = {phangan:[["05:00","14:00",0,"Raja ferry + Phantip bus"], ["05:30","14:30",0,"Sapthaweephol"], ["08:30","18:30",0,"Sapthaweephol"], ["11:00","16:30",0,"Lomprayah (Van2Travel)"], ["11:00","20:00",0,"Raja ferry + Phantip bus"], ["11:30","17:00",0,"Seatran (Van2Travel)"]]};
  e.depSrc = s;
  addSrc(e, s);
}
// Chiang Mai → Phuket flights (no saved price before)
{
  const e = edge("cnx", "phuket", "Flight"), s = AA("chiang-mai-cnx-to-phuket-hkt");
  Object.assign(e, {p:[4086, 9000], op:"AirAsia (direct)", notes:["December fares 4,086–9,000 baht one way; bags cost extra"]});
  e.src = [s].concat((e.src || []).filter(x => x[1] !== s[1]));
}
// Krabi Town → Ao Nang: the white shared songthaew (the planner only had an unpriced taxi)
N.edges = N.edges.filter(x => !x.route);
N.edges.push({a:"krabi", b:"aonang", mode:"Bus", dur:[0.5, 0.75], p:[60, 80], cur:"THB", op:"White songthaew (shared pickup truck)", da:null, db:null,
  notes:["60 baht in the day, 80 after 6 pm", "Leaves from near the Vogue department store on Maharaj Road, Krabi Town"],
  src:[["Sygic Travel: Krabi Town", "https://guides.travel.sygic.com/production/en/Krabi_Town"], ["About Krabi: getting around", "https://aboutkrabi.blogspot.com"]], verified:true, route:1});

lines[i] = "const D = " + JSON.stringify(D) + ";" + cr;
fs.writeFileSync(FILE, lines.join("\n"));
const withDep = N.edges.filter(x => x.dep).length;
console.log(`route links updated; ${withDep} links now have saved departure times`);
