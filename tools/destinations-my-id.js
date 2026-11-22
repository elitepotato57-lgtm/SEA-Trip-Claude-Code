// Adds the Malaysian destinations and the new Indonesian ones (all of Indonesia is on the map since Nov 2026) to D.cities
// in js/data.js. Coordinates are the town's (or village's) node in OpenStreetMap (download.openstreetmap.fr extracts of
// 21 Nov 2026); the Perhentian Islands point sits between the two islands. Re-runnable.     node tools/destinations-my-id.js
const fs = require("fs"), path = require("path");
const FILE = path.join(__dirname, "..", "js", "data.js");
const lines = fs.readFileSync(FILE, "utf8").split("\n");
const i = lines.findIndex(l => l.startsWith("const D = "));
const cr = lines[i].endsWith("\r") ? "\r" : "";
const D = JSON.parse(lines[i].replace(/\r$/, "").slice("const D = ".length).replace(/;\s*$/, ""));
const ADD = [
  // Malaysia (Kuala Lumpur was already there)
  ["George Town", 5.4142, 100.3287], ["Langkawi", 6.2913, 99.7289], ["Malacca", 2.1943, 102.2487], ["Ipoh", 4.5987, 101.09],
  ["Cameron Highlands", 4.4707, 101.3777], ["Perhentian Islands", 5.915, 102.735], ["Tioman", 2.8187, 104.1586], ["Kota Bharu", 6.1248, 102.2378],
  ["Taman Negara", 4.383, 102.4012], ["Cherating", 4.1265, 103.3925], ["Kuching", 1.5598, 110.3454], ["Kota Kinabalu", 5.978, 116.0729], ["Semporna", 4.4791, 118.6119],
  // Indonesia beyond Bali, Lombok and southern Sumatra
  ["Jakarta", -6.1754, 106.8272], ["Bandung", -6.9218, 107.6071], ["Yogyakarta", -7.8013, 110.3647], ["Mount Bromo", -7.9219, 112.9652],
  ["Banyuwangi", -8.2095, 114.3737], ["Malang", -7.9771, 112.634], ["Medan", 3.5895, 98.6742], ["Bukit Lawang", 3.548, 98.1272], ["Lake Toba", 2.6706, 98.8608],
  ["Bukittinggi", -0.3052, 100.3695], ["Pulau Weh", 5.8706, 95.2581], ["Labuan Bajo", -8.496, 119.8936], ["Moni", -8.7502, 121.8499],
  ["Rantepao", -2.9705, 119.8987], ["Manado", 1.49, 124.8408], ["Makassar", -5.1343, 119.4124], ["Raja Ampat", -0.4211, 130.823], ["Pangkalan Bun", -2.6766, 111.6316]
];
const names = new Set(ADD.map(c => c[0]));
D.cities = D.cities.filter(c => !names.has(c[0])).concat(ADD);
lines[i] = "const D = " + JSON.stringify(D) + ";" + cr;
fs.writeFileSync(FILE, lines.join("\n"));
console.log(`${ADD.length} destinations added; ${D.cities.length} in all`);
