/* ============================================================
   10-places: one model for every place.
   - "researched" places: the hand-checked ones in the app's own data (prices, ratings, sources)
   - OpenStreetMap places: loaded on demand from the static tiles in places/<cc>/ (see src/osm/extract.py)
   Also: opening hours, saved places, the focus point, category chips, name search.
   ============================================================ */
const KIND = {
  hostel:{l:"Hostel",ic:"bed"}, hotel:{l:"Hotel",ic:"bed"}, guesthouse:{l:"Guesthouse",ic:"bed"}, resort:{l:"Resort",ic:"bed"}, bungalow:{l:"Bungalow",ic:"bed"},
  apartment:{l:"Apartment",ic:"bed"}, motel:{l:"Motel",ic:"bed"}, campsite:{l:"Campsite",ic:"tree"}, hut:{l:"Park hut",ic:"tree"},
  restaurant:{l:"Restaurant",ic:"food"}, cafe:{l:"Café",ic:"coffee"}, fastfood:{l:"Quick eats",ic:"food"}, foodcourt:{l:"Food court",ic:"food"},
  bakery:{l:"Bakery",ic:"coffee"}, dessert:{l:"Dessert",ic:"coffee"}, market:{l:"Market",ic:"cart"},
  beach:{l:"Beach",ic:"waves"}, temple:{l:"Temple",ic:"temple"}, worship:{l:"Shrine or place of worship",ic:"temple"}, historic:{l:"Historic site",ic:"temple"},
  attraction:{l:"Attraction",ic:"camera"}, viewpoint:{l:"Viewpoint",ic:"camera"}, museum:{l:"Museum or gallery",ic:"temple"}, zoo:{l:"Zoo or aquarium",ic:"fish"},
  themepark:{l:"Theme or water park",ic:"ticket"}, waterfall:{l:"Waterfall",ic:"drop"}, peak:{l:"Peak",ic:"mountain"}, cave:{l:"Cave",ic:"mountain"},
  hotspring:{l:"Hot spring",ic:"drop"}, park:{l:"Park",ic:"tree"}, nationalpark:{l:"National park or reserve",ic:"tree"}, dive:{l:"Dive centre",ic:"fish",biz:1},
  climbing:{l:"Climbing",ic:"mountain",biz:1}, muaythai:{l:"Muay Thai",ic:"glove",biz:1}, massage:{l:"Massage or spa",ic:"hands",biz:1}, cooking:{l:"Cooking class",ic:"pot",biz:1},
  tour:{l:"Tour or travel agency",ic:"ticket",biz:1}, bar:{l:"Bar or pub",ic:"glass"}, club:{l:"Nightclub",ic:"glass"}, culture:{l:"Theatre or arts centre",ic:"ticket"},
  laundry:{l:"Laundry",ic:"washer"}, atm:{l:"ATM",ic:"cash"}, bank:{l:"Bank",ic:"cash"}, exchange:{l:"Money exchange",ic:"swap"}, pharmacy:{l:"Pharmacy",ic:"pill"},
  hospital:{l:"Hospital",ic:"cross"}, clinic:{l:"Clinic",ic:"cross"}, dentist:{l:"Dentist",ic:"cross"}, police:{l:"Police",ic:"shield"},
  embassy:{l:"Embassy or consulate",ic:"flag"}, immigration:{l:"Immigration office",ic:"flag"}, supermarket:{l:"Supermarket",ic:"cart"},
  convenience:{l:"Convenience store",ic:"cart"}, mall:{l:"Mall",ic:"cart"}, sim:{l:"SIM and phone shop",ic:"sim"}, water:{l:"Drinking water",ic:"drop"},
  toilet:{l:"Toilets",ic:"toilet"}, fuel:{l:"Fuel",ic:"fuel"}, post:{l:"Post office",ic:"mail"}, cowork:{l:"Coworking or internet café",ic:"wifi"},
  wifi:{l:"Wi-Fi spot",ic:"wifi"}, luggage:{l:"Luggage storage",ic:"luggage"},
  airport:{l:"Airport",ic:"plane"}, train:{l:"Train station",ic:"train"}, metro:{l:"Metro or Skytrain station",ic:"train"}, bus:{l:"Bus station",ic:"bus"},
  ferry:{l:"Ferry pier",ic:"ship"}, carrental:{l:"Car rental",ic:"car"}, scooter:{l:"Scooter rental",ic:"car"}, bike:{l:"Bicycle rental",ic:"car"}, taxi:{l:"Taxi stand",ic:"car"}
};
const kindLabel = it => it.osm ? (KIND[it.ok || it.k] || {l:"Place"}).l : (it.t && it.t[0]) || CAT[it.c].one;
const kindIcon = it => (KIND[it.k] || {}).ic || CAT[it.c].ic;

/* Essentials shown on the map and in Tools. Each is one or more kinds from the places database. */
const ESS = [
  {id:"laundry", l:"Laundry", ic:"washer", kinds:["laundry"]},
  {id:"atm", l:"ATMs", ic:"cash", kinds:["atm","bank"]},
  {id:"pharmacy", l:"Pharmacies", ic:"pill", kinds:["pharmacy"]},
  {id:"shop", l:"7-Eleven and minimarts", ic:"cart", kinds:["convenience"]},
  {id:"supermarket", l:"Supermarkets", ic:"cart", kinds:["supermarket","mall"]},
  {id:"sim", l:"SIM cards", ic:"sim", kinds:["sim"]},
  {id:"wifi", l:"Wi-Fi", ic:"wifi", kinds:["wifi"]},          // only places whose map entry records Wi-Fi (internet access), not every coworking space
  {id:"water", l:"Water refill", ic:"drop", kinds:["water"]},
  {id:"hospital", l:"Hospitals", ic:"cross", kinds:["hospital"]},
  {id:"clinic", l:"Clinics", ic:"cross", kinds:["clinic","dentist"]},
  {id:"police", l:"Police", ic:"shield", kinds:["police"]},
  {id:"exchange", l:"Money exchange", ic:"swap", kinds:["exchange"]},
  {id:"toilet", l:"Toilets", ic:"toilet", kinds:["toilet"]},
  {id:"fuel", l:"Fuel", ic:"fuel", kinds:["fuel"]},
  {id:"embassy", l:"Embassies", ic:"flag", kinds:["embassy","immigration"]},
  {id:"post", l:"Post offices", ic:"mail", kinds:["post"]}
];
const ESS_BY_ID = Object.fromEntries(ESS.map(e => [e.id, e]));
const essOfKind = k => ESS.find(e => e.kinds.includes(k));

