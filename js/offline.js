/* ============================================================
   75-offline: save a city for use with no signal, and back up / restore what's on this phone.
   - City packs: the places around a city (every section), its street-map tiles (zoom 10-14) and the
     map's label fonts go into their own cache ("sea-trip-packs-v1"), which sw.js reads but never trims.
     Real photos aren't saved: Google's terms don't allow storing them, so offline cards show the drawings.
   - Backup: one .json file with saved places, spending, stay dates, the Design Lab look and documents.
     On iPhone it opens the share sheet (Save to Files, AirDrop, email it to yourself).
   ============================================================ */
const PACKS_CACHE = "sea-trip-packs-v1";
const PACK_KM = 6;                        // half the width of the square saved round each city
const PACK_FONTS = ["Noto Sans Regular", "Noto Sans Bold", "Noto Sans Italic"];
const PACK_RANGES = ["0-255", "256-511", "3584-3839", "8192-8447"];     // Latin, more Latin, Thai, punctuation
const packState = {busy:null, done:0, total:0, stage:"map"};
const packStageText = () => `${packState.stage === "photos" ? "Saving landmark photos" : "Saving places and map"}… ${packState.done} of ${packState.total}`;
if (!S.packs || typeof S.packs !== "object") S.packs = {};

const boxAround = (pt, km) => { const dLat = km / 111.32, dLng = km / (111.32 * Math.cos(pt.lat * Math.PI / 180)); return [pt.lng - dLng, pt.lat - dLat, pt.lng + dLng, pt.lat + dLat]; };

/* everything a city needs, as a list of web addresses */
async function packUrls(city){
  const pt = {lat:city[1], lng:city[2]}, bb = boxAround(pt, PACK_KM), urls = [];
  const abs = u => new URL(u, location.href).href;
  const m = await Places.ready(); if (!m) throw new Error("Needs signal to start");
  // every database's small index files (so the map and search start with no signal), then the city's own tiles
  for (const db of m.dbs){
    ["meta.json", "coverage.json"].forEach(f => urls.push(abs(`${PLACES_BASE}${db.dir}/${f}`)));
    Object.keys(Places.metas[db.dir].groups).forEach(g => urls.push(abs(`${PLACES_BASE}${db.dir}/sum-${g}.json`)));
  }
  for (const g of Object.keys(Places.leaves)) for (const leaf of Places.leavesIn(g, bb)) urls.push(abs(`${PLACES_BASE}${leaf.dir}/${leaf.g}/${leaf.z}-${leaf.x}-${leaf.y}.json`));
  // street map: the small index file that says where today's tiles live, then the tiles themselves
  const tjUrl = MAP_STYLE.sources.openmaptiles.url;
  let tj = null; try { tj = await getJSON(tjUrl, {timeout:12000}); urls.push(tjUrl); } catch(e){}   // no street map server: still save the places
  const tpl = tj && tj.tiles && tj.tiles[0];
  if (tpl){
    const maxz = Math.min(14, tj.maxzoom || 14);
    for (let z = 10; z <= maxz; z++){
      const x0 = lng2tile(bb[0], z), x1 = lng2tile(bb[2], z), y0 = lat2tile(bb[3], z), y1 = lat2tile(bb[1], z);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) urls.push(tpl.replace("{z}", z).replace("{x}", x).replace("{y}", y));
    }
  }
  PACK_FONTS.forEach(f => PACK_RANGES.forEach(r => urls.push(MAP_STYLE.glyphs.replace("{fontstack}", encodeURIComponent(f)).replace("{range}", r))));
  return [...new Set(urls)];
}

// download a list of addresses into the cache, six at a time; returns {ok:[...], bytes, failed}
async function fetchInto(cache, urls, onStep){
  let done = 0, bytes = 0, failed = 0;
  const ok = [], queue = urls.slice();
  const worker = async () => {
    while (queue.length){
      const u = queue.shift();
      try {
        const res = await fetch(u, {cache:"no-cache", mode:"cors"});
        if (!res.ok) throw new Error(res.status);
        const buf = await res.clone().arrayBuffer(); bytes += buf.byteLength;
        await cache.put(u, res); ok.push(u);
      } catch(e){ failed++; }
      done++; if (onStep) onStep(done, urls.length);
    }
  };
  await Promise.all([1, 2, 3, 4, 5, 6].map(worker));
  return {ok, bytes, failed};
}

