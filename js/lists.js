/* ============================================================
   30-lists: place cards, the Gaffs / Munch / Activities pages, Saved, Discover
   ============================================================ */

/* ---------- sorting and filtering ---------- */
function bestScore(it){
  const r = it.r ? it.r / 10 : 0.5;
  const g = gbpMin(it); const cheap = g == null ? 0.4 : Math.max(0, 1 - g / 25);
  let near = 0.5; if (userLoc){ near = Math.max(0, 1 - dist(userLoc, it) / 50); }
  return r * 0.4 + cheap * 0.4 + near * 0.2;
}
/* "Recommended": researched places first, then well-known ones, then the rest, each group nearest first.
   Anything more than 40 km away drops to the end, so a researched place in the next province never beats one down the road. */
const TOP_LOW = new Set(["bar","club","massage","tour","worship"]);
function topRank(it, km){
  if (km != null && km > 40) return 5;
  if (it.cur_) return 0;
  const known = !!(it.wd || it.wp || it.wpx || it.x);
  if (it.c !== "cool") return known ? 1 : 3;
  if (isBiz(it) || TOP_LOW.has(it.k)) return known ? 2 : 4;
  return known ? 1 : 3;
}
function sortItems(items, how, pt = userLoc){
  const arr = items.slice();
  const nullLast = (a, b, f, dir) => { const x = f(a), y = f(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return dir * (x - y); };
  const byKm = (a, b) => pt ? dist(pt, a) - dist(pt, b) : 0;
  if (how === "top"){
    const key = new Map(arr.map(x => { const km = pt ? dist(pt, x) : null; return [x, [topRank(x, km), km || 0]]; }));
    arr.sort((a, b) => { const x = key.get(a), y = key.get(b); return x[0] - y[0] || x[1] - y[1] || a.n.localeCompare(b.n); });
  }
  else if (how === "near" && pt) arr.sort(byKm);
  else if (how === "rated") arr.sort((a, b) => nullLast(a, b, x => x.r, -1) || byKm(a, b));
  else if (how === "dear") arr.sort((a, b) => nullLast(a, b, gbpOrEst, -1) || byKm(a, b));
  else if (how === "match") arr.sort((a, b) => (b.cur_ ? bestScore(b) : -1) - (a.cur_ ? bestScore(a) : -1) || byKm(a, b));
  else if (how === "az") arr.sort((a, b) => a.n.localeCompare(b.n));
  else if (how === "near") arr.sort((a, b) => nullLast(a, b, x => x.r, -1) || nullLast(a, b, gbpMin, 1));
  else arr.sort((a, b) => nullLast(a, b, gbpOrEst, 1) || nullLast(a, b, x => x.r, -1) || byKm(a, b));
  return arr;
}
// a researched price in pounds, or the low end of the estimate (in its own currency: rupiah estimates are not baht)
const gbpOrEst = it => { const g = gbpMin(it); if (g != null) return g; const e = estPrice(it); return e ? toGBP(e.lo, e.cur || "THB") : null; };
function passRating(it, minR){ return !minR || (it.r != null && it.r / 2 >= minR); }

/* ---------- small renderers ---------- */
function starsHTML(r){
  if (r == null) return "";
  const five = r / 2, pct = Math.max(0, Math.min(100, five / 5 * 100));
  const row = STAR.repeat(5);
  return `<span class="stars"><span class="st5" aria-hidden="true"><span class="off">${row}</span><span class="on" style="width:${pct}%">${row}</span></span>${five.toFixed(1)}<span class="vis-hidden"> out of 5</span></span>`;
}
/* Category illustrations for cards and details with no photo. Drawn here as SVG (no photos, no figures, no religious images),
   one per group, in the group's colour. Made once per theme and shared by every card through a CSS variable. */
function hexMix(a, b, t){
  const p = h => { h = h.replace("#", ""); if (h.length === 3) h = h.replace(/./g, "$&$&"); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
  const x = p(a), y = p(b); return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
function artSVG(g){
  const col = cssv("--" + g) || "#888888", bg = cssv("--art-bg") || "#20262B";
  const top = hexMix(col, bg, .62), bot = hexMix(col, bg, .28), ink = hexMix(col, bg, .82), lite = hexMix(col, "#ffffff", .35);
  const scenes = {
    // a bungalow and a palm under a moon
    stay:`<circle cx="262" cy="38" r="17" fill="${lite}" opacity=".9"/><circle cx="270" cy="33" r="15" fill="${top}"/>
      <g fill="${lite}" opacity=".7"><circle cx="40" cy="30" r="1.6"/><circle cx="95" cy="18" r="1.2"/><circle cx="160" cy="40" r="1.4"/><circle cx="210" cy="16" r="1.1"/></g>
      <path d="M0 122 Q80 96 160 112 T320 104 V150 H0Z" fill="${ink}" opacity=".55"/>
      <path d="M118 128 V96 H186 V128Z" fill="${ink}"/><path d="M108 98 L152 70 L196 98Z" fill="${ink}"/><rect x="144" y="106" width="16" height="22" rx="2" fill="${lite}" opacity=".85"/>
      <path d="M232 130 C236 108 238 92 246 74" stroke="${ink}" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M246 74 C232 64 214 66 204 76 M246 74 C256 60 272 58 284 64 M246 74 C240 58 242 48 250 40 M246 74 C262 72 276 80 282 92 M246 74 C232 76 222 86 218 98" stroke="${ink}" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="M0 130 H320 V150 H0Z" fill="${ink}"/>`,
    // a steaming bowl and chopsticks
    food:`<g fill="${lite}" opacity=".18"><circle cx="30" cy="30" r="10"/><circle cx="290" cy="120" r="14"/><circle cx="60" cy="118" r="6"/><circle cx="268" cy="28" r="7"/></g>
      <path d="M134 44 c-8 -10 8 -16 0 -26 M160 40 c-8 -10 8 -16 0 -26 M186 44 c-8 -10 8 -16 0 -26" stroke="${lite}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".8"/>
      <path d="M200 30 L250 76 M212 24 L258 70" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>
      <path d="M96 66 H224 C224 104 196 126 160 126 C124 126 96 104 96 66Z" fill="${ink}"/>
      <path d="M96 66 H224" stroke="${lite}" stroke-width="4" stroke-linecap="round" opacity=".7"/><path d="M140 126 H180 L176 134 H144Z" fill="${ink}"/>`,
    // mountains, sun and sea
    do:`<circle cx="232" cy="46" r="20" fill="${lite}" opacity=".9"/>
      <path d="M0 116 L62 54 L104 92 L150 40 L214 108 L248 84 L320 124 V150 H0Z" fill="${ink}" opacity=".85"/>
      <path d="M138 54 L150 40 L162 54 L154 52 L150 58 L146 52Z" fill="${lite}" opacity=".8"/>
      <path d="M0 126 q20 -8 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 V150 H0Z" fill="${top}"/>
      <path d="M20 138 q20 -6 40 0 t40 0 M180 140 q20 -6 40 0 t40 0" stroke="${lite}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".5"/>`,
    // a little shop with a striped awning
    ess:`<rect x="92" y="54" width="136" height="80" rx="4" fill="${ink}"/>
      <path d="M84 54 H236 L228 34 H92Z" fill="${lite}" opacity=".85"/>
      <path d="M100 34 L96 54 M124 34 L122 54 M148 34 L148 54 M172 34 L172 54 M196 34 L198 54 M220 34 L224 54" stroke="${ink}" stroke-width="7" opacity=".55"/>
      <rect x="108" y="72" width="44" height="32" rx="3" fill="${lite}" opacity=".5"/><rect x="170" y="74" width="40" height="60" rx="3" fill="${top}"/>
      <path d="M0 134 H320 V150 H0Z" fill="${ink}" opacity=".7"/>`,
    // a long-tail boat on the water
    move:`<circle cx="70" cy="44" r="18" fill="${lite}" opacity=".85"/>
      <path d="M86 104 C120 120 214 120 250 96 L258 84 L246 88 C220 100 130 104 86 104Z" fill="${ink}"/>
      <path d="M178 98 V62 M178 62 L212 92" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>
      <path d="M0 118 q20 -8 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 V150 H0Z" fill="${top}"/>
      <path d="M30 132 q20 -6 40 0 t40 0 M190 134 q20 -6 40 0 t40 0" stroke="${lite}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".5"/>`
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 150" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient></defs><rect width="320" height="150" fill="url(#g)"/>${scenes[g] || scenes.do}</svg>`;
}
function makeArt(){
  const root = document.documentElement;
  ["stay", "food", "do", "ess", "move"].forEach(g => root.style.setProperty("--art-" + g, `url("data:image/svg+xml;charset=utf-8,${enc(artSVG(g))}")`));
}
const artOf = it => `var(--art-${grpOfItem(it)})`;
const artBadge = it => `<span class="ph-badge">${icon(kindIcon(it))}${esc(kindLabel(it))}</span>`;
function placeCard(it, pt){
  const c = CAT[it.c] || CAT.ess, col = cssv(c.v);
  const km = pt && !pt.none ? dist(pt, it) : null;
  const oh = isOpenNow(it);
  const line = [];
  const kr = knownRating(it);                              // a researched rating, or a Google one already looked up: never a guess
  const loc = itemLocal(it);
  const per = it.c === "gaff" ? ` <small class="basis">${stayBasis(it) === "bed" ? "bed" : "room"}</small>` : "";
  if (loc) line.push(`<span class="price">${esc(loc)} <small>${esc(gbpRange(it.p, it.cur))}</small>${per}</span>`);
  else if (it.cur_ && it.cost) line.push(`<span>${esc(it.cost)}</span>`);
  else { const e = estPrice(it); if (e) line.push(`<span class="price est" title="${esc(e.why)}: an estimate">${esc(estText(e))}${estGBP(e) ? ` <small>${esc(estGBP(e))}</small>` : ""}${per}</span>`); }
  if (it.k === "surf" || (!it.osm && it.c === "cool" && /surf/.test(ptext(it)))) line.push(`<span class="surf-now" data-surf="${esc(it.id)}"></span>`);       // filled in with the wave forecast
  if (it.st) line.push(`<span>${it.st}-star</span>`);
  const ft = it.c === "munch" ? foodType(it) : null;
  if (ft) line.push(`<span class="ftype">${esc(ft)}</span>`);
  else if (it.cu && it.cu.length) line.push(`<span>${esc(it.cu.slice(0, 2).join(", "))}</span>`);
  if (oh) line.push(`<span class="${oh.open ? "open" : "shut"}">${esc(oh.text)}</span>`);
  if (km != null) line.push(`<span>${distShort(km)}</span>`);
  const blurb = it.cur_ ? (it.s && it.s[0]) : it.desc;      // one line on why it is worth a look, when we have one
  const tags = [];
  if (it.cur_) tags.push(it.verified ? '<span class="tag pick">Researched</span>' : '<span class="tag warn">Not checked yet</span>');
  if (it.cur_ && it.c === "gaff" && it.d && /^(Included|Free)/.test(it.d.breakfast || "")) tags.push('<span class="tag good">Breakfast included</span>');
  if (it.cur_ && it.c === "cool") (it.t || []).slice(0, 2).forEach(t => tags.push(`<span class="tag">${esc(t)}</span>`));
  if (it.osm){
    if (isBiz(it)) tags.push('<span class="tag">Business</span>');
    if (it.wifi) tags.push(`<span class="tag">${it.wifi === 2 ? "Free Wi-Fi" : "Wi-Fi"}</span>`);
    if (it.vegan) tags.push(`<span class="tag good">${it.vegan === 2 ? "Vegan" : "Vegan options"}</span>`);
    else if (it.veg) tags.push(`<span class="tag good">${it.veg === 2 ? "Vegetarian" : "Vegetarian options"}</span>`);
    if (it.pool) tags.push('<span class="tag">Pool</span>');
    if (it.ac && it.c === "gaff") tags.push('<span class="tag">Air con</span>');
    if (it.x || it.wd) tags.push('<span class="tag pick">Notable</span>');
  }
  return `<article class="card" data-open="${esc(it.id)}" role="button" tabindex="0" style="--c:${col}">
    <div class="ph" data-ph="${esc(it.id)}" style="background-image:${artOf(it)}">${artBadge(it)}</div>
    <div class="body"><h3>${esc(it.n)}</h3>${kr != null ? `<div class="rate">${starsHTML(kr)}</div>` : ""}${romName(it) ? `<div class="rom">${esc(romName(it))}</div>` : ""}
      <div class="where2">${esc(kindLabel(it))} · ${esc(it.area || it.city)}</div>
      ${line.length ? `<div class="line">${line.join("")}</div>` : ""}
      ${blurb ? `<div class="blurb">${esc(blurb)}</div>` : ""}
      ${tags.length ? `<div class="tags">${tags.slice(0, 3).join("")}</div>` : ""}</div>${saveBtn(it)}</article>`;
}

/* ---------- list pages ---------- */
const RADIUS_MAX = 50;                                   // the distance slider runs 1 to 50 km, then "50+" (0 = any distance)
const radiusLabel = r => r ? `Within ${r} km` : "50+ km (any distance)";
// a place we expect to show a real photo: a free photo link that passes the photo rules, one saved with a city, or one seen before
const likelyPhoto = it => !!(((it.wp || it.wd) && photoPlaceOk(it)) || (cph[it.id] && cph[it.id].src) || (typeof PACK_PHOTOS !== "undefined" && PACK_PHOTOS.has(it.id)));
// the list opens on a card with a photo: the first such place in the current order moves to the top, the rest keep their order
function photoFirst(items){
  const i = items.slice(0, 80).findIndex(likelyPhoto);
  return i > 0 ? [items[i]].concat(items.slice(0, i), items.slice(i + 1)) : items;
}
const LIST_COPY = {
  gaff:{title:"Gaffs", sub:"Hostels, guesthouses and hotels", ph:"Search stays by name", img:HERO_IMG.gaffs},
  munch:{title:"Munch", sub:"Street food, markets, cafés and restaurants", ph:"Search food, restaurants, street food", img:HERO_IMG.munch},
  cool:{title:"Activities", sub:"Things to do, see and experience", ph:"Search activities, sights and tours", img:HERO_IMG.activities}
};
const listRun = {gaff:{osm:[], state:"idle", key:"", ctl:null, more:false}, munch:{osm:[], state:"idle", key:"", ctl:null, more:false}, cool:{osm:[], state:"idle", key:"", ctl:null, more:false}};
function listTest(cat){
  const st = ui.lists[cat];
  const chip = CHIPS[cat].find(c => c.id === st.chip);
  const flags = cat === "gaff" ? GAFF_FLAGS.filter(f => st.flags.has(f.id)) : [];
  const words = foldText(st.q).split(" ").filter(Boolean);
  return it => {
    if (chip && chip.f && !chip.f(it)) return false;
    for (const f of flags) if (!f.f(it)) return false;
    if (st.picks && !it.cur_) return false;
    if (st.open){ const o = isOpenNow(it); if (!o || !o.open) return false; }
    if (words.length){ const hay = foldText(`${it.n} ${it.nt || ""} ${it.area || ""} ${(it.cu || []).join(" ")} ${kindLabel(it)}`); if (!words.every(w => hay.includes(w))) return false; }
    if (!passPF(it, cat)) return false;                                            // the same maximum-price rule as the map (js/estimate.js)
    if (it.cur_ ? !passRating(it, st.minR) : st.minR) return false;                // no ratings in OpenStreetMap, so a review filter leaves them out
    return true;
  };
}
function listItems(cat){
  const st = ui.lists[cat], pt = focusPt(), run = listRun[cat], test = listTest(cat);
  let cur = D.places.filter(p => p.c === cat && test(p));
  if (!pt.none && st.radius) cur = cur.filter(p => dist(pt, p) <= st.radius);
  const osm = pt.none ? [] : run.osm.filter(p => test(p) && (!st.radius || dist(pt, p) <= st.radius));
  // surf spots are few and far between, so the Surf chip looks much further than the usual 40 km
  const surfKm = st.radius || (st.chip === "surf" ? 400 : 40), have = new Set(osm.map(p => p.id));
  if (cat === "cool") SURF.forEach(p => { if (!have.has(p.id) && test(p) && (pt.none ? p.cc === S.country : dist(pt, p) <= surfKm)) osm.push(p); });
  const how = (st.sort === "near" || st.sort === "top") && pt.none ? (cat === "cool" ? "az" : "cheap") : st.sort;
  return photoFirst(sortItems(cur.concat(osm), how, pt.none ? null : pt));
}
function listKey(cat){ const st = ui.lists[cat], pt = focusPt(); return JSON.stringify([pt.lat, pt.lng, st.radius, st.chip, [...st.flags], st.q, st.open, st.picks, st.minR, ui.pf[cat], st.sort === "top"]); }
const isKnown = p => !!(p.wd || p.wp || p.wpx || p.x);
async function loadListOsm(cat){
  const st = ui.lists[cat], run = listRun[cat], pt = focusPt(), key = listKey(cat);
  if (run.key === key && run.state !== "error") return;
  if (run.ctl) run.ctl.abort();
  run.key = key;
  if (pt.none || st.picks || st.minR){ run.osm = []; run.state = "idle"; return; }
  run.ctl = new AbortController(); run.state = "loading"; paintListStatus(cat);
  const test = listTest(cat), signal = run.ctl.signal;
  const res = await Places.near(CAT[cat].grp, pt, {maxKm: st.radius || 40, want: 240, test, signal});
  if (run.key !== key || res.state === "aborted") return;
  run.osm = res.items; run.state = res.state; run.more = !!res.more;
  if (st.sort === "top" && res.state === "ok"){
    // "Recommended" also wants the well-known places a little further out, which the nearest 240 can miss in a busy city
    if (VIEW_OF_CAT[cat] === ui.view) paintListBody(cat);
    const far = await Places.near(CAT[cat].grp, pt, {maxKm: Math.min(st.radius || 12, 12), want: 80, test: p => isKnown(p) && test(p), signal, maxLeaves: 16});
    if (run.key !== key || far.state === "aborted") return;
    const have = new Set(run.osm.map(p => p.id));
    run.osm = run.osm.concat(far.items.filter(p => !have.has(p.id)));
  }
  if (VIEW_OF_CAT[cat] === ui.view) paintListBody(cat);
}
function paintListStatus(cat){
  const el = $("#listStatus"); if (!el) return;
  const run = listRun[cat];
  el.textContent = run.state === "loading" ? "Loading more places nearby…" : run.state === "off" ? "The full places list needs signal the first time. Showing researched places." : run.state === "error" ? "Couldn’t load more places. Check your signal." : "";
}
function paintListBody(cat){
  const body = $("#listBody"); if (!body) return;
  const st = ui.lists[cat], run = listRun[cat], pt = focusPt();
  const items = listItems(cat), chip = CHIPS[cat].find(c => c.id === st.chip);
  let html = "";
  const whereTxt = pt.none ? "" : st.radius ? ` within ${st.radius} km of ${S.focus ? S.focus.n : "you"}` : ` near ${S.focus ? S.focus.n : "you"}`;
  html += `<p class="note" style="margin-top:10px"><b style="color:var(--ink)">${items.length.toLocaleString("en-GB")}${run.more ? "+" : ""}</b> ${items.length === 1 ? "place" : "places"}${esc(whereTxt)}. <span id="listStatus"></span></p>`;
  if (st.sort === "top" && !pt.none && items.length) html += `<p class="note" style="margin-top:4px">Researched and well-known places first, then the nearest. Change the order in Filters.</p>`;
  if (chip && chip.note) html += `<p class="note" style="margin-top:4px">${esc(chip.note)}</p>`;
  if (st.open) html += `<p class="note" style="margin-top:4px">Open now only counts places whose opening hours are known (Thailand time). Places with unknown hours are left out.</p>`;
  if (pt.none) html += `<div class="callout">${icon("pin")}<div><b>Pick a place to see everything nearby.</b> You’re seeing the researched places only.<div class="row" style="margin-top:8px"><button class="btn small primary" type="button" data-where>Choose a place</button></div></div></div>`;
  if (!items.length){
    html += run.state === "loading" ? `<div class="cards"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>`
      : emptyBlock(st.radius ? `Nothing found within ${st.radius} km` : "Nothing matches these filters",
        `<div>${st.radius ? "Widen the distance to see the nearest places." : "Try loosening a filter or clearing the search."}</div>`,
        `${st.radius ? `<button class="btn small" data-anywhere type="button">Show anywhere</button>` : ""}<button class="btn small" data-clear type="button">Clear filters</button>`);
  } else {
    html += `<div class="cards">${items.slice(0, st.shown).map(p => placeCard(p, pt)).join("")}</div>`;
    if (items.length > st.shown) html += `<button class="btn wide" type="button" id="listMore" style="margin-top:10px">Show more (${(items.length - st.shown).toLocaleString("en-GB")} left)</button>`;
    html += `<p class="note" style="margin-top:12px">Researched places carry prices, ratings and sources. The rest come from OpenStreetMap (© OpenStreetMap contributors) and show only what volunteers have recorded.</p>`;
  }
  body.innerHTML = html;
  paintListStatus(cat);
  const more = $("#listMore"); if (more) more.onclick = () => { st.shown += 30; paintListBody(cat); };
  const any = body.querySelector("[data-anywhere]"); if (any) any.onclick = () => { st.radius = 0; renderPage(); };
  const clr = body.querySelector("[data-clear]"); if (clr) clr.onclick = () => { ui.lists[cat] = newList(cat); ui.pf[cat] = newPF(); renderPage(); };
  watchCardPhotos(body); paintSurf(body);
}
const MAX_GUESTS = 30;
function stayStrip(){
  const s = S.stay, t = todayISO();
  return `<div class="stay">
    <label class="field">Check-in<input type="date" id="st-in" min="${t}" value="${esc(s.cin)}"></label>
    <label class="field">Check-out<input type="date" id="st-out" min="${esc(s.cin ? addDays(s.cin, 1) : t)}" value="${esc(s.cout)}"></label>
    <label class="field">Guests<select id="st-g">${[1,2,3,4,5,6,7,8].map(n => `<option value="${n}" ${+s.guests === n ? "selected" : ""}>${n}</option>`).join("")}<option value="more" ${+s.guests > 8 ? "selected" : ""}>8+</option></select></label>
    <label class="field" ${+s.guests > 8 ? "" : "hidden"} id="st-gn-wrap">How many?<input type="number" id="st-gn" inputmode="numeric" min="9" max="${MAX_GUESTS}" value="${+s.guests > 8 ? +s.guests : 9}"></label>
  </div>
  <p class="note" style="margin-top:6px">${stayParams().ok ? `${stayParams().nights} night${stayParams().nights === 1 ? "" : "s"}, ${stayParams().guests} guest${stayParams().guests === 1 ? "" : "s"}. ` : "Add dates to carry them over to the booking sites. "}Live prices and availability are confirmed by the booking site, not by this app.</p>`;
}
function renderList(cat){
  const st = ui.lists[cat], copy = LIST_COPY[cat], root = $("#pageview");
  const nFilters = (st.radius ? 1 : 0) + (st.sort !== DEFAULT_SORT[cat] ? 1 : 0) + (pfOn(cat) ? 1 : 0) + (st.minR ? 1 : 0) + st.flags.size + (st.picks ? 1 : 0);
  const sorts = cat === "gaff" ? [["top","Recommended"],["near","Nearest"],["cheap","Cheapest first"],["rated","Best reviewed"],["dear","Priciest first"],["match","Best match"]]
              : cat === "munch" ? [["near","Nearest"],["top","Recommended"],["cheap","Cheapest first"],["dear","Priciest first"]]
              : [["top","Recommended"],["near","Nearest"],["az","A to Z"]];
  let fp = "";
  if (st.filters){
    fp = `<div class="fpanel" id="fpanel">
      <div class="dist"><div class="note"><span>Distance</span><b id="l-distlab">${radiusLabel(st.radius)}</b></div><input type="range" id="l-dist" min="1" max="${RADIUS_MAX + 1}" step="1" value="${st.radius ? Math.min(st.radius, RADIUS_MAX) : RADIUS_MAX + 1}" aria-label="Distance in kilometres, up to 50 plus" ${focusPt().none ? "disabled" : ""}><div class="dist-ends"><span>0</span><span>25 km</span><span>50+</span></div></div>
      <div class="controls"><label class="field">Sort<select data-sort>${sorts.map(([v, l]) => `<option value="${v}" ${st.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      ${cat === "gaff" ? `<label class="field">Reviews<select data-minr>${[[0,"Any"],[4,"4 stars and up"],[4.5,"4.5 stars and up"]].map(([v, l]) => `<option value="${v}" ${+st.minR === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>` : ""}
</div>
      <div class="map-chips mfilt pf-row">${pfControls(cat)}</div>
      ${cat === "gaff" ? `<div><div class="note" style="margin-bottom:4px">Rooms and facilities (only where the information exists)</div><div class="flags">${GAFF_FLAGS.map(f => `<button class="chip soft" type="button" data-flag="${f.id}" aria-pressed="${st.flags.has(f.id)}">${f.l}</button>`).join("")}</div></div>` : ""}
      <button class="switch" type="button" data-picks aria-pressed="${st.picks}"><i></i>Researched places only (with prices and sources)</button>
    </div>`;
  }
  root.innerHTML = hero({title:copy.title, sub:`${copy.sub} ${focusPt().none ? "in " + D.countries[S.country].name : "around " + focusLabel()}`, img:copy.img}) + `<div class="page">
    <label class="sbar"><span class="vis-hidden">${esc(copy.ph)}</span>${icon("search")}<input type="search" id="l-q" autocomplete="off" enterkeyhint="search" placeholder="${esc(copy.ph)}" value="${esc(st.q)}"><button class="sbtn" type="button" id="l-clear" aria-label="Clear search" ${st.q ? "" : "hidden"}>${icon("x","i s")}</button></label>
    ${cat === "gaff" ? stayStrip() : ""}
    <div class="scroller" style="margin-top:10px" role="group" aria-label="Categories">${CHIPS[cat].map(c => `<button class="chip" type="button" data-chip="${c.id}" aria-pressed="${st.chip === c.id}">${c.ic ? icon(c.ic) : ""}${c.l}</button>`).join("")}</div>
    <div class="tools-row">
      <button class="btn small" type="button" id="l-filters" aria-expanded="${st.filters}">${icon("sliders","i s")}Filters${nFilters ? ` (${nFilters})` : ""}</button>
      ${cat !== "gaff" ? `<button class="switch" type="button" id="l-open" aria-pressed="${st.open}"><i></i>Open now</button>` : ""}
      <span class="sp"></span>
      <div class="seg" role="group" aria-label="Map or list"><button type="button" id="l-map" aria-pressed="false">${icon("map","i s")}Map</button><button type="button" aria-pressed="true">${icon("list","i s")}List</button></div>
    </div>${fp}
    <div id="listBody"></div></div>`;
  bindList(cat);
  paintListBody(cat);
  loadListOsm(cat);
}
function bindList(cat){
  const st = ui.lists[cat], root = $("#pageview");
  const refresh = () => { st.shown = 30; paintListBody(cat); loadListOsm(cat); };
  const qIn = $("#l-q"), typed = debounce(() => loadListOsm(cat), 350);
  qIn.oninput = () => { st.q = qIn.value; $("#l-clear").hidden = !st.q; st.shown = 30; paintListBody(cat); typed(); };
  $("#l-clear").onclick = () => { st.q = ""; qIn.value = ""; $("#l-clear").hidden = true; refresh(); qIn.focus(); };
  root.querySelectorAll("[data-chip]").forEach(b => b.onclick = () => { st.chip = b.dataset.chip; root.querySelectorAll("[data-chip]").forEach(x => x.setAttribute("aria-pressed", x === b)); refresh(); });
  $("#l-filters").onclick = () => { st.filters = !st.filters; renderPage(); };
  const op = $("#l-open"); if (op) op.onclick = () => { st.open = !st.open; op.setAttribute("aria-pressed", st.open); refresh(); };
  $("#l-map").onclick = () => { ui.mapCats = new Set([cat]); ui.essKinds.clear(); ui.mapSaved = false; ui.mapMode = "map"; go("#map"); };
  const ds = $("#l-dist");
  if (ds){
    const val = () => +ds.value > RADIUS_MAX ? 0 : +ds.value;            // the far end of the slider means "50 km and beyond"
    ds.oninput = () => { $("#l-distlab").textContent = radiusLabel(val()); };
    ds.onchange = () => { st.radius = val(); renderPage(); };
  }
  root.querySelectorAll("[data-flag]").forEach(b => b.onclick = () => { const f = b.dataset.flag; st.flags.has(f) ? st.flags.delete(f) : st.flags.add(f); renderPage(); });
  const so = root.querySelector("[data-sort]"); if (so) so.onchange = () => { st.sort = so.value; renderPage(); };
  bindPF(root, cat, () => renderPage());
  const mr = root.querySelector("[data-minr]"); if (mr) mr.onchange = () => { st.minR = +mr.value; renderPage(); };
  const pk = root.querySelector("[data-picks]"); if (pk) pk.onclick = () => { st.picks = !st.picks; renderPage(); };
  if (cat === "gaff"){
    const ci = $("#st-in"), co = $("#st-out"), sg = $("#st-g"), gn = $("#st-gn");
    ci.onchange = () => { S.stay.cin = ci.value; if (S.stay.cin && (!S.stay.cout || S.stay.cout <= S.stay.cin)) S.stay.cout = addDays(S.stay.cin, 1); persist(); renderPage(); };
    co.onchange = () => { S.stay.cout = co.value; persist(); renderPage(); };
    sg.onchange = () => {
      if (sg.value === "more"){ S.stay.guests = Math.max(9, +gn.value || 9); persist(); renderPage(); const n = $("#st-gn"); if (n){ n.focus(); n.select(); } return; }
      S.stay.guests = +sg.value; persist(); renderPage();
    };
    gn.onchange = () => { S.stay.guests = clamp(Math.round(+gn.value) || 9, 9, MAX_GUESTS); persist(); renderPage(); };
  }
}
function stayParams(){
  const s = S.stay, ok = !!(s.cin && s.cout && s.cout > s.cin && s.cin >= todayISO());
  return {ok, cin:s.cin, cout:s.cout, guests:clamp(Math.round(+s.guests) || 2, 1, MAX_GUESTS), nights: ok ? Math.round((new Date(s.cout + "T12:00:00") - new Date(s.cin + "T12:00:00")) / 864e5) : 0};
}

/* ---------- saved places ---------- */
function renderSaved(){
  const items = savedPlaces(), pt = focusPt();
  let html = hero({title:"Saved places", sub:"Kept on this phone, even without signal", back:["#map", "Map"]}) + `<div class="page">`;
  if (!items.length) html += emptyBlock("Nothing saved yet", `<div>Tap the bookmark on any place in the map, Gaffs, Munch or Activities and it will be kept here.</div>`, `<a class="btn small primary" href="#map">Open the map</a>`);
  else {
    html += `<div class="row" style="margin-bottom:6px"><button class="btn small" type="button" id="sv-map">${icon("map","i s")}Show saved on the map</button></div>`;
    for (const [cat, c] of Object.entries(CAT)){
      const group = items.filter(p => p.c === cat); if (!group.length) continue;
      html += `<div class="sect"><h2>${c.label}</h2><span class="note">${group.length}</span></div><div class="cards" style="margin-top:0">${group.map(p => placeCard(p, pt)).join("")}</div>`;
    }
  }
  $("#pageview").innerHTML = html + `</div>`;
  const b = $("#sv-map"); if (b) b.onclick = () => { ui.mapSaved = true; ui.mapMode = "map"; go("#map"); };
  watchCardPhotos($("#pageview"));
}
function onSavedChanged(){
  if (ui.view === "saved") renderSaved();
  if (typeof refreshMapData === "function" && ui.mapSaved) refreshMapData();
}

/* ---------- discover: the optional landing screen ---------- */
let coverage = null, coverageWait = null;
function renderDiscover(){
  const root = $("#pageview"), pt = focusPt();
  const b = S.budget, spent = budgetSpentGBP();
  const haveBudget = false && (+b.total > 0 || b.items.length > 0);      // Budget is hidden for now (Tools); its data is kept
  let html = hero({title:"Thailand", sub:"Find where to go, stay, eat and what to do", img:HERO_IMG.discover}) + `<div class="page">
    <a class="sbar" href="#map" id="d-search" style="text-decoration:none">${icon("search")}<span style="flex:1;color:var(--faint);font-size:16px;line-height:42px">Search places, stays, food, activities</span></a>
    <div class="sect"><h2>${esc(focusLabel())}</h2><a href="#map">Open the map</a></div>
    <a class="wx-mini" href="#tools/weather" id="d-wx">${icon("cloudsun")}<span style="flex:1"><b>Weather</b><br><span class="note">Tap for the forecast</span></span>${icon("chevr","i s")}</a>`;
  if (haveBudget){
    const tot = +b.total > 0 ? convert(+b.total, b.cur, "GBP") : 0, pc = tot ? Math.min(100, Math.round(spent / tot * 100)) : 0;
    html += `<a class="block" href="#tools/budget" style="display:block;text-decoration:none;color:inherit;margin-top:8px">
      <div class="row" style="justify-content:space-between"><h3>${icon("wallet","i s")} Budget</h3><span class="note">${tot ? `${pc}% used` : "No total set"}</span></div>
      <div style="font-size:20px;font-weight:700;margin:4px 0 8px">£${fmtNum(spent)}${tot ? ` <span class="note">of £${fmtNum(tot)}</span>` : " spent"}</div>
      ${tot ? `<div class="bar ${spent > tot ? "over" : ""}"><i style="width:${pc}%"></i></div>` : ""}</a>`;
  }
  html += `<div class="sect"><h2>Jump in</h2></div>
    <div class="entry">${[["gaffs","bed","Gaffs"],["munch","food","Munch"],["activities","compass","Activities"],["tools","grid","Tools"]].map(([h, ic, l]) => `<a class="ebtn" href="#${h}">${icon(ic)}${l}</a>`).join("")}</div>
    ${[["Explore Thailand", THAI_DESTS], ["Explore Bali and Lombok", BALI_LOMBOK_DESTS], ["Explore Sumatra", SUMATRA_DESTS], ["Explore Cambodia", KH_DESTS]].filter(([, list]) => list.length).map(([title, list]) => `
    <div class="sect"><h2>${title}</h2><span class="note">${list.length} destinations</span></div>
    <div class="dgrid">${list.map(c => `<button class="dcard ${DEST_IMG[c[0]] ? "pic" : ""}" type="button" data-dest="${esc(c[0])}">${DEST_IMG[c[0]] ? `<img src="${esc(DEST_IMG[c[0]])}" alt="" loading="lazy" decoding="async">` : ""}<span><b>${esc(c[0])}</b><small data-cov="${esc(c[0])}">${userLoc ? distText(dist(userLoc, {lat:c[1], lng:c[2]})) : ""}</small></span></button>`).join("")}</div>`).join("")}
    <p class="note" style="margin-top:12px">Places come from the app’s researched list and OpenStreetMap (© OpenStreetMap contributors).</p></div>`;
  root.innerHTML = html;
  root.querySelectorAll("[data-dest]").forEach(el => el.onclick = () => {
    const c = PLACE_DESTS.find(x => x[0] === el.dataset.dest); if (!c) return;
    setFocus({n:c[0], lat:c[1], lng:c[2]});
    const cc = ccAt(c[1], c[2]); if (cc && S.country !== cc) setCountry(cc, true);
    if (map) flyTo({lat:c[1], lng:c[2]}, 12.5); go("#map");
  });
  const fill = () => { if (!coverage) return; root.querySelectorAll("[data-cov]").forEach(el => { const c = coverage.by_destination[el.dataset.cov]; if (c) el.textContent = `${(c.stay + c.food + c.do).toLocaleString("en-GB")} places to stay, eat and see`; }); };
  if (coverage) fill();
  else { coverageWait = coverageWait || Promise.all(PLACE_DBS.map(db => getJSON(`${PLACES_BASE}${db.dir}/coverage.json`).catch(() => null))).then(list => { const ok = list.filter(Boolean); return ok.length ? {by_destination:Object.assign({}, ...ok.map(c => c.by_destination || {}))} : null; }); coverageWait.then(c => { if (!c){ coverageWait = null; return; } coverage = c; if (ui.view === "discover") fill(); }); }
  if (typeof paintWeatherMini === "function") paintWeatherMini($("#d-wx"));
  if (!S.seenDiscover){ S.seenDiscover = true; persist(); }
}