/* ---------- researched places: give them the same shape as the rest ---------- */
const CUR_KIND = {Hostel:"hostel", Guesthouse:"guesthouse", Hotel:"hotel", Villa:"hotel", Restaurant:"restaurant", Cafe:"cafe", Market:"market", Markets:"market",
  "Street food":"fastfood", Temples:"temple", Beaches:"beach", Views:"viewpoint", Hikes:"peak", Diving:"dive", Waterfalls:"waterfall", Nightlife:"bar",
  Museums:"museum", Excursions:"attraction", Hub:"bus"};
D.places.forEach(p => {
  p.cur_ = true;                                   // researched by hand
  p.k = (p.t || []).map(t => CUR_KIND[t]).find(Boolean) || (p.c === "gaff" ? "hostel" : p.c === "munch" ? "restaurant" : p.c === "cool" ? "attraction" : "bus");
  if (p.c === "move") p.k = /airport/i.test(p.n) ? "airport" : /pier|ferry|port/i.test(p.n) ? "ferry" : /railway|train|station|terminal/i.test(p.n) && !/bus/i.test(p.n) ? "train" : "bus";
  p.area = p.city;
});
const CUR_BY_ID = Object.fromEntries(D.places.map(p => [p.id, p]));

/* ---------- OpenStreetMap places, loaded tile by tile ---------- */
const PLACES_BASE = "places/";
const tile2lng = (x, z) => x / 2 ** z * 360 - 180;
const tile2lat = (y, z) => { const n = Math.PI - 2 * Math.PI * y / 2 ** z; return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };
const lng2tile = (lng, z) => Math.floor((lng + 180) / 360 * 2 ** z);
const lat2tile = (lat, z) => Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z);
function bboxDist(pt, bb){            // km from a point to a [w, s, e, n] box; 0 when inside
  const lat = clamp(pt.lat, bb[1], bb[3]), lng = clamp(pt.lng, bb[0], bb[2]);
  return lat === pt.lat && lng === pt.lng ? 0 : dist(pt, {lat, lng});
}
const P_MAP = {w:"web", v:"veg", vg:"vegan", d:"desc"};
/* The places databases, one folder each in places/ (built by tools/osm/extract.py; see tools/osm/README.md).
   Thailand covers the whole country. Indonesia so far covers Lampung, South Sumatra and Bengkulu (Sumatra), Bali and Lombok:
   the boxes below match "regions" in places/id/meta.json. */
