/* ============================================================
   65-tools-more: budget, weather, Wi-Fi finder, Thailand guide, emergency, trip assistant, deals
   ============================================================ */

/* ---------- budget tracker (kept on this phone) ---------- */
const B_CATS = [["stay","Stay","--stay"],["food","Food and drink","--food"],["move","Transport","--move"],["do","Activities","--do"],["night","Nights out","--accent-2"],["shop","Shopping","--ess"],["other","Other","--faint"]];
const B_CURS = ["THB","GBP","USD","EUR","AUD"];
const budgetSpentGBP = () => S.budget.items.reduce((a, x) => a + toGBP(x.amt, x.cur), 0);
function budgetStats(){
  const b = S.budget, spent = budgetSpentGBP();
  const total = +b.total > 0 ? toGBP(+b.total, b.cur) : 0;
  const today = todayISO();
  const todaySpent = b.items.filter(x => x.at === today).reduce((a, x) => a + toGBP(x.amt, x.cur), 0);
  const days = new Set(b.items.map(x => x.at)).size;
  const perCat = {}; b.items.forEach(x => perCat[x.cat] = (perCat[x.cat] || 0) + toGBP(x.amt, x.cur));
  return {spent, total, left: total ? total - spent : null, todaySpent, avg: days ? spent / days : 0, days, perCat, daily: total && +b.days > 0 ? total / +b.days : null};
}
TOOL_PAGES.budget = root => {
  const b = S.budget, st = budgetStats(), show = b.cur;                       // totals are shown in the budget's own currency
  const inShow = gbp => money(convert(gbp, "GBP", show), show);
  const pc = st.total ? Math.min(100, Math.round(st.spent / st.total * 100)) : 0;
  const byDay = {}; b.items.slice().sort((x, y) => y.at.localeCompare(x.at) || y.id - x.id).forEach(x => (byDay[x.at] = byDay[x.at] || []).push(x));
  const maxCat = Math.max(1, ...Object.values(st.perCat));
  root.innerHTML = toolHero("Budget", "Set a budget and log what you spend") + `<div class="page">
  <section class="block"><h2>Trip budget</h2>
    <div class="row" style="margin-top:8px"><label class="field">Total budget<input inputmode="decimal" id="bg-total" value="${esc(b.total)}" placeholder="e.g. 1500"></label>
      <label class="field" style="max-width:120px">Currency<select id="bg-cur">${B_CURS.map(k => `<option value="${k}" ${k === b.cur ? "selected" : ""}>${k}</option>`).join("")}</select></label>
      <label class="field" style="max-width:110px">Days<input inputmode="numeric" id="bg-days" value="${esc(b.days)}" placeholder="e.g. 30"></label></div>
    <div class="totals"><div><b>${inShow(st.spent)}</b><span>Spent</span></div><div><b style="${st.left != null && st.left < 0 ? "color:var(--bad)" : ""}">${st.left == null ? "–" : inShow(st.left)}</b><span>${st.left != null && st.left < 0 ? "Over budget" : "Left"}</span></div><div><b>${inShow(st.todaySpent)}</b><span>Today</span></div></div>
    ${st.total ? `<div class="bar ${st.spent > st.total ? "over" : ""}"><i style="width:${pc}%"></i></div><p class="note" style="margin-top:6px">${pc}% of your budget used.${st.daily ? ` That budget is ${inShow(st.daily)} a day; you’ve averaged ${inShow(st.avg)} a day over ${st.days} day${st.days === 1 ? "" : "s"} logged.` : st.days ? ` You’ve averaged ${inShow(st.avg)} a day over ${st.days} day${st.days === 1 ? "" : "s"} logged.` : ""}</p>` : `<p class="note">Add a total to see what’s left.${st.days ? ` You’ve averaged ${inShow(st.avg)} a day over ${st.days} day${st.days === 1 ? "" : "s"} logged.` : ""}</p>`}
  </section>
  <section class="block"><h2>Add spending</h2>
    <div class="row" style="margin-top:8px"><label class="field">Amount<input inputmode="decimal" id="bg-amt" placeholder="0"></label>
      <label class="field" style="max-width:120px">Currency<select id="bg-ecur">${B_CURS.map(k => `<option value="${k}" ${k === (b.lastCur || D.countries[S.country].cur) ? "selected" : ""}>${k}</option>`).join("")}</select></label></div>
    <div class="row" style="margin-top:8px"><label class="field">Category<select id="bg-cat">${B_CATS.map(([id, l]) => `<option value="${id}">${l}</option>`).join("")}</select></label>
      <label class="field">Date<input type="date" id="bg-date" value="${todayISO()}" max="${todayISO()}"></label></div>
    <label class="field" style="margin-top:8px">Note (optional)<input type="text" id="bg-note" maxlength="60" placeholder="e.g. Pad thai at the night market"></label>
    <button class="btn primary wide" type="button" id="bg-add" style="margin-top:10px">${icon("plus","i s")}Add</button>
  </section>
  ${b.items.length ? `<section class="block"><h2>Where it went</h2><div class="catbars">${B_CATS.filter(([id]) => st.perCat[id]).map(([id, l, v]) => `<div class="cb"><span>${l}</span><div class="bar"><i style="width:${Math.round(st.perCat[id] / maxCat * 100)}%;background:var(${v})"></i></div><b>${inShow(st.perCat[id])}</b></div>`).join("")}</div></section>
  <section class="block"><h2>History</h2>${Object.entries(byDay).map(([day, xs]) => `<div class="daylabel">${day === todayISO() ? "Today" : niceDate(day)} · ${inShow(xs.reduce((a, x) => a + toGBP(x.amt, x.cur), 0))}</div>${xs.map(x => { const cat = B_CATS.find(c => c[0] === x.cat) || B_CATS[6]; return `<div class="spend" style="--c:var(${cat[2]})"><span class="dot"></span><div class="what">${esc(x.note || cat[1])}<small>${cat[1]}</small></div><div class="amt">${money(x.amt, x.cur)}${x.cur !== show ? `<small>${inShow(toGBP(x.amt, x.cur))}</small>` : ""}</div><button class="del" type="button" data-del="${x.id}" aria-label="Delete this entry">${icon("trash","i s")}</button></div>`; }).join("")}`).join("")}
    <button class="btn small" type="button" id="bg-clear" style="margin-top:12px">Clear all spending</button></section>` : `<p class="note">Nothing logged yet. Amounts in other currencies are converted with the app’s saved rates.</p>`}
  <p class="note">Your budget stays on this phone only. It isn’t sent anywhere.</p></div>`;
  const num = s => { const v = parseFloat(String(s).replace(/,/g, "")); return isNaN(v) || v < 0 ? null : v; };
  const save = () => { if (!persist()) toast("Couldn’t save on this phone (storage is full or blocked)"); };
  $("#bg-total").onchange = e => { const v = num(e.target.value); b.total = v == null ? "" : String(v); save(); renderPage(); };
  $("#bg-cur").onchange = e => { b.cur = e.target.value; save(); renderPage(); };
  $("#bg-days").onchange = e => { const v = num(e.target.value); b.days = v ? String(Math.round(v)) : ""; save(); renderPage(); };
  $("#bg-add").onclick = () => {
    const amt = num($("#bg-amt").value);
    if (!amt){ toast("Type an amount first"); $("#bg-amt").focus(); return; }
    const d = $("#bg-date").value || todayISO();
    b.items.push({id:Date.now(), at:d > todayISO() ? todayISO() : d, amt, cur:$("#bg-ecur").value, cat:$("#bg-cat").value, note:$("#bg-note").value.trim().slice(0, 60)});
    b.lastCur = $("#bg-ecur").value; save(); renderPage(); toast("Added");
  };
  root.querySelectorAll("[data-del]").forEach(x => x.onclick = () => { const i = b.items.findIndex(y => String(y.id) === x.dataset.del); if (i < 0) return; const [gone] = b.items.splice(i, 1); save(); renderPage(); toast("Entry deleted", () => { b.items.push(gone); save(); renderPage(); }); });
  const clr = $("#bg-clear"); if (clr) clr.onclick = () => { const old = b.items; b.items = []; save(); renderPage(); toast("Spending cleared", () => { b.items = old; save(); renderPage(); }); };
};

/* ---------- surf forecast (Open-Meteo marine and weather models: free, no key) ----------
   Surfline doesn't share its data with other apps, so the numbers here are an open wave model's: the wave height and
   period just offshore, and the wind. That says how big it is, not how good the break is: the Surfline button has the full report. */
const M_FT = 3.28084, surfCache = new Map();
const surfSize = ft => ft < 1 ? "Flat" : ft < 2 ? "Small" : ft < 4 ? "Fun-size" : ft < 6 ? "Solid" : ft < 9 ? "Big" : "Very big";
const windWord = k => k < 12 ? "light wind" : k < 25 ? "breezy" : "windy";
const compass = d => ["N","NE","E","SE","S","SW","W","NW"][Math.round(((d % 360) + 360) % 360 / 45) % 8];
function surfRead(marine, wx){
  const c = (marine && marine.current) || {}, w = (wx && wx.current) || {};
  if (c.wave_height == null) return null;                          // no sea at this point in the model
  const ft = c.wave_height * M_FT;
  return {m:c.wave_height, ft, per:c.wave_period, dir:c.wave_direction, swellFt:c.swell_wave_height != null ? c.swell_wave_height * M_FT : null, swellPer:c.swell_wave_period,
    wind:w.wind_speed_10m, windDir:w.wind_direction_10m, size:surfSize(ft), at:Date.now()};
}
const surfShort = f => `${f.ft.toFixed(f.ft < 10 ? 1 : 0)} ft${f.per ? ` @ ${Math.round(f.per)} s` : ""} · ${f.size}`;
function surfNow(pt){
  const key = pt.lat.toFixed(2) + "," + pt.lng.toFixed(2), hit = surfCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60e3) return hit.p;
  const q = `latitude=${pt.lat.toFixed(3)}&longitude=${pt.lng.toFixed(3)}`;
  const p = Promise.all([
    getJSON(`https://marine-api.open-meteo.com/v1/marine?${q}&current=wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period&cell_selection=sea`, {timeout:10000}),
    getJSON(`https://api.open-meteo.com/v1/forecast?${q}&current=wind_speed_10m,wind_direction_10m`, {timeout:10000}).catch(() => null)
  ]).then(([m, w]) => surfRead(m, w)).catch(() => { surfCache.delete(key); return null; });
  surfCache.set(key, {at:Date.now(), p});
  return p;
}
// fills the wave line on surf cards, one after another (a handful of small requests, remembered for half an hour)
async function paintSurf(root){
  for (const el of [...root.querySelectorAll("[data-surf]")].slice(0, 30)){
    const it = findPlace(el.dataset.surf); if (!it) continue;
    const f = await surfNow(it); if (f && el.isConnected) el.textContent = surfShort(f);
  }
}
const surfLink = it => `https://www.surfline.com/search/${enc(it.n.replace(/\s*\(.*?\)\s*/g, " ").trim())}`;
const wantsSurf = it => isSurf(it) || it.k === "beach" || (!it.osm && hasT(it, "Beaches"));
// Activities › Surf: straight to the map with only the researched surf spots near you (or in this country)
function openSurfMap(){
  const pt = userLoc || focusPt(), spots = surfNear(pt, S.country);
  if (!spots.length){ toast(`No surf spots researched in ${D.countries[S.country].name} yet. Bali, Lombok, Krui, Phuket, Khao Lak, Samui and Malaysia’s east coast have them.`); return; }
  ui.mapSurf = true; ui.mapCats = new Set(); ui.essKinds.clear(); ui.essOpen = false; ui.mapSaved = false; ui.mapMode = "map"; ui.mapSel = null;
  go("#map");
  const fit = () => {
    if (spots.length === 1) map.jumpTo({center:[spots[0].lng, spots[0].lat], zoom:12});
    else map.fitBounds([[Math.min(...spots.map(p => p.lng)), Math.min(...spots.map(p => p.lat))], [Math.max(...spots.map(p => p.lng)), Math.max(...spots.map(p => p.lat))]], {padding:{top:150, bottom:80, left:40, right:60}, maxZoom:13, duration:0});
    refreshMapData();
  };
  const wait = () => { if (!map) return setTimeout(wait, 100); if (map.loaded() || mapLoaded) fit(); else map.once("load", fit); };
  wait();
}
function surfBlock(it){
  return `<div class="callout surfbox" id="surfBox" data-id="${esc(it.id)}">${icon("waves")}<div><b>Surf now</b><div id="surfTxt" class="note">Checking the waves…</div>
    <div class="row" style="margin-top:8px">${ext(surfLink(it), "Open on Surfline " + icon("ext","i s"))}</div></div></div>`;
}
async function fillSurf(it){
  const f = await surfNow(it), el = $("#surfTxt"), box = $("#surfBox");
  if (!el || !box || box.dataset.id !== it.id) return;
  if (!f){ el.textContent = navigator.onLine === false ? "The wave forecast needs signal." : "No wave forecast for this spot."; return; }
  el.innerHTML = `<span style="color:var(--ink);font-weight:700">${esc(f.size)}: ${f.ft.toFixed(1)} ft</span> (${f.m.toFixed(1)} m) waves${f.per ? `, ${Math.round(f.per)} seconds apart` : ""}${f.dir != null ? `, from the ${compass(f.dir)}` : ""}.`
    + (f.wind != null ? ` Wind ${Math.round(f.wind)} km/h from the ${compass(f.windDir)} (${windWord(f.wind)}).` : "")
    + ` <br>Open-sea forecast just off this spot, by <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a>. It shows size, not how well the break is working: check Surfline for that.`;
}