/* save a city; opts.photos (on unless switched off) also saves landmark photos */
async function savePack(city, onStep, opts = {}){
  if (!("caches" in window)) throw new Error("This browser can't save things for offline use");
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch(e){}
  const urls = await packUrls(city);
  const cache = await caches.open(PACKS_CACHE);
  const main = await fetchInto(cache, urls, (d, t) => onStep && onStep(d, t, "map"));
  if (main.failed > urls.length / 3) throw new Error("Too many downloads failed. Check your signal and try again");
  let photos = {count:0, bytes:0, urls:[]};
  if (opts.photos !== false && S.packPhotos !== false){
    try { photos = await savePackPhotos(city, cache, main.ok, (d, t) => onStep && onStep(d, t, "photos")); } catch(e){ /* photos are a bonus: the city is saved anyway */ }
  }
  S.packs[city[0]] = {at:Date.now(), files:main.ok.length + photos.count, bytes:main.bytes + photos.bytes, photos:photos.count, urls:main.ok.concat(photos.urls)};
  persist();
  await loadPackPhotos();
  return S.packs[city[0]];
}
async function removePack(name){
  const p = S.packs[name]; if (!p) return;
  try {
    const cache = await caches.open(PACKS_CACHE);
    // keep files another saved city also uses (shared summaries, fonts, overlapping tiles and photos)
    const keep = new Set(Object.entries(S.packs).filter(([n]) => n !== name).flatMap(([, q]) => q.urls || []));
    await Promise.all((p.urls || []).filter(u => !keep.has(u)).map(u => cache.delete(u)));
    await cache.delete(packPhotoKey(name));
  } catch(e){}
  delete S.packs[name]; persist();
  await loadPackPhotos();
}

/* ---------- landmark photos for saved cities ----------
   Temples, museums, parks and other places with a Wikipedia or Wikidata entry have free Wikimedia Commons photos.
   Up to PACK_PHOTO_MAX per city (researched places first, then activities, then stays and food, nearest the centre first),
   500 px wide, with the photographer and licence kept for the credit line. Google photos can't be stored. */
