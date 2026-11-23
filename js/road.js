/* ============================================================
   Life on the road (Phase 4; every part is an experiment, off by default): Fair price, Heads-ups (scams), Events on our
   route, Arrival mode, Trip journal, and our own three: Leave by, Visa countdown and Meet-up spot.
   Every fact comes from the source named next to it (read 23 Nov 2026); nothing here is a guess.
   Loaded after detail.js (it adds a button to the place sheet) and before boot.js.
   ============================================================ */

// the grouped Tools page (experiment tools-groups) lists tiles by id: the new tools join "Right now" and "Our trip" (hidden ones are skipped)
TOOL_GROUPS[0][1].push("fair", "headsup", "visa");
TOOL_ORDER.splice(TOOL_ORDER.indexOf("developer"), 0, "fair", "headsup", "events", "journal", "visa");      // Developer stays last
TOOL_GROUPS[1][1].push("events", "journal");
// the stop on our route (or any planner stop) you're in: within an island's radius, or 25 km of a town
function stopAt(pt){
  if (!pt || pt.lat == null) return null;
  let best = null, bk = 1e9;
  Object.values(HUB).forEach(h => { if (isAirport(h.id)) return; const k = dist(pt, h); if (k < bk){ bk = k; best = h; } });
  return best && bk <= (best.island ? (ISLAND_R[best.id] || 8) : 25) ? best.id : null;
}
const herePt = () => userLoc || (S.focus ? focusPt() : null);
const srcLink = s => `<a href="${esc(s[1])}" target="_blank" rel="noopener">${esc(s[0])}</a>`;
const ROUTE_STOPS = ["bkk", "cnx", "pai", "tao", "phangan", "samui", "aonang", "krabi", "phiphi", "phuket", "rep", "pnh", "sgn", "dad", "hoian", "han"];

