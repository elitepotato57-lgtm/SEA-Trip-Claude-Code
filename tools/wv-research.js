// Researched places from Wikivoyage's listings (Dylan, 24 Nov 2026: "way, way more" researched places in the cities we're likely
// to visit in Thailand, Cambodia and Vietnam, more for bigger cities). Every Sleep, Eat, Drink, See and Do listing on the city's
// Wikivoyage page (and its district pages, for Bangkok) becomes a researched place: its name, where it is, the price as written,
// its description, address, phone and website, the photo the listing names (never a temple or a Buddha), and Wikivoyage as the
// source with the date the listing was last edited. Bigger cities have longer pages, so they get more places.
// A listing with no map position is placed only if a place of the same name is in our OpenStreetMap search index near the city.
// A listing that is one of our hand-researched places already is left out. Nothing is estimated or invented.
//   node tools/wv-research.js            writes places/research/th.json, kh.json and vn.json
const fs = require("fs"), path = require("path"), https = require("https");
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "places", "research");
// [Wikivoyage page, the city it belongs to (as in D.cities where there is one), country, lat, lng]
const CITIES = {
  TH: [["Bangkok", "Bangkok", 13.7563, 100.5018], ["Chiang Mai", "Chiang Mai", 18.7883, 98.9853], ["Pai", "Pai", 19.3583, 98.4404],
    ["Chiang Rai", "Chiang Rai", 19.9105, 99.8406], ["Phuket", "Phuket", 7.8804, 98.3923], ["Patong", "Phuket", 7.8961, 98.2963],
    ["Kata", "Phuket", 7.8205, 98.2985], ["Karon", "Phuket", 7.8475, 98.2944], ["Rawai", "Phuket", 7.7792, 98.3253], ["Kamala", "Phuket", 7.9525, 98.2836], ["Phuket Town", "Phuket Town", 7.8804, 98.3923], ["Krabi Town", "Krabi Town", 8.0863, 98.9063],
    ["Ao Nang", "Ao Nang", 8.0319, 98.8255], ["Rai Leh", "Railay", 8.0107, 98.8371], ["Ko Phi Phi", "Koh Phi Phi", 7.7407, 98.7784],
    ["Ko Lanta", "Koh Lanta", 7.6243, 99.0791], ["Ko Samui", "Koh Samui", 9.512, 100.0136], ["Ko Pha-ngan", "Koh Phangan", 9.7319, 100.0136],
    ["Ko Tao", "Koh Tao", 10.0956, 99.8404], ["Hua Hin", "Hua Hin", 12.5684, 99.9577], ["Pattaya", "Pattaya", 12.9236, 100.8825],
    ["Ayutthaya", "Ayutthaya", 14.3532, 100.5689], ["Kanchanaburi", "Kanchanaburi", 14.0228, 99.5328], ["Sukhothai", "Sukhothai", 17.0078, 99.823],
    ["Ko Chang", "Koh Chang", 12.0566, 102.3326], ["Khao Sok National Park", "Khao Sok", 8.9126, 98.5296], ["Ko Lipe", "Koh Lipe", 6.4882, 99.3051],
    ["Chiang Khong", "Chiang Khong", 20.2615, 100.405], ["Surat Thani", "Surat Thani", 9.1382, 99.3215], ["Chumphon", "Chumphon", 10.493, 99.18]],
  KH: [["Phnom Penh", "Phnom Penh", 11.5564, 104.9282], ["Siem Reap", "Siem Reap", 13.3633, 103.856], ["Kampot", "Kampot", 10.6104, 104.181],
    ["Kep", "Kep", 10.4829, 104.3167], ["Sihanoukville", "Sihanoukville", 10.6253, 103.5234], ["Koh Rong", "Koh Rong", 10.7146, 103.2401],
    ["Koh Rong Sanloem", "Koh Rong Sanloem", 10.5839, 103.3084], ["Battambang", "Battambang", 13.0957, 103.2022], ["Kratie", "Kratie", 12.4881, 106.0188]],
  VN: [["Hanoi", "Hanoi", 21.0285, 105.8542], ["Ho Chi Minh City", "Ho Chi Minh City", 10.7769, 106.7009], ["Hoi An", "Hoi An", 15.8801, 108.338],
    ["Da Nang", "Da Nang", 16.0544, 108.2022], ["Hue", "Hue", 16.4637, 107.5909], ["Nha Trang", "Nha Trang", 12.2388, 109.1967],
    ["Da Lat", "Da Lat", 11.9404, 108.4583], ["Ninh Binh", "Ninh Binh", 20.2506, 105.9745], ["Sa Pa", "Sapa", 22.3364, 103.8438],
    ["Halong", "Ha Long", 20.9599, 107.0425], ["Ha Long Bay", "Ha Long", 20.9101, 107.1839], ["Cat Ba", "Cat Ba", 20.7268, 107.0478], ["Mui Ne", "Mui Ne", 10.9333, 108.2833],
    ["Phu Quoc", "Phu Quoc", 10.2899, 103.984], ["Phong Nha-Ke Bang National Park", "Phong Nha", 17.5902, 106.2834],
    ["Can Tho", "Can Tho", 10.0452, 105.7469], ["Ha Giang", "Ha Giang", 22.8233, 104.9836], ["Quy Nhon", "Quy Nhon", 13.782, 109.2196]]
};
const CUR = {TH:"THB", KH:"USD", VN:"VND"};
const MAX_KM = 45;                        // a listing further than this from its city is a mistake (or another town): left out

