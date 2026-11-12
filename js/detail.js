/* ============================================================
   70-detail: photos (Google with a key, Wikipedia, Wikidata) and the place details sheet
   ============================================================ */

/* ---------- Google (optional, uses the existing key; kept inside the free allowance) ---------- */
let gReady = null;
const realKey = k => { k = String(k || "").trim(); return /PASTE|YOUR-KEY/i.test(k) ? "" : k; };
const googleKey = () => realKey(S.gkey) || realKey(window.SEA_GOOGLE_KEY) || realKey(GOOGLE_KEY_IN_FILE);
function loadGoogle(){
  if (gReady) return gReady;
  const key = googleKey(); if (!key) return Promise.resolve(null);
  gReady = new Promise(res => {
    let done = false; const fin = v => { if (!done){ done = true; res(v); } };
    window.__seaGoogleReady = () => fin(window.google && google.maps && google.maps.importLibrary ? google.maps : null);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${enc(key)}&v=weekly&loading=async&callback=__seaGoogleReady`;
    s.async = true; s.onerror = () => fin(null);
    document.head.appendChild(s);
    setTimeout(() => fin(null), 12000);
  }).then(m => { if (!m) gReady = null; return m; });
  return gReady;
}
/* A daily allowance on this phone, so a long scroll can never run up a Google bill.
   The real cap is the per-day quota set in Google Cloud (see CLAUDE.md); this just stops one phone using it all. */
const G_DAILY = {photo:40, details:25, vision:15};        // vision: camera translator photos
function gUse(){ const u = lsGet("g-usage", null); return u && u.d === todayISO() ? u : {d:todayISO(), photo:0, details:0, vision:0}; }
const gAllow = kind => (gUse()[kind] || 0) < G_DAILY[kind];
function gSpend(kind){ const u = gUse(); u[kind] = (u[kind] || 0) + 1; lsSet("g-usage", u); }
const gPlaceCache = {}, gPlaceWait = {};
// Google bills each lookup at the price of its dearest field, so photos (cheap) and ratings (dearer) are asked for separately
const G_FULL = ["photos"];
// one lookup at a time per place: a card and the details sheet asking together share the same request
function googlePlace(it, fields = G_FULL){
  if (!it) return Promise.resolve(null);
  const k = it.id + "|" + fields.join(",");
  if (!gPlaceWait[k]) gPlaceWait[k] = googlePlace_(it, fields).finally(() => { delete gPlaceWait[k]; });
  return gPlaceWait[k];
}
async function googlePlace_(it, fields){
  const maps = await loadGoogle(); if (!maps) return null;
  let entry = gPlaceCache[it.id];
  if (entry){ const need = fields.filter(f => !entry.has.has(f)); if (need.length){ try { await entry.place.fetchFields({fields:need}); need.forEach(f => entry.has.add(f)); } catch(e){} } return entry.place; }
  try {
    const { Place } = await maps.importLibrary("places");
    let pid = null; try { pid = localStorage.getItem("gpid:" + it.id); } catch(e){}
    if (!pid){
      // ID-only search: free and unlimited on Google's pricing
      const { places } = await Place.searchByText({ textQuery: `${it.n}, ${it.city}`, fields: ["id"], locationBias: {lat: it.lat, lng: it.lng}, maxResultCount: 1 });
      if (!places || !places.length) return null;
      pid = places[0].id; try { localStorage.setItem("gpid:" + it.id, pid); } catch(e){}
    }
    const place = new Place({ id: pid });
    await place.fetchFields({ fields });
    gPlaceCache[it.id] = {place, has:new Set(fields)};
    return place;
  } catch(e){ return null; }
}
const G_PRICE = {PRICE_LEVEL_FREE:"Free", PRICE_LEVEL_INEXPENSIVE:"฿ (cheap)", PRICE_LEVEL_MODERATE:"฿฿ (mid-range)", PRICE_LEVEL_EXPENSIVE:"฿฿฿ (pricey)", PRICE_LEVEL_VERY_EXPENSIVE:"฿฿฿฿ (very pricey)"};
function showGoogleFacts(it, g){
  const el = $("#gFacts"); if (!el || !g || (!g.r && !g.pl)) return;
  if ($("#photoBox") && $("#photoBox").dataset.id !== it.id) return;
  el.hidden = false;
  el.innerHTML = `<span class="l">On Google Maps</span>${g.r ? `${starsHTML(g.r * 2)} <span class="note">${g.n ? g.n.toLocaleString("en-GB") + " reviews" : ""}</span>` : ""}${g.pl && G_PRICE[g.pl] ? `<div class="note">Price level: ${esc(G_PRICE[g.pl])}</div>` : ""}`;
}
/* rating, review count and price level: one small Google lookup per place, then kept on the phone for a week */
async function googleFacts(it){
  const key = "gfacts:" + it.id, hit = lsGet(key);
  if (hit && Date.now() - hit.at < 7 * 864e5){ showGoogleFacts(it, hit); return; }
  if (!gAllow("details")) return;
  const fields = ["rating", "userRatingCount", "priceLevel"].concat(it.cur_ ? ["location"] : []);
  const pl = await googlePlace(it, fields); if (!pl) return;
  gSpend("details");
  const g = {r:pl.rating || null, n:pl.userRatingCount || null, pl:pl.priceLevel || null, at:Date.now()};
  lsSet(key, g); if (g.r) G_RATINGS.set(it.id, g.r); showGoogleFacts(it, g);
  applyGoogleExtras(it, pl);
}
function applyGoogleExtras(it, pl){
  if (pl.location && it.cur_){
    const lat = typeof pl.location.lat === "function" ? pl.location.lat() : pl.location.lat;
    const lng = typeof pl.location.lng === "function" ? pl.location.lng() : pl.location.lng;
    if (isFinite(lat) && isFinite(lng) && dist({lat, lng}, it) < 30){
      const moved = dist({lat, lng}, it) > 0.03;
      it.lat = lat; it.lng = lng; it.ap = false; it._f = null;
      try { localStorage.setItem("gloc:" + it.id, JSON.stringify([lat, lng, Date.now()])); } catch(e){}
      if (moved && map){ drawPins(); highlightPin(it); }
    }
  }
}
function showGooglePhoto(box, it, pl){
  const ph = pl.photos.slice(0, 5), n = ph.length;
  const credit = k => { const a = (ph[k].authorAttributions || [])[0]; return `${a ? `Photo: <a href="${esc(a.uri || "#")}" target="_blank" rel="noopener">${esc(a.displayName || "Google user")}</a>, ` : ""}Google Maps`; };
  box.classList.add("has-img");
  box.innerHTML = `<div class="ptrack">${ph.map((p, k) => `<div class="pslide" data-k="${k}"></div>`).join("")}</div>
    ${n > 1 ? `<span class="pcount">1 / ${n}</span><div class="pdots">${ph.map((p, k) => `<i class="${k ? "" : "on"}"></i>`).join("")}</div>` : ""}<div class="credit">${credit(0)}</div>`;
  const track = box.querySelector(".ptrack");
  const load = k => { const s = track.children[k]; if (!s || s.firstChild) return; const img = new Image(); img.alt = `${it.n}, photo ${k + 1} of ${n}`; img.src = ph[k].getURI({maxWidth: 900}); img.onerror = () => { s.textContent = ""; }; s.appendChild(img); };
  load(0);
  let cur = 0, tmr = null;
  track.addEventListener("scroll", () => {
    clearTimeout(tmr);
    tmr = setTimeout(() => {
      const k = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      if (k === cur || k < 0 || k >= n) return;
      cur = k; load(k);
      const pc = box.querySelector(".pcount"); if (pc) pc.textContent = `${k + 1} / ${n}`;
      box.querySelectorAll(".pdots i").forEach((d, j) => d.classList.toggle("on", j === k));
      box.querySelector(".credit").innerHTML = credit(k);
    }, 60);
  }, {passive:true});
}

/* ---------- free photos: Wikipedia and Wikidata (Wikimedia Commons) ----------
   Lookups are batched: every card that scrolls into view within a moment shares one Wikipedia request (up to 40 titles)
   and one Wikidata request, instead of one or two requests each. Cards get a 640 px picture (not the original, which can
   be several megabytes); the details sheet asks for 960 px. Both are Wikimedia's standard sizes (it rounds other widths up,
   so 640 used to arrive as 960). Wikidata pictures are asked for straight from upload.wikimedia.org (the address is worked out
   from the file name, as MediaWiki does), which saves two redirects per picture. A lookup that fails (no signal) answers
   {err:true}, so it is tried again later rather than remembered as "no photo". Only pictures on Wikimedia Commons are used. */
const PH_CARD = 500, PH_BIG = 960;
// MD5 of a UTF-8 string, hex: Commons keeps file "Ab_c.jpg" under /thumb/x/xy/ where xy starts the MD5 of its name
const md5 = (() => {
  const K = [], R = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;
  return str => {
    const b = new TextEncoder().encode(str), n = ((b.length + 8) >> 6) + 1, w = new Uint32Array(n * 16);
    for (let i = 0; i < b.length; i++) w[i >> 2] |= b[i] << ((i % 4) * 8);
    w[b.length >> 2] |= 0x80 << ((b.length % 4) * 8);
    w[n * 16 - 2] = (b.length * 8) >>> 0; w[n * 16 - 1] = Math.floor(b.length / 2 ** 29);
    let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476;
    for (let j = 0; j < w.length; j += 16){
      let a = h0, bb = h1, c = h2, d = h3;
      for (let i = 0; i < 64; i++){
        let f, g;
        if (i < 16){ f = (bb & c) | (~bb & d); g = i; }
        else if (i < 32){ f = (d & bb) | (~d & c); g = (5 * i + 1) % 16; }
        else if (i < 48){ f = bb ^ c ^ d; g = (3 * i + 5) % 16; }
        else { f = c ^ (bb | ~d); g = (7 * i) % 16; }
        f = (f + a + K[i] + w[j + g]) >>> 0;
        const r = R[(i >> 4) * 4 + (i % 4)];
        a = d; d = c; c = bb; bb = (bb + ((f << r) | (f >>> (32 - r)))) >>> 0;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + bb) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    }
    return [h0, h1, h2, h3].map(x => [0, 8, 16, 24].map(s => ((x >>> s) & 255).toString(16).padStart(2, "0")).join("")).join("");
  };
})();
// a Commons picture at a standard width, straight from the image server (null for kinds that need the slow way round)
function commonsThumb(file, width){
  let n = phName(file).replace(/ /g, "_"); if (!n) return null;
  n = n.charAt(0).toUpperCase() + n.slice(1);
  const ext = (/\.(\w+)$/.exec(n) || [])[1] || "";
  if (!/^(jpe?g|png|gif|webp|svg)$/i.test(ext)) return null;
  const h = md5(n), e = enc(n);
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${h[0]}/${h.slice(0, 2)}/${e}/${width}px-${e}${/^svg$/i.test(ext) ? ".png" : ""}`;
}
// if a worked-out address fails (a picture narrower than the size asked for has no thumbnail), Commons' own redirect finds it
function thumbFallback(src){
  const m = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/([^/]+)\/(\d+)px-/.exec(src || "");
  return m ? `https://commons.wikimedia.org/wiki/Special:FilePath/${m[1]}?width=${m[2]}` : null;
}
const photoCache = {};
/* No Buddha imagery anywhere (a deliberate choice). Pictures of Buddhist temples and shrines often show Buddha statues, so
   temples get no photo at all (not Google's either) unless that exact picture was looked at and listed in PHOTO_CHECKED.
   Pictures whose file name mentions a Buddha, monks or a pagoda are skipped everywhere. Bali's Hindu temples (Pura …) are fine. */
const NO_PH_RE = /\b(wat|buddha|budda|buddhas|buddhist|buddhism|pagoda|stupa|chedi|vihara|viharn|wihan|candi|monastery|monks?|bodhisattva|guanyin|guan yin|kuan yin|phra that|phra yai|reclining)\b/i;
const PHOTO_CHECKED = {            // place id: the Commons file that was looked at (temple architecture only, no statues)
  "c-doisuthep":"Wat Phra That Doi Suthep - Chiang Mai.jpg", "c-bkk-watarun":"Wat Arun from Chao Phraya River.jpg",
  "c-cm-chedluang":"Wat Chedi Luang, Buddhist temple, Chiang Mai, Thailand.jpg", "c-cm-phrasingh":"Chiang Mai - Wat Phra Singh - 0004.jpg",
  "c-cm-chiangman":"Wat Chiang Man (I).jpg", "c-cr-blue":"Wat Rong Suea Ten (Blue Temple, Chiang Rai) วัดร่องเสือเต้น (October 2021) - img 01.jpg",
  "c-ay-sanphet":"Ayutthaya Wat Phra Si Sanphet (Site of Royal Palace) (31538948627).jpg",
  "c-sk-central":"Sukhothai, Buddhist stupas on the lake, Thailand.jpg", "c-py-sanctuary":"Sanctuary of Truth 001.JPG",
  "c-angkor":"Angkor Wat.jpg", "c-phousi":"Mount Phou Si from the Mekong.jpg", "c-batu":"Batu Caves stairs 2022-05.jpg",
  "c-ubd-tirtaempul":"Bali - bathing (Melukat) at Pura Tirta Empul (2025) - img 07.jpg", "c-ubd-goagajah":"Bali - Goa Gajah (2022) - img 20.jpg",
  "c-ubd-gunungkawi":"Bali - Gunung Kawi (2025) - img 07.jpg", "c-cgg-tanahlot":"TanahLot 2014.JPG",
  "c-amd-lempuyang":"Bali Pura Lempuyang Luhur.jpg", "c-plm-mosque":"Masjid Agung Palembang.jpg"};
const phName = f => { let s = String(f || ""); try { s = decodeURIComponent(s); } catch(e){} return s.replace(/^File:/i, "").replace(/_/g, " ").trim(); };
const isTemple = it => it.osm ? it.k === "temple" : hasT(it, "Temples");
const templeLike = it => !!it && ((isTemple(it) && !/\bpura\b/i.test(it.n || "")) || NO_PH_RE.test(it.n || ""));
const photoPlaceOk = it => !templeLike(it) || !!PHOTO_CHECKED[it.id];
const photoFileOk = (it, file) => PHOTO_CHECKED[it.id] ? phName(file) === phName(PHOTO_CHECKED[it.id]) : !!phName(file) && !NO_PH_RE.test(phName(file).replace(/[-.,()]/g, " "));
const photoSrcOk = (it, src) => photoPlaceOk(it) && photoFileOk(it, commonsFile(src));
function batcher(run, max = 40, wait = 40){
  const q = new Map(); let t = null;
  const flush = async () => {
    t = null;
    const batch = [...q.entries()].slice(0, max); batch.forEach(([k]) => q.delete(k));
    if (q.size) t = setTimeout(flush, wait);
    let res = null; try { res = await run(batch.map(([k]) => k)); } catch(e){ res = null; }
    batch.forEach(([k, waiters]) => waiters.forEach(w => w(res ? (res[k] || null) : {err:true})));
  };
  return key => new Promise(r => { if (!q.has(key)) q.set(key, []); q.get(key).push(r); if (!t) t = setTimeout(flush, wait); });
}
const commonsOnly = src => src && /\/wikipedia\/commons\//.test(src) ? src : null;   // pictures kept only on English Wikipedia can be non-free: skip them
const wpLookup = batcher(async titles => {
  const j = await getJSON(`https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=pageimages|info&inprop=url&piprop=thumbnail&pithumbsize=${PH_CARD}&pilicense=free&titles=${enc(titles.join("|"))}`, {timeout:10000});
  const q = j.query || {}, norm = {}, redir = {};
  (q.normalized || []).forEach(n => norm[n.from] = n.to); (q.redirects || []).forEach(r => redir[r.from] = r.to);
  const byTitle = {}; Object.values(q.pages || {}).forEach(p => byTitle[p.title] = p);
  const out = {};
  for (const t of titles){
    let k = norm[t] || t; k = redir[k] || k;
    const p = byTitle[k], src = p && p.thumbnail && commonsOnly(p.thumbnail.source);
    out[t] = src ? {src, page:p.fullurl || `https://en.wikipedia.org/wiki/${enc(t)}`, by:"Photo via Wikipedia"} : {none:true};
  }
  return out;
});
const wdLookup = batcher(async ids => {
  // one small query for many items: just each item's main picture (P18)
  const sparql = `SELECT ?i ?img WHERE { VALUES ?i { ${ids.filter(x => /^Q\d+$/.test(x)).map(x => "wd:" + x).join(" ")} } ?i wdt:P18 ?img }`;
  const j = await getJSON(`https://query.wikidata.org/sparql?format=json&query=${enc(sparql)}`, {timeout:10000});
  const out = {}; ids.forEach(id => out[id] = {none:true});
  for (const b of (j.results && j.results.bindings) || []){
    const id = b.i.value.split("/").pop(), file = decodeURIComponent(b.img.value.split("/").pop()).replace(/_/g, " ");
    if (out[id] && out[id].none) out[id] = {file, src:commonsThumb(file, PH_CARD) || `https://commons.wikimedia.org/wiki/Special:FilePath/${enc(file)}?width=${PH_CARD}`, page:`https://commons.wikimedia.org/wiki/File:${enc(file.replace(/ /g, "_"))}`, by:"Photo: Wikimedia Commons"};
  }
  return out;
}, 50);
// a lookup that failed isn't remembered, so the next look tries again
function cachedLookup(key, make){
  if (!(key in photoCache)) photoCache[key] = make().then(r => { if (!r || r.err) delete photoCache[key]; return r; });
  return photoCache[key];
}
const loadPhoto = it => !it.wp || typeof fetch === "undefined" ? Promise.resolve(null) : cachedLookup("wp:" + it.wp, () => wpLookup(String(it.wp)));
const loadWdPhoto = it => !it.wd || typeof fetch === "undefined" ? Promise.resolve(null) : cachedLookup("wd:" + it.wd, () => wdLookup(String(it.wd)));
const realPhoto = r => r && r.src ? r : null;
// the bigger picture for the details sheet (Wikimedia makes these sizes on request)
const bigPhoto = src => src && /\/\d+px-/.test(src) ? src.replace(/\/\d+px-/, `/${PH_BIG}px-`) : src && /Special:FilePath/.test(src) ? src.replace(/width=\d+/, "width=" + PH_BIG) : src;
// {src, page, by} for a place, null when it has none, {err:true} when it couldn't be checked (no signal)
const freePhoto = async it => {
  if (!photoPlaceOk(it)) return null;
  const pk = await savedPhoto(it);
  if (pk) return {src:pk.s, page:pk.p, by:"Photo: Wikimedia Commons", credit:pk.c};
  const a = it.wp ? await loadPhoto(it) : null; if (realPhoto(a) && photoSrcOk(it, a.src)) return a;
  const b = it.wd ? await loadWdPhoto(it) : null; if (realPhoto(b) && photoSrcOk(it, b.src)) return b;
  return (a && a.err) || (b && b.err) ? {err:true} : null;
};
// a landmark photo saved with a city (Tools > Offline & backup), if there is one
async function savedPhoto(it){
  if (typeof PACK_PHOTOS === "undefined") return null;
  if (packPhotosReady) await packPhotosReady;
  const pk = PACK_PHOTOS.get(it.id) || null;
  return pk && photoSrcOk(it, pk.s) ? pk : null;
}
/* Card photos load only when the card scrolls into view. Order: Google (only with a key, within today's allowance),
   then a free Wikipedia / Wikimedia Commons photo, otherwise the card keeps its illustration.
   Answers are remembered on the phone (cardPhotoCache) so scrolling back never asks again. */
const CPH_KEY = "card-photos-v1", CPH_MAX = 500;
let cph = lsGet(CPH_KEY, {}) || {};
const cphSave = debounce(() => {
  const ks = Object.keys(cph);
  if (ks.length > CPH_MAX) ks.sort((a, b) => cph[a].at - cph[b].at).slice(0, ks.length - CPH_MAX).forEach(k => delete cph[k]);
  lsSet(CPH_KEY, cph);
}, 800);
const googleFor = it => !!googleKey() && it.c !== "move" && it.c !== "ess";     // Google only for stays, food and things to do
const googlePhotoFor = it => googleFor(it) && !templeLike(it);                   // nobody has looked at Google's temple photos
async function cardPhoto(it){
  if (!photoPlaceOk(it)) return null;
  const pk = await savedPhoto(it); if (pk) return pk.s;          // saved with a city: free, and works offline
  const hit = cph[it.id], now = Date.now();
  // free photos are kept for 30 days; Google photo links only for a day (they expire and Google asks apps not to keep them)
  if (hit && now - hit.at < (hit.g ? 864e5 : 30 * 864e5) && (hit.src || !googlePhotoFor(it) || hit.gTried))
    return hit.src && !hit.g && !photoSrcOk(it, hit.src) ? null : hit.src;     // remembered by an older version: checked again
  let src = null, g = false, gTried = false;
  if (googlePhotoFor(it) && gAllow("photo")){
    gTried = true;
    const pl = await googlePlace(it, ["photos"]);
    if (pl && pl.photos && pl.photos.length){ src = pl.photos[0].getURI({maxWidth: 640}); g = true; gSpend("photo"); }
  }
  let failed = false;
  if (!src){ const ph = await freePhoto(it); if (ph && ph.src) src = ph.src; else if (ph && ph.err) failed = true; }
  if (src || !failed){ cph[it.id] = {src, at:now, g, gTried}; cphSave(); }      // "no photo" is remembered; "couldn't check" isn't
  return src;
}
const cardWait = {};                                // one lookup per place even when it's on two cards at once
const cardPhotoOnce = it => cardWait[it.id] || (cardWait[it.id] = cardPhoto(it).finally(() => { delete cardWait[it.id]; }));
let photoObs = null;
function watchCardPhotos(root){
  const slots = root.querySelectorAll("[data-ph]:not([data-done])"); if (!slots.length) return;
  const fill = async slot => {
    const it = findPlace(slot.dataset.ph); if (!it || slot.dataset.done) return;
    slot.dataset.done = "1";
    const src = await cardPhotoOnce(it); if (!src || !slot.isConnected){ if (!src) slot.dataset.nophoto = "1"; return; }
    const img = new Image(); img.alt = ""; img.decoding = "async";
    img.onerror = () => {
      const fb = !img.dataset.fb && thumbFallback(img.src); if (fb){ img.dataset.fb = "1"; img.src = fb; return; }
      img.remove(); if (cph[it.id]){ delete cph[it.id]; cphSave(); }
    };
    img.onload = () => slot.insertBefore(img, slot.firstChild);
    img.src = src;
  };
  if (!("IntersectionObserver" in window)){ slots.forEach(fill); return; }
  if (!photoObs) photoObs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting){ photoObs.unobserve(e.target); fill(e.target); } }), {rootMargin:"0px 0px 200px 0px", threshold:.1});
  slots.forEach(s => photoObs.observe(s));
}
/* Author and licence of a Wikimedia Commons file, for the credit line in the details sheet */
const creditCache = {};
function commonsFile(src){
  const m = /\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?]+)/.exec(src || "") || /Special:FilePath\/([^?]+)/.exec(src || "");
  return m ? decodeURIComponent(m[1]) : null;
}
function commonsCredit(src){
  const file = commonsFile(src); if (!file) return Promise.resolve(null);
  if (!creditCache[file]) creditCache[file] = getJSON(`https://commons.wikimedia.org/w/api.php?action=query&titles=${enc("File:" + file)}&prop=imageinfo&iiprop=extmetadata&format=json&origin=*`, {timeout:8000}).then(j => {
    const pg = j.query && Object.values(j.query.pages || {})[0], md = pg && pg.imageinfo && pg.imageinfo[0] && pg.imageinfo[0].extmetadata;
    if (!md) return null;
    const txt = h => { try { return (new DOMParser().parseFromString(String(h || ""), "text/html").body.textContent || "").trim(); } catch(e){ return ""; } };
    return {by: txt(md.Artist && md.Artist.value).slice(0, 60) || "Unknown author", lic: txt(md.LicenseShortName && md.LicenseShortName.value) || "see file page",
      page:`https://commons.wikimedia.org/wiki/File:${enc(file.replace(/ /g, "_"))}`};
  }).catch(() => null);
  return creditCache[file];
}
function wikiInto(box, it){
  if (!it.wp && !it.wd){ box.innerHTML = photoFallback(it, "none"); return; }
  freePhoto(it).then(ph => {
    if (!box.isConnected || box.dataset.id !== it.id) return;
    if (!ph || !ph.src){ box.innerHTML = photoFallback(it, "none"); return; }
    box.classList.add("has-img");
    box.classList.remove("art"); box.style.backgroundImage = "";
    // the card's picture shows at once (the browser already has it), then the bigger one replaces it when it arrives
    box.innerHTML = `<img alt="${esc(it.n)}" src="${esc(ph.src)}"><div class="credit"><a href="${esc(ph.page)}" target="_blank" rel="noopener">${esc(ph.by)}</a></div>`;
    const im = box.querySelector("img");
    im.onerror = () => {
      const fb = !im.dataset.fb && thumbFallback(im.src); if (fb){ im.dataset.fb = "1"; im.src = fb; return; }
      box.classList.remove("has-img"); box.innerHTML = photoFallback(it, "none");
    };
    const big = bigPhoto(ph.src);
    if (big && big !== ph.src){ const pre = new Image(); pre.onload = () => { if (im.isConnected && !im.dataset.fb) im.src = big; }; pre.src = big; }
    // name the photographer and the licence, as Commons licences ask
    if (ph.credit){ box.querySelector(".credit").innerHTML = `<a href="${esc(ph.page)}" target="_blank" rel="noopener">${esc(ph.credit)}</a>`; return; }
    commonsCredit(ph.src).then(c => { const cr = box.querySelector(".credit"); if (c && cr && box.dataset.id === it.id) cr.innerHTML = `Photo: <a href="${esc(c.page)}" target="_blank" rel="noopener">${esc(c.by)}</a>, ${esc(c.lic)}, Wikimedia Commons`; });
  });
}
(function applyCachedLocations(){
  try { const now = Date.now(); D.places.forEach(p => { const v = localStorage.getItem("gloc:" + p.id); if (!v) return; const [lat, lng, ts] = JSON.parse(v); if (now - ts < 30 * 864e5){ p.lat = lat; p.lng = lng; p.ap = false; } }); } catch(e){}
})();
// no photo: the category illustration fills the space (the links to more photos sit just below it)
function photoFallback(it){
  const box = $("#photoBox");
  if (box && box.dataset.id === it.id){ box.classList.remove("has-img"); box.classList.add("art"); box.style.backgroundImage = artOf(it); }
  return artBadge(it);
}