const PLACE_DBS = [{dir:"th", cc:"TH"}, {dir:"id", cc:"ID", bbs:[[100.62, -6.455, 106.847, -1.514], [114.413, -9.05, 115.832, -7.463], [115.75, -9.0, 116.74, -8.15]]}];
const inPlaceDb = (lat, lng) => !!placeDbCc(lat, lng);
// which country's database covers a point (islands and coasts can fall outside the simplified country outlines, so the boxes win)
function placeDbCc(lat, lng){
  const d = PLACE_DBS.find(x => x.bbs ? x.bbs.some(b => lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3]) : countryAt(lat, lng) === x.cc);
  return d ? d.cc : null;
}
const ccAt = (lat, lng) => placeDbCc(lat, lng) || countryAt(lat, lng);
function osmPlace(row, areas, grp, cc = "TH"){
  const k = row[3], cn = (D.countries[cc] || {name:"Thailand"}).name, a = areas[row[5]] || [cn, cn], p = row[6] || {};
  const name = String(row[4] || "").split(";")[0].trim();        // OpenStreetMap sometimes packs two names into one field
  const it = {id:"o:" + row[0], osm:true, g:grp, c:CAT_OF_GRP[grp], k, n:name || (KIND[k] || {l:"Place"}).l, unnamed:!name, cc, city:a[1], area:a[0],
    lat:row[1], lng:row[2], ap:false, t:[(KIND[k] || {l:"Place"}).l], p:null, cur:null, r:null, s:[], tips:[], verified:false};
  for (const key in p) it[P_MAP[key] || key] = p[key];
  if (it.wp){ const m = /^en:(.+)$/.exec(it.wp); it.wpx = it.wp; it.wp = m ? m[1] : undefined; }
  return it;
}
const Places = {
  meta:null, metas:{}, state:"idle", leaves:{}, cache:new Map(), sums:{}, shards:new Map(), byId:new Map(), _ready:null,
  // every database's index, merged: kinds, and each section's tiles (each tile remembers its folder)
  ready(){
    if (this._ready) return this._ready;
    this.state = "loading";
    this._ready = Promise.all(PLACE_DBS.map(db => getJSON(`${PLACES_BASE}${db.dir}/meta.json`, {timeout:15000}).then(m => [db, m]).catch(() => null))).then(list => {
      const got = list.filter(Boolean);
      if (!got.length) throw new Error("no index");
      const merged = {kinds:{}, groups:{}, generated:"", osm:"", dbs:[]};
      this.leaves = {};
      for (const [db, m] of got){
        this.metas[db.dir] = m;
        Object.assign(merged.kinds, m.kinds);
        if (m.generated > merged.generated) merged.generated = m.generated;
        if (m.osm > merged.osm) merged.osm = m.osm;
        merged.dbs.push({dir:db.dir, cc:db.cc, regions:m.regions || null});
        for (const g in m.groups){
          (merged.groups[g] = merged.groups[g] || {n:0}).n += m.groups[g].n;
          (this.leaves[g] = this.leaves[g] || []).push(...m.groups[g].leaves.map(([z, x, y, n]) => ({g, z, x, y, n, dir:db.dir, cc:db.cc, key:`${db.dir}/${g}/${z}-${x}-${y}`,
            bb:[tile2lng(x, z), tile2lat(y + 1, z), tile2lng(x + 1, z), tile2lat(y, z)]})));
        }
      }
      this.meta = merged; this.state = "ok";
      return merged;
    }).catch(() => { this.state = "off"; this._ready = null; return null; });
    return this._ready;
  },
  leavesIn(g, bb){ return (this.leaves[g] || []).filter(l => l.bb[0] <= bb[2] && l.bb[2] >= bb[0] && l.bb[1] <= bb[3] && l.bb[3] >= bb[1]); },
  loaded(leaf){ const c = this.cache.get(leaf.key); return c && c.items ? c.items : null; },
  leaf(leaf, signal){
    let c = this.cache.get(leaf.key);
    if (c){ c.used = Date.now(); return c.promise; }
    c = {used:Date.now(), items:null};
    c.promise = getJSON(`${PLACES_BASE}${leaf.dir}/${leaf.g}/${leaf.z}-${leaf.x}-${leaf.y}.json`, {signal, timeout:20000}).then(t => {
      c.items = t.f.map(r => osmPlace(r, t.a, leaf.g, leaf.cc));
      c.items.forEach(p => { if (!this.byId.has(p.id) || p.k !== "wifi") this.byId.set(p.id, p); });
      this.trim();
      return c.items;
    }).catch(e => { this.cache.delete(leaf.key); throw e; });
    this.cache.set(leaf.key, c);
    return c.promise;
  },
  trim(){                                              // keep memory steady: forget the tiles used longest ago
    if (this.cache.size <= 90) return;
    [...this.cache.entries()].filter(([, c]) => c.items).sort((a, b) => a[1].used - b[1].used).slice(0, this.cache.size - 70)
      .forEach(([k, c]) => { c.items.forEach(p => { if (this.byId.get(p.id) === p) this.byId.delete(p.id); }); this.cache.delete(k); });
  },
  /* nearest places to a point, loading only the tiles needed to be sure of the answer */
  async near(g, pt, {maxKm = 25, want = 240, test = null, signal = null, maxLeaves = 28} = {}){
    const m = await this.ready(); if (!m) return {items:[], state:"off"};
    const cand = (this.leaves[g] || []).map(l => ({l, d:bboxDist(pt, l.bb)})).filter(x => x.d <= maxKm).sort((a, b) => a.d - b.d);
    const out = []; let used = 0, more = false, failed = 0;
    for (let i = 0; i < cand.length;){
      if (out.length >= want){ out.sort((a, b) => a.km - b.km); if (out[want - 1].km <= cand[i].d) break; }
      if (used >= maxLeaves){ more = true; break; }
      const batch = cand.slice(i, i + (i === 0 ? 2 : 4)); i += batch.length; used += batch.length;
      const res = await Promise.all(batch.map(x => this.leaf(x.l, signal).catch(() => { failed++; return []; })));
      if (signal && signal.aborted) return {items:[], state:"aborted"};
      for (const items of res) for (const p of items){ const k = dist(pt, p); if (k <= maxKm && (!test || test(p))) out.push({p, km:k}); }
    }
    out.sort((a, b) => a.km - b.km);
    return {items:out.slice(0, Math.max(want, 400)).map(x => x.p), state: failed && !out.length ? "error" : "ok", more};
  },
  /* The single nearest place that passes test, searched properly: tiles are opened nearest first, and the search only stops
     once nothing still unopened could hold anything closer. complete is false when a tile that could have held a closer
     place failed to load, or the search gave up (maxKm, maxLeaves), so the answer is never called "the nearest" on a guess. */
  async nearest(g, pt, {test = null, maxKm = 60, maxLeaves = 80, signal = null} = {}){
    const m = await this.ready(); if (!m) return {p:null, km:null, complete:false, state:"off"};
    const cand = (this.leaves[g] || []).map(l => ({l, d:bboxDist(pt, l.bb)})).filter(x => x.d <= maxKm).sort((a, b) => a.d - b.d);
    let best = null, bestKm = Infinity, failedNear = Infinity, used = 0, i = 0;
    while (i < cand.length && cand[i].d < bestKm){
      if (used >= maxLeaves) return {p:best, km:best ? bestKm : null, complete:false, state:"ok", searchedKm:cand[i].d};
      const batch = []; while (i < cand.length && batch.length < 4 && cand[i].d < bestKm){ batch.push(cand[i]); i++; }
      used += batch.length;
      const res = await Promise.all(batch.map(x => this.leaf(x.l, signal).then(items => ({x, items})).catch(() => ({x, items:null}))));
      if (signal && signal.aborted) return {p:null, km:null, complete:false, state:"aborted"};
      for (const {x, items} of res){
        if (!items){ failedNear = Math.min(failedNear, x.d); continue; }
        for (const p of items){ if (test && !test(p)) continue; const k = dist(pt, p); if (k < bestKm){ bestKm = k; best = p; } }
      }
    }
    // a tile that failed to load counts only if it could have held something closer than the answer
    const complete = failedNear >= bestKm && (best != null || i >= cand.length);
    return {p:best, km:best ? bestKm : null, complete, state:best ? "ok" : failedNear < Infinity ? "error" : "none", searchedKm:maxKm};
  },
  // The promise is stored straight away (before any await), so two early calls share one download.
  summary(g){
    if (this.sums[g]) return this.sums[g];
    this.sums[g] = this.ready().then(m => {
      if (!m) throw new Error("no index");
      // each database's counts, added together (a missing one is skipped rather than losing the rest)
      return Promise.all(m.dbs.filter(db => this.metas[db.dir].groups[g]).map(db => getJSON(`${PLACES_BASE}${db.dir}/sum-${g}.json`, {timeout:20000}).catch(() => null)));
    }).then(list => {
      const cells = [];
      for (const s of list){
        if (!s) continue;
        const z = s.z;
        for (const c of s.cells){
          const counts = {}; let total = 0;
          for (let i = 2; i < c.length; i += 2){ counts[s.kinds[c[i]]] = c[i + 1]; total += c[i + 1]; }
          cells.push({lat:(tile2lat(c[1], z) + tile2lat(c[1] + 1, z)) / 2, lng:(tile2lng(c[0], z) + tile2lng(c[0] + 1, z)) / 2, counts, total});
        }
      }
      if (!cells.length && !list.some(Boolean)) throw new Error("no summary");
      return cells;
    }).catch(() => { delete this.sums[g]; return null; });
    return this.sums[g];
  },
  async findLeafPlace(g, id, lat, lng){               // used when a search result is opened
    const m = await this.ready(); if (!m) return null;
    const leaf = (this.leaves[g] || []).find(l => lng >= l.bb[0] && lng < l.bb[2] && lat >= l.bb[1] && lat < l.bb[3]);
    if (!leaf) return null;
    try { const items = await this.leaf(leaf); return items.find(p => p.id === id) || null; } catch(e){ return null; }
  },
  // the search file for a word in one database (keep the promise, so typing fast doesn't download the same file twice)
  shard(dir, key){
    const k = dir + "/" + key;
    if (!this.shards.has(k)) this.shards.set(k, getJSON(`${PLACES_BASE}${dir}/search/s-${key}.json`, {timeout:12000}).catch(() => { this.shards.delete(k); return []; }));
    return this.shards.get(k);
  },
  /* name search over every database, one small file per word prefix */
  async search(text, near){
    const m = await this.ready(); if (!m) return [];
    const toks = foldText(text).split(" ").filter(t => t.length > 1);
    if (!toks.length) return [];
    const parts = await Promise.all(m.dbs.map(db => {
      const s = this.metas[db.dir].search;
      const stop = new Set(s.stop);
      const pick = toks.filter(t => !stop.has(t)).sort((a, b) => b.length - a.length)[0] || toks[0];
      let key = pick.slice(0, 2);
      if (s.split.includes(key)){ if (pick.length < 3) return []; key = pick.slice(0, 3); }
      return this.shard(db.dir, key);
    }));
    const rows = parts.flat();
    const hits = [];
    for (const r of rows){
      const words = foldText(r[0]).split(" ");
      if (!toks.every(t => words.some(w => w.startsWith(t)))) continue;
      const full = foldText(r[0]).startsWith(toks.join(" "));
      const km = near ? dist(near, {lat:r[1], lng:r[2]}) : 0;
      hits.push({r, score:(full ? 0 : 60) + Math.min(km, 900) / 6 + (r[3] === "ess" ? 15 : 0)});
    }
    hits.sort((a, b) => a.score - b.score);
    return hits.slice(0, 8).map(({r}) => ({n:r[0], lat:r[1], lng:r[2], g:r[3], k:r[4], id:"o:" + r[5], area:r[6]}));
  }
};
function foldText(s){
  return String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9฀-๿]+/g, " ").trim();
}
/* ---------- Thai to Latin letters, worked out on the phone (no signal needed) ----------
   A small rule-based romaniser written for this app. Two styles:
   - "rtgs": close to the official Royal Thai General System, for addresses and names (Thanon Ratchadamri)
   - "easy": a say-it-like-it-looks guide for English speakers, split into syllables (sa-wat-dee)
   Thai is written without spaces and many vowels are silent, so this is a best effort, never an official spelling.
   Well-known words and Bangkok street names come from a small list first, so the common ones are spelled the usual way. */