/* ---------- 14. Fair price ---------- */
EXPERIMENTS.push({id:"fair-price", n:"Fair price check", d:"Tools › Fair price: type or say an item (tuk-tuk 3 km, beer in a bar, massage, scooter a day) for the usual price where you are, with sources."});
// [what, words that ask for it, {country: [usual price, Wikivoyage page]}]; rides and scooters come from the transport data
const FAIR = [
  {k:"massage", l:"Massage", re:/massag/, by:{
    TH:["250–400 baht for a two-hour massage at a proper shop (Bangkok). Shops with therapists working on feet in view at the door are the legitimate kind.", "Bangkok"],
    KH:["About US$15–16 for an hour of Khmer massage (Siem Reap).", "Siem_Reap"]}},
  {k:"beer", l:"Beer in a bar", re:/beer|chang|leo\b|singha|angkor|bia|pint|drink/, by:{
    TH:["Chang about 60 baht and a large Leo about 85 in Chiang Mai bars. Bars with a ‘show’ charge 1,000 baht or more for it.", "Chiang_Mai"],
    KH:["Draught Angkor US$0.50–0.75; cans of other beers US$1–2 (Siem Reap).", "Siem_Reap"],
    VN:["Bia hơi (fresh draught) under 5,000 dong in Hanoi; about 30,000 dong for a beer in Hoi An.", "Hanoi"]}},
  {k:"laundry", l:"Laundry", re:/laundr|washing/, by:{
    TH:["About 30 baht a kilo (Chiang Mai).", "Chiang_Mai"],
    KH:["About US$1 a kilo, US$3 a kilo for 3-hour service (Siem Reap, 2020).", "Siem_Reap"]}},
  {k:"food", l:"Street food", re:/street food|food|dish|noodle|pad thai|pho\b|meal|eat|lunch|dinner/, by:{
    TH:["Simple Thai dishes at street stalls about 30 baht (Bangkok); night-market meals from 40 baht (Koh Phangan).", "Bangkok"],
    VN:["A bowl of noodle soup 40,000–60,000 dong (Hanoi, June 2024).", "Hanoi"]}},
  {k:"sim", l:"SIM card", re:/\bsim\b|data|esim/, by:{
    KH:["SIM cards from US$2 on most main streets (Phnom Penh).", "Phnom_Penh"]}},
  {k:"scooter", l:"Scooter for a day", re:/scooter|motorbike|moped|bike/},
  {k:"ride", l:"Taxi or tuk-tuk", re:/tuk|taxi|grab|bolt|ride|cab|moto|songthaew|lift/}
];
const FAIR_EXAMPLES = ["Tuk-tuk 3 km", "Beer in a bar", "Massage", "Scooter a day", "Laundry", "Street food"];
// {item, lines:[{h, t, src, est}]} for a question, at a place (or null when we don't know the item)
function fairAnswer(q, at){
  const s = foldText(q || "");
  const it = FAIR.find(f => f.re.test(s)); if (!it) return null;
  const cc = (at && ccAt(at.lat, at.lng)) || S.country, stop = stopAt(at), lines = [];
  if (it.k === "ride"){
    const m = /(\d+(?:\.\d+)?)\s*(?:km|k\b|kilomet)/.exec(s), km = m ? +m[1] : 3;
    fareEstimates(km, at || HUB.bkk).forEach(f => lines.push({h:f.label, t:f.lo != null ? `${rangeText([f.lo, f.hi], f.cur)} for ${km} km` : "", n:f.note, src:f.src || null, est:f.lo != null}));
    if (stop && TOWN[stop]) TOWN[stop].i.filter(x => /taxi|tuk|songthaew|moto|grab/i.test(x[1])).forEach(x => lines.push({h:`${x[1]} in ${HUB[stop].n}`, t:x[2], src:WV(TOWN[stop].w)}));
  } else if (it.k === "scooter"){
    const towns = stop && TOWN[stop] ? [stop] : ROUTE_STOPS.filter(id => TOWN[id] && nodeCc(HUB[id]) === cc);
    towns.forEach(id => TOWN[id].i.filter(x => /scooter|bicycle/i.test(x[1])).forEach(x => lines.push({h:`${x[1]}, ${HUB[id].n}`, t:x[2], src:WV(TOWN[id].w)})));
  } else {
    const r = it.by[cc]; if (r) lines.push({h:it.l, t:r[0], src:WV(r[1])});
  }
  return {item:it, cc, stop, lines};
}
function fairHTML(a){
  if (!a) return `<p class="note">Try one of these: ${FAIR_EXAMPLES.join(", ")}.</p>`;
  if (!a.lines.length) return emptyBlock(`No sourced price for ${a.item.l.toLowerCase()} in ${(D.countries[a.cc] || {name:"this country"}).name} yet`, `<div>We only show prices a source gives. Ask at your hostel, or compare two or three places.</div>`);
  return `<div class="fair-res">${a.lines.map(x => `<div class="fair-row"><b>${esc(x.h)}</b>${x.t ? `<div>${esc(x.t)}${x.est ? ' <span class="tag">est.</span>' : ""}</div>` : ""}${x.n ? `<div class="note">${esc(x.n)}</div>` : ""}${x.src ? `<div class="note">${Array.isArray(x.src[0]) ? x.src.map(srcLink).join(", ") : srcLink(x.src)}</div>` : ""}</div>`).join("")}</div>
    <p class="note">The usual price from the source, not a quote: prices rise in high season and in tourist spots. Fares marked est. are worked out from the Bangkok meter or app fares.</p>`;
}
TOOLS.push({id:"fair", l:"Fair price", d:"What things usually cost here", ic:"tag", get hidden(){ return !exp("fair-price"); }});
TOOL_PAGES.fair = (root, arg) => {
  const at = herePt();
  root.innerHTML = hero({title:"Fair price", sub:"Is that a fair price? The usual price where you are", back:"#tools"}) + `<div class="page">
    <div class="block"><label class="field">What are you paying for?<input id="fairQ" type="search" enterkeyhint="search" autocomplete="off" placeholder="Tuk-tuk 3 km, beer, massage…" value="${esc(decodeURIComponent(arg || ""))}"></label>
      <div class="scroller fair-chips" style="margin-top:8px">${FAIR_EXAMPLES.map(x => `<button class="chip" type="button" data-fq="${esc(x)}">${esc(x)}</button>`).join("")}</div>
      ${typeof listen === "function" ? `<button class="btn small" type="button" id="fairMic" style="margin-top:8px">${icon("speaker","i s")}Say it</button>` : ""}</div>
    <div id="fairOut"></div>
    <p class="note">${at ? `Where you are: ${esc(stopAt(at) ? HUB[stopAt(at)].n : (D.countries[ccAt(at.lat, at.lng) || S.country] || {}).name || "")}.` : `No location yet, so it uses ${esc(D.countries[S.country].name)}.`}</p></div>`;
  const out = $("#fairOut"), q = $("#fairQ");
  const show = () => { out.innerHTML = q.value.trim() ? fairHTML(fairAnswer(q.value, herePt())) : fairHTML(null); };
  q.oninput = show; show();
  root.querySelectorAll("[data-fq]").forEach(b => b.onclick = () => { q.value = b.dataset.fq; show(); });
  const mic = $("#fairMic"); if (mic) mic.onclick = () => listen(t => { q.value = t; show(); }, t => { if (t){ q.value = t; show(); } });
};

