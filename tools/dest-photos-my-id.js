// Credits for the destination photos added with Malaysia and the rest of Indonesia (Nov 2026): img/dest-*.jpg, each cut to
// 440×270 from a Wikimedia Commons file (licence and author read from the file's page, 22 Nov 2026; each picture looked at
// by eye: no Buddha imagery). Writes DEST_IMG and PHOTO_CREDITS in js/core.js, img/credits.json and img/CREDITS.md. Re-runnable.
//   node tools/dest-photos-my-id.js
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const LIC = {"CC BY 1.0":"https://creativecommons.org/licenses/by/1.0", "CC BY 2.0":"https://creativecommons.org/licenses/by/2.0", "CC BY 3.0":"https://creativecommons.org/licenses/by/3.0",
  "CC BY 4.0":"https://creativecommons.org/licenses/by/4.0", "CC BY-SA 1.0":"https://creativecommons.org/licenses/by-sa/1.0", "CC BY-SA 2.0":"https://creativecommons.org/licenses/by-sa/2.0",
  "CC BY-SA 3.0":"https://creativecommons.org/licenses/by-sa/3.0", "CC BY-SA 4.0":"https://creativecommons.org/licenses/by-sa/4.0", "Public domain":"https://commons.wikimedia.org/wiki/Commons:Public_domain"};