const thaiRom = (() => {
  // consonant: [sound at the start, sound at the end] (RTGS)
  const C = {"ก":["k","k"],"ข":["kh","k"],"ฃ":["kh","k"],"ค":["kh","k"],"ฅ":["kh","k"],"ฆ":["kh","k"],"ง":["ng","ng"],"จ":["ch","t"],"ฉ":["ch","t"],"ช":["ch","t"],
    "ซ":["s","t"],"ฌ":["ch","t"],"ญ":["y","n"],"ฎ":["d","t"],"ฏ":["t","t"],"ฐ":["th","t"],"ฑ":["th","t"],"ฒ":["th","t"],"ณ":["n","n"],"ด":["d","t"],"ต":["t","t"],
    "ถ":["th","t"],"ท":["th","t"],"ธ":["th","t"],"น":["n","n"],"บ":["b","p"],"ป":["p","p"],"ผ":["ph","p"],"ฝ":["f","p"],"พ":["ph","p"],"ฟ":["f","p"],"ภ":["ph","p"],
    "ม":["m","m"],"ย":["y","i"],"ร":["r","n"],"ล":["l","n"],"ว":["w","o"],"ศ":["s","t"],"ษ":["s","t"],"ส":["s","t"],"ห":["h",""],"ฬ":["l","n"],"อ":["",""],"ฮ":["h",""]};
  // the easy style swaps a few letters that English speakers read wrongly (th as in "think", ph as in "phone")
  const V = {   // vowel: [rtgs, easy when the syllable ends in a vowel, easy when a consonant follows]
    a:["a","a","a"], aa:["a","a","a"], i:["i","i","i"], ii:["i","ee","ee"], ue:["ue","eu","eu"], u:["u","u","u"], uu:["u","oo","oo"],
    e:["e","ay","e"], ae:["ae","ae","ae"], o:["o","oh","o"], aw:["o","aw","aw"], oe:["oe","er","er"], ia:["ia","ia","ia"], uea:["uea","eua","eua"],
    ua:["ua","ua","ua"], ai:["ai","ai","ai"], ao:["ao","ao","ao"], am:["am","am","am"], io:["io","iu","iu"], oi:["oi","oi","oi"], ui:["ui","ui","ui"],
    oei:["oei","oey","oey"], imp_o:["o","o","o"], imp_a:["a","a","a"], rue:["rue","reu","reu"], lue:["lue","leu","leu"]};
  const DEP = "ะัาำิีึืุู", LEAD = "เแโใไ", CLUSTER1 = "กขคปพตบผฟด", CLUSTER2 = "รลว", SONOR = "งญนมยรลว";
  // common words, so they come out spelled the usual way (RTGS, as on road signs)
  const WORDS = [["กรุงเทพมหานคร","Bangkok"],["กรุงเทพฯ","Bangkok"],["กรุงเทพ","Bangkok"],["ถนน","Thanon"],["ซอย","Soi"],["หมู่บ้าน","Mu Ban"],["หมู่ที่","Mu"],["หมู่","Mu"],
    ["แขวง","Khwaeng"],["เขต","Khet"],["ตำบล","Tambon"],["อำเภอ","Amphoe"],["จังหวัด","Changwat"],["ถ.","Th."],["ซ.","Soi"],["ม.","Mu"],["ต.","T."],["อ.","A."],["จ.","Ch."],
    ["พระราม","Rama"],["สุขุมวิท","Sukhumvit"],["ราชดำริ","Ratchadamri"],["รัชดาภิเษก","Ratchadaphisek"],["พหลโยธิน","Phahonyothin"],["เพชรบุรี","Phetchaburi"],
    ["สีลม","Silom"],["สาทร","Sathon"],["เจริญกรุง","Charoen Krung"],["ราชวิถี","Ratchawithi"],["วิภาวดีรังสิต","Vibhavadi Rangsit"],["พญาไท","Phaya Thai"],
    ["ข้าวสาร","Khao San"],["จุฬาลงกรณ์","Chulalongkorn"],["ลุมพินี","Lumphini"],["วังใหม่","Wang Mai"],["ปทุมวัน","Pathum Wan"],["ห้วยขวาง","Huai Khwang"],
    ["ดินแดง","Din Daeng"],["นิมมานเหมินท์","Nimmanhaemin"],["นิมมานเหมินทร์","Nimmanhaemin"],["เพลินจิต","Phloen Chit"],["วิทยุ","Witthayu"],["ราชประสงค์","Ratchaprasong"],
    ["สยาม","Siam"],["ประตูน้ำ","Pratunam"],["เยาวราช","Yaowarat"],["บางรัก","Bang Rak"],["ทองหล่อ","Thong Lo"],["เอกมัย","Ekkamai"],["อโศก","Asok"],["พระนคร","Phra Nakhon"],
    ["เชียงใหม่","Chiang Mai"],["เชียงราย","Chiang Rai"],["ภูเก็ต","Phuket"],["กระบี่","Krabi"],["ปาย","Pai"],["พัทยา","Pattaya"],["หัวหิน","Hua Hin"],["อยุธยา","Ayutthaya"],
    ["กาญจนบุรี","Kanchanaburi"],["สุราษฎร์ธานี","Surat Thani"],["เกาะ","Ko"],["หาด","Hat"],["อ่าว","Ao"],["วัด","Wat"],["ตลาด","Talat"],["จตุจักร","Chatuchak"],["ตลาดนัด","Talat Nat"],["ร้านขายยา","Ran Khai Ya"],["บ้าน","Ban"],["ร้าน","Ran"],
    ["โรงพยาบาล","Rong Phayaban"],["โรงแรม","Rong Raem"],["สถานี","Sathani"],["ท่าเรือ","Tha Ruea"],["ประเทศไทย","Prathet Thai"],["ไทย","Thai"],["อังกฤษ","Angkrit"],["มหาวิทยาลัย","Mahawitthayalai"],
    ["ศูนย์การค้า","Sun Kan Kha"],["ห้าง","Hang"],["ประชา","Pracha"],["นคร","Nakhon"],["บุรี","Buri"],["ธานี","Thani"],["สมุทร","Samut"],["เมือง","Mueang"],["ศรี","Si"],
    ["ราช","Rat"],["พระ","Phra"],["มิตร","Mit"],["สมเด็จ","Somdet"],["เจ้าพระยา","Chao Phraya"],["นานา","Nana"],["คลอง","Khlong"],["ทุ่ง","Thung"],["ดอย","Doi"],["ภู","Phu"],
    ["น้ำตก","Nam Tok"],["ห้วย","Huai"],["หนอง","Nong"],["สวน","Suan"],["ใหม่","Mai"],["เก่า","Kao"],["ใต้","Tai"],["เหนือ","Nuea"],["กลาง","Klang"],["ตะวันออก","Tawan Ok"],["ตะวันตก","Tawan Tok"]]
    .sort((a, b) => b[0].length - a[0].length);
  const THAI = /[ก-๛]/;
  const isC = c => !!c && C[c] !== undefined;
  const inS = (set, c) => !!c && set.includes(c);
  const dep = c => inS(DEP, c);

  function syllables(w){
    // tone marks and the short-vowel sign change the sound's pitch or length, not the letters; ์ marks silent letters
    w = w.replace(/[่-๋็]/g, "").replace(/[ก-ฮ][ิุ]?์/g, "").replace(/ๆ/g, "");
    const out = [], n = w.length, ch = j => w[j] || "";
    // an "อ" straight after a consonant is the vowel "o" unless a vowel sign sits on it
    const oVowel = j => ch(j) === "อ" && !dep(ch(j + 1));
    const clusterAt = (j, afterLead) => isC(ch(j)) && inS(CLUSTER1, ch(j)) && inS(CLUSTER2, ch(j + 1)) &&
      (dep(ch(j + 2)) || oVowel(j + 2) || (afterLead && isC(ch(j + 2))) || (ch(j + 1) !== "ว" && inS(LEAD, ch(j - 1)) && ch(j + 2) === ""));
    function initial(j, afterLead){
      if (ch(j) === "ห" && inS(SONOR, ch(j + 1))) return {c:C[ch(j + 1)][0], len:2};
      if (ch(j) === "อ" && ch(j + 1) === "ย") return {c:"y", len:2};
      if (clusterAt(j, afterLead)) return {c:C[ch(j)][0] + C[ch(j + 1)][0], len:2};
      return {c:C[ch(j)][0], len:1};
    }
    // how many consonants in a row from j carry no vowel of their own
    // ห before a soft letter, อย, and pairs like ตร or กล are said as one sound, so count them as one
    const unitLen = j => (ch(j) === "ห" && inS(SONOR, ch(j + 1))) || (ch(j) === "อ" && ch(j + 1) === "ย") || (inS(CLUSTER1, ch(j)) && inS("รล", ch(j + 1))) ? 2 : 1;
    const bareRun_ = j => { let r = 0; while (isC(ch(j))){ const u = unitLen(j); if (dep(ch(j + u)) || oVowel(j + u)) break; r++; j += u; } return {r, end:j}; };
    const bareRun = j => bareRun_(j).r;
    // can the consonant at j close the syllable before it? Bare consonants pair up (คน: khon), so an odd number left means the first one is a final.
    const canFinal = j => isC(ch(j)) && (bareRun(j) % 2 === 1 || unitLen(j) === 2) && !dep(ch(j + 1)) && !oVowel(j + 1) && !clusterAt(j, false) && !inS(LEAD, ch(j)) &&
      !(ch(j + 1) === "ว" && isC(ch(j + 2)) && !dep(ch(j + 2)));
    const takeFinal = k => canFinal(k) ? {f:C[ch(k)][1], len:1} : {f:"", len:0};
    let i = 0, prevClosed = true;
    const push = (c, v, f, l) => { out.push({c, v, f, l}); prevClosed = !!f; };
    while (i < n){
      const x = ch(i);
      if (/[๐-๙]/.test(x)){ out.push({raw:String("๐๑๒๓๔๕๖๗๘๙".indexOf(x))}); i++; continue; }
      if (x === "ฤ" || x === "ฦ"){ push("", x === "ฤ" ? "rue" : "lue", ""); i += ch(i + 1) === "ๅ" ? 2 : 1; continue; }
      if (inS(LEAD, x)){
        const I = initial(i + 1, true); I.l = ch(i + 1); let k = i + 1 + I.len, v;
        if (!isC(ch(i + 1))){ i++; continue; }
        if (x === "เ"){
          if (ch(k) === "ี" && ch(k + 1) === "ย"){ v = "ia"; k += 2; }
          else if (ch(k) === "ื" && ch(k + 1) === "อ"){ v = "uea"; k += 2; }
          else if (ch(k) === "า" && ch(k + 1) === "ะ"){ v = "aw"; k += 2; }
          else if (ch(k) === "า"){ v = "ao"; k += 1; }
          else if (ch(k) === "อ"){ v = "oe"; k += ch(k + 1) === "ะ" ? 2 : 1; }
          else if (ch(k) === "ิ"){ v = "oe"; k += 1; }
          else if (ch(k) === "ย" && !dep(ch(k + 1))){ v = "oei"; k += 1; }
          else if (ch(k) === "ะ"){ v = "e"; k += 1; }
          else v = "e";
        } else if (x === "แ"){ v = "ae"; if (ch(k) === "ะ") k++; }
        else if (x === "โ"){ v = "o"; if (ch(k) === "ะ") k++; }
        else { v = "ai"; if (ch(k) === "ย" && !dep(ch(k + 1)) && !oVowel(k + 1)) k++; }       // ไทย: the ย is silent
        const F = (v === "ao" || v === "ai" || v === "oei" || ch(k - 1) === "ะ") ? {f:"", len:0} : takeFinal(k);
        push(I.c, v, F.f, I.l); i = k + F.len; continue;
      }
      if (!isC(x)){ i++; continue; }                                    // stray marks
      const I = initial(i, false); I.l = x; let k = i + I.len, v = null;
      const y = ch(k);
      if (y === "ั"){ if (ch(k + 1) === "ว"){ v = "ua"; k += 2; } else if (ch(k + 1) === "ย" && !dep(ch(k + 2))){ v = "ai"; k += 2; push(I.c, v, "", I.l); i = k; continue; } else { v = "a"; k += 1; } }
      else if (y === "ะ"){ push(I.c, "a", "", I.l); i = k + 1; continue; }
      else if (y === "า"){ if (ch(k + 1) === "ย" && !dep(ch(k + 2)) && !oVowel(k + 2)){ push(I.c, "ai", "", I.l); i = k + 2; continue; } if (ch(k + 1) === "ว" && !dep(ch(k + 2))){ push(I.c, "ao", "", I.l); i = k + 2; continue; } v = "aa"; k += 1; }
      else if (y === "ำ"){ push(I.c, "am", "", I.l); i = k + 1; continue; }
      else if (y === "ิ"){ if (ch(k + 1) === "ว" && !dep(ch(k + 2))){ push(I.c, "io", "", I.l); i = k + 2; continue; } v = "i"; k += 1; }
      else if (y === "ี"){ v = "ii"; k += 1; }
      else if (y === "ึ"){ v = "ue"; k += 1; }
      else if (y === "ื"){ v = "ue"; k += ch(k + 1) === "อ" ? 2 : 1; }
      else if (y === "ุ"){ if (ch(k + 1) === "ย" && !dep(ch(k + 2))){ push(I.c, "ui", "", I.l); i = k + 2; continue; } v = "u"; k += 1; }
      else if (y === "ู"){ v = "uu"; k += 1; }
      else if (oVowel(k)){ if (ch(k + 1) === "ย" && !dep(ch(k + 2))){ push(I.c, "oi", "", I.l); i = k + 2; continue; } v = "aw"; k += 1; }
      else if (y === "ว" && isC(ch(k + 1)) && !dep(ch(k + 1))){ v = "ua"; k += 1; }
      if (v){ const F = takeFinal(k); push(I.c, v, F.f, I.l); i = k + F.len; continue; }
      // no written vowel: count the bare consonants in a row and share out the hidden "a" and "o" sounds.
      // Pairs say "o" (คน: khon). An odd number left over says "a": first at the end of a word (ถนน: tha-non), last before another syllable (ปงสนุก: pong-sa-nuk).
      const U = unitLen(i), ic = U === 2 ? (x === "ห" ? C[ch(i + 1)][0] : x === "อ" ? "y" : C[x][0] + C[ch(i + 1)][0]) : C[x][0];
      const {r:run, end} = bareRun_(i);
      if (run === 1){
        if (!prevClosed && out.length && !ch(i + U) && U === 1){ out[out.length - 1].f = C[x][1]; i++; continue; }
        push(ic, "imp_a", "", x); i += U; continue;
      }
      if (run % 2 === 0 || isC(ch(end))){ push(ic, "imp_o", C[ch(i + U)][1], x); i += U + 1; continue; }
      push(ic, "imp_a", "", x); i += U;
    }
    return out;
  }
  function render(syls, style){
    const easy = style === "easy";
    return syls.map(s => {
      if (s.raw) return s.raw;
      let c = s.c, f = s.f;
      const vv = V[s.v] || ["a", "a", "a"];
      let v = easy ? (f ? vv[2] : vv[1]) : vv[0];
      if (easy){ c = s.l === "จ" ? "j" : c.replace(/^([ktp])h/, "$1"); }
      return c + v + f;
    });
  }
  // romanise one run of Thai letters (no spaces inside)
  function word(w, style){
    const parts = []; let buf = "";
    const flush = () => { if (buf){ parts.push({syl:render(syllables(buf), style)}); buf = ""; } };
    for (let i = 0; i < w.length;){
      const hit = style === "easy" ? null : WORDS.find(([th]) => w.startsWith(th, i));
      if (hit){ flush(); parts.push({fixed:hit[1]}); i += hit[0].length; }
      else { buf += w[i]; i++; }
    }
    flush();
    if (style === "easy") return parts.map(p => p.syl.join("-")).join(" ");
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    return parts.map(p => p.fixed || cap(p.syl.join(""))).join(" ");
  }
  return {
    has: s => THAI.test(String(s || "")),
    /* romanise any text, leaving the non-Thai parts (numbers, English, punctuation) as they are */
    text(s, style = "rtgs"){
      return String(s || "").replace(/​/g, "").replace(/[ก-๛.]+/g, m => THAI.test(m) ? (m.endsWith(".") && !WORDS.some(([th]) => th === m) ? word(m.slice(0, -1), style) + "." : word(m, style)) : m)
        .replace(/(\d)([A-Za-z])/g, "$1 $2").replace(/\s+/g, " ").trim();
    }
  };
})();

