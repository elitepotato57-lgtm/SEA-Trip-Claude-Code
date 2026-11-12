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
TOOL_PAGES.wifi = root => {
  root.innerHTML = toolHero("Wi-Fi finder", `Places with Wi-Fi around ${focusPt().none ? "you" : focusLabel()}`) + `<div class="page">
    <div class="row" style="margin-bottom:10px"><button class="btn primary" type="button" id="wfMap">${icon("map","i s")}Show Wi-Fi on the map</button></div>
    <div id="wfBody"><div class="skel"></div></div>
    <p class="note" style="margin-top:10px">These are cafés, hostels, coworking spaces and other places that mappers have recorded as having Wi-Fi. The app doesn’t know passwords or speeds, and “free” means free for customers unless it says otherwise. Ask at the counter.</p></div>`;
  $("#wfMap").onclick = () => showEssentialOnMap("wifi");
  nearestEss(["wifi", "cowork"], 10, 12).then(r => essList($("#wfBody"), r, "Try another area, or look for cafés in Munch."));
};

/* ---------- Thailand guide ---------- */
const GUIDE_CHECKED = "10 Nov 2026";
const DEST_NOTE = {Bangkok:"The capital: temples, street food, markets, nightlife, and the hub for trains, buses and flights.", "Chiang Mai":"Northern city with an old walled centre, temples, cooking classes and mountain day trips.",
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
TOOL_PAGES.guide = root => (S.country === "ID" ? guideID : guideTH)(root);

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
TOOL_PAGES.emergency = root => {
  const ID = S.country === "ID", list = ID ? SOS_ID : SOS;
  root.innerHTML = toolHero("Emergency", `Numbers that work anywhere in ${ID ? "Indonesia" : "Thailand"}`) + `<div class="page">
  <section class="block">${list.map(([n, tel, d], i) => `<div class="tel"><div><b>${n}</b><small>${d}</small></div><a class="btn${i ? "" : " primary"}" href="tel:${tel}">${icon("phone","i s")}${tel}</a></div>`).join("")}
    <p class="note" style="margin-top:8px">Checked ${ID ? GUIDE_ID_CHECKED : GUIDE_CHECKED}. Source: <a href="https://www.gov.uk/foreign-travel-advice/${ID ? "indonesia" : "thailand"}/getting-help" target="_blank" rel="noopener">gov.uk, getting help in ${ID ? "Indonesia" : "Thailand"}</a>.</p></section>
  <section class="block"><h2>British nationals</h2>
    ${ID ? `<p>For consular help, contact the British Embassy in Jakarta (its phone line is answered 24 hours) or the British Consulate in Bali. If someone at home is worried about you, they can ring the Foreign Office in London, open 24 hours.</p>
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
function destsIn(text){
  const t = " " + foldText(text) + " ", hits = [];
  for (const [alias, name] of Object.entries(DEST_ALIAS)){ const i = t.indexOf(" " + alias + " "); if (i >= 0 && !hits.some(h => h.name === name)) hits.push({i, name}); }
  return hits.sort((a, b) => a.i - b.i).map(h => h.name);
}
const destNode = name => { const hub = Object.values(HUB).find(h => h.n === name && !isAir(h.id)); if (hub) return hubNode(hub.id); const c = D.cities.find(x => x[0] === name); return c ? {n:c[0], lat:c[1], lng:c[2]} : null; };
const median = xs => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const miniBtn = p => `<button type="button" data-open="${esc(p.id)}"><span>${esc(p.n)}</span><small>${esc([itemLocal(p), p.r != null ? (p.r / 2).toFixed(1) + "★" : "", p.cur_ ? "" : kindLabel(p)].filter(Boolean).join(" · "))}</small></button>`;
const asst = {log:[]};
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
      return `<p><b>${esc(nodeLabel(fromN).replace(" (you’re here)", ""))} to ${esc(toN.n)}</b>, ${trips.length} way${trips.length === 1 ? "" : "s"} from the saved network:</p><ul class="known">${trips.map(tr => `<li>${tr.fastest ? "<b>Fastest:</b> " : tr.cheapest ? "<b>Cheapest:</b> " : ""}${[...new Set(tr.legs.map(L => L.o.mode.toLowerCase()))].join(" + ")}, ${fRange(tr.dmin, tr.dmax)}${tr.unpriced === tr.legs.length ? ", price to check live" : `, from ${thb(tr.pmin)} (£${fmtNum(tr.pmin)})`}</li>`).join("")}</ul><p class="note">Times and prices are a saved baseline. Confirm before you pay.</p>${act("See the full journeys", `plan:${fromN.id || fromN.n}>${toN.id || toN.n}`)}`;
    }
  }
  // essentials
  for (const [re, id] of [[/ (laundry|laundrette|wash my clothes|washing) /, "laundry"], [/ (atm|cash machine|cashpoint) /, "atm"], [/ (pharmacy|chemist) /, "pharmacy"], [/ (wifi|wi fi|internet) /, "wifi"],
    [/ (sim|data plan) /, "sim"], [/ (water|refill) /, "water"], [/ (supermarket|7 eleven|seven eleven|minimart) /, "shop"], [/ (toilet|loo) /, "toilet"]]){
    if (has(re)){ const e = ESS_BY_ID[id]; return `<p>I can show <b>${esc(e.l.toLowerCase())}</b> around ${esc(where)} on the map.</p>${act(`Show ${e.l} on the map`, `ess:${id}`)}`; }
  }
  if (has(/ (hospital|doctor|police|emergency|ambulance|embassy) /)) return `<p>In an emergency: <b>Police 191</b>, <b>Tourist Police 1155</b> (English), <b>Ambulance 1669</b>.</p>${act("Open Emergency", "go:#tools/emergency")}`;
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
  return `<p>I can answer from this app’s own data. Try asking:</p><ul class="known"><li>Where should I stay in Chiang Mai?</li><li>What are affordable things to do in Bangkok?</li><li>How can I travel from Bangkok to Krabi?</li><li>What restaurants are nearby?</li><li>How much should I budget?</li><li>Where can I do laundry?</li></ul>`;
}
TOOL_PAGES.assistant = root => {
  const chips = ["Where should I stay in Chiang Mai?", "Affordable things to do in Bangkok", "How can I travel from Bangkok to Krabi?", "What restaurants are nearby?", "How much should I budget?", "Which places should I save?"];
  root.innerHTML = toolHero("Trip assistant", "Quick answers from this app’s own data") + `<div class="page">
    <div class="callout">${icon("info")}<div><b>This is not a live AI chatbot.</b> It works out answers on your phone from the app’s researched places, journey planner and map data, so it works offline and never makes up a business or a price.</div></div>
    <div class="chat" id="chat" aria-live="polite">${asst.log.map(m => `<div class="msg ${m.who}">${m.html}</div>`).join("")}</div>
    ${asst.log.length ? "" : `<div class="row" id="asstChips">${chips.map((c, i) => `<button class="chip" type="button" data-q="${i}" style="height:auto;min-height:34px;white-space:normal;text-align:left;padding:6px 10px">${esc(c)}</button>`).join("")}</div>`}
    <form class="ask" id="askForm"><input type="text" id="askIn" autocomplete="off" enterkeyhint="send" placeholder="Ask about stays, food, journeys…" aria-label="Your question"><button class="btn primary" type="submit" aria-label="Ask">${icon("send","i s")}</button></form></div>`;
  const ask = async text => {
    text = text.trim(); if (!text) return;
    asst.log.push({who:"me", html:esc(text)}); renderPage();
    let html; try { html = await assistantAnswer(text); } catch(e){ html = "<p>Sorry, I couldn’t work that one out.</p>"; }
    asst.log.push({who:"bot", html}); if (asst.log.length > 40) asst.log.splice(0, asst.log.length - 40);
    if (ui.view === "tools" && ui.sub === "assistant"){ renderPage(); const p = $("#pageview"); p.scrollTop = p.scrollHeight; }
  };
  $("#askForm").onsubmit = e => { e.preventDefault(); const v = $("#askIn").value; $("#askIn").value = ""; ask(v); };
  root.querySelectorAll("[data-q]").forEach(b => b.onclick = () => ask(chips[+b.dataset.q]));
  root.querySelectorAll("[data-act]").forEach(b => b.onclick = () => {
    const [kind, a, c] = b.dataset.act.split(":");
    if (kind === "go") go(a + (c ? ":" + c : ""));
    else if (kind === "ess") showEssentialOnMap(a);
    else if (kind === "list"){ if (c){ const d = D.cities.find(x => x[0] === c); if (d) setFocus({n:d[0], lat:d[1], lng:d[2]}); } go("#" + a); }
    else if (kind === "plan"){ const [f, t] = b.dataset.act.slice(5).split(">"); const node = x => HUB[x] ? hubNode(x) : destNode(x); ui.tp.from = f === "bkk" && !ui.tp.from ? null : node(f); ui.tp.to = node(t); ui.tp.sel = 0; go("#tools/transport"); }
  });
};

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