/* ---------- 15. Heads-ups: scams per stop ---------- */
EXPERIMENTS.push({id:"headsup", n:"Scams and heads-ups", d:"Tools › Heads-ups: the known scams at each stop on our route (gem scam, “it’s closed today”, jet-ski damage, taxis without the meter), from Wikivoyage."});
const HEADSUP = {
  bkk:{w:"Bangkok", i:[
    ["The gem scam", "Tuk-tuk ‘tours’ for as little as 10 baht end at gem and souvenir shops, and the ‘gems’ are near-worthless. If it happens, while you’re still in Thailand call the Tourist Police (1155) and go back for a refund: shops must return 80% by law."],
    ["“It’s closed today”", "A friendly English speaker at a sight says it’s closed and offers a better plan. Temples are almost always open and free (except Wat Phra Kaeo and Wat Pho): walk on."],
    ["Taxis without the meter", "Hail a moving taxi on the main road, away from the tourist spots, or use Grab or Bolt."],
    ["‘VIP’ buses from tourist areas", "Cheap ‘direct VIP’ trips can turn into three or four minibus changes. Book Transport Co. buses at the main terminals."]]},
  cnx:{w:"Chiang_Mai", i:[["Gem and tuk-tuk scams", "The Bangkok gem and tuk-tuk scams have reached Chiang Mai: say no to cheap tuk-tuk tours and pushy gem sellers."]]},
  tao:{w:"Ko_Tao", i:[["Scooter ‘damage’", "Some rental shops keep your passport, then charge large sums for scratches that were already there (mostly on or near the ‘Up Road’ from Mae Haad). Photograph the bike before you ride."]]},
  phangan:{w:"Ko_Pha_Ngan", i:[
    ["Overpriced SIM cards", "Some places sell ‘internet’ SIMs at 100 baht plus 230 for the data: buy from the networks’ own shops."],
    ["Dogs on the back roads", "Packs of territorial dogs on the smaller roads; a bite means getting to Bangkok for jabs."]]},
  samui:{w:"Ko_Samui", i:[["Rides home after a night out", "From Chaweng, Bophut and Lamai, taxi and motorbike-taxi drivers tend to overcharge: agree the price first."], ["Scooter rental", "Rent only from a reputable company: there have been reports of scams."]]},
  phuket:{w:"Phuket", i:[["Jet-ski ‘damage’", "When you bring a jet ski back, the owner ‘finds’ damage and demands money for it. Best not to hire one."]]},
  rep:{w:"Siem_Reap", i:[["Fake and torn dollars", "Fake dollar notes are common, even from ATMs, and notes with the tiniest tear get refused. Change big notes into $10s and $20s at a bank."]]},
  pnh:{w:"Phnom_Penh", i:[
    ["Bag and phone snatching", "Keep phones and bags in the middle of a tuk-tuk, not on the side by the road."],
    ["Fake monks", "Real monks don’t go round begging from tourists."],
    ["The friendly invitation", "A group strikes up a chat, mentions a relative moving to your country and invites you home for dinner: it’s a set-up. Say no."]]},
  han:{w:"Hanoi", i:[["Taxi tricks", "Crooked meters and roundabout routes happen: use Grab (fixed fares) or insist on the meter."]]}
};
function headsupHTML(id, title = true){
  const H = HEADSUP[id]; if (!H) return "";
  return `<div class="hu">${title ? `<h3>${esc(HUB[id].n)}</h3>` : ""}<ul class="known">${H.i.map(x => `<li><b>${esc(x[0])}</b>: ${esc(x[1])}</li>`).join("")}</ul>
    <p class="note">From ${srcLink(WV(H.w))}.</p></div>`;
}
TOOLS.push({id:"headsup", l:"Heads-ups", d:"Scams to know at each stop", ic:"alert", get hidden(){ return !exp("headsup"); }});
TOOL_PAGES.headsup = root => {
  const here = stopAt(herePt()), ids = ROUTE_STOPS.filter(id => HEADSUP[id]).sort((a, b) => (b === here) - (a === here));
  root.innerHTML = hero({title:"Heads-ups", sub:"Scams and things to know, stop by stop", back:"#tools"}) + `<div class="page">
    ${here && HEADSUP[here] ? `<p class="note">You’re in ${esc(HUB[here].n)}: its heads-ups are first.</p>` : ""}
    ${ids.map(id => `<div class="block">${headsupHTML(id)}</div>`).join("")}
    <p class="note">In trouble in Thailand: Tourist Police 1155. Every country’s numbers are in Tools › Emergency.</p></div>`;
};