// [destination, Commons file, what it shows, photographer, licence]
const PHOTOS = [
  ["Kuala Lumpur", "Kuala Lumpur with Petronas Towers.jpg", "Kuala Lumpur and the Petronas Towers", "thomasgl", "Public domain"],
  ["George Town", "Skyline of George Town, Penang at night January 2025 02-01.jpg", "George Town, Penang, at dusk", "HundenvonPenang", "CC BY-SA 4.0"],
  ["Langkawi", "Langkawi cablecar bridge.jpg", "The Sky Bridge, Langkawi", "Cheon Fong Liew", "CC BY-SA 2.0"],
  ["Malacca", "Malacca stadhuys1.jpg", "The Stadthuys, Malacca", "Elizabeth Lisa John", "CC BY 1.0"],
  ["Ipoh", "Ipoh railway station 2024, Perak Malaysia 02.jpg", "Ipoh railway station", "FBilula", "CC BY-SA 4.0"],
  ["Cameron Highlands", "Tea fields (Will Ellis).jpg", "Tea fields in the Cameron Highlands", "Will Ellis", "CC BY 2.0"],
  ["Perhentian Islands", "Perhentian Besar, Malaysia, West beach 2.jpg", "West beach, Perhentian Besar", "Vyacheslav Argenberg", "CC BY 4.0"],
  ["Tioman", "Tioman island.jpg", "Tioman island", "Andrew Lih", "CC BY-SA 2.0"],
  ["Kota Bharu", "Pasar Besar Siti Khadijah, Kota Bharu, Malaysia (4014429550).jpg", "Siti Khadijah market, Kota Bharu", "yeowatzup", "CC BY 2.0"],
  ["Taman Negara", "Taman Negara, Malaysia, Canopy Walkway.jpg", "The canopy walkway, Taman Negara", "Vyacheslav Argenberg", "CC BY 4.0"],
  ["Cherating", "Cherating, Malaysia, Cherating Village.jpg", "Cherating village", "Vyacheslav Argenberg", "CC BY 4.0"],
  ["Kuching", "Sarawak River.jpg", "The Sarawak River at Kuching", "CoolCityCat", "CC BY-SA 3.0"],
  ["Kota Kinabalu", "KKCity4.jpg", "Kota Kinabalu and the islands offshore", "Flanegan", "CC BY 3.0"],
  ["Semporna", "Semporna Waterfront.jpg", "Semporna waterfront", "Marcin Falenczyk", "CC BY-SA 3.0"],
  ["Jakarta", "Batavia Fatahillah Square, Kota Tua Jakarta 01.jpg", "Fatahillah Square, Kota Tua, Jakarta", "Aisha Tanduk", "CC BY-SA 4.0"],
  ["Bandung", "Gedung Sate Oktober 2024 - Rahmatdenas.jpg", "Gedung Sate, Bandung", "Rahmatdenas", "CC BY-SA 4.0"],
  ["Yogyakarta", "Prambanan Trimurti.jpg", "Prambanan (Hindu), near Yogyakarta", "Gunawan Kartapranata", "CC BY-SA 3.0"],
  ["Mount Bromo", "Andhika bayu nugraha-taman nasional bromo tengger semeru.jpg", "Bromo at sunrise", "Andhika Bayu Nugraha", "CC BY-SA 4.0"],
  ["Banyuwangi", "Ijen volcano.jpg", "The crater lake of Ijen, near Banyuwangi", "Tom Casadevall, U.S. Geological Survey", "Public domain"],
  ["Malang", "Malang - Kampung Warna-Warni Jodipan - Dec 2024.jpg", "Kampung Warna-Warni Jodipan, Malang", "Dominic Nelson", "CC BY-SA 4.0"],
  ["Medan", "Maimun Palace Medan Indonesia.jpg", "Maimun Palace, Medan", "Mimihitam", "CC BY-SA 3.0"],
  ["Bukit Lawang", "Bukit Indonesia Entrance.JPG", "The river at Bukit Lawang", "Velorian (Wikitravel Shared)", "CC BY-SA 1.0"],
  ["Lake Toba", "HAMPARAN BUKIT DAN LUASNYA DANAU TOBA.jpg", "Lake Toba", "Ibal harun", "CC BY-SA 4.0"],
  ["Bukittinggi", "Daily Bukittinggi.jpg", "Jam Gadang clock tower, Bukittinggi", "Hanafiannoy", "Public domain"],
  ["Pulau Weh", "Rubiah Island Aceh.jpg", "Rubiah island, off Pulau Weh", "fitri agung", "CC BY 2.0"],
  ["Labuan Bajo", "LabuanBajo View.JPG", "Labuan Bajo harbour", "Lofor", "CC BY-SA 3.0"],
  ["Moni", "Kelimutu 2008-08-08.jpg", "The crater lakes of Kelimutu, above Moni", "Neil (neilsrtw)", "CC BY 2.0"],
  ["Rantepao", "A funeral ceremony in Tana Toraja.jpg", "A funeral ceremony in Tana Toraja", "WiDi", "CC BY-SA 4.0"],
  ["Manado", "Feather Stars (Comatulida) (6059124438).jpg", "Feather stars on the reef at Bunaken", "Bernard Dupont", "CC BY-SA 2.0"],
  ["Makassar", "Fort Rotterdam, Makassar, Indonesia - 20100227-02.jpg", "Fort Rotterdam, Makassar", "Sanko", "CC BY-SA 3.0"],
  ["Raja Ampat", "Majestic Raja Ampat.jpg", "Islands of Raja Ampat", "Nickoasmara", "CC BY-SA 4.0"],
  ["Pangkalan Bun", "Wikiearth-Bekantan Taman Nasional Tanjung Puting.jpg", "Proboscis monkeys in Tanjung Puting National Park", "RaiyaniM", "CC BY-SA 4.0"]
];
const slug = d => "dest-" + d.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".jpg";
const page = f => "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(f.replace(/ /g, "_")).replace(/%2C/g, ",").replace(/%28/g, "(").replace(/%29/g, ")");
for (const [d] of PHOTOS) if (!fs.existsSync(path.join(ROOT, "img", slug(d)))) throw new Error("missing img/" + slug(d));
// js/core.js
const coreF = path.join(ROOT, "js", "core.js");
let core = fs.readFileSync(coreF, "utf8");
const imgLine = core.match(/^const DEST_IMG = (\{.*\});$/m), credLine = core.match(/^const PHOTO_CREDITS = (\[.*\]);$/m);
const DEST_IMG = JSON.parse(imgLine[1]), CRED = JSON.parse(credLine[1]);
for (const [d, f, shows, by, lic] of PHOTOS){
  DEST_IMG[d] = "img/" + slug(d);
  const row = [shows, by, lic, page(f)], k = CRED.findIndex(c => c[3] === row[3]);
  if (k >= 0) CRED[k] = row; else CRED.push(row);
}
core = core.replace(imgLine[0], "const DEST_IMG = " + JSON.stringify(DEST_IMG) + ";").replace(credLine[0], "const PHOTO_CREDITS = " + JSON.stringify(CRED) + ";");
fs.writeFileSync(coreF, core);
// img/credits.json and img/CREDITS.md
const cjF = path.join(ROOT, "img", "credits.json"), cj = JSON.parse(fs.readFileSync(cjF, "utf8"));
const mdF = path.join(ROOT, "img", "CREDITS.md");
let md = fs.readFileSync(mdF, "utf8").split("\n").filter(l => !PHOTOS.some(([d]) => l.startsWith(`| ${slug(d)} |`)));
const tableEnd = md.map((l, i) => l.startsWith("| dest-") || l.startsWith("| hero-") ? i : -1).filter(i => i >= 0).pop();
const rows = PHOTOS.map(([d, f, shows, by, lic]) => `| ${slug(d)} | ${shows} | ${by} | [${lic}](${LIC[lic]}) | [Wikimedia Commons](${page(f)}) |`);
md.splice(tableEnd + 1, 0, ...rows);
fs.writeFileSync(mdF, md.join("\n"));
for (const [d, f, shows, by, lic] of PHOTOS) cj[slug(d)] = {file:"File:" + f, by, lic, licUrl:LIC[lic], page:page(f)};
fs.writeFileSync(cjF, JSON.stringify(cj, null, 1) + "\n");
console.log(`${PHOTOS.length} destination photos credited`);