// curl rather than Node's https, so it works behind a proxy too
const get1 = url => new Promise((res, rej) => require("child_process").execFile("curl", ["-sfL", "-m", "60", "-A", "SEA-trip-app research tool (github.com/elitepotato57-lgtm/SEA-Trip-Claude-Code)", url],
  {maxBuffer:64 << 20}, (err, out) => err ? rej(new Error((err.code || "") + " " + url)) : res(out)));
// Wikivoyage sometimes says "slow down": try again a few times, waiting longer each time
async function get(url){ for (let k = 0; ; k++){ try { return await get1(url); } catch(e){ if (k >= 3 || /^22 /.test(e.message) && k >= 1) throw e; await sleep(2000 * (k + 1)); } } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function raw(title, hops = 0){
  const s = await get(`https://en.wikivoyage.org/w/index.php?title=${encodeURIComponent(title.replace(/ /g, "_"))}&action=raw`);
  const m = /^#redirect\s*\[\[([^\]|#]+)/i.exec(s.trim());
  return m && hops < 3 ? raw(m[1].trim(), hops + 1) : {title, text:s};
}
// Bangkok's district pages, as Wikivoyage has them (looked up once; the lookup API is rate-limited from busy networks)
const DISTRICTS = {Bangkok:["Khao San Road", "Sukhumvit", "Silom", "Rattanakosin", "Phahonyothin", "Yaowarat and Phahurat", "Thonburi", "Ratchadaphisek",
  "Siam Square", "Pratunam", "Ramkhamhaeng", "Dusit", "Downtown"].map(d => "Bangkok/" + d)};
async function districts(title){
  if (DISTRICTS[title]) return DISTRICTS[title];
  const j = JSON.parse(await get(`https://en.wikivoyage.org/w/api.php?action=query&list=prefixsearch&pssearch=${encodeURIComponent(title + "/")}&pslimit=40&format=json`));
  return j.query.prefixsearch.map(p => p.title).filter(t => t.startsWith(title + "/") && !/tour$/i.test(t));
}

/* ---------- the listing templates: {{sleep | name=… | lat=… | price=… | content=…}} ---------- */
function listings(s){
  const out = []; let i = 0;
  for (;;){
    const m = /\{\{\s*(sleep|eat|drink|see|do|buy|listing)\s*\|/i.exec(s.slice(i)); if (!m) break;
    const st = i + m.index; let j = st + 2, depth = 1;
    while (j < s.length && depth){ if (s.startsWith("{{", j)){ depth++; j += 2; } else if (s.startsWith("}}", j)){ depth--; j += 2; } else j++; }
    const body = s.slice(st + 2, j - 2); i = j;
    const parts = []; let d = 0, cur = "";
    for (let k = 0; k < body.length;){
      if (body.startsWith("{{", k) || body.startsWith("[[", k)){ d++; cur += body.slice(k, k + 2); k += 2; continue; }
      if (body.startsWith("}}", k) || body.startsWith("]]", k)){ d--; cur += body.slice(k, k + 2); k += 2; continue; }
      if (body[k] === "|" && d === 0){ parts.push(cur); cur = ""; k++; continue; }
      cur += body[k++];
    }
    parts.push(cur);
    // the page section it's in ("== Cope ==" lists embassies, "== Learn ==" universities: not things to do)
    const heads = s.slice(0, st).match(/^==+\s*([^=\n]+?)\s*==+\s*$/gm) || [];
    const f = {type:parts[0].trim().toLowerCase(), sec:heads.length ? heads[heads.length - 1].replace(/=/g, "").trim().toLowerCase() : ""};
    for (const p of parts.slice(1)){ const e = p.indexOf("="); if (e > 0) f[p.slice(0, e).trim().toLowerCase()] = p.slice(e + 1).trim(); }
    out.push(f);
  }
  return out;
}
// &amp; &ocirc; &#8211; … in wiki text: the character itself
const ENT = {amp:"&", lt:"<", gt:">", quot:"\"", apos:"'", ndash:"–", mdash:"—", hellip:"…", deg:"°", times:"×", eacute:"é", egrave:"è", ocirc:"ô", ecirc:"ê", acirc:"â", agrave:"à", aacute:"á", uacute:"ú", ugrave:"ù", oacute:"ó", ograve:"ò", iacute:"í", igrave:"ì"};
const entity = e => e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()];
// wiki text to plain text
const plain = s => String(s || "").replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/g, "").replace(/<!--[\s\S]*?-->/g, "")
  .replace(/\{\{\s*(?:km|mi|convert)\s*\|\s*([\d.]+)[^}]*\}\}/gi, "$1 km").replace(/\{\{[^{}]*\}\}/g, "").replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1")
  .replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, "$1").replace(/\[https?:\/\/[^\]]+\]/g, "").replace(/'{2,}/g, "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e) => entity(e) ?? m)
  .replace(/\s+/g, " ").trim();
const fold = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// a name without the words every place has ("Mad Monkey Hostel" and "Mad Monkey Phnom Penh" are both "mad monkey")
const GENERIC = /\b(the|hostel|hotel|guest ?house|guesthouse|resort|restaurant|cafe|bar|and|boutique|inn|homestay|villa|bungalows?|phnom penh|siem reap|bangkok|chiang mai|hanoi|saigon|ho chi minh city|hoi an)\b/g;
const core = s => fold(s).replace(GENERIC, " ").replace(/\s+/g, " ").trim();
const sameName = (a, b) => { const x = core(a), y = core(b); return !!x && !!y && (x === y || (Math.min(x.length, y.length) >= 5 && (x.includes(y) || y.includes(x)))); };
const km = (a, b) => { const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

/* ---------- the price, as written: its currency and its lowest and highest numbers ---------- */
function parsePrice(text, cc){
  const t = plain(text).toLowerCase(); if (!t) return null;
  if (/^(free|no charge|free entry|free admission)\b/.test(t)) return {p:[0], cur:CUR[cc]};
  let cur = /baht|thb|฿/.test(t) ? "THB" : /riel|khr|៛/.test(t) ? "KHR" : /dong|vnd|₫|đ\b|\d\s?k\b|\d{2,3}[.,]000\b/.test(t) && cc === "VN" ? "VND"
    : /us\$|usd|\$|dollar/.test(t) ? "USD" : null;
  if (!cur && cc === "TH" && /\b\d{2,5}\b/.test(t) && !/[$€£]/.test(t)) cur = "THB";            // Thai pages often write just the number
  if (!cur) return null;
  const nums = [];
  const re = /(\d{1,3}(?:[.,]\d{3})+|\d+(?:\.\d+)?)\s*(k|m|million)?\b/g; let m;
  while ((m = re.exec(t))){
    let v = +m[1].replace(/[.,](?=\d{3}\b)/g, "").replace(/,/g, "");
    if (m[2] === "k") v *= 1000; else if (m[2] === "m" || m[2] === "million") v *= 1e6;
    nums.push(v);
  }
  const ok = {THB:[10, 60000], USD:[0.5, 1500], VND:[5000, 40e6], KHR:[500, 2e6]}[cur];
  const vals = nums.filter(v => v >= ok[0] && v <= ok[1]);
  if (!vals.length) return null;
  return {p:vals.length > 1 ? [Math.min(...vals), Math.max(...vals)] : [vals[0]], cur};
}

/* ---------- the kind of place ---------- */
// sections whose listings aren't places to stay, eat or go (embassies, hospitals, banks, schools, transport offices)
const SKIP_SEC = /cope|connect|stay safe|stay healthy|embass|consulat|learn|work|get in|get around|go next|understand|talk|respect|medical|health|money|post|internet|telecom/;
const NOT_A_PLACE = /\bembass|consulat|\bimmigration\b|\buniversity\b|\bhospital\b|\bclinic\b|\bpost office\b|tourist information|tourism authority|\bbank\b|\bpolice\b|\bministry\b|\bvisa\b/i;
function kindOf(f, name, txt){
  if (SKIP_SEC.test(f.sec || "") || NOT_A_PLACE.test(name)) return null;
  if (f.type !== "sleep" && f.type !== "eat" && f.type !== "drink" && /^\(?(consulate|embassy)\)?$/i.test(txt.trim())) return null;
  const s = (name + " " + txt).toLowerCase();
  if (f.type === "sleep") return {c:"gaff", t:/hostel|dorm\b|dormitor/.test(s) ? "Hostel" : /villa/.test(name.toLowerCase()) ? "Villa" : /guest ?house|homestay|home stay|bungalow|hut\b/.test(s) ? "Guesthouse" : "Hotel"};
  if (f.type === "eat") return {c:"munch", t:/caf[eé]|coffee|bakery/.test(s) ? "Cafe" : /night market|food market|\bmarket\b/.test(s) ? "Market" : /street food|stall|food court|hawker/.test(s) ? "Street food" : "Restaurant"};
  if (f.type === "drink") return {c:"cool", t:/caf[eé]|coffee/.test(s) && !/bar|beer|cocktail|pub|club/.test(s) ? null : "Nightlife"};
  if (f.type === "buy") return /market/.test(s) ? {c:"cool", t:"Markets"} : null;                       // shops are left out
  if (f.type === "see" || f.type === "do" || f.type === "listing"){
    const t = /\btemple|\bwat\b|pagoda|shrine|monaster/.test(s) ? "Temples" : /museum|gallery/.test(s) ? "Museums" : /night market|\bmarket\b/.test(s) ? "Markets"
      : /beach/.test(s) ? "Beaches" : /waterfall|falls\b/.test(s) ? "Waterfalls" : /viewpoint|view point|lookout|sunset point/.test(s) ? "Views"
      : /\btrek|\bhike|hiking|mountain|summit/.test(s) ? "Hikes" : /\bdiv(e|ing)\b|snorkel/.test(s) ? "Diving" : /\bbar\b|pub\b|nightclub|club\b|rooftop/.test(s) && f.type !== "see" ? "Nightlife" : "Excursions";
    return {c:"cool", t};
  }
  return null;
}

/* ---------- our OpenStreetMap search index, to place listings that have no map position ---------- */
function osmIndex(cc){
  const dir = path.join(ROOT, "places", cc.toLowerCase(), "search"), by = new Map();
  if (!fs.existsSync(dir)) return by;
  for (const f of fs.readdirSync(dir)) for (const r of JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))){
    const k = fold(r[0]); if (!k) continue; (by.get(k) || by.set(k, []).get(k)).push({lat:r[1], lng:r[2]});
  }
  return by;
}