/* An address or name for the details sheet: English letters first (worked out on the phone when it's only in Thai), the Thai underneath for a driver */
function thaiPair(s, sayId){
  if (!thaiRom.has(s)) return esc(s);
  return `<b>${esc(thaiRom.text(s))}</b><div class="note">Approximate English spelling, worked out on your phone</div>
    <div class="th-under"><span lang="th">${esc(s)}</span>${sayId ? `<button class="btn small" type="button" id="${sayId}">${icon("speaker","i s")}Say it</button>` : ""}</div>`;
}
const romName = it => thaiRom.has(it.n) ? thaiRom.text(it.n) : "";

function findPlace(id){
  return CUR_BY_ID[id] || Places.byId.get(id) || (S.saved[id] && S.saved[id].snap) || null;
}

/* ---------- opening hours (OpenStreetMap format) ---------- */
const OH_DAYS = ["Mo","Tu","We","Th","Fr","Sa","Su"];
const OH_NAMES = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
function ohParse(str){
  if (!str) return null;
  let s = String(str).trim();
  if (/^24\s*\/\s*7$/.test(s)) return {always:true};
  if (/[\[\]"]|\|\||sunrise|sunset|dawn|dusk|week|easter|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(s)) return null;
  const week = [[],[],[],[],[],[],[]];
  const dayIdx = d => OH_DAYS.indexOf(d.slice(0, 1).toUpperCase() + d.slice(1, 2).toLowerCase());
  for (const part of s.split(";")){
    const rule = part.trim(); if (!rule) continue;
    // "Mo-Fr 08:00-12:00, Sa 09:00-12:00": a comma before a day name starts another rule that adds to the first
    const subs = rule.split(/,\s*(?=(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)\b)/i);
    let first = true, lastDays = null;
    for (let sub of subs){
      sub = sub.trim();
      const m = /^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?\s*,?\s*)+)?\s*(.*)$/i.exec(sub);
      let dayPart = (m[1] || "").trim().replace(/,$/, ""), timePart = (m[2] || "").trim();
      let days;
      if (dayPart){
        days = new Set();
        for (const seg of dayPart.split(",")){
          const t = seg.trim(); if (!t || /^(PH|SH)$/i.test(t)) continue;
          const [a, b] = t.split("-").map(x => x.trim());
          const ia = dayIdx(a), ib = b ? dayIdx(b) : ia;
          if (ia < 0 || ib < 0) return null;
          for (let i = ia; ; i = (i + 1) % 7){ days.add(i); if (i === ib) break; }
        }
        if (!days.size){ first = false; continue; }             // a public-holiday-only rule: ignore it
        lastDays = days;
      } else days = lastDays && !first ? lastDays : new Set([0,1,2,3,4,5,6]);
      const replace = first || !!dayPart;
      if (/^(off|closed)$/i.test(timePart)){ days.forEach(d => week[d] = []); first = false; continue; }
      const ranges = [];
      if (!timePart) ranges.push([0, 1440]);
      else for (const tr of timePart.split(",")){
        const mm = /^(\d{1,2})[:.](\d{2})\s*(?:-\s*(\d{1,2})[:.](\d{2})|\+)?$/.exec(tr.trim());
        if (!mm) return null;
        const a = +mm[1] * 60 + +mm[2];
        let b = mm[3] != null ? +mm[3] * 60 + +mm[4] : 1440;
        if (a > 1440 || b > 2880) return null;
        if (b <= a) b += 1440;                                  // closes after midnight
        ranges.push([a, b]);
      }
      days.forEach(d => { week[d] = replace && sub === subs[0] ? ranges.slice() : week[d].concat(ranges); });
      first = false;
    }
  }
  return {week};
}
const thaiNow = () => { const d = new Date(Date.now() + 7 * 3600e3); return {day:(d.getUTCDay() + 6) % 7, min:d.getUTCHours() * 60 + d.getUTCMinutes()}; };
const hhmm = m => { m = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
/* Is it open? Returns null when the hours are unknown or written in a way we can't read: unknown is never treated as open. */
function ohState(str, now = thaiNow()){
  const p = ohParse(str);
  if (!p) return null;
  if (p.always) return {open:true, text:"Open 24 hours"};
  const {day, min} = now, w = p.week;
  for (const [a, b] of w[day]) if (min >= a && min < b) return {open:true, text: a === 0 && b >= 1440 ? "Open all day" : `Open until ${hhmm(b)}`};
  for (const [a, b] of w[(day + 6) % 7]) if (b > 1440 && min < b - 1440) return {open:true, text:`Open until ${hhmm(b)}`};
  for (let i = 0; i < 8; i++){
    const d = (day + i) % 7;
    const next = w[d].map(r => r[0]).filter(a => i > 0 || a > min).sort((x, y) => x - y)[0];
    if (next != null) return {open:false, text: i === 0 ? `Closed, opens ${hhmm(next)}` : i === 1 ? `Closed, opens tomorrow ${hhmm(next)}` : `Closed, opens ${OH_NAMES[d]} ${hhmm(next)}`};
  }
  return {open:false, text:"Closed"};
}
const isOpenNow = it => { if (!it.oh) return null; if (it._oh === undefined || it._ohAt !== Math.floor(Date.now() / 60000)){ it._oh = ohState(it.oh); it._ohAt = Math.floor(Date.now() / 60000); } return it._oh; };

/* ---------- saved places ---------- */
const isSaved = id => !!S.saved[id];
function savedPlaces(){
  return Object.values(S.saved).sort((a, b) => b.at - a.at).map(s => CUR_BY_ID[s.id] || Places.byId.get(s.id) || s.snap).filter(Boolean);
}
function toggleSave(it){
  if (!it) return;
  const had = S.saved[it.id];
  if (had) delete S.saved[it.id];
  else {
    const snap = it.cur_ ? null : Object.fromEntries(Object.entries(it).filter(([k]) => k[0] !== "_"));
    S.saved[it.id] = {id:it.id, at:Date.now(), snap};
  }
  if (!persist()) toast("Couldn’t save on this phone (storage is full or blocked)");
  else toast(had ? "Removed from saved places" : "Saved", had ? () => { S.saved[it.id] = had; persist(); syncSaveButtons(); } : null);
  syncSaveButtons();
}
function syncSaveButtons(){
  $$("[data-save]").forEach(b => { const on = isSaved(b.dataset.save); b.setAttribute("aria-pressed", on); b.setAttribute("aria-label", on ? "Remove from saved places" : "Save this place"); });
  if (typeof onSavedChanged === "function") onSavedChanged();
}
const saveBtn = (it, cls = "save") => `<button class="${cls}" type="button" data-save="${esc(it.id)}" aria-pressed="${isSaved(it.id)}" aria-label="${isSaved(it.id) ? "Remove from saved places" : "Save this place"}">${icon("bookmark")}</button>`;

/* ---------- the focus point: where lists and search look ---------- */
const THAI_DESTS = D.cities.filter(c => countryAt(c[1], c[2]) === "TH");
// destinations inside a places database (Thailand, and the Sumatran provinces so far): these can be saved offline and picked as "where"
const PLACE_DESTS = D.cities.filter(c => inPlaceDb(c[1], c[2]));
const SUMATRA_DESTS = PLACE_DESTS.filter(c => placeDbCc(c[1], c[2]) === "ID" && c[2] < 110);
const BALI_LOMBOK_DESTS = PLACE_DESTS.filter(c => placeDbCc(c[1], c[2]) === "ID" && c[2] >= 114);
function focusPt(){
  if (S.focus && isFinite(S.focus.lat)) return S.focus;
  if (userLoc) return {lat:userLoc.lat, lng:userLoc.lng, here:true};
  const c = D.countries[S.country].c; return {lat:c[0], lng:c[1], none:true};
}
function nearestDest(pt, maxKm = 30){
  let best = null, bk = maxKm;
  for (const c of D.cities){ const k = dist(pt, {lat:c[1], lng:c[2]}); if (k < bk){ bk = k; best = c[0]; } }
  return best;
}
function focusLabel(){
  const f = focusPt();
  if (S.focus) return S.focus.n;
  if (f.here) return nearestDest(f) || "Near you";
  return D.countries[S.country].name;
}
function setFocus(node){
  S.focus = node ? {n:node.n, lat:node.lat, lng:node.lng} : null; persist();
  ["gaff","munch","cool"].forEach(k => ui.lists[k].shown = 30);
}

/* ---------- category chips ---------- */
const ptext = it => it._txt || (it._txt = [it.n, ...(it.s || []), ...(it.tips || []), it.d ? Object.values(it.d).join(" ") : "", it.desc || "", (it.cu || []).join(" ")].join(" ").toLowerCase());
const hasT = (it, ...ts) => !!it.t && it.t.some(t => ts.includes(t));
const hasCu = (it, re) => (it.cu || []).some(c => re.test(c));
const WESTERN = /burger|pizza|italian|american|steak|mexican|french|german|british|english|breakfast|sandwich|international|western|mediterranean|greek|spanish|tex-mex|fish and chips|pasta|bagel|brunch|european|irish|australian/;
const THAI_CU = /thai|isan|isaan|noodle|som tam|lao|seafood;thai|khao|pad /;
const STREETISH = it => it.osm ? ((it.k === "fastfood" && !it.br) || it.k === "foodcourt" || it.k === "market") : hasT(it, "Street food", "Market", "Markets");
const CHIPS = {
  gaff: [
    {id:"all", l:"All stays"},
    {id:"hostel", l:"Hostels", ic:"bed", f:it => it.k === "hostel"},
    {id:"hotel", l:"Hotels", ic:"bed", f:it => ["hotel","resort","motel","apartment"].includes(it.k)},
    {id:"guesthouse", l:"Guesthouses", ic:"bed", f:it => ["guesthouse","bungalow","campsite","hut"].includes(it.k)}
  ],
  munch: [
    {id:"all", l:"All", ic:"food"},
    {id:"street", l:"Street Food", ic:"food", f:STREETISH},
    // the country's own food: Thai in Thailand, Indonesian (including Padang food, pempek and satay) in Indonesia
    {id:"thai", get l(){ return S.country === "ID" ? "Indonesian Food" : "Thai Food"; }, ic:"pot",
      f:it => it.cc === "ID" ? ["Indonesian", "Padang food", "Pempek", "Satay"].includes(foodType(it)) : it.osm ? hasCu(it, THAI_CU) && !it.br : it.cc === "TH" && !WESTERN.test(ptext(it))},
    {id:"cheap", l:"Cheap Eats", ic:"cash", f:it => it.osm ? STREETISH(it) : (it.p ? toGBP(it.p[0], it.cur) * rate("THB") <= 100 : false),
      note:"Researched places with a checked price of ฿100 or less, then street stalls, food courts and markets, which are normally cheap. OpenStreetMap has no prices, so none are shown for those."},
    {id:"picks", l:"Local Favourites", ic:"star", f:it => !it.osm, note:"Places recommended by travel guides and blogs, each with its sources."},
    {id:"veg", l:"Vegetarian", ic:"leaf", f:it => it.osm ? !!it.veg || hasCu(it, /vegetarian/) : /vegetarian/.test(ptext(it))},
    {id:"vegan", l:"Vegan", ic:"leaf", f:it => it.osm ? !!it.vegan || hasCu(it, /vegan/) : /vegan/.test(ptext(it))},
    {id:"western", l:"Western Food", ic:"food", f:it => it.osm ? hasCu(it, WESTERN) : WESTERN.test(ptext(it))},
    {id:"markets", l:"Food Markets", ic:"cart", f:it => it.k === "market" || hasT(it, "Market", "Markets")},
    {id:"cafes", l:"Cafés", ic:"coffee", f:it => ["cafe","bakery","dessert"].includes(it.k)}
  ],
  cool: [
    {id:"all", l:"All"},
    {id:"beaches", l:"Beaches", ic:"waves", f:it => it.k === "beach" || hasT(it, "Beaches")},
    {id:"temples", l:"Temples", ic:"temple", f:it => it.osm ? it.k === "temple" || it.k === "worship" : hasT(it, "Temples")},
    {id:"markets", l:"Markets", ic:"cart", f:it => it.k === "market" || hasT(it, "Markets")},
    {id:"diving", l:"Diving", ic:"fish", f:it => it.k === "dive" || hasT(it, "Diving")},
    {id:"snorkel", l:"Snorkelling", ic:"fish", f:it => /snorkel/.test(ptext(it))},
    {id:"hiking", l:"Hiking", ic:"mountain", f:it => it.osm ? ["peak","nationalpark"].includes(it.k) : hasT(it, "Hikes")},
    {id:"waterfalls", l:"Waterfalls", ic:"drop", f:it => it.k === "waterfall" || hasT(it, "Waterfalls")},
    {id:"nature", l:"Nature", ic:"tree", f:it => it.osm ? ["nationalpark","park","cave","hotspring","waterfall","peak","zoo"].includes(it.k) : hasT(it, "Hikes", "Waterfalls")},
    {id:"culture", l:"Culture", ic:"temple", f:it => it.osm ? ["museum","historic","culture","muaythai","attraction"].includes(it.k) : hasT(it, "Museums", "Temples")},
    {id:"tours", l:"Tours", ic:"ticket", f:it => it.osm ? it.k === "tour" : hasT(it, "Excursions")},
    {id:"cooking", l:"Cooking classes", ic:"pot", f:it => it.k === "cooking" || /cook(ing|ery) (class|school)/.test(ptext(it))},
    {id:"views", l:"Views", ic:"camera", f:it => it.k === "viewpoint" || hasT(it, "Views")},
    {id:"nightlife", l:"Nightlife", ic:"glass", f:it => it.osm ? ["bar","club"].includes(it.k) : hasT(it, "Nightlife")},
    {id:"massage", l:"Massage and spa", ic:"hands", f:it => it.k === "massage"}
  ]
};
const GAFF_FLAGS = [
  {id:"dorm", l:"Dorm rooms", f:it => it.osm ? it.k === "hostel" : /dorm/.test(ptext(it)) || it.k === "hostel"},
  {id:"private", l:"Private rooms", f:it => it.osm ? it.k !== "hostel" : /private/.test(ptext(it)) || it.k !== "hostel"},
  {id:"pool", l:"Pool", f:it => it.osm ? !!it.pool : /\bpool\b(?! table)/.test(ptext(it))},
  {id:"ac", l:"Air conditioning", f:it => it.osm ? !!it.ac : /air[- ]?con/.test(ptext(it))},
  {id:"wifi", l:"Wi-Fi", f:it => it.osm ? !!it.wifi : /wi-?fi/.test(ptext(it))},
  {id:"social", l:"Social hostels", f:it => !it.osm && /social|party|pub crawl|meet people|events/.test(ptext(it))}
];
const isBiz = it => it.osm ? !!(KIND[it.k] || {}).biz : hasT(it, "Excursions", "Diving") && !!it.p;