const PACK_PHOTO_MAX = 150, PACK_PHOTO_W = 500;          // 500 px is one of Wikimedia's standard sizes (it rounds other widths up, e.g. 640 to 960)
const PACK_PHOTOS = new Map();                 // place id -> {s: picture address, p: its Commons page, c: credit line}
const packPhotoKey = name => new URL(`__pack-photos/${encodeURIComponent(name)}.json`, location.href).href;
let packPhotosReady = null;
function loadPackPhotos(){
  packPhotosReady = (async () => {
    const fresh = new Map();
    if ("caches" in window){
      try {
        const cache = await caches.open(PACKS_CACHE);
        for (const name of Object.keys(S.packs || {})){
          const r = await cache.match(packPhotoKey(name)); if (!r) continue;
          Object.entries(await r.json()).forEach(([id, v]) => fresh.set(id, v));
        }
      } catch(e){}
    }
    PACK_PHOTOS.clear(); fresh.forEach((v, k) => PACK_PHOTOS.set(k, v));
  })();
  return packPhotosReady;
}
// HTML from Commons (photographer names) as plain text, without loading anything it mentions
const plainText = h => { try { return (new DOMParser().parseFromString(String(h || ""), "text/html").body.textContent || "").trim(); } catch(e){ return ""; } };
// a MediaWiki API query, up to 50 titles or ids at a time. Big answers come back in parts ("continue"): fetch them all.
async function wmBatch(base, params, list, size = 50){
  const out = [];
  for (let i = 0; i < list.length; i += size){
    const first = Object.assign({format:"json", origin:"*"}, params(list.slice(i, i + size)));
    let more = {};
    for (let part = 0; part < 12; part++){
      let j = null;
      try { j = await getJSON(`${base}?${new URLSearchParams(Object.assign({}, first, more))}`, {timeout:20000}); } catch(e){ break; }
      out.push(j);
      if (!j.continue) break;
      more = j.continue;
    }
  }
  return out;
}
// which places in the city have a free photo, best first
async function packPhotoPlaces(city, cache, urls){
  const pt = {lat:city[1], lng:city[2]}, bb = boxAround(pt, PACK_KM);
  const inBox = p => p.lng >= bb[0] && p.lng <= bb[2] && p.lat >= bb[1] && p.lat <= bb[3];
  const found = [];
  D.places.filter(p => (p.wp || p.wd) && inBox(p)).forEach(p => found.push({p, tier:0}));
  for (const u of urls){
    const m = /\/places\/([a-z]+)\/(stay|food|do)\/[\d-]+\.json$/.exec(u); if (!m) continue;
    const cc = (PLACE_DBS.find(d => d.dir === m[1]) || {cc:"TH"}).cc;
    try {
      const t = await (await cache.match(u)).json();
      t.f.forEach(r => { const p = osmPlace(r, t.a, m[2], cc); if ((p.wp || p.wd) && inBox(p)) found.push({p, tier:m[2] === "do" ? 1 : 2}); });
    } catch(e){}
  }
  const seen = new Set();
  return found.filter(x => !seen.has(x.p.id) && seen.add(x.p.id) && photoPlaceOk(x.p))     // no temple photos (see js/detail.js)
    .sort((a, b) => a.tier - b.tier || dist(pt, a.p) - dist(pt, b.p)).slice(0, PACK_PHOTO_MAX).map(x => x.p);
}
// place id -> Commons file name: the Wikipedia page's main picture, or the Wikidata "image"
async function packPhotoFiles(places){
  const file = {};
  const follow = (t, map) => { for (let i = 0; i < 4 && map[t]; i++) t = map[t]; return t; };
  const titles = [...new Set(places.filter(p => p.wp).map(p => String(p.wp).replace(/_/g, " ")))];
  const wp = await wmBatch("https://en.wikipedia.org/w/api.php", t => ({action:"query", prop:"pageimages", piprop:"name", redirects:"1", titles:t.join("|")}), titles);
  const map = {}, pic = {};
  wp.forEach(j => { const q = j.query || {}; (q.normalized || []).concat(q.redirects || []).forEach(n => map[n.from] = n.to); Object.values(q.pages || {}).forEach(pg => { if (pg.pageimage) pic[pg.title] = pg.pageimage; }); });
  places.forEach(p => { if (p.wp){ const f = pic[follow(String(p.wp).replace(/_/g, " "), map)]; if (f) file[p.id] = f; } });
  const need = places.filter(p => !file[p.id] && p.wd);
  const wd = await wmBatch("https://www.wikidata.org/w/api.php", t => ({action:"wbgetentities", props:"claims", ids:t.join("|")}), [...new Set(need.map(p => p.wd))]);
  const p18 = {};
  wd.forEach(j => Object.values(j.entities || {}).forEach(e => { const c = e.claims && e.claims.P18 && e.claims.P18[0]; const v = c && c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value; if (v) p18[e.id] = v; }));
  need.forEach(p => { if (p18[p.wd]) file[p.id] = p18[p.wd]; });
  return file;
}
// Commons file name -> {s, p, c}; files that aren't on Commons (so may not be free to use) get nothing
async function packPhotoInfo(files){
  const names = [...new Set(Object.values(files).map(f => String(f).replace(/_/g, " ")))];
  const res = await wmBatch("https://commons.wikimedia.org/w/api.php", t => ({action:"query", prop:"imageinfo", iiprop:"url|extmetadata",
    iiextmetadatafilter:"Artist|LicenseShortName", iiurlwidth:String(PACK_PHOTO_W), titles:t.map(f => "File:" + f).join("|")}), names, 20);
  const info = {};
  res.forEach(j => {
    const q = j.query || {}, back = {};
    (q.normalized || []).forEach(n => back[n.to] = n.from);
    Object.values(q.pages || {}).forEach(pg => {
      const ii = pg.imageinfo && pg.imageinfo[0]; if (!ii || !ii.thumburl) return;
      const md = ii.extmetadata || {};
      const by = plainText(md.Artist && md.Artist.value).slice(0, 60) || "Unknown author", lic = plainText(md.LicenseShortName && md.LicenseShortName.value) || "see file page";
      const v = {s:ii.thumburl, p:ii.descriptionurl, c:`Photo: ${by}, ${lic}, Wikimedia Commons`};
      [pg.title, back[pg.title]].filter(Boolean).forEach(t => info[t.replace(/^File:/, "").replace(/_/g, " ")] = v);
    });
  });
  return info;
}
async function savePackPhotos(city, cache, urls, onStep){
  const places = await packPhotoPlaces(city, cache, urls);
  if (!places.length) return {count:0, bytes:0, urls:[]};
  if (onStep) onStep(0, places.length);
  const files = await packPhotoFiles(places);
  const info = await packPhotoInfo(files);
  const manifest = {};
  places.forEach(p => { const f = files[p.id]; const v = f && photoFileOk(p, f) && info[String(f).replace(/_/g, " ")]; if (v) manifest[p.id] = v; });
  const pics = [...new Set(Object.values(manifest).map(v => v.s))];
  const got = await fetchInto(cache, pics, onStep);
  const okSet = new Set(got.ok);
  Object.keys(manifest).forEach(id => { if (!okSet.has(manifest[id].s)) delete manifest[id]; });
  const key = packPhotoKey(city[0]);
  await cache.put(key, new Response(JSON.stringify(manifest), {headers:{"Content-Type":"application/json"}}));
  return {count:Object.keys(manifest).length, bytes:got.bytes, urls:got.ok.concat([key])};
}
loadPackPhotos();