/* ---------- 16. Events on our route ---------- */
EXPERIMENTS.push({id:"events", n:"Events on our route", d:"Tools › Events: Full Moon Parties, New Year’s Eve and other dates along our route from now to February, marked “check before you go” where dates move."});
const EVENTS = [
  {d:"2026-12-05", p:"Bangkok", t:"Father’s Day (the late King’s birthday)", x:"Ratchadamri Road and the Grand Palace are decorated and lit up.", src:[WV("Bangkok")]},
  {d:"2026-12-23", e:"2026-12-24", p:"Hoi An", t:"Full moon: no motorbikes in the Old Town", x:"Motorbikes are kept out of the Old Town on the 14th and 15th days of each lunar month.", src:[WV("Hoi_An")], move:true},
  {d:"2026-12-24", p:"Koh Phangan", t:"Full Moon Party, Haad Rin", x:"All night on Haad Rin beach; 200 baht entry at the gate. The boats and rooms fill up around it: book ahead.", src:[FMP_SRC, WV("Ko_Pha_Ngan")], move:true},
  {d:"2026-12-31", p:"Koh Phangan", t:"New Year countdown Full Moon Party", x:"The second party in December, for New Year’s Eve; 200 baht entry.", src:[FMP_SRC], move:true},
  {d:"2026-12-31", p:"Bangkok", t:"New Year’s Eve fireworks", x:"A huge fireworks display at the Ratchaprasong intersection.", src:[WV("Bangkok")]},
  {d:"2027-01-21", e:"2027-01-22", p:"Hoi An", t:"Full moon: no motorbikes in the Old Town", x:"The 14th and 15th days of the lunar month.", src:[WV("Hoi_An")], move:true},
  {d:"2027-01-22", p:"Koh Phangan", t:"Full Moon Party, Haad Rin", x:"200 baht entry; book boats and rooms ahead.", src:[FMP_SRC], move:true},
  {d:"2027-02-22", p:"Koh Phangan", t:"Full Moon Party, Haad Rin", x:"200 baht entry (21 February is Makha Bucha Day, a Buddhist holiday).", src:[FMP_SRC], move:true},
  {d:"2027-01-25", e:"2027-02-20", p:"Vietnam", t:"Tết (Vietnamese New Year) falls in this window", x:"Usually between late January and 20 February. Trains and buses sell out, and many places close for a few days: book ahead, and check the exact date.", src:[WV("Hanoi"), S61_VN], move:true}
];
function eventsHTML(today = todayISO()){
  const fmtD = e => fmtDay(e.d) + (e.e ? "–" + fmtDay(e.e) : "");
  return EVENTS.slice().sort((a, b) => a.d.localeCompare(b.d)).map(e => { const past = (e.e || e.d) < today;
    return `<div class="ev ${past ? "past" : ""}"><div class="ev-d">${esc(fmtD(e))}</div><div><b>${esc(e.t)}</b> <span class="note">${esc(e.p)}</span>
      <div>${esc(e.x)}</div>${e.move ? '<span class="tag warn">Dates can move: check before you go</span>' : ""}${past ? '<span class="tag">Past</span>' : ""}
      <div class="note">${e.src.map(srcLink).join(", ")}</div></div></div>`; }).join("");
}
TOOLS.push({id:"events", l:"Events", d:"Full moons, New Year, festivals", ic:"calendar", get hidden(){ return !exp("events"); }});
TOOL_PAGES.events = root => {
  root.innerHTML = hero({title:"Events on our route", sub:"From now to February", back:"#tools"}) + `<div class="page"><div class="block">${eventsHTML()}</div>
    <p class="note">Only dates a source gives. Full Moon Party dates are set locally and move for Buddhist holidays; lunar dates are worked out from the full moon.</p></div>`;
};

/* ---------- 17. Arrival mode ---------- */
EXPERIMENTS.push({id:"arrival", n:"Arrival mode", d:"The first time you’re in a new stop, a card shows how to get into town, a fair fare, the nearest ATM, SIM shop and 7-Eleven, and the local heads-ups."});
// the ways into town from an airport hub next to this stop (the saved links, with their prices)
function intoTown(id){
  return NET.edges.filter(e => (e.a === id && isAirport(e.b)) || (e.b === id && isAirport(e.a))).map(e => ({mode:e.mode, op:e.op, p:e.p ? rangeText(e.p, e.cur) : null, dur:fRange(e.dur[0], e.dur[1]), from:HUB[isAirport(e.a) ? e.a : e.b].n}));
}
function arrivalHTML(id){
  const into = intoTown(id), fare = fareEstimates(5, HUB[id])[0];
  return `<div class="sheet-head"><h2 id="arr-title" style="margin:0">Welcome to ${esc(HUB[id].n)}</h2><button class="icon-btn" data-close aria-label="Close">${icon("x")}</button></div>
    ${into.length ? `<div class="block"><h3>Getting into town</h3><ul class="known">${into.map(x => `<li><b>${esc(x.mode)}</b> from ${esc(x.from)}: ${esc(x.op)}, ${esc(x.dur)}${x.p ? ", " + esc(x.p) : ""}</li>`).join("")}</ul></div>` : ""}
    ${TOWN[id] ? `<div class="block"><h3>Getting around</h3><ul class="known">${TOWN[id].i.map(x => `<li><b>${esc(x[1])}</b>: ${esc(x[2])}</li>`).join("")}</ul><p class="note">From ${srcLink(WV(TOWN[id].w))}.</p></div>` : ""}
    ${fare && fare.lo != null ? `<div class="block"><h3>A fair fare</h3><p>${esc(fare.label)}, 5 km: about ${esc(rangeText([fare.lo, fare.hi], fare.cur))} <span class="tag">est.</span></p><p class="note">${esc(fare.note)}</p></div>` : ""}
    <div class="block"><h3>Nearest</h3><div id="arrNear"><p class="note">Looking…</p></div></div>
    ${HEADSUP[id] ? `<div class="block"><h3>Heads-ups</h3>${headsupHTML(id, false)}</div>` : ""}`;
}
async function paintArrivalNear(at){
  const el = $("#arrNear"); if (!el) return;
  const want = [["atm", "ATM"], ["sim", "SIM card shop"], ["shop", "7-Eleven or minimart"]];
  const rows = await Promise.all(want.map(async ([e, l]) => {
    const kinds = ESS_BY_ID[e].kinds, test = e === "shop" ? (p => kinds.includes(p.k) && /7-?eleven|seven/i.test(p.n || "")) : (p => kinds.includes(p.k));
    let r = await Places.nearest("ess", at, {test, maxKm:5}).catch(() => null);
    if (e === "shop" && (!r || !r.p)) r = await Places.nearest("ess", at, {test:p => kinds.includes(p.k), maxKm:5}).catch(() => null);
    return [l, r && r.p ? r : null];
  }));
  if (!el.isConnected) return;
  el.innerHTML = `<ul class="known">${rows.map(([l, r]) => `<li><b>${esc(l)}</b>: ${r ? `<button class="linkish" type="button" data-arrp="${esc(r.p.id)}">${esc(r.p.n || l)}</button>, ${esc(distText(r.km))}` : "none found within 5 km in the map data"}</li>`).join("")}</ul>`;
  el.querySelectorAll("[data-arrp]").forEach(b => b.onclick = () => openDetail(b.dataset.arrp));
}
function openArrival(id, at){
  openSheet(arrivalHTML(id), "arr-title");
  paintArrivalNear(at || HUB[id]);
}
// once per stop: the first real GPS fix there opens the card
function arrivalCheck(){
  if (!exp("arrival") || locStatus !== "ok" || !userLoc) return;
  const id = stopAt(userLoc); if (!id) return;
  const seen = S.arrived || (S.arrived = {});
  if (seen[id]) return;
  seen[id] = todayISO(); persist();
  if (!$("#sheetRoot .sheet-head")) openArrival(id, userLoc);
}