/* ---------- weather (Open-Meteo: free for non-commercial use, no key) ---------- */
const WMO = c => c === 0 ? ["Clear", "sun"] : c <= 2 ? [c === 1 ? "Mostly clear" : "Partly cloudy", "cloudsun"] : c === 3 ? ["Cloudy", "cloud"] : c <= 48 ? ["Fog", "fog"]
  : c <= 57 ? ["Drizzle", "rain"] : c <= 67 ? ["Rain", "rain"] : c <= 77 ? ["Snow", "cloud"] : c <= 82 ? ["Showers", "rain"] : c <= 86 ? ["Snow showers", "cloud"] : ["Thunderstorms", "storm"];
function wxPoint(){ const p = focusPt(); return {lat:p.lat, lng:p.lng, n:p.none ? D.cities[0][0] : focusLabel(), ...(p.none ? {lat:D.cities[0][1], lng:D.cities[0][2]} : {})}; }
async function loadWeather(pt, force){
  const key = `wx:${pt.lat.toFixed(1)},${pt.lng.toFixed(1)}`;
  const hit = lsGet(key);
  if (hit && !force && Date.now() - hit.at < 3600e3) return hit;
  try {
    const j = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${pt.lat.toFixed(3)}&longitude=${pt.lng.toFixed(3)}&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max&timezone=Asia%2FBangkok&forecast_days=7`, {timeout:10000});
    const w = {at:Date.now(), cur:j.current, daily:j.daily};
    lsSet(key, w); return w;
  } catch(e){ return hit ? Object.assign({stale:true}, hit) : null; }
}
function paintWeatherMini(el){
  if (!el) return;
  const pt = wxPoint();
  loadWeather(pt).then(w => {
    if (!w || !el.isConnected) return;
    const [label, ic] = WMO(w.cur.weather_code);
    el.innerHTML = `${icon(ic)}<span style="flex:1"><b>${Math.round(w.cur.temperature_2m)}°C</b> <span class="note">${esc(label)} in ${esc(pt.n)}</span><br><span class="note">High ${Math.round(w.daily.temperature_2m_max[0])}°, low ${Math.round(w.daily.temperature_2m_min[0])}°${w.daily.precipitation_probability_max[0] != null ? `, ${w.daily.precipitation_probability_max[0]}% chance of rain` : ""}</span></span>${icon("chevr","i s")}`;
  });
}
TOOL_PAGES.weather = root => {
  const pt = wxPoint();
  root.innerHTML = hero({title:"Weather", sub:`Now and the next 7 days in ${pt.n}`, back:["#tools", "Tools"]}) + `<div class="page">
    <button class="where" type="button" data-where style="margin-bottom:10px;border-color:var(--line);background:var(--surface)">${icon("pin","i s")}<span>${esc(pt.n)}</span>${icon("chevd","i xs")}</button>
    <div id="wxBody"><div class="skel"></div></div>
    <p class="note" style="margin-top:10px">Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a> (CC BY 4.0). Times are Thailand time.</p></div>`;
  loadWeather(pt).then(w => {
    const el = $("#wxBody"); if (!el) return;
    if (!w){ el.innerHTML = emptyBlock("No forecast right now", "<div>The weather needs signal the first time. Try again when you’re connected.</div>", `<button class="btn small" type="button" id="wxRetry">Try again</button>`); const r = $("#wxRetry"); if (r) r.onclick = () => renderPage(); return; }
    const [label, ic] = WMO(w.cur.weather_code), d = w.daily;
    el.innerHTML = `<section class="block"><div class="wx-now">${icon(ic)}<div><div class="big">${Math.round(w.cur.temperature_2m)}°C</div><div class="note">${esc(label)}, feels like ${Math.round(w.cur.apparent_temperature)}°</div></div>
        <div class="note" style="text-align:right">Humidity ${Math.round(w.cur.relative_humidity_2m)}%<br>Wind ${Math.round(w.cur.wind_speed_10m)} km/h${d.uv_index_max && d.uv_index_max[0] != null ? `<br>UV ${Math.round(d.uv_index_max[0])}` : ""}</div></div>
      <p class="note" style="margin-top:8px">${w.stale ? "No signal, so this is the last saved forecast from " : "Updated "}${new Date(w.at).toLocaleString("en-GB", {day:"numeric", month:"short", hour:"2-digit", minute:"2-digit"})}.</p></section>
      <section class="block"><h2>Next 7 days</h2><div class="wx-days">${d.time.map((t, i) => { const [l, ici] = WMO(d.weather_code[i]); return `<div class="wx-day"><b>${i === 0 ? "Today" : new Date(t + "T12:00:00").toLocaleDateString("en-GB", {weekday:"short", day:"numeric"})}</b>${icon(ici)}<span>${esc(l)}<span class="r">${d.precipitation_probability_max[i] != null ? ` · ${d.precipitation_probability_max[i]}% rain` : ""}${d.precipitation_sum[i] > 0.4 ? ` · ${d.precipitation_sum[i].toFixed(0)} mm` : ""}</span></span><b>${Math.round(d.temperature_2m_max[i])}° <span class="r">${Math.round(d.temperature_2m_min[i])}°</span></b></div>`; }).join("")}</div></section>`;
  });
};

/* ---------- nearest essentials, used by Wi-Fi and Emergency ---------- */
async function nearestEss(kinds, maxKm = 15, want = 8){
  const pt = focusPt(); if (pt.none) return {pt, items:[], state:"nopoint"};
  const set = new Set(kinds);
  const res = await Places.near("ess", pt, {maxKm, want, test:p => set.has(p.k)});
  return {pt, items:res.items.slice(0, want), state:res.state};
}
function essList(el, r, emptyMsg){
  if (!el) return;
  if (r.state === "nopoint"){ el.innerHTML = `<div class="callout">${icon("pin")}<div><b>Pick a place first.</b><div class="row" style="margin-top:8px"><button class="btn small primary" type="button" data-where>Choose a place</button></div></div></div>`; return; }
  if (r.state === "off" || r.state === "error"){ el.innerHTML = emptyBlock("Needs signal", "<div>The places list hasn’t been saved on this phone yet. Open the map once with signal.</div>"); return; }
  el.innerHTML = r.items.length ? `<div class="cards" style="margin-top:0">${r.items.map(p => placeCard(p, r.pt)).join("")}</div>` : emptyBlock("None found nearby", `<div>${emptyMsg}</div>`);
}
// Wi-Fi finder: the main map with only Wi-Fi showing, near the phone (its previews, saving and directions as usual).
// The old list page below is kept for reference but no longer used.
TOOL_PAGES.wifi = root => { root.innerHTML = ""; showEssentialOnMap("wifi", {nearMe:true}); };
TOOL_PAGES.wifiList = root => {
  root.innerHTML = toolHero("Wi-Fi finder", `Places with Wi-Fi around ${focusPt().none ? "you" : focusLabel()}`) + `<div class="page">
    <div class="row" style="margin-bottom:10px"><button class="btn primary" type="button" id="wfMap">${icon("map","i s")}Show Wi-Fi on the map</button></div>
    <div id="wfBody"><div class="skel"></div></div>
    <p class="note" style="margin-top:10px">These are cafés, hostels, coworking spaces and other places that mappers have recorded as having Wi-Fi. The app doesn’t know passwords or speeds, and “free” means free for customers unless it says otherwise. Ask at the counter.</p></div>`;
  $("#wfMap").onclick = () => showEssentialOnMap("wifi");
  nearestEss(["wifi", "cowork"], 10, 12).then(r => essList($("#wfBody"), r, "Try another area, or look for cafés in Munch."));
};

/* ---------- Thailand guide ---------- */
const GUIDE_CHECKED = "10 Nov 2026";
const DEST_NOTE = {"Siem Reap":"Town by the temples of Angkor, with Pub Street and the night markets.",
  "Phnom Penh":"Cambodia’s capital on the Mekong: the Royal Palace, the riverside, and the sobering Tuol Sleng and Killing Fields memorials.",
  "Kampot":"Sleepy river town known for pepper farms, Bokor Mountain and sunset boat trips.",
  // Vietnam
  Hanoi:"The capital: the Old Quarter’s street food and bia hơi corners, lakes, and the hub for the north.",
  "Ha Long":"Base for boat trips among the limestone islands of Ha Long Bay.", "Cat Ba":"Island on the edge of Lan Ha Bay: kayaking, climbing and a national park.",
  "Ninh Binh":"Rice fields and limestone karsts by rowing boat at Tam Coc and Trang An.", Sapa:"Mountain town above terraced rice valleys, the base for treks with local guides.",
  "Ha Giang":"Far-north mountain loop, usually done over a few days by motorbike with a driver.", "Phong Nha":"National park with some of the world’s biggest caves.",
  Hue:"The old imperial capital: the Citadel and royal tombs on the Perfume River.", "Da Nang":"Beach city with an airport, the Marble Mountains and the road over the Hai Van Pass.",
  "Hoi An":"Lantern-lit old trading town, famous for tailors, cao lầu noodles and nearby beaches.", "Quy Nhon":"Quieter beach city on the south-central coast.",
  "Nha Trang":"Big beach city with island boat trips and diving.", "Da Lat":"Cool highland town of pine forests, waterfalls and canyoning.",
  "Mui Ne":"Kitesurfing beach with red and white sand dunes.", "Ho Chi Minh City":"Saigon: the busy south, with street food, rooftop bars and the war museum.",
  "Can Tho":"The Mekong Delta’s biggest city, known for its early-morning floating market.", "Phu Quoc":"Big island in the far south-west with long beaches.",
  // Laos
  Vientiane:"The small, relaxed capital on the Mekong, with its riverside night market.", "Vang Vieng":"Karst valley town for tubing, kayaking, caves and lagoons.",
  "Luang Prabang":"Old royal town of temples and French houses where the Nam Khan meets the Mekong, with waterfalls nearby.",
  "Nong Khiaw":"River village under limestone cliffs, with viewpoint hikes and boat trips.", "Luang Namtha":"Northern town and base for jungle treks in the Nam Ha protected area.",
  Phonsavan:"Base for the Plain of Jars.", Thakhek:"Start of the Thakhek motorbike loop through caves and karst country.",
  Savannakhet:"Quiet Mekong town with old colonial streets.", Pakse:"Southern hub for the Bolaven Plateau’s coffee and waterfalls.",
  "Don Det":"Laid-back island in the Mekong’s Four Thousand Islands.",
  // Singapore
  Singapore:"City-state of hawker centres, Gardens by the Bay and the Marina Bay skyline, with excellent public transport.",
  Sentosa:"Resort island off Singapore with beaches and theme parks.","Kep":"Small seaside town known for its crab market.", "Battambang":"Relaxed river city with old colonial streets, the bamboo train and the bat cave.",
  "Sihanoukville":"Port city and the jumping-off point for the islands.", "Koh Rong":"Big island with long white beaches; Koh Touch village by the pier is the busy, social end.",
  "Koh Rong Sanloem":"Quieter island, with the long beach of Saracen Bay.", "Kratie":"Mekong river town, known for river dolphins.",
  "Sen Monorom":"Cool hill town in Mondulkiri, with waterfalls nearby.", "Banlung":"Ratanakiri's main town, near the Yeak Laom crater lake.",
  "Koh Kong":"Town on the Thai border side of the Cardamom Mountains and mangroves.", "Kampong Cham":"Mekong river town between Phnom Penh and Kratie.",
  Bangkok:"The capital: temples, street food, markets, nightlife, and the hub for trains, buses and flights.", "Chiang Mai":"Northern city with an old walled centre, temples, cooking classes and mountain day trips.",
  Pai:"Small mountain town north of Chiang Mai, known for hot springs, canyons and a slow pace.", "Chiang Rai":"Far north: the White Temple, Blue Temple and the Golden Triangle.",
  Sukhothai:"Ruins of the first Thai capital, best seen by bicycle.", Ayutthaya:"Ruined temples of the old capital, an easy day trip from Bangkok.",
  Kanchanaburi:"River town with the Bridge on the River Kwai and Erawan waterfalls nearby.", "Hua Hin":"Beach town on the Gulf, a few hours south of Bangkok.", Pattaya:"Busy beach city close to Bangkok.",
  "Koh Chang":"Large jungle island near the Cambodian border.", "Koh Tao":"Small island famous for cheap dive courses and snorkelling.", "Koh Phangan":"Home of the Full Moon Party, with quieter beaches in the north.",
  "Koh Samui":"The biggest Gulf island, with an airport, resorts and beaches.", "Khao Sok":"Rainforest national park and the lake at Cheow Lan.", Phuket:"Thailand’s largest island: beaches, an airport and ferries onwards.",
  "Krabi Town":"Mainland base for the Krabi coast, with a night market and buses.", "Ao Nang":"Beach strip and the jumping-off point for Railay and island boats.", Railay:"Limestone peninsula reached only by boat, known for climbing and beaches.",
  "Koh Phi Phi":"Car-free islands with viewpoints, boat trips and Maya Bay.", "Koh Lanta":"Long, relaxed island with quiet beaches.", "Koh Lipe":"Small island in the far south with clear water, reached by ferry or speedboat.",
  // Indonesia
  Ubud:"Bali’s inland culture town: rice terraces, temples, yoga and craft villages.", Canggu:"Surf and café strip on Bali’s west coast, popular with backpackers and digital nomads.",
  Seminyak:"Busy beach area with beach clubs, shops and restaurants, next to Kuta.", Uluwatu:"Clifftop south of Bali: surf breaks, beaches below the cliffs and the sea temple.",
  Sanur:"Calm east-coast beach town, and the main port for boats to Nusa Penida.", Amed:"Quiet black-sand coast in east Bali, known for snorkelling and diving.",
  "Nusa Penida":"Rugged island off Bali with dramatic cliffs and manta-ray snorkelling, reached by fast boat.",
  "Kuta Lombok":"Surf town on Lombok’s south coast with wide bays nearby.", Senggigi:"Lombok’s older beach resort on the west coast, near the boats to the Gilis.",
  "Gili Trawangan":"The liveliest Gili island: no cars or scooters, diving, snorkelling and nightlife.", "Gili Air":"Smaller, quieter Gili island with snorkelling and beach cafés.",
  Senaru:"Village on the north side of Mount Rinjani, a start point for treks and waterfalls.",
  Palembang:"South Sumatra’s big river city, known for pempek fish cakes, the Ampera Bridge and the Musi river.",
  "Bandar Lampung":"Lampung’s capital on the bay at Sumatra’s southern tip, gateway to the islands and Way Kambas.",
  Bengkulu:"Quiet coastal city on Sumatra’s west coast with the old British Fort Marlborough.",
  Krui:"Small surf town on Lampung’s remote west coast.", "Pagar Alam":"Cool highland town under Mount Dempo, surrounded by tea plantations."};
// the guide for the country you're in (Indonesia gets its own; everywhere else the Thailand one)
TOOL_PAGES.guide = root => {
  (S.country === "ID" ? guideID : S.country === "KH" ? guideKH : GUIDES[S.country] ? (r => guideFrom(r, GUIDES[S.country])) : guideTH)(root);
  // every guide ends with "Hangover and the shits" (js/ask-more.js)
  const pg = root.querySelector(".page");
  if (pg && typeof remedyGuideHTML === "function"){ pg.insertAdjacentHTML("beforeend", remedyGuideHTML(REMEDIES[S.country] ? S.country : "TH")); bindRemedyButtons(pg); }
};

/* Cambodia guide: entry rules, warnings and laws from gov.uk, checked 12 Nov 2026 */
const GUIDE_KH_CHECKED = "12 Nov 2026";
function guideKH(root){
  const src = (label, url) => `<a href="${url}" target="_blank" rel="noopener">${label}</a>`;
  const riel = Math.round(rate("KHR") / rate("USD") / 100) * 100;
  root.innerHTML = toolHero("Cambodia guide", "The practical basics, with official sources") + `<div class="page">
  <div class="callout">${icon("alert")}<div><b>The UK advises against all but essential travel within 20 km of Cambodia’s land border with Thailand</b> (after fighting there in 2025). Travelling against that advice can cancel your travel insurance. ${src("gov.uk warnings", "https://www.gov.uk/foreign-travel-advice/cambodia/warnings-and-insurance")}, updated 19 March 2026.</div></div>
  <section class="block"><h2>Getting in (British passport)</h2>
    <ul class="known"><li>You need a visa: an <b>e-visa</b> (apply at least 4 days ahead, on the official e-visa website or app) or a <b>visa on arrival</b> at airports and land borders, paid in US dollars, with a passport photo.</li>
      <li>Tourist visas last <b>30 days</b> from the day you arrive and can be extended in Cambodia. Overstaying means a fine with no upper limit, and possibly detention.</li>
      <li>Your passport needs <b>at least 6 months</b> left from the day you arrive, and must be undamaged with no missing pages.</li>
      <li>Flying into Phnom Penh, Siem Reap or Sihanoukville? Fill in the free <b>e-Arrival card</b> at arrival.gov.kh within the 7 days before you land.</li>
      <li>At land borders, officials or tour companies may ask for unofficial fees or inflate the visa price: know the real price before you go.</li></ul>
    <p class="note" style="margin-top:8px">Checked ${GUIDE_KH_CHECKED}. Source: ${src("gov.uk entry requirements", "https://www.gov.uk/foreign-travel-advice/cambodia/entry-requirements")}. Other passports have different rules.</p></section>
  <section class="block"><h2>Money</h2>
    <ul class="known"><li>US dollars are used everywhere alongside the Cambodian riel; small change often comes in riel. At today’s rates $1 is about ${riel.toLocaleString("en-GB")} riel.</li>
      <li>Fake dollar notes sometimes turn up in change, so check your notes.</li></ul>
    <div class="row" style="margin-top:8px"><a class="btn small" href="#tools/currency">Open the converter</a><button class="btn small" type="button" data-ess="atm">ATMs on the map</button></div></section>
  <section class="block"><h2>Laws that catch travellers out</h2>
    <ul class="known"><li><b>Drug penalties are severe</b>, including for cannabis: up to life in prison. Police raid venues popular with foreigners and may test for drugs.</li>
      <li>You can be refused entry to temples, including Angkor Wat, in shorts or skirts above the knee or with bare shoulders.</li>
      <li>Never photograph military sites. Ask before photographing people, especially monks.</li>
      <li>Never leave your passport as a deposit for a scooter.</li></ul>
    <p class="note" style="margin-top:8px">Checked ${GUIDE_KH_CHECKED}. Source: ${src("gov.uk safety and security", "https://www.gov.uk/foreign-travel-advice/cambodia/safety-and-security")}. This is a summary, not legal advice.</p></section>
  <section class="block"><h2>Staying safe</h2>
    <ul class="known"><li><b>Landmines and unexploded bombs</b> remain in rural areas, often unmarked: stay on main paths, including around temples, and never pick up metal objects.</li>
      <li>Bag and phone snatching from motorbikes happens, notably on Phnom Penh’s riverfront and in BKK, and on Sihanoukville’s beaches. Carry bags on the side away from the road.</li>
      <li>Methanol in drinks can kill, and drink spiking has been reported: don’t leave drinks unattended.</li>
      <li>Roads are among the most dangerous in South East Asia, worst after dark; wear a helmet.</li>
      <li>Boats to the islands sometimes sail despite weather warnings, and some are overloaded. Medical help on the islands is limited.</li>
      <li>“Easy job, high pay” offers can be trafficking scams that end in guarded compounds.</li></ul>
    <p class="note" style="margin-top:8px">Checked ${GUIDE_KH_CHECKED}. Source: ${src("gov.uk safety and security", "https://www.gov.uk/foreign-travel-advice/cambodia/safety-and-security")}.</p>
    <div class="row" style="margin-top:8px"><a class="btn small primary" href="#tools/emergency">${icon("siren","i s")}Emergency numbers</a></div></section>
  <section class="block"><h2>Language</h2>
    <ul class="known"><li>Khmer is the language; English is common in Siem Reap, Phnom Penh and on the islands, less so elsewhere.</li></ul>
    <div class="row" style="margin-top:8px"><a class="btn small" href="#tools/translate">Open the Khmer phrasebook</a></div></section>
  <section class="block"><h2>When to go</h2>
    <p>The monsoon runs roughly June to October, with flooding and landslides on some roads. March to May is the hot dry season.</p>
    <p class="note" style="margin-top:6px">Source: ${src("gov.uk safety and security", "https://www.gov.uk/foreign-travel-advice/cambodia/safety-and-security")}.</p>
    <div class="row" style="margin-top:8px"><a class="btn small" href="#tools/weather">Check the forecast</a></div></section>
  ${D.rides.KH ? `<section class="block"><h2>Getting around</h2><p>${esc(D.rides.KH)}</p></section>` : ""}
  <div class="sect"><h2>Destinations</h2><span class="note">${KH_DESTS.length}</span></div>
  ${KH_DESTS.map(c => `<div class="block" style="padding:11px 12px"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><div><h3>${esc(c[0])}</h3><p class="note" style="margin-top:2px">${esc(DEST_NOTE[c[0]] || "")}</p></div><button class="btn small" type="button" data-look="${esc(c[0])}">Look here</button></div></div>`).join("")}
  </div>`;
  root.querySelectorAll("[data-ess]").forEach(b => b.onclick = () => showEssentialOnMap(b.dataset.ess));
  root.querySelectorAll("[data-look]").forEach(b => b.onclick = () => { const c = KH_DESTS.find(x => x[0] === b.dataset.look); setFocus({n:c[0], lat:c[1], lng:c[2]}); flyTo({lat:c[1], lng:c[2]}, 12.5); go("#map"); });
}

/* Vietnam, Laos and Singapore guides: entry rules, laws and safety from gov.uk travel advice, checked 18 Nov 2026.
   Each one is data; guideFrom() draws it the same way as the Cambodia guide. */
const GUIDE_NEW_CHECKED = "18 Nov 2026";
const GUIDES = {
  VN:{name:"Vietnam", lang:"Vietnamese", slug:"vietnam",
    entry:["British passports can visit <b>without a visa for up to 45 days</b>. Check the exit date stamped in your passport on arrival: immigration won’t change it later.",
      "For longer, an <b>e-visa</b> gives up to 90 days with multiple entries, but it is tied to the entry and exit points you pick when you apply.",
      "Your passport needs <b>at least 6 months</b> left from the day you arrive, at least 2 blank pages, and no damage. Enter and leave on the same passport.",
      "A digital arrival card is encouraged (not required) at Ho Chi Minh City’s Tan Son Nhat airport."],
    money:["The money is the Vietnamese dong (₫). Prices have lots of zeros: the converter shows what they are in pounds.",
      "Only change money at official counters."],
    laws:["<b>Drug penalties are severe</b>, including for cannabis: long prison terms and even the death penalty. Police raid nightlife venues and may drug-test people, and a positive test can lead to charges even if the drugs were taken before you arrived. Laughing-gas balloons count too.",
      "<b>Vapes and e-cigarettes are banned</b>: you can’t buy them or bring them in.",
      "Carry photo ID: a printed copy of your passport photo page and visa is accepted.",
      "To ride a motorbike you need a 1968 International Driving Permit <b>and</b> your UK licence, plus third-party insurance; helmets are compulsory.",
      "Don’t photograph military sites. Cover shoulders and knees at temples and pagodas. Avoid protests."],
    safety:["Bag snatchers on motorbikes target crowds and tourist areas: carry bags on the side away from the traffic.",
      "Never leave your passport as a deposit for a motorbike or a room: give a copy.",
      "Methanol in drinks has killed people, even in licensed bars. Don’t buy spirits or cigarettes from street sellers.",
      "Drink spiking has been reported, often linked to unlicensed taxis: use Grab or Xanh SM.",
      "Overnight Ha Long Bay boats have had accidents from overcrowding: check the boat is certified.",
      "Landmines remain in central Vietnam and near the Laos border, often unmarked: stay on paths."],
    when:"Typhoons hit the east coast from roughly May to November. The north and south are rainiest June to September, the centre (Hue, Hoi An) October to December, when it floods.",
    embassies:[["British Embassy Hanoi", "https://www.gov.uk/world/organisations/british-embassy-hanoi"], ["British Consulate Ho Chi Minh City", "https://www.gov.uk/world/organisations/british-consulate-general-ho-chi-minh-city"]],
    sos:[["Ambulance", "115", "Medical emergencies. The lines are answered in Vietnamese"], ["Police", "113", ""], ["Fire", "114", ""], ["Search and rescue", "112", ""]]},
  LA:{name:"Laos", lang:"Lao", slug:"laos",
    warn:"<b>The UK advises against all but essential travel to Xaisomboun Province</b>. Travelling against that advice can cancel your travel insurance.",
    entry:["You need a visa: an <b>e-visa</b> (apply at least 5 days ahead; single entry, accepted at the main crossings) or a <b>visa on arrival</b> at Vientiane, Luang Prabang and Pakse airports and the main land borders.",
      "Tourist visas last <b>30 days</b> from arrival, and can be extended twice in Laos (60 more days in all).",
      "Your passport needs <b>at least 6 months</b> left from the day you arrive and 2 blank pages.",
      "Flying into Vientiane, Luang Prabang or Pakse, or crossing at the first Friendship Bridge? Fill in the free <b>Lao Digital Immigration Form</b> online within the 3 days before you arrive."],
    money:["The money is the Lao kip (₭).",
      "Keep bank cards and cash in separate bags."],
    laws:["<b>Drug penalties are severe</b>, including for cannabis, and even small amounts: long jail terms, and death for trafficking. Police may test for drugs.",
      "<b>Sex between foreigners and Lao nationals is illegal unless you are married under Lao law</b>: fines up to US$5,000 and possibly prison. Police may check hotel rooms.",
      "Don’t photograph military sites, bridges or airfields.",
      "Never leave your passport as a deposit for a motorbike: some rental shops have damaged or ‘stolen’ their own bikes and then demanded big fees."],
    safety:["<b>Unexploded bombs</b> lie all over Laos and still kill people: stick to main paths in the countryside and never touch metal objects, especially after floods or landslides.",
      "Tubing, kayaking and swimming (especially on the Mekong) have drowned tourists: wear a lifejacket and check your insurance covers it.",
      "Methanol in drinks has killed people; <b>Tiger Vodka and Tiger Whisky are banned</b>.",
      "Riding at night is especially risky; rentals may not come with a helmet, so bring or buy one. Stop at police checkpoints unless waved on."],
    when:"The rainy season runs roughly May to October, with flash floods and landslides. November to February is dry and cooler; March to May is hot.",
    embassies:[["British Embassy Vientiane", "https://www.gov.uk/world/organisations/british-embassy-vientiane"]],
    sos:[["Ambulance", "1195", "Medical emergencies (or 030 525 7239)"], ["Police", "1191", ""], ["Fire", "1190", ""], ["Tourist police, Vientiane", "+85621251128", ""]]},
  SG:{name:"Singapore", lang:"English", slug:"singapore",
    entry:["British passports need <b>no visa</b>: you are usually given 30 to 90 days, at the officer’s discretion.",
      "Your passport needs <b>at least 6 months</b> left from the day you arrive.",
      "Fill in the free <b>SG Arrival Card</b> (with a health declaration) online within the 3 days before you arrive. Your face, iris and fingerprints are scanned at the border."],
    money:["The money is the Singapore dollar (S$). You can tap in on the MRT and buses with a contactless card."],
    laws:["<b>Drug penalties are extremely severe</b>: prison, caning and the death penalty, even when only passing through the airport.",
      "<b>Vapes are banned</b>, even for your own use: they are confiscated and you can be fined.",
      "No smoking in parks, on beaches, along Orchard Road or in many other public places; you must be 21 to buy or use tobacco.",
      "Drinking in public is illegal from 10:30pm to 7am (bars and restaurants are fine). Geylang and Little India ban it all weekend and on public holidays.",
      "Littering gets an on-the-spot fine. Graffiti or vandalism can mean prison and caning."],
    safety:["Singapore is very safe, but drunk or disorderly behaviour is punished hard: fines, prison or caning."],
    when:"Hot and humid all year. It rains most in the north-east monsoon, roughly November to January.",
    embassies:[["British High Commission Singapore", "https://www.gov.uk/world/organisations/british-high-commission-singapore"]],
    sos:[["Police", "999", ""], ["Ambulance and fire", "995", "Medical emergencies"]]}
};
// the destinations of a country that has a places database
const destsOf = cc => PLACE_DESTS.filter(c => placeDbCc(c[1], c[2]) === cc);
function guideFrom(root, G){
  const src = (label, url) => `<a href="${url}" target="_blank" rel="noopener">${label}</a>`, gov = p => `https://www.gov.uk/foreign-travel-advice/${G.slug}${p ? "/" + p : ""}`;
  const cc = Object.keys(GUIDES).find(k => GUIDES[k] === G), dests = destsOf(cc), li = a => `<ul class="known">${a.map(x => `<li>${x}</li>`).join("")}</ul>`;
  root.innerHTML = toolHero(`${G.name} guide`, "The practical basics, with official sources") + `<div class="page">
  ${G.warn ? `<div class="callout">${icon("alert")}<div>${G.warn} ${src("gov.uk warnings", gov("warnings-and-insurance"))}.</div></div>` : ""}
  <section class="block"><h2>Getting in (British passport)</h2>${li(G.entry)}
    <p class="note" style="margin-top:8px">Checked ${GUIDE_NEW_CHECKED}. Source: ${src("gov.uk entry requirements", gov("entry-requirements"))}. Other passports have different rules.</p></section>
  <section class="block"><h2>Money</h2>${li(G.money)}
    <div class="row" style="margin-top:8px"><a class="btn small" href="#tools/currency">Open the converter</a><button class="btn small" type="button" data-ess="atm">ATMs on the map</button></div></section>
  <section class="block"><h2>Laws that catch travellers out</h2>${li(G.laws)}
    <p class="note" style="margin-top:8px">Checked ${GUIDE_NEW_CHECKED}. Source: ${src("gov.uk safety and security", gov("safety-and-security"))}. This is a summary, not legal advice.</p></section>
  <section class="block"><h2>Staying safe</h2>${li(G.safety)}
    <p class="note" style="margin-top:8px">Checked ${GUIDE_NEW_CHECKED}. Source: ${src("gov.uk safety and security", gov("safety-and-security"))}.</p>
    <div class="row" style="margin-top:8px"><a class="btn small primary" href="#tools/emergency">${icon("siren","i s")}Emergency numbers</a></div></section>
  <section class="block"><h2>Language</h2>
    <div class="row" style="margin-top:4px"><a class="btn small" href="#tools/translate">Open the ${esc(phrasebook().name)} phrasebook</a></div></section>
  <section class="block"><h2>When to go</h2><p>${G.when}</p>
    <div class="row" style="margin-top:8px"><a class="btn small" href="#tools/weather">Check the forecast</a></div></section>
  ${D.rides[cc] ? `<section class="block"><h2>Getting around</h2><p>${esc(D.rides[cc])}</p></section>` : ""}
  ${dests.length ? `<div class="sect"><h2>Destinations</h2><span class="note">${dests.length}</span></div>` : ""}
  ${dests.map(c => `<div class="block" style="padding:11px 12px"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><div><h3>${esc(c[0])}</h3><p class="note" style="margin-top:2px">${esc(DEST_NOTE[c[0]] || "")}</p></div><button class="btn small" type="button" data-look="${esc(c[0])}">Look here</button></div></div>`).join("")}
  </div>`;
  root.querySelectorAll("[data-ess]").forEach(b => b.onclick = () => showEssentialOnMap(b.dataset.ess));
  root.querySelectorAll("[data-look]").forEach(b => b.onclick = () => { const c = dests.find(x => x[0] === b.dataset.look); setFocus({n:c[0], lat:c[1], lng:c[2]}); flyTo({lat:c[1], lng:c[2]}, 12.5); go("#map"); });
}

/* Indonesia guide: entry rules and laws from gov.uk, checked 12 Nov 2026 */
const GUIDE_ID_CHECKED = "12 Nov 2026";
const ID_DESTS = PLACE_DESTS.filter(c => placeDbCc(c[1], c[2]) === "ID");
function guideID(root){
  const src = (label, url) => `<a href="${url}" target="_blank" rel="noopener">${label}</a>`;
  root.innerHTML = toolHero("Indonesia guide", "The practical basics, with official sources") + `<div class="page">
  <div class="callout">${icon("info")}<div>Entry rules and laws change. Each section says when it was checked and links to the official page. <b>Check those pages again before you fly.</b></div></div>
  <section class="block"><h2>Getting in (British passport)</h2>
    <ul class="known"><li>You need a visa. A <b>30-day visa on arrival</b> costs <b>500,000 rupiah</b>, is single entry, and you need proof of an onward or return journey.</li>
      <li>You can also apply online before you fly, which offers other options such as 60-day and multiple-entry visas. If an online visa isn’t approved in time, you may only get the 30-day visa on arrival.</li>
      <li>Your passport needs <b>at least 6 months</b> left after the day you arrive, and <b>at least 2 blank pages</b>.</li>
      <li>Fill in the free <b>All Indonesia arrival card</b> online within the 72 hours before you arrive. Avoid paid third-party sites.</li>
      <li><b>Bali</b> charges foreign tourists a <b>150,000 rupiah</b> levy (about £8), paid online or on arrival.</li>
      <li>Staying somewhere private rather than a hotel? You must register with the local police (hotels do it for you). Not registering can mean a fine of up to 5 million rupiah.</li></ul>
    <p class="note" style="margin-top:8px">Checked ${GUIDE_ID_CHECKED}. Source: ${src("gov.uk entry requirements", "https://www.gov.uk/foreign-travel-advice/indonesia/entry-requirements")}. Other passports have different rules.</p></section>
  <section class="block"><h2>Money</h2>
    <ul class="known"><li>The currency is the Indonesian rupiah (Rp). Prices run into thousands: Rp 100,000 is about £${fmtNum(Math.round(toGBP(100000, "IDR") * 10) / 10)}.</li>
      <li>Cash rules for warungs (small local restaurants), markets, buses and small guesthouses, especially in Sumatra.</li>
      <li>If a machine or card reader offers to charge you in pounds, choose rupiah. Your bank’s rate is almost always better.</li></ul>
    <div class="row" style="margin-top:8px"><a class="btn small" href="#tools/currency">Open the converter</a><button class="btn small" type="button" data-ess="atm">ATMs on the map</button><button class="btn small" type="button" data-ess="exchange">Money exchange</button></div></section>
  <section class="block"><h2>Laws that catch travellers out</h2>
    <ul class="known"><li><b>Drug penalties are severe</b>, up to the death penalty. Police raid venues popular with foreigners, especially in Bali, and may test you for drugs; a positive test means arrest.</li>
      <li>Indonesian law covers <b>sex outside marriage</b> and unmarried couples living together. Read the gov.uk section on it before you go.</li>
      <li>To ride a scooter you need the right licence for it, and a helmet. Riding without the right licence can cancel your travel insurance.</li></ul>
    <p class="note" style="margin-top:8px">Checked ${GUIDE_ID_CHECKED}. Source: ${src("gov.uk safety and security", "https://www.gov.uk/foreign-travel-advice/indonesia/safety-and-security")}. This is a summary, not legal advice.</p></section>
  <section class="block"><h2>Staying safe</h2>
    <ul class="known"><li>Indonesia has active volcanoes (including Rinjani on Lombok and Agung on Bali) and earthquakes. Follow local warnings and closures.</li>
      <li>Stick to sealed drinks from busy, reputable bars: drinks made with methanol can kill. Don’t drink the tap water.</li>
      <li>Watch for strong currents and obey beach flags.</li></ul>
    <p class="note" style="margin-top:8px">Checked ${GUIDE_ID_CHECKED}. Source: ${src("gov.uk Indonesia travel advice", "https://www.gov.uk/foreign-travel-advice/indonesia")}.</p>
    <div class="row" style="margin-top:8px"><a class="btn small primary" href="#tools/emergency">${icon("siren","i s")}Emergency numbers</a><button class="btn small" type="button" data-ess="water">Water refill points</button></div></section>
  <section class="block"><h2>Language and manners</h2>
    <ul class="known"><li>Indonesian (Bahasa Indonesia) is the language. English is common in Bali’s tourist areas, much less so in Sumatra. A few polite words go a long way.</li>
      <li>Most Indonesians are Muslim; Bali is mostly Hindu. Away from the beach, cover shoulders and knees, and always in mosques and temples (Bali temples lend sarongs).</li>
      <li>Give and take things with your right hand.</li></ul>
    <div class="row" style="margin-top:8px"><a class="btn small" href="#tools/translate">Open the phrasebook</a></div></section>
  <section class="block"><h2>When to go</h2>
    <p>Roughly: Bali and Lombok are drier from about April to October and wetter from November to March. Southern Sumatra gets rain all year, most from about November to April.</p>
    <div class="row" style="margin-top:8px"><a class="btn small" href="#tools/weather">Check the forecast</a></div></section>
  ${D.rides.ID ? `<section class="block"><h2>Getting around</h2><p>${esc(D.rides.ID)}</p><div class="row" style="margin-top:8px"><a class="btn small" href="#tools/transport">Plan a journey</a></div></section>` : ""}
  <div class="sect"><h2>Destinations</h2><span class="note">${ID_DESTS.length}</span></div>
  ${ID_DESTS.map(c => `<div class="block" style="padding:11px 12px"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><div><h3>${esc(c[0])}</h3><p class="note" style="margin-top:2px">${esc(DEST_NOTE[c[0]] || "")}</p></div><button class="btn small" type="button" data-look="${esc(c[0])}">Look here</button></div></div>`).join("")}
  </div>`;
  root.querySelectorAll("[data-ess]").forEach(b => b.onclick = () => showEssentialOnMap(b.dataset.ess));
  root.querySelectorAll("[data-look]").forEach(b => b.onclick = () => { const c = ID_DESTS.find(x => x[0] === b.dataset.look); setFocus({n:c[0], lat:c[1], lng:c[2]}); flyTo({lat:c[1], lng:c[2]}, 12.5); go("#map"); });
}

function guideTH(root){
  const src = (label, url) => `<a href="${url}" target="_blank" rel="noopener">${label}</a>`;
  root.innerHTML = toolHero("Thailand guide", "The practical basics, with official sources") + `<div class="page">
  <div class="callout">${icon("info")}<div>Entry rules and laws change. Each section says when it was checked and links to the official page. <b>Check those pages again before you fly.</b></div></div>
  <section class="block"><h2>Getting in (British passport)</h2>
    <ul class="known"><li><b>No visa needed for tourism for up to 30 days</b> (this changed from 60 days on 15 September 2026). Tourism only, not work.</li>
      <li>Your passport needs <b>at least 6 months</b> left after the day you arrive, and a blank page.</li>
      <li>Fill in the <b>Thailand Digital Arrival Card (TDAC)</b> online before you arrive. You can do it within the 3 days before arrival, and it is free on the official site.</li>
      <li>You may be asked for proof of onward or return travel, and proof of funds of 10,000 baht per person.</li>
      <li>Arriving overland without a visa is normally limited to 2 entries a calendar year.</li>
      <li>Overstaying costs 500 baht a day (up to 20,000 baht) and can mean detention or a ban.</li></ul>
    <p class="note" style="margin-top:8px">Checked ${GUIDE_CHECKED}. Sources: ${src("gov.uk entry requirements", "https://www.gov.uk/foreign-travel-advice/thailand/entry-requirements")}, ${src("official TDAC site", "https://tdac.immigration.go.th")}, ${src("official Thai e-Visa site", "https://www.thaievisa.go.th")}. Other passports have different rules.</p></section>
  <section class="block"><h2>Money</h2>
    <ul class="known"><li>The currency is the Thai baht (฿). Cash rules for street food, markets, buses and small guesthouses.</li>
      <li>Thai bank ATMs add their own fee for foreign cards and show it before you confirm. Take out larger amounts less often.</li>
      <li>If a machine or card reader offers to charge you in pounds, choose baht. Your bank’s rate is almost always better.</li></ul>
    <div class="row" style="margin-top:8px"><a class="btn small" href="#tools/currency">Open the converter</a><button class="btn small" type="button" data-ess="atm">ATMs on the map</button><button class="btn small" type="button" data-ess="exchange">Money exchange</button></div></section>
  <section class="block"><h2>Laws that catch travellers out</h2>
    <ul class="known"><li><b>Vapes and e-cigarettes are illegal</b> to have or use, with fines and no exception for tourists.</li>
      <li><b>Cannabis is medical-only</b> and needs a Thai prescription. Recreational use is illegal.</li>
      <li><b>Never insult the monarchy</b>, including online. It is a serious crime with long prison sentences.</li>
      <li>Drug penalties are severe, up to the death penalty for Class A drugs.</li>
      <li>Police can ask for your passport. A copy of the photo page is usually fine. Never leave your passport as a deposit for a scooter or jet-ski.</li>
      <li><b>Scooters:</b> you need your UK licence plus a 1968 International Driving Permit, and a helmet is the law. Riding without the right licence can cancel your travel insurance.</li></ul>
    <p class="note" style="margin-top:8px">Checked ${GUIDE_CHECKED}. Source: ${src("gov.uk safety and security", "https://www.gov.uk/foreign-travel-advice/thailand/safety-and-security")}. This is a summary, not legal advice.</p></section>
  <section class="block"><h2>Staying safe</h2>
    <ul class="known"><li>Don’t leave drinks unattended or accept them from strangers. Bar measures are stronger than at home, and drinks made with methanol can kill, so stick to sealed bottles and busy bars.</li>
      <li>Obey beach flags, especially red ones. Rip currents are strongest in the monsoon, and jellyfish are most active May to October.</li>
      <li>Don’t drink the tap water. Use sealed bottles or filtered refill machines.</li>
      <li>The UK government advises against all but essential travel to parts of the far south near the Malaysian border. See its map before heading that way.</li></ul>
    <p class="note" style="margin-top:8px">Checked ${GUIDE_CHECKED}. Source: ${src("gov.uk Thailand travel advice", "https://www.gov.uk/foreign-travel-advice/thailand")}.</p>
    <div class="row" style="margin-top:8px"><a class="btn small primary" href="#tools/emergency">${icon("siren","i s")}Emergency numbers</a><button class="btn small" type="button" data-ess="water">Water refill points</button></div></section>
  <section class="block"><h2>Language and manners</h2>
    <ul class="known"><li>Thai is the language. English is common in tourist areas, less so elsewhere. A few polite words go a long way.</li>
      <li>At temples, cover shoulders and knees and take your shoes off before entering buildings.</li>
      <li>The head is treated as sacred and feet as low: don’t touch heads or point your feet at people or sacred images.</li></ul>
    <div class="row" style="margin-top:8px"><a class="btn small" href="#tools/translate">Open the phrasebook</a></div></section>
  <section class="block"><h2>When to go</h2>
    <p>Roughly: cool and dry from November to February, hot from March to May, and rainy from about May to October. The Gulf islands (Koh Samui, Koh Phangan, Koh Tao) get their heaviest rain later, around October to December, when the Andaman side (Phuket, Krabi, Koh Lanta) is at its best.</p>
    <div class="row" style="margin-top:8px"><a class="btn small" href="#tools/weather">Check the forecast</a></div></section>
  <section class="block"><h2>Getting around</h2><p>${esc(D.rides.TH)}</p><div class="row" style="margin-top:8px"><a class="btn small" href="#tools/transport">Plan a journey</a></div></section>
  <div class="sect"><h2>Destinations</h2><span class="note">${THAI_DESTS.length}</span></div>
  ${THAI_DESTS.map((c, i) => `<div class="block" style="padding:11px 12px"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><div><h3>${esc(c[0])}</h3><p class="note" style="margin-top:2px">${esc(DEST_NOTE[c[0]] || "")}</p></div><button class="btn small" type="button" data-look="${i}">Look here</button></div></div>`).join("")}
  </div>`;
  root.querySelectorAll("[data-ess]").forEach(b => b.onclick = () => showEssentialOnMap(b.dataset.ess));
  root.querySelectorAll("[data-look]").forEach(b => b.onclick = () => { const c = THAI_DESTS[+b.dataset.look]; setFocus({n:c[0], lat:c[1], lng:c[2]}); flyTo({lat:c[1], lng:c[2]}, 12.5); go("#map"); });
}

/* ---------- emergency ---------- */
const SOS = [["Police", "191", "General emergency line"], ["Tourist Police", "1155", "English-speaking help for visitors"], ["Ambulance", "1669", "Medical emergencies"], ["Fire", "199", ""]];
// Indonesia, from gov.uk "Getting help" (checked 12 Nov 2026)
const SOS_ID = [["Ambulance", "118", "Medical emergencies"], ["Police", "110", ""], ["Fire", "112", ""]];
// Cambodia: gov.uk "Getting help", checked 12 Nov 2026
const SOS_KH = [["Ambulance", "119", "Medical emergencies"], ["Police", "117", ""], ["Fire", "118", ""], ["Tourist police, Phnom Penh", "+85512942484", "Street 598. In Siem Reap the tourist police are next to the Angkor ticket office"]];
TOOL_PAGES.emergency = root => {
  const ID = S.country === "ID", KH = S.country === "KH", G = GUIDES[S.country], list = G ? G.sos : ID ? SOS_ID : KH ? SOS_KH : SOS;
  const cname = G ? G.name : ID ? "Indonesia" : KH ? "Cambodia" : "Thailand";
  root.innerHTML = toolHero("Emergency", `Numbers that work anywhere in ${cname}`) + `<div class="page">
  <section class="block">${list.map(([n, tel, d], i) => `<div class="tel"><div><b>${n}</b><small>${d}</small></div><a class="btn${i ? "" : " primary"}" href="tel:${tel}">${icon("phone","i s")}${tel}</a></div>`).join("")}
    <p class="note" style="margin-top:8px">Checked ${G ? GUIDE_NEW_CHECKED : ID ? GUIDE_ID_CHECKED : KH ? GUIDE_KH_CHECKED : GUIDE_CHECKED}. Source: <a href="https://www.gov.uk/foreign-travel-advice/${cname.toLowerCase()}/getting-help" target="_blank" rel="noopener">gov.uk, getting help in ${cname}</a>.</p></section>
  <section class="block"><h2>British nationals</h2>
    ${G ? `<p>For consular help, contact the ${G.embassies.map(e => e[0]).join(" or the ")}. If someone at home is worried about you, they can ring the Foreign Office in London, open 24 hours.</p>
    <div class="row" style="margin-top:8px">${G.embassies.map(([n, u]) => `<a class="btn small" href="${u}" target="_blank" rel="noopener">${n} ${icon("ext","i s")}</a>`).join("")}<a class="btn small" href="tel:+442070085000">${icon("phone","i s")}+44 20 7008 5000</a></div>`
    : KH ? `<p>For consular help, contact the British Embassy in Phnom Penh through the Foreign Office’s contact page. If someone at home is worried about you, they can ring the Foreign Office in London, open 24 hours.</p>
    <div class="row" style="margin-top:8px"><a class="btn small" href="https://www.contact.service.csd.fcdo.gov.uk/posts/cambodia/british-embassy-phnom-penh" target="_blank" rel="noopener">British Embassy Phnom Penh ${icon("ext","i s")}</a><a class="btn small" href="tel:+442070085000">${icon("phone","i s")}+44 20 7008 5000</a></div>`
    : ID ? `<p>For consular help, contact the British Embassy in Jakarta (its phone line is answered 24 hours) or the British Consulate in Bali. If someone at home is worried about you, they can ring the Foreign Office in London, open 24 hours.</p>
    <div class="row" style="margin-top:8px"><a class="btn small" href="https://www.gov.uk/world/organisations/british-embassy-jakarta" target="_blank" rel="noopener">British Embassy Jakarta ${icon("ext","i s")}</a><a class="btn small" href="tel:+622123565200">${icon("phone","i s")}+62 21 2356 5200</a>
      <a class="btn small" href="https://www.gov.uk/world/organisations/british-consulate-bali" target="_blank" rel="noopener">British Consulate Bali ${icon("ext","i s")}</a><a class="btn small" href="tel:+442070085000">${icon("phone","i s")}+44 20 7008 5000</a></div>`
    : `<p>For consular help, contact the British Embassy in Bangkok. If someone at home is worried about you, they can ring the Foreign Office in London, open 24 hours.</p>
    <div class="row" style="margin-top:8px"><a class="btn small" href="https://www.gov.uk/world/organisations/british-embassy-bangkok" target="_blank" rel="noopener">British Embassy Bangkok ${icon("ext","i s")}</a><a class="btn small" href="tel:+442070085000">${icon("phone","i s")}+44 20 7008 5000</a></div>`}
    <p class="note" style="margin-top:8px">Tell your travel insurer as soon as you can; most have a 24-hour number on the policy. Keep that number and your policy number somewhere you can reach offline.</p></section>
  <div class="sect"><h2>Nearest help</h2><span class="note">${esc(focusPt().none ? "" : focusLabel())}</span></div>
  <div class="scroller" style="margin-bottom:8px">${[["hospital","Hospitals",["hospital"]],["clinic","Clinics",["clinic"]],["pharmacy","Pharmacies",["pharmacy"]],["police","Police",["police"]],["embassy","Embassies",["embassy"]]].map(([id, l], i) => `<button class="chip" type="button" data-near="${id}" aria-pressed="${i === 0}">${l}</button>`).join("")}</div>
  <div id="sosBody"><div class="skel"></div></div>
  <div class="row" style="margin-top:10px"><button class="btn small" type="button" id="sosMap">${icon("map","i s")}Show these on the map</button></div>
  <p class="note" style="margin-top:10px">Listings come from OpenStreetMap and may be out of date. In a real emergency, call first.</p></div>`;
  const KINDS = {hospital:["hospital"], clinic:["clinic","dentist"], pharmacy:["pharmacy"], police:["police"], embassy:["embassy"]};
  let cur = "hospital";
  const load = () => { $("#sosBody").innerHTML = '<div class="skel"></div>'; nearestEss(KINDS[cur], cur === "embassy" ? 900 : 40, 6).then(r => essList($("#sosBody"), r, "Widen the search by picking a bigger town.")); };
  root.querySelectorAll("[data-near]").forEach(b => b.onclick = () => { cur = b.dataset.near; root.querySelectorAll("[data-near]").forEach(x => x.setAttribute("aria-pressed", x === b)); load(); });
  $("#sosMap").onclick = () => showEssentialOnMap(cur);
  load();
};

/* ---------- trip assistant: answers from the app's own data, worked out on the phone. Not a live AI. ---------- */
const DEST_ALIAS = {bkk:"Bangkok", bangkok:"Bangkok", "chiang mai":"Chiang Mai", "chiang rai":"Chiang Rai", pai:"Pai", "phi phi":"Koh Phi Phi", phiphi:"Koh Phi Phi", samui:"Koh Samui",
  phangan:"Koh Phangan", "pha ngan":"Koh Phangan", "koh tao":"Koh Tao", "ko tao":"Koh Tao", lanta:"Koh Lanta", lipe:"Koh Lipe", "koh chang":"Koh Chang", "ko chang":"Koh Chang", krabi:"Krabi Town",
  "ao nang":"Ao Nang", railay:"Railay", phuket:"Phuket", ayutthaya:"Ayutthaya", kanchanaburi:"Kanchanaburi", "khao sok":"Khao Sok", "hua hin":"Hua Hin", pattaya:"Pattaya", sukhothai:"Sukhothai"};
// every destination on the map answers to its own name too (Hoi An, Vang Vieng, Siem Reap…)
if (typeof D !== "undefined") D.cities.forEach(c => { const k = foldText(c[0]); if (!DEST_ALIAS[k]) DEST_ALIAS[k] = c[0]; });
function destsIn(text){
  const t = " " + foldText(text) + " ", hits = [];
  for (const [alias, name] of Object.entries(DEST_ALIAS)){ const i = t.indexOf(" " + alias + " "); if (i >= 0 && !hits.some(h => h.name === name)) hits.push({i, name}); }
  return hits.sort((a, b) => a.i - b.i).map(h => h.name);
}
const destNode = name => { const hub = Object.values(HUB).find(h => h.n === name && !isAir(h.id)); if (hub) return hubNode(hub.id); const c = D.cities.find(x => x[0] === name); return c ? {n:c[0], lat:c[1], lng:c[2]} : null; };
const median = xs => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const miniBtn = p => `<button type="button" data-open="${esc(p.id)}"><span>${esc(p.n)}</span><small>${esc([itemLocal(p), p.r != null ? (p.r / 2).toFixed(1) + "★" : "", p.cur_ ? "" : kindLabel(p)].filter(Boolean).join(" · "))}</small></button>`;
const asst = {log:[]};
/* ---------- the assistant's wider knowledge: every country, money, phrases, safety, the app's own tools ----------
   All from the app's own data (guides from gov.uk, researched places, the phrasebooks, today's saved exchange rates). */
const ASST_CUR = [[/\b(baht|thb|฿)\b/, "THB"], [/\b(dong|vnd|₫)\b/, "VND"], [/\b(kip|lak)\b/, "LAK"], [/\b(riel|khr)\b/, "KHR"], [/\b(rupiah|idr|rp)\b/, "IDR"],
  [/\b(sgd|singapore dollars?)\b/, "SGD"], [/\b(ringgit|myr|rm)\b/, "MYR"], [/\b(usd|us dollars?|dollars?|bucks|\$)\b/, "USD"], [/\b(euros?|eur|€)\b/, "EUR"], [/\b(pounds?|quid|gbp|£)\b/, "GBP"], [/\b(aud|aussie dollars?)\b/, "AUD"]];
const ASST_TZ = {TH:"7 hours ahead of the UK (6 in the British summer)", KH:"7 hours ahead of the UK (6 in the British summer)", VN:"7 hours ahead of the UK (6 in the British summer)",
  LA:"7 hours ahead of the UK (6 in the British summer)", SG:"8 hours ahead of the UK (7 in the British summer)", MY:"8 hours ahead of the UK (7 in the British summer)",
  ID:"7 hours ahead in Sumatra and Java, 8 in Bali and Lombok (1 less in the British summer)"};
const asstPlain = h => String(h || "").replace(/<[^>]+>/g, "");
// "tell me about …": a country named in the question, otherwise the one you're in
function asstCountry(t){
  for (const [cc, c] of Object.entries(D.countries)) if (new RegExp(" " + foldText(c.name) + " ").test(t)) return cc;
  return S.country;
}
function asstGuide(cc){ return typeof GUIDES !== "undefined" && GUIDES[cc] ? GUIDES[cc] : null; }
function asstSos(cc){
  const g = asstGuide(cc);
  const list = g && g.sos ? g.sos : cc === "ID" ? SOS_ID : cc === "KH" ? SOS_KH : SOS;
  return list.map(([n, num, note]) => `<li><b>${esc(n)}: <a href="tel:${esc(num)}">${esc(num)}</a></b>${note ? " · " + esc(note) : ""}</li>`).join("");
}
function asstMoney(t){
  const m = t.match(/(\d[\d,]*(?:\.\d+)?)\s*(k|m|thousand|million)?\s*([a-z$£€฿₫]+(?: [a-z]+)?)/);
  const pre = t.match(/([$£€฿₫])\s*(\d[\d,]*(?:\.\d+)?)/);
  let amt = null, unit = "";
  if (m){ amt = parseFloat(m[1].replace(/,/g, "")) * (/^(k|thousand)$/.test(m[2] || "") ? 1e3 : /^(m|million)$/.test(m[2] || "") ? 1e6 : 1); unit = " " + m[3] + " "; }
  else if (pre){ amt = parseFloat(pre[2].replace(/,/g, "")); unit = " " + pre[1] + " "; }
  if (amt == null || !isFinite(amt)) return null;
  const hit = ASST_CUR.find(([re]) => re.test(unit)); if (!hit) return null;
  const from = hit[1], local = (D.countries[S.country] || {}).cur || "THB";
  const gbp = toGBP(amt, from), to = from === "GBP" ? local : "GBP";
  return {amt, from, gbp, out: to === "GBP" ? `£${fmtNum(Math.round(gbp * 100) / 100)}` : money(niceRound(gbp * rate(to), to), to)};
}
function asstPhrase(t, raw){
  const m = raw.match(/(?:how (?:do|would|can) (?:i|you|we) say|what(?:'s| is) (?:the word for )?|say|translate)\s+["“']?([^"”'?]+?)["”']?(?:\s+in\s+([a-z]+))?\s*\??$/i);
  if (!m) return null;
  const want = foldText(m[1]).replace(/^(a|an|the) /, ""), lang = m[2] ? foldText(m[2]) : "";
  const cc = Object.keys(PHRASEBOOKS).find(k => foldText(PHRASEBOOKS[k].name).startsWith(lang) && lang) || S.country;
  const pb = PHRASEBOOKS[cc] || PHRASEBOOKS.TH;
  const all = pb.list.flatMap(sec => sec.p);
  const hit = all.find(p => foldText(p[0]) === want) || all.find(p => foldText(p[0]).includes(want)) || all.find(p => want.split(" ").every(w => foldText(p[0]).includes(w)));
  return {cc, pb, hit, want:m[1].trim()};
}
async function asstMore(text, t, has, act, dest){
  // money: "how much is 500 baht", "200k dong in pounds", "£20 in baht"
  if (has(/ (how much is|convert|in pounds|in gbp|worth|in baht|in dong|in kip|in rupiah|is that) /) || /^\s*[$£€฿₫]?\s*\d/.test(text)){
    const mo = asstMoney(" " + String(text).toLowerCase() + " ");
    if (mo) return `<p><b>${esc(fmtNum(mo.amt))} ${esc(mo.from)}</b> is about <b>${esc(mo.out)}</b>${mo.from !== "GBP" ? "" : ` in ${esc(CUR_NAME[(D.countries[S.country] || {}).cur] || "")}`}.</p><p class="note">At the rates saved in the app (${esc(D.rates[mo.from === "GBP" ? (D.countries[S.country] || {}).cur || "THB" : mo.from] ? D.rates[mo.from === "GBP" ? (D.countries[S.country] || {}).cur || "THB" : mo.from].note : "")}). Card and ATM rates are a little worse.</p>${act("Open the converter", "go:#tools/currency")}`;
  }
  if (has(/ (exchange rate|the rate|rates today|currency) /)){
    const cc = asstCountry(t), c = D.countries[cc], cur = c.cur;
    return `<p><b>${esc(c.name)}</b> uses the ${esc(CUR_NAME[cur] || cur)}${c.alt && c.alt.length ? ` (and ${esc(c.alt.map(a => CUR_NAME[a] || a).join(", "))})` : ""}. £1 is about <b>${esc(money(niceRound(rate(cur), cur), cur))}</b>.</p><p class="note">${esc(D.rates[cur] ? D.rates[cur].note : "")}</p>${act("Open the converter", "go:#tools/currency")}`;
  }
  // phrases: "how do I say thank you", "what's hello in Vietnamese"
  const ph = asstPhrase(t, text);
  if (ph){
    if (ph.hit) return `<p><b>${esc(ph.hit[0])}</b> in ${esc(ph.pb.name)}: <b lang="${esc(ph.pb.lang)}">${esc(ph.hit[1])}</b></p><p>Say it like: <b>${esc(ph.hit[3] || ph.hit[2])}</b></p>${act("Open the phrasebook", "go:#tools/translate")}`;
    return `<p>“${esc(ph.want)}” isn’t in the ${esc(ph.pb.name)} phrasebook, but the translator can do it (with signal).</p>${act("Open the translator", "go:#tools/translate")}`;
  }
  // per-country guide: visas, laws, safety and scams, money tips, when to go, embassies
  const cc = asstCountry(t), g = asstGuide(cc), cn = (D.countries[cc] || {}).name || "Thailand";
  const guideBits = (key, title) => g && g[key] ? `<p><b>${esc(title)} (${esc(cn)})</b></p><ul class="known">${(Array.isArray(g[key]) ? g[key] : [g[key]]).slice(0, 5).map(x => `<li>${Array.isArray(x) ? esc(x.join(": ")) : x}</li>`).join("")}</ul>` : "";
  if (has(/ (emergency|ambulance|police|fire|999|911|112) /) || has(/ (hospital|doctor) (number|phone)/)) return `<p><b>Emergency numbers in ${esc(cn)}</b></p><ul class="known">${asstSos(cc)}</ul>${act("Open Emergency", "go:#tools/emergency")}`;
  if (g && has(/ (visa|entry|passport|arrival card|immigration|how long can i stay|overstay) /)) return guideBits("entry", "Entry and visas") + `<p class="note">From gov.uk; check again before you go.</p>${act("Open the guide", "go:#tools/guide")}`;
  if (g && has(/ (law|laws|illegal|legal|allowed|banned|vape|vaping|drugs|weed|cannabis|fine|fines) /)) return guideBits("laws", "Laws that catch travellers out") + act("Open the guide", "go:#tools/guide");
  if (g && has(/ (safe|safety|scam|scams|danger|dangerous|crime|rip off|ripped off) /)) return guideBits("safety", "Staying safe") + act("Open the guide", "go:#tools/guide");
  if (g && has(/ (when to go|best time|season|rainy|dry season|monsoon) /)) return guideBits("when", "When to go") + act("Open Weather", "go:#tools/weather");
  if (g && has(/ (embassy|consulate|lost passport|stolen passport) /)) return guideBits("embassies", "The British embassy") + act("Open Emergency", "go:#tools/emergency");
  if (g && has(/ (money|cash|atm fee|card|cards|tip|tipping) /) && !has(/ (budget|how much) /)) return guideBits("money", "Money") + act("Open the converter", "go:#tools/currency");
  if (has(/ (time difference|what time|timezone|time zone|hours ahead) /)) return `<p>${esc(cn)} is <b>${esc(ASST_TZ[cc] || "ahead of the UK")}</b>.</p>`;
  if (has(/ (grab|bolt|gojek|uber|taxi app|ride app|get a taxi|get a ride|tuk tuk|tuktuk) /)) return `<p><b>Getting a ride in ${esc(cn)}</b></p><p>${esc(D.rides[cc] || D.rides.TH)}</p>${act("What should a ride cost?", "ask:how much is a taxi")}`;
  // the app's own tools
  if (has(/ (lost|cant find|can't find|where are you|help me find) /) && has(/ (i m|im|i am|we re|were|lost) /)) return `<p>Use <b>I’m lost</b> in Friends: one tap pops up an alert on all your mates’ phones with where you are, a button to call you, and your group call link.</p>${act("Open Friends", "go:#tools/friends")}`;
  if (has(/ (where are my friends|my friends|my mates|where is (sam|ben|tom|everyone)) /)) return `<p>Your friends who share their location show on the map.</p>${act("Show friends on the map", "friends:")}`;
  if (has(/ (who owes|owe|owes|split|tally|iou) /)) return `<p>${esc(typeof splitSummary === "function" ? splitSummary() : "")}</p>${act("Open Split costs", "go:#tools/split")}`;
  if (has(/ (my saved|saved places|bookmarks|favourites|favorites) /)){ const n = Object.keys(S.saved || {}).length; return `<p>You’ve saved <b>${n}</b> place${n === 1 ? "" : "s"}.</p>${act("See them", "go:#saved")}`; }
  if (has(/ (offline|no signal|no data|download|save for offline) /)) return `<p>Save a city in Offline & backup: its places, map, guide, phrasebook and saved photos then work with no signal.</p>${act("Open Offline & backup", "go:#tools/offline")}`;
  if (has(/ (passport copy|my passport|documents|my tickets|insurance|booking) /)) return `<p>Your documents (passport, tickets, insurance) are kept on this phone in Documents, and open with no signal.</p>${act("Open Documents", "go:#tools/docs")}`;
  if (has(/ (surf|waves|swell|surfing) /)) return `<p>Surf spots and today’s wave forecast are in Activities › Surf.</p>${act("Show surf spots", "surf:")}`;
  if (has(/ (drink|drinks|drinking|beer|beers|bar|bars|pub|pubs|club|clubs|clubbing|booze|boozer|cocktail|cocktails|party|nightlife|bottle shop|liquor) /)){
    const pt = focusPt();
    if (!pt.none){
      const boo = doChip("boozer"), res = await Places.near("do", pt, {maxKm:3, want:8, test:p => boo.f(p)});
      const cur = D.places.filter(p => p.c === "cool" && dist(pt, p) <= 3 && boo.f(p));
      const items = sortItems(cur.concat(res.items), "near", pt).slice(0, 6);
      if (items.length) return `<p><b>Bars, clubs and bottle shops</b> near ${esc(S.focus ? S.focus.n : "you")}:</p><div class="mini">${items.map(p => `<button type="button" data-open="${esc(p.id)}"><span>${esc(p.n || kindLabel(p))}</span><small>${esc(kindLabel(p))} · ${distShort(dist(pt, p))}</small></button>`).join("")}</div>${cc === "TH" ? `<p class="note">In Thailand, shops sell alcohol only 11am–2pm and 5pm–midnight.</p>` : ""}${act("Show the Boozer map", "boozer:")}`;
    }
    return `<p>The Boozas section shows bars, pubs, clubs and bottle shops.</p>${act("Show the Boozas map", "boozer:")}`;
  }
  // a destination: "tell me about Hoi An", "what's Pai like"
  if (dest && has(/ (tell me about|what s|what is|whats|about|like|worth|info|information) /) && typeof DEST_NOTE !== "undefined" && DEST_NOTE[dest]){
    return `<p><b>${esc(dest)}</b>: ${esc(DEST_NOTE[dest])}</p>${act(`Stays in ${dest}`, `list:gaffs:${dest}`)}${act(`Food in ${dest}`, `list:munch:${dest}`)}${act(`Things to do in ${dest}`, `list:activities:${dest}`)}${act(`Get to ${dest}`, `plan:here>${dest}`)}`;
  }
  // nearby anything the map search understands ("nearest toilet", "cheap noodles near me", "open now")
  const a = typeof parseAsk === "function" ? parseAsk(text) : null;
  if (a && (a.kind === "ess" || a.kind === "move" || has(/ (near|nearby|nearest|closest|around here|open now|close by|walking distance) /))){
    const r = await answerAsk(text).catch(() => null);
    if (r && r.items.length) return `<p><b>${esc(askTitle(r.a))}</b>${r.ref.here ? ", nearest to you" : ` around ${esc(focusLabel())}`}:</p><div class="mini">${r.items.slice(0, 6).map(({p, km}) => `<button type="button" data-open="${esc(p.id)}"><span>${esc(p.n || kindLabel(p))}</span><small>${esc(kindLabel(p))} · ${distShort(km)}</small></button>`).join("")}</div>${act("Show on the map", "maptext:" + text)}`;
  }
  // costs, times and distances, feeling rough (the same answers as the map search)
  const mi = typeof moreIntent === "function" ? moreIntent(text) : null;
  if (mi) return `<p>${esc(mi.title || "Here’s what I worked out")}</p>${act("Show the answer", "more:" + text)}`;
  return null;
}
async function assistantAnswer(text){
  const t = " " + foldText(text) + " ", has = re => re.test(t);
  const ds = destsIn(text), dest = ds[0] || (S.focus ? S.focus.n : nearestDest(focusPt(), 40)), inDest = p => p.city === dest;
  const where = dest || "Thailand";
  const act = (label, js) => `<button class="btn small" type="button" data-act="${esc(js)}">${label}</button>`;
  // journeys
  if (has(/ (get|travel|go|going|route|bus|train|ferry|fly|flight|transport) /) && (ds.length >= 2 || has(/ (from|to) /)) && ds.length){
    const toN = destNode(ds.length >= 2 ? ds[1] : ds[0]), fromN = ds.length >= 2 ? destNode(ds[0]) : fromNode();
    if (toN && fromN){
      const trips = planTrips(fromN, toN).slice(0, 3);
      if (!trips.length) return `<p>I don’t have a saved route from ${esc(fromN.n)} to ${esc(toN.n)} yet.</p>${act("Open Transport", `plan:${fromN.n}>${toN.n}`)}`;
      return `<p><b>${esc(nodeLabel(fromN).replace(" (you’re here)", ""))} to ${esc(toN.n)}</b>, ${trips.length} way${trips.length === 1 ? "" : "s"} from the saved network:</p><ul class="known">${trips.map(tr => `<li>${tr.fastest ? "<b>Fastest:</b> " : tr.cheapest ? "<b>Cheapest:</b> " : ""}${[...new Set(tr.legs.map(L => L.o.mode.toLowerCase()))].join(" + ")}, ${fRange(tr.dmin, tr.dmax)}${tr.unpriced === tr.legs.length ? ", price to check live" : `, from ${tripFrom(tr)} (£${fmtNum(tr.pmin)})`}</li>`).join("")}</ul><p class="note">Times and prices are a saved baseline. Confirm before you pay.</p>${act("See the full journeys", `plan:${fromN.id || fromN.n}>${toN.id || toN.n}`)}`;
    }
  }
  const extra = await asstMore(text, t, has, act, dest); if (extra) return extra;
  // essentials
  for (const [re, id] of [[/ (laundry|laundrette|wash my clothes|washing) /, "laundry"], [/ (atm|cash machine|cashpoint) /, "atm"], [/ (pharmacy|chemist) /, "pharmacy"], [/ (wifi|wi fi|internet) /, "wifi"],
    [/ (sim|data plan) /, "sim"], [/ (water|refill) /, "water"], [/ (supermarket|7 eleven|seven eleven|minimart) /, "shop"], [/ (toilet|loo) /, "toilet"]]){
    if (has(re)){ const e = ESS_BY_ID[id]; return `<p>I can show <b>${esc(e.l.toLowerCase())}</b> around ${esc(where)} on the map.</p>${act(`Show ${e.l} on the map`, `ess:${id}`)}`; }
  }
  if (has(/ (hospital|doctor|police|emergency|ambulance|embassy) /)) return `<p><b>Emergency numbers</b></p><ul class="known">${asstSos(S.country)}</ul>${act("Open Emergency", "go:#tools/emergency")}`;
  if (has(/ (visa|entry|passport|arrival card|tdac|immigration) /) && asstCountry(t) !== "TH") return `<p>The guide for ${esc(D.countries[asstCountry(t)].name)} has the entry rules from gov.uk.</p>${act("Open the guide", "go:#tools/guide")}`;
  if (has(/ (visa|entry|passport|arrival card|tdac|immigration) /)) return `<p>For British passports: visa-free for tourism for up to <b>30 days</b>, passport valid 6 months, and the free <b>digital arrival card (TDAC)</b> filled in online within the 3 days before you arrive. Checked ${GUIDE_CHECKED} on gov.uk; check again before you fly.</p>${act("Open the Thailand guide", "go:#tools/guide")}`;
  if (has(/ (weather|rain|hot|forecast|monsoon) /)) return `<p>The Weather tool has the forecast for ${esc(where)}.</p>${act("Open Weather", "go:#tools/weather")}`;
  // budget
  if (has(/ (budget|cost|how much|afford|spend|money) /) && !has(/ (stay|hostel|eat|food|things to do) /)){
    const dorms = D.places.filter(p => p.c === "gaff" && p.cc === "TH" && p.p && /dorm/.test(p.pu || "")).map(p => toGBP(p.p[0], p.cur) * rate("THB"));
    const meals = D.places.filter(p => p.c === "munch" && p.cc === "TH" && p.p);
    const mLo = median(meals.map(p => toGBP(p.p[0], p.cur) * rate("THB"))), mHi = median(meals.map(p => toGBP(p.p[p.p.length - 1], p.cur) * rate("THB"))), bed = median(dorms);
    const day = bed + 3 * (mLo + mHi) / 2;
    return `<p>From the prices in this app’s researched places:</p><ul class="known"><li>A dorm bed: about <b>${money(niceRound(bed, "THB"), "THB")}</b> a night (the middle of ${dorms.length} hostels checked).</li><li>A meal: about <b>${money(niceRound(mLo, "THB"), "THB")}–${fmtNum(niceRound(mHi, "THB"))}</b> (the middle of ${meals.length} food spots checked).</li></ul><p>So a bed and three meals come to roughly <b>${money(niceRound(day, "THB"), "THB")}</b> a day (£${fmtNum(toGBP(day, "THB"))}), before transport, activities and nights out. Islands cost more than the north.</p>${act("Open the Budget tool", "go:#tools/budget")}`;
  }
  // stays
  if (has(/ (stay|hostel|hostels|sleep|accommodation|gaff|gaffs|hotel|hotels|guesthouse|room) /)){
    const cur = D.places.filter(p => p.c === "gaff" && inDest(p));
    const top = sortItems(cur, "rated").filter(p => p.r != null).slice(0, 3), cheap = sortItems(cur.filter(p => p.p), "cheap").slice(0, 2).filter(p => !top.includes(p));
    if (!cur.length) return `<p>I don’t have researched places to stay in ${esc(where)}, but the map data may.</p>${act(`See stays in ${where}`, `list:gaffs:${dest || ""}`)}`;
    return `<p><b>Where to stay in ${esc(where)}</b>, from ${cur.length} researched places:</p>${top.length ? `<p class="note">Best reviewed</p><div class="mini">${top.map(miniBtn).join("")}</div>` : ""}${cheap.length ? `<p class="note">Cheapest</p><div class="mini">${cheap.map(miniBtn).join("")}</div>` : ""}${act(`See every stay in ${where}`, `list:gaffs:${dest || ""}`)}`;
  }
  // food
  if (has(/ (eat|food|restaurant|restaurants|munch|hungry|dinner|lunch|breakfast|street food|vegan|vegetarian|cafe|coffee) /)){
    if (has(/ (near|nearby|around here|close) /) && !focusPt().none){
      const pt = focusPt(), res = await Places.near("food", pt, {maxKm:2, want:5});
      const cur = D.places.filter(p => p.c === "munch" && dist(pt, p) <= 2);
      const items = sortItems(cur.concat(res.items), "near", pt).slice(0, 6);
      if (items.length) return `<p><b>Closest places to eat</b> to ${esc(S.focus ? S.focus.n : "you")}:</p><div class="mini">${items.map(p => `<button type="button" data-open="${esc(p.id)}"><span>${esc(p.n)}</span><small>${distShort(dist(pt, p))}${isOpenNow(p) ? " · " + (isOpenNow(p).open ? "open" : "closed") : ""}</small></button>`).join("")}</div>${act("See all food nearby", "list:munch:")}`;
    }
    const cur = D.places.filter(p => p.c === "munch" && inDest(p));
    const pick = (has(/ (cheap|budget|affordable) /) ? sortItems(cur.filter(p => p.p), "cheap") : cur).slice(0, 5);
    if (!pick.length) return `<p>I don’t have researched food spots in ${esc(where)}, but the map data may.</p>${act(`See food in ${where}`, `list:munch:${dest || ""}`)}`;
    return `<p><b>Where to eat in ${esc(where)}</b>, from ${cur.length} researched spots:</p><div class="mini">${pick.map(miniBtn).join("")}</div>${act(`See all food in ${where}`, `list:munch:${dest || ""}`)}`;
  }
  // things to do, and what to save
  if (has(/ (do|see|visit|activities|activity|things|attractions|sights|temple|temples|beach|beaches|save|itinerary|plan) /)){
    const cur = D.places.filter(p => p.c === "cool" && inDest(p));
    const free = cur.filter(p => /free/i.test(p.cost || "") || (p.p && p.p[0] === 0)), cheapOnes = cur.filter(p => p.p && toGBP(p.p[0], p.cur) <= 5 && !free.includes(p));
    const wantCheap = has(/ (cheap|free|affordable|budget) /);
    const pick = (wantCheap ? free.concat(sortItems(cheapOnes, "cheap")) : cur).slice(0, 6);
    if (!pick.length) return `<p>I don’t have researched things to do in ${esc(where)}${wantCheap ? " with a checked low price" : ""}, but the map data may.</p>${act(`See activities in ${where}`, `list:activities:${dest || ""}`)}`;
    return `<p><b>${wantCheap ? "Free and cheap things" : "Things"} to do in ${esc(where)}</b>, from ${cur.length} researched ideas. Tap one to read more, and use its bookmark to save it:</p><div class="mini">${pick.map(miniBtn).join("")}</div>${act(`See everything in ${where}`, `list:activities:${dest || ""}`)}`;
  }
  return `<p>I can answer from this app’s own data. Try asking:</p><ul class="known"><li>Where should I stay in Hoi An?</li><li>How do I get from Bangkok to Luang Prabang?</li><li>How much is 500,000 dong in pounds?</li><li>How do I say thank you in Vietnamese?</li><li>Do I need a visa for Laos?</li><li>Is vaping legal in Singapore?</li><li>Emergency numbers</li><li>Where can I get a drink near here?</li><li>Nearest toilet</li><li>How much should a taxi cost?</li><li>I’ve got a hangover</li><li>Tell me about Kampot</li><li>Who owes who?</li><li>Things to do in Ubud</li></ul>`;
}
TOOL_PAGES.assistant = root => {
  const chips = ["Where should I stay in Chiang Mai?", "How do I get from Bangkok to Hanoi?", "How much is 1000 baht in pounds?", "How do I say thank you?", "Where can I get a drink near here?", "Nearest toilet", "Is it safe here?", "Do I need a visa for Vietnam?", "Emergency numbers", "I’ve got a hangover"];
  root.innerHTML = toolHero("Trip assistant", "Quick answers from this app’s own data") + `<div class="page">
    <div class="callout">${icon("info")}<div><b>This is not a live AI chatbot.</b> It works out answers on your phone from the app’s researched places, journey planner and map data, so it works offline and never makes up a business or a price.</div></div>
    <div class="chat" id="chat" aria-live="polite">${asst.log.map(m => `<div class="msg ${m.who}">${m.html}</div>`).join("")}</div>
    ${asst.log.length ? "" : `<div class="row" id="asstChips">${chips.map((c, i) => `<button class="chip" type="button" data-q="${i}" style="height:auto;min-height:34px;white-space:normal;text-align:left;padding:6px 10px">${esc(c)}</button>`).join("")}</div>`}
    <form class="ask" id="askForm"><input type="text" id="askIn" autocomplete="off" enterkeyhint="send" placeholder="Ask about stays, food, journeys, money, visas…" aria-label="Your question"><button class="btn primary" type="submit" aria-label="Ask">${icon("send","i s")}</button></form></div>`;
  const ask = async text => {
    text = text.trim(); if (!text) return;
    asst.log.push({who:"me", html:esc(text)}); renderPage();
    let html; try { html = await assistantAnswer(text); } catch(e){ html = "<p>Sorry, I couldn’t work that one out.</p>"; }
    asst.log.push({who:"bot", html}); if (asst.log.length > 40) asst.log.splice(0, asst.log.length - 40);
    if (ui.view === "tools" && ui.sub === "assistant"){ renderPage(); const p = $("#pageview"); p.scrollTop = p.scrollHeight; }
  };
  $("#askForm").onsubmit = e => { e.preventDefault(); const v = $("#askIn").value; $("#askIn").value = ""; ask(v); };
  root.querySelectorAll("[data-q]").forEach(b => b.onclick = () => ask(chips[+b.dataset.q]));
  root.querySelectorAll("[data-act]").forEach(b => b.onclick = () => asstAct(b, ask));
};

// what a button in an assistant answer does (the Trip assistant page, and answers in the map search)
function asstAct(b, ask){
  const [kind, a, c] = b.dataset.act.split(":");
  if (kind === "go") go(a + (c ? ":" + c : ""));
  else if (kind === "ess") showEssentialOnMap(a);
  else if (kind === "list"){ if (c){ const d = D.cities.find(x => x[0] === c); if (d) setFocus({n:d[0], lat:d[1], lng:d[2]}); } go("#" + a); }
  else if (kind === "plan"){ const [f, t] = b.dataset.act.slice(5).split(">"); const node = x => HUB[x] ? hubNode(x) : destNode(x); ui.tp.from = f === "here" || (f === "bkk" && !ui.tp.from) ? null : node(f); ui.tp.to = node(t); ui.tp.sel = 0; ui.tp.go = !!ui.tp.to; go("#tools/transport"); }
  else if (kind === "friends") openFriendsMap();
  else if (kind === "surf") openSurfMap();
  else if (kind === "boozer"){ ui.mapCats = new Set(["cool"]); ui.doKinds = new Set(["boozer"]); ui.essKinds.clear(); ui.mapSaved = false; ui.mapMode = "map"; go("#map"); }
  else if (kind === "maptext" || kind === "more"){ const q = b.dataset.act.slice(kind.length + 1); if (kind === "more") showMore(q, moreIntent(q)); else showAnswer(q); }
  else if (kind === "ask") ask(b.dataset.act.slice(4));
}

/* ---------- deals: there is no free, legitimate deals feed, so this page says so and points to the real ones ---------- */
TOOL_PAGES.deals = root => {
  const pt = focusPt();
  const free = D.places.filter(p => p.c === "cool" && p.cc === "TH" && (/^free/i.test(p.cost || "") || (p.p && p.p[0] === 0)));
  const near = pt.none ? free.slice(0, 6) : sortItems(free, "near", pt).slice(0, 6);
  const L = [["Hostelworld deals", "https://www.hostelworld.com/deals", "Hostel discounts"], ["Booking.com deals", "https://www.booking.com/dealspage.html", "Hotels and guesthouses"], ["Agoda deals", "https://www.agoda.com/deals", "Strong coverage in Thailand"], ["12Go", "https://12go.asia/en", "Bus, train and ferry tickets"]];
  root.innerHTML = toolHero("Deals", "Genuine offers only") + `<div class="page">
    <div class="callout">${icon("info")}<div><b>The app has no live deals feed.</b> There is no free, legitimate source of travel deals it could show, and it won’t invent discounts. These are the pages where the booking sites post their own current offers.</div></div>
    <div class="tgrid">${L.map(([n, u, d], i) => `<a class="tool ${i % 2 ? "alt" : ""}" href="${u}" target="_blank" rel="noopener"><span class="ti">${icon("tag")}</span><span><b>${n}</b><small>${d}</small></span></a>`).join("")}</div>
    <div class="sect"><h2>Free things to do${pt.none ? "" : " near " + esc(S.focus ? S.focus.n : "you")}</h2><span class="note">${free.length} researched</span></div>
    ${near.length ? `<div class="cards" style="margin-top:0">${near.map(p => placeCard(p, pt)).join("")}</div>` : emptyBlock("None saved here yet", "<div>Check Activities for ideas.</div>")}
    <p class="note" style="margin-top:10px">Free entry was checked when each place was researched. Confirm on the day.</p></div>`;
  watchCardPhotos(root);
};
