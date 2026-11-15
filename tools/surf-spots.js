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
  osm:["OpenStreetMap (surf break)", "https://www.openstreetmap.org/"]
};
// [id, name, lat, lng, area, country, note, photo or "", approximate pin, sources]
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
  ["karon", "Karon Beach", 7.84399, 98.29178, "Phuket", "TH", "Long beach next to Kata, with some of Thailand’s best surf in the wet season (June to September).", "karon", 0, ["ex"]]
];
const credits = JSON.parse(fs.readFileSync(process.argv[2] || "img/surf/credits.json", "utf8"));
const lines = fs.readFileSync("js/data.js", "utf8").split("\n");
const i = lines.findIndex(l => l.startsWith("const D = "));
const cr = lines[i].endsWith("\r") ? "\r" : "";
const D = JSON.parse(lines[i].replace(/\r$/, "").slice("const D = ".length).replace(/;\s*$/, ""));
D.surf = SPOTS.map(([id, n, lat, lng, area, cc, note, ph, ap, src]) => {
  const o = {id:"s-" + id, n, lat, lng, area, cc, note, src:src.map(k => SRC[k])};
  if (ap) o.ap = true;
  if (ph){ const c = credits[ph]; if (!c) throw new Error("no credit for " + ph); o.ph = [`img/surf/${ph}.jpg`, c.page, `Photo: ${c.by || "see the file page"}, ${c.lic}, Wikimedia Commons`]; }
  return o;
});
D.surfChecked = "Nov 2026";
lines[i] = "const D = " + JSON.stringify(D) + ";" + cr;
fs.writeFileSync("js/data.js", lines.join("\n"));
console.log(`${D.surf.length} surf spots, ${D.surf.filter(s => s.ph).length} with a photo`);