/* ---------- 18. Trip journal ---------- */
EXPERIMENTS.push({id:"journal", n:"Trip journal", d:"Mark places “Been here”, see a map of where you’ve been, and an end-of-trip “Trip wrapped”: km, countries, places, nights and game winners."});
// where the phone has been (stops on the planner's network), recorded from real GPS fixes only: {hub: {first, days:[iso…]}}
function journalTick(){
  if (!exp("journal") || locStatus !== "ok" || !userLoc) return;
  const id = stopAt(userLoc); if (!id) return;
  const v = S.visits || (S.visits = {}), d = clockAt(userLoc).iso, x = v[id] || (v[id] = {first:d, days:[]});
  if (!x.days.includes(d)){ x.days.push(d); persist(); }
}
const beenList = () => Object.entries(S.been || {}).map(([id, b]) => Object.assign({id}, b));
function toggleBeen(it){
  const b = S.been || (S.been = {});
  if (b[it.id]) delete b[it.id]; else b[it.id] = {n:it.n, lat:it.lat, lng:it.lng, cc:it.cc || ccAt(it.lat, it.lng), c:it.c, t:Date.now()};
  persist(); return !!b[it.id];
}
// the numbers for Trip wrapped: km between the stops in the order you reached them (as the crow flies), countries, places, nights
function wrapped(){
  const stops = Object.entries(S.visits || {}).map(([id, x]) => ({id, first:x.first, days:x.days || []})).filter(x => HUB[x.id]).sort((a, b) => a.first.localeCompare(b.first));
  let km = 0; for (let i = 1; i < stops.length; i++) km += dist(HUB[stops[i - 1].id], HUB[stops[i].id]);
  const cc = new Set(stops.map(x => nodeCc(HUB[x.id])).concat(beenList().map(b => b.cc).filter(Boolean)));
  const nights = new Set(stops.flatMap(x => x.days)).size;
  return {stops, km:Math.round(km), countries:[...cc].filter(c => D.countries[c]), places:beenList().length, nights};
}
async function paintWinners(){
  const el = $("#jrWin"); if (!el) return;
  if (!frCfg() || !(S.friends && S.friends.on)){ el.innerHTML = `<p class="note">Game winners show once Friends is on.</p>`; return; }
  try {
    const me = frMyId(), f = frState(), ids = [me, ...Object.keys(f.list)].filter(Boolean);
    const rows = await Promise.all(ids.map(async u => [u, await frDb("GET", `tally/${u}`).catch(() => null) || {}]));
    const tot = t => GAME_ORDER.reduce((a, g) => a + ((t[g] || {}).w || 0), 0);
    const list = rows.map(([u, t]) => ({u, w:tot(t)})).sort((a, b) => b.w - a.w);
    if (!el.isConnected) return;
    el.innerHTML = list.some(r => r.w) ? `<ol class="known">${list.slice(0, 3).map(r => `<li><b>${r.u === me ? "You" : esc(frNameOf(r.u))}</b>: ${r.w} win${r.w === 1 ? "" : "s"}</li>`).join("")}</ol>` : `<p class="note">No games finished yet.</p>`;
  } catch(e){ el.innerHTML = `<p class="note">Game winners need signal.</p>`; }
}
let jrMap = null;
function drawJournalMap(){
  const el = $("#jrMap"); if (!el || typeof maplibregl === "undefined") { if (el) el.remove(); return; }
  const w = wrapped(), pts = w.stops.map(x => HUB[x.id]).concat(beenList());
  if (!pts.length){ el.remove(); return; }
  if (jrMap){ try { jrMap.remove(); } catch(e){} jrMap = null; }
  try {
    jrMap = new maplibregl.Map({container:el, style:{version:8, glyphs:MAP_STYLE.glyphs, sources:{}, layers:[{id:"bg", type:"background", paint:{"background-color":cssv("--sea")}}]},
      bounds:[[Math.min(...pts.map(p => p.lng)) - .3, Math.min(...pts.map(p => p.lat)) - .3], [Math.max(...pts.map(p => p.lng)) + .3, Math.max(...pts.map(p => p.lat)) + .3]],
      fitBoundsOptions:{padding:30, maxZoom:11}, attributionControl:false, dragRotate:false, pitchWithRotate:false, touchPitch:false});
  } catch(e){ el.remove(); return; }
  jrMap.on("load", () => {
    jrMap.addSource("land", {type:"geojson", data:geoFC()});
    jrMap.addLayer({id:"land", type:"fill", source:"land", paint:{"fill-color":["case", ["==", ["get", "cc"], ""], cssv("--land"), cssv("--land-trip")], "fill-outline-color":cssv("--border-land")}});
    jrMap.addSource("route", {type:"geojson", data:fc(w.stops.length > 1 ? [{type:"Feature", geometry:{type:"LineString", coordinates:w.stops.map(x => [HUB[x.id].lng, HUB[x.id].lat])}, properties:{}}] : [])});
    jrMap.addLayer({id:"route", type:"line", source:"route", paint:{"line-color":cssv("--accent"), "line-width":3, "line-dasharray":[1.5, 1.2]}});
    jrMap.addSource("been", {type:"geojson", data:fc(beenList().map(b => ({type:"Feature", geometry:{type:"Point", coordinates:[b.lng, b.lat]}, properties:{}})))});
    jrMap.addLayer({id:"been", type:"circle", source:"been", paint:{"circle-radius":5, "circle-color":cssv("--do"), "circle-stroke-color":cssv("--bg"), "circle-stroke-width":1.5}});
    jrMap.addSource("stops", {type:"geojson", data:fc(w.stops.map(x => ({type:"Feature", geometry:{type:"Point", coordinates:[HUB[x.id].lng, HUB[x.id].lat]}, properties:{n:HUB[x.id].n}})))});
    jrMap.addLayer({id:"stops", type:"circle", source:"stops", paint:{"circle-radius":6, "circle-color":cssv("--accent"), "circle-stroke-color":cssv("--bg"), "circle-stroke-width":2}});
  });
}
TOOLS.push({id:"journal", l:"Trip journal", d:"Where we’ve been, and Trip wrapped", ic:"book", get hidden(){ return !exp("journal"); }});
TOOL_PAGES.journal = root => {
  const w = wrapped(), been = beenList().sort((a, b) => b.t - a.t);
  root.innerHTML = hero({title:"Trip journal", sub:"Where we’ve been", back:"#tools"}) + `<div class="page">
    <div class="block jr-wrap"><h2>Trip wrapped</h2>
      <div class="jr-stats"><div><b>${fmtNum(w.km)}</b><small>km between stops</small></div><div><b>${w.countries.length}</b><small>countr${w.countries.length === 1 ? "y" : "ies"}</small></div>
        <div><b>${w.stops.length}</b><small>stops</small></div><div><b>${w.places}</b><small>places been</small></div><div><b>${w.nights}</b><small>nights</small></div></div>
      ${w.countries.length ? `<p class="note">${esc(w.countries.map(c => D.countries[c].name).join(", "))}. Km are as the crow flies between the stops, in the order you reached them; nights count each date the app saw you on the road.</p>` : `<p class="note">It fills in as you travel: the app notes each stop when your phone’s location is on, and places you mark “Been here”.</p>`}
      <h3 style="margin-top:10px">Game winners</h3><div id="jrWin"><p class="note">Loading…</p></div></div>
    ${w.stops.length || been.length ? `<div class="legmap" id="jrMap" role="img" aria-label="Map of where you’ve been"></div>` : ""}
    ${w.stops.length ? `<div class="block"><h2>Stops</h2><ol class="known">${w.stops.map(x => `<li><b>${esc(HUB[x.id].n)}</b> <span class="note">from ${esc(fmtDay(x.first))}, ${x.days.length} day${x.days.length === 1 ? "" : "s"}</span></li>`).join("")}</ol></div>` : ""}
    <div class="block"><h2>Places we’ve been</h2>${been.length ? `<ul class="known">${been.map(b => `<li><button class="linkish" type="button" data-jr="${esc(b.id)}">${esc(b.n)}</button></li>`).join("")}</ul>` : `<p class="note">Open any place and tap <b>Been here</b>.</p>`}</div></div>`;
  root.querySelectorAll("[data-jr]").forEach(b => b.onclick = () => openDetail(b.dataset.jr));
  drawJournalMap(); paintWinners();
};
// "Been here" on every place's details sheet
const openDetailBase = openDetail;
openDetail = function(id){
  openDetailBase(id);
  if (!exp("journal")) return;
  const it = findPlace(id), head = $("#sheetRoot .actions"); if (!it || !head) return;
  head.insertAdjacentHTML("afterend", `<button class="btn small" type="button" id="dtBeen" aria-pressed="${!!(S.been || {})[it.id]}" style="margin-top:8px">${icon("check","i s")}<span>${(S.been || {})[it.id] ? "Been here" : "Mark as been here"}</span></button>`);
  $("#dtBeen").onclick = () => { const on = toggleBeen(it), b = $("#dtBeen"); b.setAttribute("aria-pressed", on); b.querySelector("span").textContent = on ? "Been here" : "Mark as been here"; toast(on ? "Added to the trip journal" : "Taken off the trip journal"); };
};

