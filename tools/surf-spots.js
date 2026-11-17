// The surf spots the app shows (Activities › Surf and the map). Hand-researched: every spot is named as a surf break or surf
// beach by a source below, and its pin comes from OpenStreetMap or Wikidata (ap: an approximate pin, the area not the break).
// Photos are in img/surf/ (500 px, from Wikimedia Commons, each looked at by eye; credits below).
// Run from the repo root after editing:  node tools/surf-spots.js     (writes D.surf into js/data.js)
const fs = require("fs");
const SRC = {
  wv:["Wikivoyage: Surfing in Indonesia", "https://en.wikivoyage.org/wiki/Surfing_in_Indonesia"],
  bukit:["Wikivoyage: Bukit Peninsula", "https://en.wikivoyage.org/wiki/Bukit_Peninsula"],
  rb:["Red Bull: best surf spots in Indonesia", "https://www.redbull.com/us-en/best-surf-spots-indonesia"],
  mm:["Mad Monkey: surfing in south Lombok", "https://madmonkeyhostels.com/h2o_blog/best-surfing-in-south-lombok"],
  ex:["Expat Living: best surf breaks in Southeast Asia", "https://expatliving.sg/best-surf-breaks-in-southeast-asia"],
  osm:["OpenStreetMap (surf break)", "https://www.openstreetmap.org/"],
  atlas:["The Surf Atlas: Khao Lak surfing", "https://thesurfatlas.com/surfing-in-thailand/khao-lak-surfing/"],
  zaf:["Zafigo: best places to surf in Malaysia", "https://zafigo.com/travel/zafigo-stories/20211226-best-places-to-surf-in-malaysia/"],
  scs:["Surf Camp Sumatra: Way Jambu", "https://www.surfcampsumatra.com/surf-breaks/krui-sumatra/way-jambu"]
};
// [id, name, lat, lng, area, country, note, photo or "", approximate pin, sources (a key below, or [title, link])]
// Nov 2026: more breaks from Surf-Forecast's break guides (type and season), pinned from OpenStreetMap; most are the beach, so marked approximate.
const SPOTS = [
  ["uluwatu", "Uluwatu", -8.81516, 115.08855, "Uluwatu", "ID", "Bali’s most famous break: long lefts off the reef below the cliffs, reached through the cave at Suluban. For experienced surfers.", "uluwatu", 0, ["wv", "bukit"]],
  ["padang", "Padang Padang", -8.81122, 115.10377, "Uluwatu", "ID", "A heavy left over shallow reef for experts when it’s big; Padang Rights is a mellower wave for intermediates.", "padang", 0, ["wv", "bukit", "ex"]],
  ["impossibles", "Impossibles", -8.80759, 115.10894, "Uluwatu", "ID", "Long, fast lefts along the reef between Padang Padang and Bingin.", "", 0, ["bukit", "rb"]],
  ["bingin", "Bingin", -8.80564, 115.11321, "Uluwatu", "ID", "Short, hollow left over the reef. The reef can be shallow at low tide.", "bingin", 0, ["bukit"]],
  ["dreamland", "Dreamland", -8.79955, 115.11718, "Uluwatu", "ID", "Beach with peaks over sand and reef, busy with surfers and day visitors.", "dreamland", 0, ["bukit"]],
  ["balangan", "Balangan", -8.79230, 115.12324, "Uluwatu", "ID", "Long left-hand break along the reef. Swimming can be hazardous when the surf is up.", "balangan", 0, ["bukit", "rb"]],
  ["nyangnyang", "Nyang Nyang", -8.83980, 115.09589, "Uluwatu", "ID", "Remote beach below the cliffs with powerful surf.", "nyang", 0, ["bukit"]],
  ["kutabali", "Kuta Beach", -8.71797, 115.16800, "Kuta", "ID", "Bali’s original surf beach: a gentle beach break, good for learning.", "", 0, ["ex"]],
  ["batubolong", "Batu Bolong", -8.65953, 115.13014, "Canggu", "ID", "Canggu’s friendly beach and reef break, popular with longboarders and learners.", "batubolong", 0, ["rb"]],
  ["echobeach", "Echo Beach", -8.65478, 115.12488, "Canggu", "ID", "Canggu’s punchier reef break, a few minutes’ walk from Batu Bolong.", "", 0, ["rb"]],
  ["keramas", "Keramas", -8.5979, 115.3305, "Gianyar", "ID", "A right and left breaking on rocks, on Bali’s south-east coast.", "", 1, ["wv", "rb"]],
  ["medewi", "Medewi", -8.41981, 114.80522, "West Bali", "ID", "Long left point break over a rocky beach in quiet West Bali.", "medewi", 0, ["wv", "rb"]],
  ["gerupukinside", "Gerupuk Inside", -8.91526, 116.36551, "Kuta Lombok", "ID", "Hollow lefts and rights inside Gerupuk bay; a good fit for beginners. Boats take you out.", "gerupuk", 0, ["wv", "osm"]],
  ["dondon", "Don Don", -8.91091, 116.35482, "Kuta Lombok", "ID", "Break in Gerupuk bay, at its most reliable in the dry season.", "", 0, ["osm", "mm"]],
  ["kidspoint", "Kidspoint", -8.91744, 116.35101, "Kuta Lombok", "ID", "Smaller wave in Gerupuk bay.", "", 0, ["osm"]],
  ["outsideleft", "Outside Left", -8.95045, 116.36323, "Kuta Lombok", "ID", "Outer reef at the mouth of Gerupuk bay.", "", 0, ["osm"]],
  ["mawi", "Mawi", -8.87684, 116.15690, "Selong Belanak", "ID", "A right and left on Lombok’s south coast near Selong Belanak.", "", 0, ["wv", "osm"]],
  ["ekas", "Ekas", -8.89944, 116.42833, "East Lombok", "ID", "A right and left across the bay from the harbour at Awang.", "", 1, ["wv"]],
  ["krui", "Krui", -5.18889, 103.93611, "Krui", "ID", "The town’s own waves need a bigger swell; the best breaks are a short ride along the coast.", "", 1, ["rb"]],
  ["kata", "Kata Beach", 7.81939, 98.29603, "Phuket", "TH", "Phuket’s surf hub, usually not crowded. Best between June and September; often flat from November to March.", "kata", 0, ["ex"]],
  ["karon", "Karon Beach", 7.84399, 98.29178, "Phuket", "TH", "Long beach next to Kata, with some of Thailand’s best surf in the wet season (June to September).", "karon", 0, ["ex"]],
  ["katanoi", "Kata Noi", 7.80634, 98.29874, "Phuket", "TH", "Small beach just south of Kata with a reliable beach break. Best from May to October.", "", 1, [["Surf-Forecast: Kata Noi", "https://www.surf-forecast.com/breaks/Kata-Noi"], ["OpenStreetMap: relation 4235946", "https://www.openstreetmap.org/relation/4235946"]]],
  ["kalim", "Kalim Beach", 7.91046, 98.29552, "Phuket", "TH", "Reef break at the north end of Patong bay that only works on a decent swell. May to October.", "", 1, [["Surf-Forecast: Kalim Beach", "https://www.surf-forecast.com/breaks/Kalim-Beach"], ["OpenStreetMap: way 188637523", "https://www.openstreetmap.org/way/188637523"]]],
  ["kamala", "Kamala Beach", 7.95007, 98.27895, "Phuket", "TH", "Beach break with fairly consistent surf in the wet season (May to October).", "", 1, [["Surf-Forecast: Kamala Beach", "https://www.surf-forecast.com/breaks/Kamala"], ["OpenStreetMap: relation 6892478", "https://www.openstreetmap.org/relation/6892478"]]],
  ["surin", "Surin Beach", 7.97604, 98.27836, "Phuket", "TH", "Beach break that doesn’t work very often; May to October when it does.", "", 1, [["Surf-Forecast: Surin Beach", "https://www.surf-forecast.com/breaks/Surin-Beach"], ["OpenStreetMap: relation 14010442", "https://www.openstreetmap.org/relation/14010442"]]],
  ["bangtao", "Bang Tao", 8.0083, 98.29224, "Phuket", "TH", "Long beach with a fairly reliable beach break from May to October.", "", 1, [["Surf-Forecast: Bang Tao", "https://www.surf-forecast.com/breaks/Bang-Tao"], ["OpenStreetMap: way 150298518", "https://www.openstreetmap.org/way/150298518"]]],
  ["naiharn", "Nai Harn Beach", 7.77571, 98.30582, "Phuket", "TH", "Beach and reef break in Phuket’s far south. Inconsistent; best May to October.", "", 1, [["Surf-Forecast: Nai Harn Beach", "https://www.surf-forecast.com/breaks/Nai-Harn-Beach"], ["OpenStreetMap: relation 6162518", "https://www.openstreetmap.org/relation/6162518"]]],
  ["naiyang", "Nai Yang Reef (Airport Reef)", 8.09035, 98.29773, "Phuket", "TH", "Reef break off Nai Yang beach near the airport, fairly consistent from May to October. The pin is the beach.", "", 1, [["Surf-Forecast: Nai Yang Reef", "https://www.surf-forecast.com/breaks/Nai-Yang-Reef-Break"], ["OpenStreetMap: way 1020477061", "https://www.openstreetmap.org/way/1020477061"]]],
  ["patong", "Patong Beach", 7.89663, 98.29543, "Phuket", "TH", "Phuket’s busiest beach. Its beach break doesn’t work very often; May to October.", "", 1, [["Surf-Forecast: Patong Beach", "https://www.surf-forecast.com/breaks/Patong-Beach"], ["OpenStreetMap: relation 14018589", "https://www.openstreetmap.org/relation/14018589"]]],
  ["nangthong", "Khao Lak (Nang Thong)", 8.64899, 98.24629, "Khao Lak", "TH", "Beach break with fairly consistent surf from May to October, mostly gentle waves for learners.", "", 1, [["Surf-Forecast: Khao Lak / Nang Thong", "https://www.surf-forecast.com/breaks/Khao-Lak"], ["OpenStreetMap: way 23600298", "https://www.openstreetmap.org/way/23600298"], "atlas"]],
  ["pakarang", "Cape Pakarang", 8.73618, 98.22155, "Khao Lak", "TH", "Point break off the cape north of Khao Lak, the area’s most dependable wave from May to October.", "", 1, [["Surf-Forecast: Cape Pakarang Right", "https://www.surf-forecast.com/breaks/Pakarang-Right"], ["OpenStreetMap: node 255587531", "https://www.openstreetmap.org/node/255587531"]]],
  ["bangniang", "Bang Niang", 8.66678, 98.24348, "Khao Lak", "TH", "River-mouth break by Bang Niang beach, fairly consistent from May to October.", "", 1, [["Surf-Forecast: Bang Niang Rivermouth", "https://www.surf-forecast.com/breaks/Bang-Niang-Rivermouth"], ["OpenStreetMap: way 23600445", "https://www.openstreetmap.org/way/23600445"]]],
  ["chaweng", "Chaweng (Koh Samui)", 9.52357, 100.05988, "Koh Samui", "TH", "Beach break on the Gulf side, so its season is November to April (the north-east monsoon). Inconsistent.", "", 1, [["Surf-Forecast: Chaweng Malibu", "https://www.surf-forecast.com/breaks/Chaweng-Malibu"], ["OpenStreetMap: way 246391044", "https://www.openstreetmap.org/way/246391044"]]],
  ["cherating", "Cherating", 4.12115, 103.38869, "Pahang", "MY", "Malaysia’s best-known surf village: a point break that works now and then, November to April.", "", 1, [["Surf-Forecast: Cherating", "https://www.surf-forecast.com/breaks/Cherating"], ["OpenStreetMap: way 338189711", "https://www.openstreetmap.org/way/338189711"], "zaf"]],
  ["batuburuk", "Batu Buruk", 5.31251, 103.16116, "Kuala Terengganu", "MY", "Town beach in Kuala Terengganu with a fairly consistent beach break, November to April.", "", 1, [["Surf-Forecast: Batu Buruk", "https://www.surf-forecast.com/breaks/Batu-Buruk"], ["OpenStreetMap: way 584341836", "https://www.openstreetmap.org/way/584341836"], "zaf"]],
  ["juara", "Juara (Tioman)", 2.79521, 104.20257, "Tioman", "MY", "Tioman’s surf beach on the east side of the island. Works only now and then; the monsoon months bring the swell.", "", 1, [["Surf-Forecast: Tioman Island", "https://www.surf-forecast.com/breaks/Tioman-Island-Malaysia"], ["OpenStreetMap: node 262579324", "https://www.openstreetmap.org/node/262579324"], "zaf"]],
  ["kijal", "Kijal", 4.3422, 103.48001, "Terengganu", "MY", "Beach break that works now and then, November to April.", "", 1, [["Surf-Forecast: Kijal", "https://www.surf-forecast.com/breaks/Kijal"]]],
  ["kelulut", "Kelulut (Marang)", 5.16676, 103.23259, "Terengganu", "MY", "Beach break south of Kuala Terengganu with fairly consistent surf, November to April.", "", 1, [["Surf-Forecast: Kelulut (Marang)", "https://www.surf-forecast.com/breaks/Kelulut-Marang"], ["OpenStreetMap: node 3888665861", "https://www.openstreetmap.org/node/3888665861"]]],
  ["legian", "Legian Beach", -8.7035, 115.1641, "Kuta", "ID", "Beach break north of Kuta with consistent surf, best May to October.", "", 1, [["Surf-Forecast: Legian Beach", "https://www.surf-forecast.com/breaks/Legian-Beach"], ["OpenStreetMap: way 30904902", "https://www.openstreetmap.org/way/30904902"]]],
  ["pererenan", "Pererenan", -8.63951, 115.13091, "Canggu", "ID", "Beach and reef break just north of Canggu, dependable from May to October. The pin is the beach road.", "", 1, [["Surf-Forecast: Pererenan", "https://www.surf-forecast.com/breaks/Pererenan"]]],
  ["balian", "Balian", -8.5048, 114.96821, "West Bali", "ID", "River-mouth reef break in quiet West Bali with consistent surf, best May to October.", "", 1, [["Surf-Forecast: Balian", "https://www.surf-forecast.com/breaks/Balian"]]],
  ["sanur", "Sanur Reef", -8.67379, 115.26268, "Sanur", "ID", "Reef break off Sanur on Bali’s east side, so it works from November to April. Only now and then.", "", 1, [["Surf-Forecast: Sanur Reef", "https://www.surf-forecast.com/breaks/Sanur-Reef"]]],
  ["serangan", "Serangan", -8.7368, 115.22498, "Sanur", "ID", "Reef break off Serangan island with consistent surf from November to April.", "", 1, [["Surf-Forecast: Serangan (Bali)", "https://www.surf-forecast.com/breaks/Serangan-Bali"]]],
  ["nusadua", "Nusa Dua", -8.78846, 115.23022, "Nusa Dua", "ID", "Reef break on the Bukit’s east side, often working from November to April.", "", 1, [["Surf-Forecast: Nusa dua", "https://www.surf-forecast.com/breaks/Nusadua"], ["OpenStreetMap: relation 3498598", "https://www.openstreetmap.org/relation/3498598"]]],
  ["shipwrecks", "Shipwrecks (Nusa Lembongan)", -8.6702, 115.4423, "Nusa Lembongan", "ID", "Reef break off Nusa Lembongan, reached by boat; reliable from May to October.", "", 0, [["Surf-Forecast: Shipwrecks (Nusa Lembongan)", "https://www.surf-forecast.com/breaks/Shipwrecks"], ["OpenStreetMap: way 299142648", "https://www.openstreetmap.org/way/299142648"]]],
  ["tanjungaan", "Tanjung Aan", -8.91026, 116.32059, "Kuta Lombok", "ID", "Reef break near the Tanjung Aan bay, very consistent and works all year.", "", 1, [["Surf-Forecast: Tanjung A’an", "https://www.surf-forecast.com/breaks/Tanjung-Aan"], ["OpenStreetMap: relation 3899724", "https://www.openstreetmap.org/relation/3899724"]]],
  ["seger", "Seger Reef", -8.9077, 116.31046, "Kuta Lombok", "ID", "Reef break off Seger beach, east of Kuta Lombok, fairly consistent all year.", "", 1, [["Surf-Forecast: Seger Reef", "https://www.surf-forecast.com/breaks/Seger-Reef"], ["OpenStreetMap: relation 3899722", "https://www.openstreetmap.org/relation/3899722"]]],
  ["areguling", "Are Guling", -8.9051, 116.2473, "Kuta Lombok", "ID", "Reef break in the bay west of Kuta Lombok, consistent all year.", "", 1, [["Surf-Forecast: Air Guling", "https://www.surf-forecast.com/breaks/Air-Guling"], ["OpenStreetMap: relation 3899714", "https://www.openstreetmap.org/relation/3899714"]]],
  ["mawun", "Mawun", -8.90221, 116.23234, "Kuta Lombok", "ID", "Reef break at the mouth of Mawun bay, reasonably consistent all year.", "", 1, [["Surf-Forecast: Mawun", "https://www.surf-forecast.com/breaks/Mawun"], ["OpenStreetMap: relation 3899711", "https://www.openstreetmap.org/relation/3899711"]]],
  ["desert", "Desert Point", -8.73003, 115.83631, "West Lombok", "ID", "World-famous, very long left-hand barrel over shallow reef, for experts. Best May to October.", "", 0, [["Surf-Forecast: Desert Point (Bangko-Bangko)", "https://www.surf-forecast.com/breaks/Desert-Point-Bangko-Bangko"], ["OpenStreetMap: node 2967490402", "https://www.openstreetmap.org/node/2967490402"]]],
  ["gilit", "Gili Trawangan", -8.3618, 116.0404, "Gili Islands", "ID", "Reef break off the south-west of Gili T, best from May to October.", "", 0, [["Surf-Forecast: Safari Island", "https://www.surf-forecast.com/breaks/Safari-Island"], ["OpenStreetMap: node 2490688543", "https://www.openstreetmap.org/node/2490688543"]]],
  ["senggigi", "Senggigi", -8.49821, 116.04536, "Senggigi", "ID", "Reef break off Senggigi beach with fairly consistent surf, May to October.", "", 1, [["Surf-Forecast: Senggigi", "https://www.surf-forecast.com/breaks/Senggigi"], ["OpenStreetMap: way 959185363", "https://www.openstreetmap.org/way/959185363"]]],
  ["wayjambu", "Way Jambu", -5.37961, 104.16378, "Krui", "ID", "Hollow reef break known as the ‘Sumatran Pipeline’, for advanced surfers. May to October. The pin is the village.", "", 1, [["Surf-Forecast: Way Jambu", "https://www.surf-forecast.com/breaks/Way-Jambu"], ["OpenStreetMap: node 1308705539", "https://www.openstreetmap.org/node/1308705539"], "scs"]]
];
const credits = JSON.parse(fs.readFileSync(process.argv[2] || "img/surf/credits.json", "utf8"));
const lines = fs.readFileSync("js/data.js", "utf8").split("\n");
const i = lines.findIndex(l => l.startsWith("const D = "));
const cr = lines[i].endsWith("\r") ? "\r" : "";
const D = JSON.parse(lines[i].replace(/\r$/, "").slice("const D = ".length).replace(/;\s*$/, ""));
D.surf = SPOTS.map(([id, n, lat, lng, area, cc, note, ph, ap, src]) => {
  const o = {id:"s-" + id, n, lat, lng, area, cc, note, src:src.map(k => Array.isArray(k) ? k : SRC[k])};
  if (ap) o.ap = true;
  if (ph){ const c = credits[ph]; if (!c) throw new Error("no credit for " + ph); o.ph = [`img/surf/${ph}.jpg`, c.page, `Photo: ${c.by || "see the file page"}, ${c.lic}, Wikimedia Commons`]; }
  return o;
});
D.surfChecked = "Nov 2026";
lines[i] = "const D = " + JSON.stringify(D) + ";" + cr;
fs.writeFileSync("js/data.js", lines.join("\n"));
console.log(`${D.surf.length} surf spots, ${D.surf.filter(s => s.ph).length} with a photo`);