(async () => {
  const dataFile = path.join(ROOT, "js", "data.js"), line = fs.readFileSync(dataFile, "utf8").split("\n").find(l => l.startsWith("const D = "));
  const D = JSON.parse(line.replace(/\r$/, "").slice("const D = ".length).replace(/;\s*$/, ""));
  const known = D.places.map(p => ({n:p.n, lat:p.lat, lng:p.lng}));
  fs.mkdirSync(OUT, {recursive:true});
  const report = [];
  const only = (process.argv[2] || "").toUpperCase();          // node tools/wv-research.js th   rebuilds just Thailand
  for (const [cc, cities] of Object.entries(CITIES)){
    if (only && cc !== only) continue;
    let failed = [];
    const idx = osmIndex(cc), out = [], seen = new Set();
    for (const [page, city, clat, clng] of cities){
      const centre = {lat:clat, lng:clng};
      let pages = [page];
      try { const ds = await districts(page); if (ds.length) pages = pages.concat(ds); } catch(e){}
      let n = 0, placedByName = 0;
      for (const pg of pages){
        let doc; try { doc = await raw(pg); } catch(e){ console.warn("  skip", pg, e.message); failed.push(pg); continue; }
        await sleep(300);
        const edited = (doc.text.match(/\blastedit\s*=\s*(\d{4}-\d{2})/g) || []).length;
        for (const f of listings(doc.text)){
          const name = plain(f.name); if (!name || name.length > 80) continue;
          const txt = plain(f.content || f.description || "");
          const kd = kindOf(f, name, txt); if (!kd || !kd.t) continue;
          let lat = parseFloat(f.lat), lng = parseFloat(f.long);
          if (!isFinite(lat) || !isFinite(lng)){
            const fk0 = fold(name);
            let hits = (idx.get(fk0) || []).filter(h => km(h, centre) <= MAX_KM);
            if (!hits.length && fk0.length >= 6){
              hits = [];
              for (const [k, arr] of idx) if (k.length >= 6 && (k.includes(fk0) || fk0.includes(k)) && k.split(" ").length >= 2) arr.forEach(h => { if (km(h, centre) <= MAX_KM) hits.push(h); });
            }
            // several hits a few metres apart are the same place mapped twice; further apart, we can't be sure which it is
            if (!hits.length || hits.some(h => km(h, hits[0]) > 0.15)) continue;
            ({lat, lng} = hits[0]); placedByName++;
          }
          if (km({lat, lng}, centre) > MAX_KM) continue;
          const fk = fold(name), key = fk + "@" + lat.toFixed(3) + "," + lng.toFixed(3);
          if (seen.has(key)) continue; seen.add(key);
          if (known.some(k => km(k, {lat, lng}) < 1.5 && sameName(k.n, name))) continue;     // already one of our hand-researched places
          const pr = parsePrice(f.price, cc);
          const src = `https://en.wikivoyage.org/wiki/${encodeURIComponent(doc.title.replace(/ /g, "_"))}`;
          const le = /^(\d{4})-(\d{2})/.exec(f.lastedit || "");
          const chk = le ? new Date(Date.UTC(+le[1], +le[2] - 1, 1)).toLocaleDateString("en-GB", {month:"short", year:"numeric", timeZone:"UTC"}) : "";
          const img = plain(f.image).replace(/^(file|image):/i, "");
          const templeish = kd.t === "Temples" || /\bwat\b|temple|pagoda|shrine|buddha/i.test(name + " " + img);
          const p = {c:kd.c, id:"wv-" + cc.toLowerCase() + "-" + require("crypto").createHash("md5").update(key).digest("hex").slice(0, 10),
            n:name, cc, city, lat:+lat.toFixed(5), lng:+lng.toFixed(5), t:[kd.t],
            p:pr ? pr.p : null, cur:pr ? pr.cur : null, pu:pr ? (kd.c === "gaff" ? "per night, as Wikivoyage gives it" : kd.c === "munch" ? "as Wikivoyage gives it" : "entry, as Wikivoyage gives it") : "",
            pt:plain(f.price).slice(0, 160) || null, s:txt ? [txt.length > 320 ? txt.slice(0, 317).replace(/\s+\S*$/, "") + "…" : txt] : [],
            ad:plain(f.address).slice(0, 120) || null, ph:plain(f.phone).slice(0, 40) || null, web:/^https?:\/\//.test(f.url || "") ? f.url.trim() : null,
            hrs:plain(f.hours).slice(0, 120) || null, wd:/^Q\d+$/.test(f.wikidata || "") ? f.wikidata : null,
            img:img && !templeish && /\.(jpe?g|png|webp)$/i.test(img) ? img : null,
            src:[["Wikivoyage: " + doc.title.replace(/\//g, " › "), src]], chk:chk || "", wv:true, r:null, tips:[], d:{}, verified:false};
          out.push(p); n++;
        }
      }
      report.push(`${cc} ${city}: ${n} places (${placedByName} placed by name)`);
      console.log(report[report.length - 1]);
    }
    // a page that couldn't be downloaded would silently drop a whole city: keep the last good file instead
    if (failed.length){ console.error(`${cc}: ${failed.length} pages didn't download (${failed.slice(0, 5).join(", ")}…): not saved, run it again later`); continue; }
    fs.writeFileSync(path.join(OUT, cc.toLowerCase() + ".json"), JSON.stringify({v:1, made:"2026-11-24", src:"Wikivoyage listings (CC BY-SA 3.0)", places:out}));
    console.log(`${cc}: ${out.length} places, ${(fs.statSync(path.join(OUT, cc.toLowerCase() + ".json")).size / 1024).toFixed(0)} KB`);
  }
})();