/* ---------- 19. Our own three (see IMPROVEMENTS.md) ---------- */
/* (a) Leave by: on a journey whose first leg has a saved timetable and a travel-day card, "to make the 15:30, leave by 14:30":
   the next departure, minus how early the source says to be there, minus the ride there from where you are (worked out at
   city speeds, 25 km/h, and marked est.). */
EXPERIMENTS.push({id:"leave-by", n:"Leave by", d:"A journey whose first boat, train or bus has a saved timetable says when to leave to catch the next one, from where you are."});
function leaveBy(t, at, nowMin){
  if (!exp("leave-by") || !t || !at) return null;
  const L = t.legs[0], list = legDeps(L); if (!list) return null;
  const from = NODE[L.from], stn = stationOf(L.from === L.o.a ? L.o.da : L.o.db) || from;
  const km = roadKm(at, stn); if (km > 45) return null;
  const d = (L.o.day || {})[L.from] || {}, early = /(\d+)\s*minutes before/.exec(d.early || "");
  const pre = early ? +early[1] : 0, ride = Math.max(5, Math.round(km / 25 * 60 / 5) * 5);
  const next = list.find(x => hm(x[0]) - pre - ride >= nowMin); if (!next) return null;
  const at2 = hm(next[0]) - pre - ride, hh = String(Math.floor(at2 / 60)).padStart(2, "0"), mm = String(at2 % 60).padStart(2, "0");
  return {dep:next[0], svc:next[3] || "", leave:`${hh}:${mm}`, ride, pre};
}
function leaveByHTML(t){
  const at = userLoc; if (!at) return "";
  const r = leaveBy(t, at, clockAt(NODE[t.legs[0].from]).min); if (!r) return "";
  return `<div class="callout leave-by">${icon("clock")}<div><b>Leave by ${esc(r.leave)}</b> to make the ${esc(r.dep)}${r.svc ? " " + esc(r.svc) : ""}.
    <div class="note">About ${r.ride} minutes to get there from you (est.)${r.pre ? `, and be there ${r.pre} minutes before, as the operator asks` : ""}. Saved timetable, not live.</div></div></div>`;
}
/* (b) Visa countdown: days left of the visa-free (or e-visa) stay in each country, from the day you arrived. The arrival day is
   noted from the first real GPS fix in a new country and can be changed; the allowances are gov.uk's (in Tools › guide). */
