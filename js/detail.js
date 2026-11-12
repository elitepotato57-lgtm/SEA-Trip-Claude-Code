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
const G_DAILY = {photo:40, details:25};
function gUse(){ const u = lsGet("g-usage", null); return u && u.d === todayISO() ? u : {d:todayISO(), photo:0, details:0}; }
const gAllow = kind => gUse()[kind] < G_DAILY[kind];
function gSpend(kind){ const u = gUse(); u[kind]++; lsSet("g-usage", u); }
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
  lsSet(key, g); showGoogleFacts(it, g);
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

/* ---------- free photos: Wikipedia and Wikidata (Wikimedia Commons) ---------- */
const photoCache = {};
function loadPhoto(it){
  if (!it.wp || typeof fetch === "undefined") return Promise.resolve(null);
  if (!(it.wp in photoCache)) photoCache[it.wp] = loadPhoto_(it);
  return Promise.resolve(photoCache[it.wp]);
}
async function loadPhoto_(it){
  let out = null;
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${enc(it.wp)}`);
    if (!res.ok) throw new Error("no page");
    const j = await res.json();
    const orig = j.originalimage, th = j.thumbnail;
    let src = null;
    if (orig && orig.width <= 1400) src = orig.source;
    else if (th && th.source) src = th.source.replace(/\/\d+px-/, "/800px-");
    if (src && !/\/wikipedia\/commons\//.test(src)) src = null;     // pictures kept only on English Wikipedia can be non-free: skip them
    out = src ? {src, page: (j.content_urls && j.content_urls.mobile && j.content_urls.mobile.page) || `https://en.wikipedia.org/wiki/${enc(it.wp)}`, by:"Photo via Wikipedia"} : null;
  } catch(e){ out = null; }
  return out;
}
function loadWdPhoto(it){
  if (!it.wd || typeof fetch === "undefined") return Promise.resolve(null);
  const key = "wd:" + it.wd;
  if (!(key in photoCache)) photoCache[key] = (async () => {
    try {
      const j = await getJSON(`https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${enc(it.wd)}&property=P18&format=json&origin=*`, {timeout:9000});
      const file = j.claims && j.claims.P18 && j.claims.P18[0] && j.claims.P18[0].mainsnak.datavalue.value;
      return file ? {src:`https://commons.wikimedia.org/wiki/Special:FilePath/${enc(file)}?width=640`, page:`https://commons.wikimedia.org/wiki/File:${enc(file.replace(/ /g, "_"))}`, by:"Photo: Wikimedia Commons"} : null;
    } catch(e){ return null; }
  })();
  return Promise.resolve(photoCache[key]);
}
const freePhoto = async it => (it.wp && await loadPhoto(it)) || (it.wd && await loadWdPhoto(it)) || null;
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
async function cardPhoto(it){
  const hit = cph[it.id], now = Date.now();
  // free photos are kept for 30 days; Google photo links only for a day (they expire and Google asks apps not to keep them)
  if (hit && now - hit.at < (hit.g ? 864e5 : 30 * 864e5) && (hit.src || !googleFor(it) || hit.gTried)) return hit.src;
  let src = null, g = false, gTried = false;
  if (googleFor(it) && gAllow("photo")){
    gTried = true;
    const pl = await googlePlace(it, ["photos"]);
    if (pl && pl.photos && pl.photos.length){ src = pl.photos[0].getURI({maxWidth: 640}); g = true; gSpend("photo"); }
  }
  if (!src){ const ph = await freePhoto(it); if (ph) src = ph.src; }
  if (src || navigator.onLine !== false){ cph[it.id] = {src, at:now, g, gTried}; cphSave(); }
  return src;
}
let photoObs = null;
function watchCardPhotos(root){
  const slots = root.querySelectorAll("[data-ph]:not([data-done])"); if (!slots.length) return;
  const fill = async slot => {
    const it = findPlace(slot.dataset.ph); if (!it || slot.dataset.done) return;
    slot.dataset.done = "1";
    const src = await cardPhoto(it); if (!src || !slot.isConnected) return;
    const img = new Image(); img.alt = ""; img.decoding = "async";
    img.onerror = () => { img.remove(); if (cph[it.id]){ delete cph[it.id]; cphSave(); } };
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
    const txt = h => { const d = document.createElement("div"); d.innerHTML = h || ""; return d.textContent.trim(); };
    return {by: txt(md.Artist && md.Artist.value).slice(0, 60) || "Unknown author", lic: txt(md.LicenseShortName && md.LicenseShortName.value) || "see file page",
      page:`https://commons.wikimedia.org/wiki/File:${enc(file.replace(/ /g, "_"))}`};
  }).catch(() => null);
  return creditCache[file];
}
function wikiInto(box, it){
  if (!it.wp && !it.wd){ box.innerHTML = photoFallback(it, "none"); return; }
  freePhoto(it).then(ph => {
    if (!box.isConnected || box.dataset.id !== it.id) return;
    if (!ph){ box.innerHTML = photoFallback(it, "none"); return; }
    box.classList.add("has-img");
    box.classList.remove("art"); box.style.backgroundImage = "";
    box.innerHTML = `<img alt="${esc(it.n)}" src="${esc(ph.src)}"><div class="credit"><a href="${esc(ph.page)}" target="_blank" rel="noopener">${esc(ph.by)}</a></div>`;
    box.querySelector("img").onerror = () => { box.classList.remove("has-img"); box.innerHTML = photoFallback(it, "none"); };
    // name the photographer and the licence, as Commons licences ask
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
  if (it.cu && it.cu.length) facts.push(fact("Food", esc(it.cu.join(", "))));
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
  if (googleFor(it) && gAllow("photo")) viaGoogle();
  else if (it.wp || it.wd) wikiInto(box0, it);
  if (googleFor(it)) googleFacts(it);
}