/* ---------- booking hand-off (no live availability in the app; the sites confirm prices) ---------- */
function L_booking(text){ const p = stayParams(); return `https://www.booking.com/searchresults.html?ss=${enc(text)}${p.ok ? `&checkin=${p.cin}&checkout=${p.cout}` : ""}&group_adults=${p.guests}&no_rooms=1&group_children=0`; }
function L_agoda(text){ const p = stayParams(); return `https://www.agoda.com/search?textToSearch=${enc(text)}${p.ok ? `&checkIn=${p.cin}&los=${p.nights}` : ""}&rooms=1&adults=${p.guests}`; }
function L_hostelworld(text){ return L_google(`${text} hostelworld`); }
function bookingBlock(it){
  const p = stayParams(), name = `${it.n} ${it.city}`;
  return `<h4>Rooms and availability</h4>
    <p class="note">${p.ok ? `For ${niceDate(p.cin)} to ${niceDate(p.cout)} (${p.nights} night${p.nights === 1 ? "" : "s"}), ${p.guests} guest${p.guests === 1 ? "" : "s"}.` : "Add your dates in Gaffs to carry them over."} The booking site confirms the live price and whether there is space. This app does not.</p>
    <div class="actions" style="margin-top:8px">
      <a class="btn" href="${esc(L_booking(name))}" target="_blank" rel="noopener">Booking.com ${icon("ext","i s")}</a>
      <a class="btn" href="${esc(L_agoda(name))}" target="_blank" rel="noopener">Agoda ${icon("ext","i s")}</a>
      ${it.k === "hostel" ? `<a class="btn" href="${esc(L_hostelworld(name))}" target="_blank" rel="noopener">Hostelworld ${icon("ext","i s")}</a>` : ""}
      ${it.web ? `<a class="btn" href="${esc(it.web)}" target="_blank" rel="noopener">Their own website ${icon("ext","i s")}</a>` : ""}
    </div>`;
}