EXPERIMENTS.push({id:"visa-count", n:"Visa countdown", d:"Tools › Visa countdown: days left on your stay in each country from the day you arrived (gov.uk allowances), so nobody overstays."});
const VISA_DAYS = {TH:[30, "visa-free for British passports", "https://www.gov.uk/foreign-travel-advice/thailand/entry-requirements"],
  KH:[30, "on a tourist e-visa", "https://www.gov.uk/foreign-travel-advice/cambodia/entry-requirements"],
  VN:[45, "visa-free for British passports", "https://www.gov.uk/foreign-travel-advice/vietnam/entry-requirements"]};
function visaLeft(cc, entered, today = todayISO()){
  const v = VISA_DAYS[cc]; if (!v || !entered) return null;
  const last = new Date(Date.parse(entered + "T12:00:00Z") + (v[0] - 1) * 864e5).toISOString().slice(0, 10);
  return {days:v[0], last, left:dayDiff(last, today) + 1};
}
function visaTick(){
  if (!exp("visa-count") || locStatus !== "ok" || !userLoc) return;
  const cc = ccAt(userLoc.lat, userLoc.lng); if (!VISA_DAYS[cc]) return;
  const e = S.entered || (S.entered = {});
  if (!e[cc]){ e[cc] = clockAt(userLoc).iso; persist(); }
}
TOOLS.push({id:"visa", l:"Visa countdown", d:"Days left in each country", ic:"calendar", get hidden(){ return !exp("visa-count"); }});
TOOL_PAGES.visa = root => {
  const e = S.entered || {};
  root.innerHTML = hero({title:"Visa countdown", sub:"So nobody overstays", back:"#tools"}) + `<div class="page">
    ${Object.entries(VISA_DAYS).map(([cc, v]) => { const r = visaLeft(cc, e[cc]);
      return `<div class="block"><h2>${esc(D.countries[cc].name)}</h2><p>${v[0]} days ${esc(v[1])}.</p>
        <label class="field">Day you arrived<input type="date" data-ent="${cc}" value="${esc(e[cc] || "")}"></label>
        ${r ? `<p class="visa-left ${r.left <= 5 ? "warn" : ""}"><b>${r.left > 0 ? `${r.left} day${r.left === 1 ? "" : "s"} left` : "Your stay has run out"}</b>: last day ${esc(fmtDay(r.last))}</p>` : ""}
        <p class="note">${srcLink(["gov.uk entry requirements", v[2]])}. The date stamped in your passport is the one that counts: if it differs, put that date here. Overstaying means a fine for every day over.</p></div>`; }).join("")}</div>`;
  root.querySelectorAll("[data-ent]").forEach(i => i.onchange = () => { (S.entered = S.entered || {})[i.dataset.ent] = i.value || undefined; if (!i.value) delete S.entered[i.dataset.ent]; persist(); TOOL_PAGES.visa(root); });
};