const fmtBytes = b => b >= 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1e3)) + " KB";
const agoText = t => { const d = Math.floor((Date.now() - t) / 864e5); return d <= 0 ? "today" : d === 1 ? "yesterday" : d + " days ago"; };

/* ---------- backup and restore ---------- */
// the testing-only pretend location is never restored from a backup (an old backup would bring back the Bangkok default)
const BACKUP_KEYS = ["saved", "budget", "stay", "design", "look", "focus", "countryMode", "country", "nearClosed", "rates"];
async function makeBackup(){
  const state = {}; BACKUP_KEYS.forEach(k => { if (S[k] !== undefined) state[k] = S[k]; });
  const docs = typeof Docs !== "undefined" ? await Docs.exportAll() : [];
  return {app:"sea-trip", v:1, made:new Date().toISOString(), version:VERSION, state, docs};
}
async function downloadBackup(){
  const data = await makeBackup();
  const name = `sea-trip-backup-${todayISO()}.json`;
  const blob = new Blob([JSON.stringify(data)], {type:"application/json"});
  const file = typeof File === "function" ? new File([blob], name, {type:"application/json"}) : null;
  S.lastBackup = Date.now(); persist();
  if (file && navigator.canShare && navigator.canShare({files:[file]})){
    try { await navigator.share({files:[file], title:"SE Asia Trip backup"}); return "shared"; }
    catch(e){ if (e && e.name === "AbortError") return "cancelled"; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return "downloaded";
}
// check a backup file before using it; returns a summary, or null if it isn't one of ours
function readBackup(o){
  if (!o || o.app !== "sea-trip" || typeof o.state !== "object" || !o.state) return null;
  const st = o.state;
  return {
    saved: st.saved && typeof st.saved === "object" ? Object.keys(st.saved).length : 0,
    spend: st.budget && Array.isArray(st.budget.items) ? st.budget.items.length : 0,
    docs: Array.isArray(o.docs) ? o.docs.length : 0,
    made: o.made || ""
  };
}
async function restoreBackup(o, mode){
  const st = o.state;
  if (mode === "replace"){
    BACKUP_KEYS.forEach(k => { if (st[k] !== undefined) S[k] = st[k]; });
  } else {
    if (st.saved && typeof st.saved === "object") S.saved = Object.assign({}, st.saved, S.saved);
    if (st.budget && Array.isArray(st.budget.items)){
      const have = new Set(S.budget.items.map(x => JSON.stringify(x)));
      st.budget.items.forEach(x => { if (!have.has(JSON.stringify(x))) S.budget.items.push(x); });
      if (!S.budget.total && st.budget.total) S.budget.total = st.budget.total;
    }
    if (st.design && !Object.keys(S.design).some(k => k !== "on")) S.design = st.design;
  }
  if (!S.saved || typeof S.saved !== "object") S.saved = {};
  if (!S.budget || !Array.isArray(S.budget.items)) S.budget = {total:"", cur:"GBP", days:"", items:[]};
  if (!S.design || typeof S.design !== "object") S.design = {on:true};
  persist();
  if (typeof Docs !== "undefined" && Array.isArray(o.docs)) await Docs.importAll(o.docs, mode === "replace");
  applyLook(); applyDesign();
}

/* ---------- the page: Tools > Offline & backup ---------- */
TOOL_PAGES.offline = root => {
  const ref = userLoc || (S.focus ? focusPt() : null);
  const cities = PLACE_DESTS.slice().sort((a, b) => ref && !ref.none ? dist(ref, {lat:a[1], lng:a[2]}) - dist(ref, {lat:b[1], lng:b[2]}) : 0);
  const row = c => {
    const p = S.packs[c[0]], busy = packState.busy === c[0];
    return `<div class="pack" data-city="${esc(c[0])}"><div><b>${esc(c[0])}</b><small>${busy ? packStageText() : p ? `Saved ${agoText(p.at)} · ${fmtBytes(p.bytes)}${p.photos ? ` · ${p.photos} photos` : ""}` : "Not saved"}</small>
      ${busy ? `<div class="bar"><i style="width:${packState.total ? Math.round(100 * packState.done / packState.total) : 0}%"></i></div>` : ""}</div>
      <div class="row" style="gap:6px;flex-wrap:nowrap">${p && !busy ? `<button class="btn small" type="button" data-unpack aria-label="Remove ${esc(c[0])}">${icon("trash", "i s")}</button>` : ""}
      <button class="btn small" type="button" data-pack ${packState.busy ? "disabled" : ""}>${icon("download", "i s")}${p ? "Update" : "Save"}</button></div></div>`;
  };
  root.innerHTML = toolHero("Offline & backup", "Keep the app working with no signal") + `<div class="page">
    <div class="sect"><h2>Save cities for offline</h2></div>
    <p class="note">Saves every gaff, munch spot, activity, essential and station within about ${PACK_KM} km of the city, plus its street map. Bangkok is the biggest at about 20 MB; smaller towns and islands are a few MB.</p>
    <button class="switch" type="button" id="packPh" aria-pressed="${S.packPhotos !== false}" style="margin-top:6px"><i></i>Include landmark photos (about 5–15 MB more per city)</button>
    <p class="note">Temples, museums, parks and other well-known places keep their photos offline (free Wikimedia Commons pictures, up to ${PACK_PHOTO_MAX} per city). Other places show the drawings with no signal: Google doesn't allow its photos to be stored.</p>
    <p class="note" id="storeLine"></p>
    <div class="packs">${cities.map(row).join("")}</div>
    <div class="sect"><h2>Back up your trip</h2></div>
    <p class="note">Your saved places, spending, stay dates, your look and your documents live only on this phone, and iPhone can clear website data it thinks you don't use. Save a backup file now and then (to Files, iCloud Drive or by emailing it to yourself).</p>
    <p class="note"><b>Last backup:</b> ${S.lastBackup ? agoText(S.lastBackup) : "never"}</p>
    <div class="row" style="margin-top:8px"><button class="btn primary" type="button" id="bkSave">${icon("upload", "i s")}Save a backup file</button>
      <label class="btn" style="cursor:pointer">${icon("folder", "i s")}Restore from a file<input type="file" id="bkFile" accept=".json,application/json" hidden></label></div>
    <div id="bkInfo"></div>
    <p class="note" style="margin-top:10px">The backup doesn't include your Google key. Keep the file private: it lists where you're staying and copies of your documents.</p>
  </div>`;
  storageLine();
  $("#packPh").onclick = () => { S.packPhotos = S.packPhotos === false; persist(); renderPage(); };
  root.querySelectorAll("[data-pack]").forEach(b => b.onclick = async () => {
    const name = b.closest("[data-city]").dataset.city, city = PLACE_DESTS.find(c => c[0] === name);
    packState.busy = name; packState.done = 0; packState.total = 0; packState.stage = "map"; renderPage();
    try {
      const p = await savePack(city, (d, t, stage) => {
        packState.done = d; packState.total = t; packState.stage = stage || "map";
        const el = root.querySelector(`[data-city="${CSS.escape(name)}"] small`); if (el) el.textContent = packStageText();
        const bar = root.querySelector(`[data-city="${CSS.escape(name)}"] .bar i`); if (bar) bar.style.width = (t ? Math.round(100 * d / t) : 0) + "%";
      });
      toast(`${name} saved for offline (${fmtBytes(p.bytes)}${p.photos ? `, ${p.photos} photos` : ""})`);
    } catch(e){ toast(e.message || "Couldn't save. Check your signal"); }
    packState.busy = null; if (ui.sub === "offline") renderPage();
  });
  root.querySelectorAll("[data-unpack]").forEach(b => b.onclick = async () => {
    const name = b.closest("[data-city]").dataset.city;
    if (!confirm(`Remove the offline copy of ${name}?`)) return;
    await removePack(name); toast(`${name} removed`); renderPage();
  });
  $("#bkSave").onclick = async () => {
    try { const r = await downloadBackup(); if (r !== "cancelled") toast("Backup saved"); renderPage(); }
    catch(e){ toast("Couldn't make the backup file"); }
  };
  $("#bkFile").onchange = async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    let o = null; try { o = JSON.parse(await f.text()); } catch(err){}
    const sum = readBackup(o);
    const box = $("#bkInfo");
    if (!sum){ box.innerHTML = `<div class="callout">${icon("info")}<div>That file isn't a backup from this app.</div></div>`; return; }
    box.innerHTML = `<div class="callout">${icon("info")}<div><b>Backup from ${esc(sum.made ? niceDate(sum.made.slice(0, 10)) : "an unknown date")}</b>: ${sum.saved} saved place${sum.saved === 1 ? "" : "s"}, ${sum.spend} spending item${sum.spend === 1 ? "" : "s"}, ${sum.docs} document${sum.docs === 1 ? "" : "s"}.
      <div class="row" style="margin-top:8px"><button class="btn small primary" type="button" data-restore="merge">Add to what's here</button><button class="btn small" type="button" data-restore="replace">Replace what's here</button></div></div></div>`;
    box.querySelectorAll("[data-restore]").forEach(b => b.onclick = async () => {
      if (b.dataset.restore === "replace" && !confirm("Replace the saved places, spending and documents on this phone with the backup? This can't be undone.")) return;
      try { await restoreBackup(o, b.dataset.restore); toast("Backup restored"); renderPage(); }
      catch(err){ toast("Couldn't restore that backup"); }
    });
  };
};
async function storageLine(){
  const el = $("#storeLine"); if (!el) return;
  const bits = [];
  try {
    if (navigator.storage && navigator.storage.estimate){ const e = await navigator.storage.estimate(); if (e.usage != null) bits.push(`Using ${fmtBytes(e.usage)} on this phone`); }
    if (navigator.storage && navigator.storage.persisted){ const p = await navigator.storage.persisted(); bits.push(p ? "protected from clean-up" : "not yet protected from clean-up (saving a city asks for it)"); }
  } catch(e){}
  el.textContent = bits.length ? bits.join(", ") + "." : "";
}