/* ---------- the details sheet ---------- */
const WIFI_TXT = {1:"Yes", 2:"Free", 3:"For customers", 4:"Paid"};
const socialLink = (v, base) => /^https?:/.test(v) ? v : base + v.replace(/^@/, "");
const monthName = ym => { const m = /^(\d{4})-(\d{2})/.exec(ym || ""); return m ? `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m[2] - 1]} ${m[1]}` : ym; };
function openDetail(id){
  const it = findPlace(id); if (!it) return;
  const c = CAT[it.c] || CAT.ess, col = cssv(c.v);
  const ref = userLoc || (S.focus ? focusPt() : null);
  const km = ref ? distText(dist(ref, it)) : null;
  const d = it.d || {};
  const fact = (l, v, wide) => `<div class="fact ${wide ? "wide" : ""}"><span class="l">${l}</span>${v}</div>`;
  let body = "";
  body += `<div class="photo art" id="photoBox" data-id="${esc(it.id)}" style="background-image:${artOf(it)}">${artBadge(it)}</div>
    <div class="photo-links">${it.c === "gaff" ? "Room photos are on the booking sites. " : ""}<a href="${esc(L_maps(it))}" target="_blank" rel="noopener">More photos on Google Maps</a></div>`;
  const facts = [];
  const pr = itemLocal(it);
  const converted = it.p && dispCur(it.cc, it.cur) !== it.cur;
  // only what we actually know: unknown prices and reviews are left out rather than shown as empty boxes
  if (it.cur_ && it.c !== "move" && (pr || it.cost)) facts.push(fact(`${it.c === "cool" ? "Cost" : "Price"}${it.pu && pr ? ", " + esc(it.pu) : ""}`, pr ? `<b>${esc(pr)}</b> <span class="note">${esc(gbpRange(it.p, it.cur))}</span>${converted ? `<div class="note">Listed as ${esc(rangeText(it.p, it.cur))}, converted at your saved rate</div>` : ""}${it.cost ? `<div class="note">${esc(it.cost)}</div>` : ""}` : esc(it.cost)));
  if (!(it.cur_ && (pr || it.cost)) && it.c !== "move"){
    const e = estPrice(it);
    if (e) facts.push(fact(`Typical price, ${esc(e.per)}`, `<b>${esc(estText(e))}</b>${estGBP(e) ? ` <span class="note">${esc(estGBP(e))}</span>` : ""}<div class="note">${esc(e.why)}. An estimate, not a quoted price.${e.note ? " " + esc(e.note) : ""}</div>`, true));
  }
  if (it.cur_ && it.r != null) facts.push(fact("Reviews", `${starsHTML(it.r)}<div class="note">${esc(it.rs)}${it.rc ? `, ${it.rc.toLocaleString("en-GB")} reviews` : ""}</div>`));
  const oh = isOpenNow(it);
  if (it.oh) facts.push(fact("Opening hours", `${oh ? `<b style="color:${oh.open ? "var(--ok)" : "var(--muted)"}">${esc(oh.text)}</b><div class="note">` : '<div>'}${esc(it.oh.replace(/;\s*/g, "; "))}</div>`, true));
  let roomGaps = false;
  if (it.c === "gaff"){
    [["breakfast", "Breakfast"], ["privacy", "Shared or private"], ["beds", "Beds"], ["toilet", "Toilet"], ["room", "Rooms", true]].forEach(([k, l, w]) => { if (d[k]) facts.push(fact(l, esc(d[k]), w)); else roomGaps = true; });
  }
  if (it.best) facts.push(fact("Best time", esc(it.best)));
  if (it.busy) facts.push(fact("How busy", esc(it.busy)));
  if (it.ad) facts.push(fact("Address", thaiPair(it.ad, "sayAddr"), true));
  if (it.ph) facts.push(fact("Phone", `<a href="tel:${esc(it.ph.replace(/[^+\d]/g, ""))}">${esc(it.ph)}</a>`));
  if (it.web) facts.push(fact("Website", `<a href="${esc(it.web)}" target="_blank" rel="noopener">${esc(it.web.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "").slice(0, 40))}</a>`));
  const soc = [it.fb && `<a href="${esc(socialLink(it.fb, "https://www.facebook.com/"))}" target="_blank" rel="noopener">Facebook</a>`, it.ig && `<a href="${esc(socialLink(it.ig, "https://www.instagram.com/"))}" target="_blank" rel="noopener">Instagram</a>`, it.ln && `Line: ${esc(it.ln)}`].filter(Boolean);
  if (soc.length) facts.push(fact("Social", soc.join(" · ")));
  const ftype = it.c === "munch" ? foodType(it) : null;
  if (ftype || (it.cu && it.cu.length)) facts.push(fact("Food", `${esc(ftype || it.cu.join(", "))}${ftype && it.cu && it.cu.length ? `<div class="note">${esc(it.cu.join(", "))}</div>` : ""}`));
  if (it.veg || it.vegan) facts.push(fact("Diet", [it.vegan ? (it.vegan === 2 ? "Fully vegan" : "Vegan options") : "", it.veg ? (it.veg === 2 ? "Fully vegetarian" : "Vegetarian options") : ""].filter(Boolean).join(", ")));
  if (it.wifi) facts.push(fact("Wi-Fi", WIFI_TXT[it.wifi] || "Yes"));
  if (it.st) facts.push(fact("Star rating", `${it.st}-star`));
  if (it.rm) facts.push(fact("Rooms", String(it.rm)));
  if (it.ac) facts.push(fact("Air conditioning", "Yes"));
  if (it.pool) facts.push(fact("Pool", "Yes"));
  if (it.fee) facts.push(fact("Entry fee", it.fee === "yes" ? `Yes${it.ch ? ", " + esc(it.ch) : " (amount not recorded)"}` : "Free"));
  if (it.ele) facts.push(fact("Height", `${it.ele.toLocaleString("en-GB")} m`));
  if (it.iata) facts.push(fact("Airport code", esc(it.iata)));
  if (it.br && it.br !== it.n) facts.push(fact("Brand", esc(it.br)));
  if (it.op) facts.push(fact("Run by", esc(it.op)));
  if (it.ss) facts.push(fact("Type", "Self-service (coin) laundry"));
  if (it.atm) facts.push(fact("ATM", "Yes"));
  if (it.wc) facts.push(fact("Wheelchair access", {yes:"Yes", limited:"Limited", no:"No"}[it.wc]));
  if (it.rel) facts.push(fact("Faith", esc(it.rel.replace(/_/g, " "))));
  if (km) facts.push(fact("Distance", km));
  if (it.nt) facts.push(fact("Name in Thai (show a driver)", `<span lang="th" style="font-size:17px">${esc(it.nt)}</span> <button class="btn small" type="button" id="sayName" style="margin-left:6px">${icon("speaker","i s")}Say it</button><div class="note">Sounds roughly like: ${esc(thaiRom.text(it.nt, "easy"))}</div>`, true));
  body += `<div class="facts">${facts.join("")}<div class="fact wide" id="gFacts" hidden></div></div>`;
  if (roomGaps) body += `<p class="note" style="margin:-2px 0 8px">More details (breakfast, beds, bathrooms, room types) on the booking site: <a href="${esc(L_booking(it.n + " " + it.city))}" target="_blank" rel="noopener">Booking.com</a> · <a href="${esc(L_agoda(it.n + " " + it.city))}" target="_blank" rel="noopener">Agoda</a></p>`;
  if (it.desc) body += `<p style="margin:8px 0">${esc(it.desc)}</p>`;
  if (it.k === "water") body += `<div class="callout">${icon("alert")}<div><b>Check before you drink.</b> A refill point on the map is not proof the water is safe. Look for a filtered or reverse-osmosis machine${it.paid ? " (usually ฿1–2 a litre)" : ""}, and ask locally if unsure.</div></div>`;
  if (isBiz(it) && it.osm) body += `<div class="callout">${icon("info")}<div><b>This is a business, not a public sight.</b> Prices and availability are theirs to confirm. Contact them or check their website before you go.</div></div>`;
  if (it.s && it.s.length) body += `<h4>${it.c === "move" ? "What leaves from here" : "What it’s known for"}</h4><ul class="known">${it.s.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
  if (it.tips && it.tips.length) body += `<h4>Good to know</h4><ul class="known">${it.tips.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
  if (it.cur_ && it.c === "move"){
    const rel = D.routes.filter(r => r.a.includes(it.city) || r.b.includes(it.city));
    if (rel.length) body += `<h4>Saved routes</h4><ul class="known">${rel.map(r => `<li>${esc(r.a)} → ${esc(r.b)}, ${esc(r.mode.toLowerCase())}${r.p ? `, ${esc(withGBP(routeLocal(r), r.p, r.cur))}` : ""}</li>`).join("")}</ul>`;
  }
  if (it.c === "gaff") body += bookingBlock(it);
  body += `<div class="actions">
    <a class="btn primary" href="${esc(L_dir(it))}" target="_blank" rel="noopener">${icon("nav")}Directions</a>
    <a class="btn" href="${esc(L_apple(it))}" target="_blank" rel="noopener">${icon("nav")}Apple Maps</a>
    <button class="btn" type="button" id="dtMap">${icon("map")}Show on map</button>
    <button class="btn" type="button" data-save="${esc(it.id)}" aria-pressed="${isSaved(it.id)}">${icon("bookmark")}<span id="dtSaveTxt">${isSaved(it.id) ? "Saved" : "Save"}</span></button>
    ${it.c === "move" || it.c === "ess" ? "" : `<a class="btn" href="${esc(L_google(it.n + " " + it.city + " reviews"))}" target="_blank" rel="noopener">${icon("ext")}Read reviews</a>`}
    <a class="btn" href="${esc(satLink(it.lat, it.lng, it.ap ? 16 : 18))}" target="_blank" rel="noopener">${icon("layers")}Satellite view</a>
    ${it.c === "move" ? `<button class="btn" type="button" id="dtPlan">${icon("route")}Plan a journey here</button>` : ""}
  </div>`;
  if (it.ap) body += `<p class="note">The pin is approximate. Directions goes to the real address.</p>`;
  if (it.cur_) body += `<div class="srcs">${it.verified ? `Checked ${esc(it.chk)}. Sources: ${it.src.map(s => `<a href="${esc(s[1])}" target="_blank" rel="noopener">${esc(s[0])}</a>`).join(", ")}` : "Not checked yet. Prices are typical, not looked up, so confirm on the day."}${it.osmid ? ". Location and contact details from OpenStreetMap." : ""}</div>`;
  else body += `<div class="srcs">From OpenStreetMap${it.ts ? `, last edited ${esc(monthName(it.ts))}` : ""}${it.cd ? `, checked on site ${esc(it.cd)}` : ""}. © OpenStreetMap contributors. ${L_osm(it) ? `<a href="${esc(L_osm(it))}" target="_blank" rel="noopener">See or fix this listing</a>` : ""}</div>`;

  openSheet(`<div class="sheet-head"><div><span class="kind"><span class="dot"></span>${esc(kindLabel(it))}${it.cur_ && it.c === "cool" && it.t.length > 1 ? `, ${esc(it.t.slice(1).join(", ").toLowerCase())}` : ""}</span>
      <h2 id="sheet-title">${esc(it.n)}</h2>${romName(it) ? `<div class="rom">${esc(romName(it))} (approximate English spelling)</div>` : ""}<div class="note">${esc(it.area || it.city)}${D.countries[it.cc] ? ", " + esc(D.countries[it.cc].name) : ""}</div></div>
      <button class="icon-btn" data-close aria-label="Close">${icon("x")}</button></div>${body}`, "sheet-title", `--c:${col}`);
  highlightPin(it);
  const sayBtn = $("#sayName"); if (sayBtn) sayBtn.onclick = () => speak(it.nt, "th");
  const sayAd = $("#sayAddr"); if (sayAd) sayAd.onclick = () => speak(it.ad, "th");
  $("#dtMap").onclick = () => { closeDetail(); if (it.c !== "ess" && !ui.mapCats.has(it.c)) ui.mapCats.add(it.c); if (it.c === "ess"){ const e = essOfKind(it.k); if (e) ui.essKinds.add(e.id); } ui.mapSaved = false; ui.mapMode = "map"; ui.mapSel = it.id; flyTo(it, 16); go("#map"); };
  const plan = $("#dtPlan"); if (plan) plan.onclick = () => { closeDetail(); ui.tp.to = {n:it.n, lat:it.lat, lng:it.lng}; ui.tp.sel = 0; go("#tools/transport"); };
  const box0 = $("#photoBox");
  // the photo loads by itself: Google first when there's a key (within today's allowance), then a free Wikimedia photo
  const viaGoogle = () => googlePlace(it, ["photos"]).then(pl => {
    const box = $("#photoBox"); if (!box || box.dataset.id !== it.id) return;
    if (pl && pl.photos && pl.photos.length){ gSpend("photo"); box.classList.remove("art"); box.style.backgroundImage = ""; showGooglePhoto(box, it, pl); return; }
    wikiInto(box, it);
  });
  if (googlePhotoFor(it) && gAllow("photo")) viaGoogle();
  else if (it.wp || it.wd) wikiInto(box0, it);
  if (googleFor(it)) googleFacts(it);
}