/* (c) Meet-up spot: Friends › Meet up sends every friend "meet here at 20:00" with the spot (where you are, or the middle of the
   map) and a note; it pops up on their phones like a sticker (msgs/{uid}/{id} {f, s:"meet", t, m:{lat, lng, w, n}}; the
   Firebase rules already allow it), with Directions and Show on the map. */
EXPERIMENTS.push({id:"meetup", n:"Meet-up spot", d:"Friends › Meet up: send every friend “meet here at 20:00” with the spot and a note; it pops up on their phones like a sticker."});
function meetDefaultTime(now = new Date()){ const m = now.getHours() * 60 + now.getMinutes() + 30, r = Math.ceil(m / 30) * 30 % 1440; return `${String(Math.floor(r / 60)).padStart(2, "0")}:${String(r % 60).padStart(2, "0")}`; }
function meetHTML(){
  return `<div class="block meet-block"><h2>${icon("pin","i s")}Meet up</h2>
    <p class="note">Sends every friend a spot and a time. It pops up when they next have the app open.</p>
    <div class="pair"><label class="field">Time<input id="meetW" type="time" value="${meetDefaultTime()}"></label>
      <label class="field">Where<select id="meetAt"><option value="here">Where I am</option><option value="map">The middle of the map</option></select></label></div>
    <label class="field">Note (optional)<input id="meetN" type="text" maxlength="60" placeholder="Outside the 7-Eleven"></label>
    <button class="btn wide" type="button" id="meetGo">${icon("send","i s")}Send to everyone</button></div>`;
}
async function meetSend(spot, w, n){
  const me = await frMe(), to = Object.keys(frState().list);
  const m = {lat:+spot.lat.toFixed(5), lng:+spot.lng.toFixed(5), w:/^\d\d:\d\d$/.test(w) ? w : "", n:String(n || "").slice(0, 60)};
  await Promise.all(to.map(u => frDb("PUT", `msgs/${u}/m${frNow().toString(36)}${Math.random().toString(36).slice(2, 6)}`, {f:me.uid, s:"meet", t:{".sv":"timestamp"}, m})));
  return to.length;
}
function meetMsgHTML(mm){
  const m = mm.m, it = {lat:m.lat, lng:m.lng, osm:1};
  return `<p id="msg-t"><b>${esc(frNameOf(mm.f))}</b>: meet ${m.w ? `at <b>${esc(m.w)}</b>` : "up"}${m.n ? `, ${esc(m.n)}` : ""}</p>
    <div class="row" style="justify-content:center"><a class="btn primary" href="${esc(L_dir(it))}" target="_blank" rel="noopener">${icon("nav","i s")}Directions</a></div>
    <div class="note">${esc(frWhen(mm.t))}</div><div class="row"><button class="btn" type="button" data-msg="done">Close</button></div>`;
}
const frSosHTMLBase = frSosHTML;
frSosHTML = function(){ return frSosHTMLBase() + (exp("meetup") ? meetHTML() : ""); };
const frSosBindBase = frSosBind;
frSosBind = function(root){
  frSosBindBase(root);
  const b = exp("meetup") && root.querySelector("#meetGo"); if (!b) return;
  b.onclick = async () => {
    const where = root.querySelector("#meetAt").value;
    const spot = where === "here" ? userLoc : (typeof map !== "undefined" && map && mapLoaded ? {lat:map.getCenter().lat, lng:map.getCenter().lng} : null);
    if (!spot){ toast(where === "here" ? "No location yet: turn it on, or pick the middle of the map" : "Open the map first and move it to the spot"); return; }
    b.disabled = true;
    try { const n = await meetSend(spot, root.querySelector("#meetW").value, root.querySelector("#meetN").value); toast(`Sent to ${n} ${n === 1 ? "friend" : "friends"}`); }
    catch(e){ toast(e.message === "permission" ? "Firebase refused it: re-publish the rules (FIREBASE-SETUP.md)" : "No signal? Try again"); }
    b.disabled = false;
  };
};

// one timer for the arrival card, the journal's stops and the visa dates: boot.js runs it every 30 seconds
function roadTick(){ try { arrivalCheck(); journalTick(); visaTick(); } catch(e){} }
