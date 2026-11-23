/* ============================================================
   50-transport: the journey planner (lives in Tools). Thailand, Cambodia, Vietnam, Laos, Singapore, Malaysia and Indonesia.
   The links between them are researched (tools/transport-asia.js and tools/transport-my-id.js add the newer countries).
   ============================================================ */
/* ---------- transport planner ---------- */
const NET = D.net;
const HUB = Object.fromEntries(NET.hubs.map(h => [h[0], {id:h[0], n:h[1], lat:h[2], lng:h[3], g:h[4], island:h[5]}]));
const MODE_IC = {"Train":"train","Bus":"bus","Ferry":"ship","Flight":"plane","Minivan":"bus","Bus + ferry":"ship","Train + ferry":"train","Taxi":"car","Local ride":"car"};
const MODE_COL = {"Train":"--accent-2","Bus":"--food","Minivan":"--food","Ferry":"--move","Bus + ferry":"--move","Train + ferry":"--accent-2","Flight":"--do","Taxi":"--ess","Local ride":"--ess"};
const FLIGHT_EXTRA = [2, 3], CHANGE_EXTRA = [0.5, 1];
const roadKm = (a, b) => dist(a, b) * 1.35;
// The network covers every country on the map: rides, apps and money follow the country
const nodeCc = n => (n && n.lat != null ? ccAt(n.lat, n.lng) : null) || "TH";
const ccCur = cc => (D.countries[cc] && D.countries[cc].cur) || "THB";
const RIDE_APPS = {TH:"Grab or Bolt", ID:"Grab or Gojek", VN:"Grab or Xanh SM", SG:"Grab, Gojek or TADA", LA:"LOCA (Vientiane) or a tuk-tuk", KH:"PassApp or Grab", MY:"Grab"};
// countries the planner covers (Indonesia: wherever the places database is, which is now the whole country)
const PLAN_CC = new Set(["TH", "KH", "VN", "LA", "SG", "MY"]);
const planCovers = n => { const cc = nodeCc(n); return PLAN_CC.has(cc) || (cc === "ID" && inPlaceDb(n.lat, n.lng)); };
const rideApps = cc => RIDE_APPS[cc] || "Grab";
function meterFare(km){
  const m = NET.taxi.meter; let f = m.flag, d = Math.max(0, km - 1);
  for (const [len, r] of m.bands){ const x = len == null ? d : Math.min(d, len); f += x * r; d -= x; if (d <= 0) break; }
  return f;
}
const LEGS = (() => {
  const opts = NET.edges.map(e => ({...e}));
  const hubs = Object.values(HUB);
  for (let i = 0; i < hubs.length; i++) for (let j = i + 1; j < hubs.length; j++){
    const a = hubs[i], b = hubs[j];
    if (a.island || b.island) continue;
    if (opts.some(o => (o.a === a.id && o.b === b.id) || (o.a === b.id && o.b === a.id))) continue;
    const km = roadKm(a, b); if (km > 60) continue;
    const cc = nodeCc(a);
    opts.push({a:a.id, b:b.id, mode:"Taxi", op:`Taxi, ${rideApps(cc)}`, dur:[km / 45, km / 30], p:null, cur:ccCur(cc), da:"hotel", db:"hotel",
      notes:[`About ${Math.round(km)} km by road`, `Check ${rideApps(cc)} for the price`], src:[], verified:false});
  }
  return opts;
})();
const ADJ = {};
LEGS.forEach(o => { (ADJ[o.a] = ADJ[o.a] || []).push({o, to:o.b}); (ADJ[o.b] = ADJ[o.b] || []).push({o, to:o.a}); });
const isAir = h => h === "bkkair" || h === "dmk";
// Bali's and Lombok's airports are hubs that journeys pass through (a flight lands, then a taxi on), but "where I am" never snaps to them
const AIRPORT_HUBS = new Set(["dps", "lop"]);
const isAirport = h => isAir(h) || AIRPORT_HUBS.has(h);
const GO12 = D.net.go12 || {};
/* Booking links. 12Go has a page per route and transport type (/en/ferry/padang-bai/gili-trawangan) and reads the date and
   number of travellers from ?date=YYYY-MM-DD&people=N (checked in a browser, Nov 2026). It answers for any type, even one with
   no services, so the type's own page is used only where it was checked to list services (D.net.go12ok); otherwise the
   route's all-transport page. It can't be linked to one particular departure, so the button never claims to. */
const GO12_OK = new Set(D.net.go12ok || []);
const GO12_MODE = {Train:"train", Bus:"bus", Minivan:"bus", Ferry:"ferry", "Bus + ferry":"ferry", Flight:"flights", Taxi:"taxi"};
const GO12_WORD = {train:"trains", bus:"buses and vans", ferry:"boats", flights:"flights", taxi:"private transfers"};
function go12Query(){
  const q = new URLSearchParams();
  if (/^\d{4}-\d{2}-\d{2}$/.test(ui.tp.date || "") && ui.tp.date >= todayISO()) q.set("date", ui.tp.date);
  const n = Math.round(+ui.tp.people || 1); if (n > 1) q.set("people", String(clamp(n, 1, 9)));
  const s = q.toString(); return s ? "?" + s : "";
}
// {url, kind, label} for going from hub a to hub b by this mode (in that direction), or null where 12Go doesn't cover the places
function go12Link(a, b, mode){
  if (!GO12[a] || !GO12[b] || a === b) return null;
  const m = GO12_MODE[mode], exact = m && GO12_OK.has(`${m}/${GO12[a]}/${GO12[b]}`);
  const path = exact ? m : "travel";
  return {url:`https://12go.asia/en/${path}/${GO12[a]}/${GO12[b]}${go12Query()}`, kind:path,
    label: exact ? `Find ${GO12_WORD[m]} for this leg on 12Go` : "Search this route on 12Go"};
}
const go12 = (a, b) => { const l = go12Link(a, b, null); return l ? l.url : null; };
const ISLAND_R = {samui:14, phangan:10, tao:5, phiphi:5, kohchang:14, lipe:3, railay:2, penida:12, gilit:2.5, giliair:2};
let NODE = HUB;
const hubNode = id => ({id, n:HUB[id].n, lat:HUB[id].lat, lng:HUB[id].lng});
// Link a searched place (not one of the saved hubs) to the network with a local ride to the nearest hubs
function connectors(node, key){
  const legs = [];
  const cc = nodeCc(node), id = cc === "ID", apps = rideApps(cc);
  const add = (h, label) => {
    const km = roadKm(node, HUB[h]);
    const inBkk = dist(node, HUB.bkk) < 40 && dist(HUB[h], HUB.bkk) < 40;
    const m = inBkk ? meterFare(km) : null;
    legs.push({a:key, b:h, mode: inBkk ? "Taxi" : "Local ride", op: inBkk ? "Taxi, Grab or Bolt" : (label || (id ? "Taxi, Grab, Gojek or a local boat, depending on the place" : cc === "TH" ? "Taxi, Grab, songthaew or longtail boat, depending on the place" : `Taxi, ${apps} or a local bus, depending on the place`)), dur:[Math.max(.15, km / 45), Math.max(.25, km / 28)],
      p: m ? [Math.round(m * 1.05), Math.round(m * 1.4)] : null, cur:ccCur(cc), da:null, db:null,
      notes:[`About ${Math.round(km)} km by road`, inBkk ? "Estimated from Bangkok’s taxi meter rates" : id ? "Check Grab or Gojek for the price, or ask locally for a bus or bemo" : cc === "TH" ? "Check Grab or Bolt for the price, or ask locally for a bus or songthaew" : `Check ${apps} for the price, or ask locally`], src:[], verified:false});
  };
  for (const [h, r] of Object.entries(ISLAND_R)) if (dist(node, HUB[h]) <= r){ add(h, id ? "Local transport or on foot, depending on the island" : "Taxi, songthaew or scooter taxi"); return legs; }
  const ranked = Object.values(HUB).filter(h => !h.island && !isAir(h.id)).map(h => ({h:h.id, km:roadKm(node, h)})).sort((x, y) => x.km - y.km);
  const close = ranked.filter(x => x.km <= 170).slice(0, 3);
  if (close.length){ close.forEach(x => add(x.h)); return legs; }
  // further from the saved hubs but still in a covered country: link the two nearest by bus or taxi, flagged as an estimate
  if (planCovers(node)) ranked.slice(0, 2).forEach(x => legs.push({a:key, b:x.h, mode:"Bus", op:"Bus, minivan or taxi (check live)", dur:[x.km / 65, x.km / 45], p:null, cur:ccCur(cc), da:null, db:null,
    notes:[`About ${Math.round(x.km)} km by road`, "This stretch isn’t in the saved network yet, so the time is a rough estimate"], src:[], verified:false}));
  return legs;
}
EXPERIMENTS.push({id:"tp-fastest", n:"Transport: true fastest journey", d:"Always keeps the quickest journey, even when one of its legs has no saved price, so the Fastest badge is right."});
/* Experiment tp-overnight: a night train or sleeper bus is kept as an option even when it's much slower than flying, because the
   night on board saves a night's gaff. For choosing which journeys to show, up to NIGHT_SLEEP hours of an overnight leg don't
   count, and the night's gaff it saves (the middle price of our researched hostels where it leaves from) counts towards Cheapest.
   The times and prices shown are never changed. */
EXPERIMENTS.push({id:"tp-overnight", n:"Transport: overnight trains and buses", d:"Night trains and sleeper buses are offered even when flying is quicker, marked “saves a night’s gaff, about £X”, and that counts towards Cheapest."});
const NIGHT_SLEEP = 8;
let NIGHT_ON = false;          // set by planTrips, so the busy search below doesn't read the switch thousands of times
// an overnight option: marked night in the data, and (where a timetable is saved) leaving in the evening and arriving the next day
const nightAny = o => !!o.night && (!o.dep || Object.values(o.dep).some(l => l.some(d => d[2] === 1 && hm(d[0]) >= 17 * 60)));
const nightLeg = (o, from) => !!o.night && (!o.dep || !o.dep[from] ? nightAny(o) : o.dep[from].some(d => d[2] === 1 && hm(d[0]) >= 17 * 60));
const legMin = o => o.dur[0] + (o.mode === "Flight" ? FLIGHT_EXTRA[0] : 0) + CHANGE_EXTRA[0] - (NIGHT_ON && nightAny(o) ? Math.min(NIGHT_SLEEP, o.dur[0] - 1) : 0);
const gaffCache = {};
// a night in a researched hostel near this stop, in pounds: the middle of their lowest prices (null where we have none)
function gaffNight(id){
  if (id in gaffCache) return gaffCache[id];
  const n = NODE[id] || HUB[id];
  const ps = n ? D.places.filter(p => p.c === "gaff" && p.p && p.p[0] > 0 && dist(p, n) <= 25).map(p => toGBP(p.p[0], p.cur || "THB")).sort((a, b) => a - b) : [];
  return (gaffCache[id] = ps.length >= 2 ? {gbp:ps[Math.floor(ps.length / 2)], n:ps.length, city:n.n} : null);
}
// the quickest possible time from every stop to the destination (Dijkstra, backwards)
function timeTo(adj, to){
  const best = {[to]:0}, todo = [[0, to]];
  while (todo.length){
    todo.sort((a, b) => a[0] - b[0]); const [d, at] = todo.shift();
    if (d > best[at]) continue;
    for (const {o, to:nx} of (adj[at] || [])){ const nd = d + legMin(o); if (best[nx] == null || nd < best[nx]){ best[nx] = nd; todo.push([nd, nx]); } }
  }
  return best;
}
function hubPaths(adj, from, to, maxLegs){
  const out = [], lb = timeTo(adj, to);
  if (lb[from] == null) return out;
  const bound = lb[from] * 2.2 + 3;
  (function walk(at, seen, path, t){
    if (out.length > 600) return;
    if (at === to && path.length){ out.push(path.slice()); return; }
    if (path.length === maxLegs) return;
    for (const {o, to:nx} of (adj[at] || [])){
      if (seen.has(nx) || (isAir(nx) && nx !== to) || lb[nx] == null) continue;
      const nt = t + legMin(o); if (nt + lb[nx] > bound) continue;
      seen.add(nx); path.push({o, from:at, to:nx}); walk(nx, seen, path, nt); path.pop(); seen.delete(nx);
    }
  })(from, new Set([from]), [], 0);
  // a flight "from Bangkok" already leaves from an airport, so don't pair it with a leg to or from that airport
  return out.filter(legs => !legs.some((L, k) => {
    const nx = legs[k + 1];
    return nx && ((isAir(L.from) && L.to === "bkk" && nx.o.mode === "Flight") || (L.o.mode === "Flight" && L.to === "bkk" && isAir(nx.to)));
  }));
}
function planTrips(fromN, toN){
  if (!fromN || !toN) return [];
  const fk = fromN.id || "@from", tk = toN.id || "@to";
  if (fk === tk || (!fromN.id && !toN.id && dist(fromN, toN) < .3)) return [];
  NIGHT_ON = exp("tp-overnight");
  NODE = Object.assign({}, HUB);
  const adj = {}; Object.keys(ADJ).forEach(k => adj[k] = ADJ[k].slice());
  const link = o => { (adj[o.a] = adj[o.a] || []).push({o, to:o.b}); (adj[o.b] = adj[o.b] || []).push({o, to:o.a}); };
  let extra = 0;
  [[fromN, "@from"], [toN, "@to"]].forEach(([n, key]) => { if (n.id) return; NODE[key] = {id:key, n:n.n, lat:n.lat, lng:n.lng}; connectors(n, key).forEach(link); extra++; });
  if (!fromN.id && !toN.id && roadKm(fromN, toN) <= 60){ const km = roadKm(fromN, toN); const cc = nodeCc(fromN); link({a:"@from", b:"@to", mode:"Taxi", op:`Taxi, ${rideApps(cc)}`, dur:[km / 45, km / 28], p:null, cur:ccCur(cc), da:null, db:null, notes:[`About ${Math.round(km)} km by road`], src:[], verified:false}); }
  let trips = hubPaths(adj, fk, tk, 6 + extra).map(legs => {
    let dmin = 0, dmax = 0, pmin = 0, pmax = 0, unpriced = 0, unverified = 0;
    legs.forEach((L, k) => {
      const o = L.o, fl = o.mode === "Flight";
      dmin += o.dur[0] + (fl ? FLIGHT_EXTRA[0] : 0) + (k ? CHANGE_EXTRA[0] : 0);
      dmax += o.dur[1] + (fl ? FLIGHT_EXTRA[1] : 0) + (k ? CHANGE_EXTRA[1] : 0);
      if (o.p){ pmin += toGBP(o.p[0], o.cur); pmax += toGBP(o.p[o.p.length - 1], o.cur); } else unpriced++;
      if (!o.verified) unverified++;
    });
    const mid = (dmin + dmax) / 2;
    // tp-overnight: the nights spent on board, the hours that don't count for choosing, and the gaff they save
    const nights = NIGHT_ON ? legs.filter(L => nightLeg(L.o, L.from)) : [];
    const saved = nights.reduce((a, L) => a + ((gaffNight(L.from) || {}).gbp || 0), 0);
    const eff = mid - nights.reduce((a, L) => a + Math.min(NIGHT_SLEEP, L.o.dur[0] - 1), 0);
    // low: a leg's price is only the lowest fare seen (flights, from Kiwi.com), so the total is a "from" price
    return {legs, dmin, dmax, mid, pmin, pmax, unpriced, unverified, nights:nights.length, saved, eff, net:pmin - saved, low:legs.some(L => L.o.p && L.o.from)};
  });
  if (!trips.length) return [];
  // no silly detours through another country: a trip inside one country stays in it, and a trip between two countries only goes
  // through a third if that's quicker than every way that doesn't (Bangkok to Pai via Laos, Phnom Penh to Saigon via Singapore)
  {
    const ccOf = k => nodeCc(NODE[k]), c0 = ccOf(fk), c1 = ccOf(tk);
    const third = t => t.legs.some(L => { const c = ccOf(L.to); return c && c !== c0 && c !== c1; });
    const stay = trips.filter(t => !third(t));
    if (stay.length){
      const best = Math.min(...stay.map(t => t.mid));
      trips = trips.filter(t => !third(t) || (c0 !== c1 && t.eff < best));
    }
  }
  // local rides at either end are always unpriced outside Bangkok, so judge prices on the main legs
  const core = t => t.unpriced - t.legs.filter(L => L.from[0] === "@" || L.to[0] === "@").filter(L => !L.o.p).length;
  // (a journey is judged by eff and net, its time and price as tp-overnight counts them, against the others' real time: with the
  // switch off they're the same as mid and pmin)
  const best = Math.min(...trips.map(t => t.mid));
  // experiment: the truly fastest journey is always kept, even when a leg on it has no saved price
  const quickest = trips.reduce((a, b) => (a.mid < b.mid || (a.mid === b.mid && core(a) <= core(b))) ? a : b);
  trips = trips.filter(t => t.eff <= best * 2.5 + 2);
  const priced = trips.filter(t => !core(t));
  const keepUnpriced = new Set(trips.filter(t => core(t) && t.eff <= best * 1.6 + 1).sort((a, b) => (core(a) - core(b)) || (a.eff - b.eff)).slice(0, 3));
  trips = trips.filter(t => core(t) ? keepUnpriced.has(t)
    : !priced.some(u => u !== t && u.mid <= t.eff && u.net <= t.net && (u.mid < t.eff || u.net < t.net)));
  if (!trips.includes(quickest)) trips.push(quickest);
  // and no long way round: a trip goes if another is much quicker, no dearer, with no more legs and no more legs without a price
  trips = trips.filter(t => !trips.some(u => u !== t && u.mid * 1.3 < t.eff && u.legs.length <= t.legs.length && core(u) <= core(t) && u.net <= t.net + 0.5));
  const fastest = trips.reduce((a, b) => a.mid <= b.mid ? a : b);
  const cheapPool = trips.filter(t => !core(t));
  const cheapest = cheapPool.length ? cheapPool.reduce((a, b) => a.net <= b.net ? a : b) : null;
  trips.forEach(t => { t.fastest = t === fastest; t.cheapest = t === cheapest; });
  trips.sort(ui.tp.sort === "cheap"
    ? (a, b) => (core(a) - core(b)) || (a.net - b.net) || (a.mid - b.mid)
    : (a, b) => (a.mid - b.mid) || (a.pmin - b.pmin));
  return trips.slice(0, 8);
}
function fh(h){
  if (h < 1) return `${Math.max(5, Math.round(h * 60 / 5) * 5)} min`;
  const r = Math.round(h * 2) / 2;
  return `${Math.floor(r)}${r % 1 ? "½" : ""} h`;
}
const fRange = (a, b) => fh(a) === fh(b) ? fh(a) : (b < 1 ? `${fh(a).replace(" min", "")}–${fh(b)}` : a < 1 ? `${fh(a)}–${fh(b)}` : `${fh(a).replace(" h", "")}–${fh(b)}`);
// a journey's total shows in the money of the country it starts in (baht from Bangkok, rupiah from Bali)
const inCur = (gbp, cur) => niceRound(gbp * rate(cur), cur);
const tripCur = t => ccCur(nodeCc(NODE[t.legs[0].from]));
const tripFrom = t => money(inCur(t.pmin, tripCur(t)), tripCur(t));
function stationOf(key){ const s = key && NET.stations[key]; return s ? {n:s[0], lat:s[1], lng:s[2]} : null; }
function getThere(stn){
  if (!userLoc || !stn || stn.lat == null) return "";
  const km = roadKm(userLoc, stn);
  if (km > 45) return "";
  if (km < 0.6) return `<div class="getthere">${esc(stn.n)} is a short walk from you.</div>`;
  const inBkk = dist(userLoc, HUB.bkk) < 40;
  if (inBkk){
    const m = meterFare(km);
    return `<div class="getthere">${esc(stn.n)} is about ${km.toFixed(1)} km from you. Taxi about ${thbGBP(Math.round(m * 1.05), Math.round(m * 1.4))} on the meter, Grab or Bolt about ${thbGBP(Math.round(Math.max(100, m * 1.2)), Math.round(Math.max(150, m * 1.8)))}. Estimates from Bangkok’s official meter rates.</div>`;
  }
  const cc = nodeCc(stn);
  return `<div class="getthere">${esc(stn.n)} is about ${km.toFixed(1)} km from you. ${cc === "TH" ? "Outside Bangkok taxis rarely use meters, so check" : "Check"} ${rideApps(cc)} for the price.</div>`;
}
// the leg's own booking link: its mode, its direction; none for local rides or the planner's own rough taxi hops
function legBook(L){
  const o = L.o;
  if (o.mode === "Local ride" || (o.mode === "Taxi" && !o.src.length)) return null;
  const l = go12Link(L.from, L.to, o.mode);
  if (l && o.mode === "Taxi" && l.kind !== "taxi") return null;        // a taxi leg only links where 12Go sells that transfer
  return l;
}
function legBookBtn(L){
  const l = legBook(L); if (!l) return "";
  return `<a class="btn small" style="margin-top:6px" href="${esc(l.url)}" target="_blank" rel="noopener" data-book="${esc(l.kind)}">${esc(l.label)} ${icon("ext","i s")}</a>`;
}
// each leg gets its own colour on the journey map (and the same colour on its number in the list)
const LEG_COLS = ["#4FC3F7", "#FFB74D", "#BA68C8", "#81C784", "#F06292", "#FFF176", "#4DB6AC"];
// flights on the chosen date: Google Flights reads a plain-English search
function flightLink(L){
  const a = NODE[L.from].n, b = NODE[L.to].n, d = ui.tp.date && ui.tp.date >= todayISO() ? " on " + ui.tp.date : "";
  return `https://www.google.com/travel/flights?q=${enc(`Flights from ${a} to ${b}${d} one way`)}`;
}
/* Experiment tp-group: with more than one person chosen, a journey's price shows per person and for the whole group,
   in local money and pounds (the saved prices are per person). */
EXPERIMENTS.push({id:"tp-group", n:"Transport: prices for the group", d:"With 2 or more people chosen, journeys show the price each and for the whole group, in local money and pounds."});
function groupLine(t){
  const n = Math.round(+ui.tp.people || 1), tc = tripCur(t);
  if (!exp("tp-group") || n < 2 || t.unpriced === t.legs.length) return "";
  const rng = (a, b, f) => f(a) + (b - a > 0.3 ? "–" + f(b).replace(/^[^\d]*/, "") : "");
  const loc = v => money(inCur(v, tc), tc), gbp = v => "£" + fmtNum(Math.round(v));
  return `<div class="grp-price">${n} of you: <b>${rng(t.pmin * n, t.pmax * n, loc)}</b> <small>${rng(t.pmin * n, t.pmax * n, gbp)} together, ${rng(t.pmin, t.pmax, gbp)} each${t.unpriced ? ", plus a leg without a saved price" : ""}</small></div>`;
}
function nightLine(t){
  if (!exp("tp-overnight") || !t.nights) return "";
  const g = t.legs.filter(L => nightLeg(L.o, L.from)).map(L => gaffNight(L.from)).filter(Boolean);
  return `<div class="night-line">${icon("bed","i xs")} Overnight${t.nights > 1 ? ` (${t.nights} nights)` : ""}: saves a night’s gaff${t.saved ? `, about <b>£${fmtNum(Math.round(t.saved))}</b>` : ""}${g.length ? ` <small>(the middle price of ${g[0].n} researched hostels in ${esc(g[0].city)})</small>` : ""}</div>`;
}
// a journey's price. When a leg has no saved price, the total is only part of the cost, so it says "so far" and names the leg(s)
// left out, instead of looking like the whole fare
const unpricedLegs = t => t.legs.filter(L => !L.o.p).map(L => `${NODE[L.from].n} → ${NODE[L.to].n} ${L.o.mode.toLowerCase()}`);
function tripPrice(t){
  const tc = tripCur(t);
  if (t.unpriced === t.legs.length) return `<small>Price: check live</small>`;
  const rng = `${money(inCur(t.pmin, tc), tc)}${t.pmax - t.pmin > 0.3 ? "–" + fmtNum(inCur(t.pmax, tc)) : ""}`, gbp = `£${fmtNum(t.pmin)}${t.pmax - t.pmin > 0.3 ? "–" + fmtNum(t.pmax) : ""}`;
  if (t.low){
    // a flight's price is the lowest fare seen, so the total is only a floor: no range, just "from"
    const low = `from ${money(inCur(t.pmin, tc), tc)}`, lowG = `from £${fmtNum(t.pmin)}`, fl = t.legs.filter(L => L.o.p && L.o.from).length;
    const why = `the ${fl === 1 ? "flight is its" : "flights are their"} lowest fare seen, so check live`;
    if (!t.unpriced) return `${low}<small>${lowG}: ${why}</small>`;
    return `${low} <span class="plus">+ ?</span><small>${lowG} so far, not counting the ${esc(listAnd(unpricedLegs(t)))} (no saved price); ${why}</small>`;
  }
  if (!t.unpriced) return `${rng}<small>${gbp}</small>`;
  return `${rng} <span class="plus">+ ?</span><small>${gbp} so far, not counting the ${esc(listAnd(unpricedLegs(t)))} (no saved price)</small>`;
}
function tripCard(t, idx){
  const stops = [t.legs[0].from].concat(t.legs.map(L => L.to)).map(k => NODE[k].n);
  const chain = t.legs.map((L, k) => `<span class="lchip" style="--lc:${LEG_COLS[k % LEG_COLS.length]}">${icon(MODE_IC[L.o.mode] || "bus", "i xs")}${esc(L.o.mode)}</span>`).join('<span class="larr" aria-hidden="true">›</span>');
  return `<div class="trip compact" data-trip="${idx}" role="button" tabindex="0" aria-label="See every leg of this journey">
    <div>${t.fastest ? '<span class="badge">Fastest</span>' : ""}${t.cheapest ? '<span class="badge cheap">Cheapest</span>' : ""}${bookNotes(t).some(x => x.r.warn) ? '<span class="tag warn">Book ahead</span>' : ""}</div>
    <div class="sum" style="margin-top:6px"><div><div class="big">${fRange(t.dmin, t.dmax)}</div><div class="m note">${t.legs.length === 1 ? "Direct" : `${t.legs.length} legs, ${t.legs.length - 1} change${t.legs.length > 2 ? "s" : ""}`}${t.legs.some(L => L.o.mode === "Flight") ? ", includes airport time" : ""}</div></div>
      <div class="price">${tripPrice(t)}</div></div>${groupLine(t)}${nightLine(t)}
    <div class="lchain">${chain}</div>
    <div class="note" style="margin-top:4px">${esc(stops.join(" → "))}</div>
    <div class="trip-more">${icon("map","i s")}See ${t.legs.length === 1 ? "the details" : "all " + t.legs.length + " legs"} and the map${icon("chevr","i xs")}</div>
  </div>`;
}
EXPERIMENTS.push({id:"tp-legnames", n:"Transport: clearer leg names", d:"Local rides are named by their stop (“To Thong Sala Pier”), and “Bus, Bus, minivan or taxi” reads “Bus, minivan or taxi”."});
// a leg's title in the journey sheet. Experiment tp-legnames: a local ride at either end is named by the pier, station or
// bus stop it takes you to (or from), instead of "Koh Phangan → Koh Phangan"
function legTitle(t, k){
  const L = t.legs[k], plain = `${NODE[L.from].n} → ${NODE[L.to].n}`;
  const local = L.o.mode === "Local ride" || (L.o.mode === "Taxi" && !(L.o.src || []).length);
  if (!local) return plain;
  const nx = t.legs[k + 1], pv = t.legs[k - 1];
  if (nx && L.to[0] !== "@"){ const s = stationOf(nx.from === nx.o.a ? nx.o.da : nx.o.db); return `To ${s && s.lat != null ? s.n : NODE[L.to].n}`; }
  if (pv && L.from[0] !== "@"){ const s = stationOf(pv.to === pv.o.b ? pv.o.db : pv.o.da); return `From ${s && s.lat != null ? s.n : NODE[L.from].n} to ${NODE[L.to].n}`; }
  return NODE[L.from].n === NODE[L.to].n ? `Around ${NODE[L.to].n}` : plain;
}
// "Bus" and "Bus, minivan or taxi" together read "Bus, Bus, minivan or taxi": drop the mode when the operator already says it
const legKind = o => o.op && o.op.toLowerCase().startsWith(o.mode.toLowerCase()) ? o.op : `${o.mode}${o.op ? ", " + o.op : ""}`;
/* Experiment tp-border: a leg that crosses a land border gets a short card: the visa to sort out before, how the crossing
   goes and what to watch for. Only what gov.uk says for British passports (fetched and checked 23 Nov 2026), with its links. */
EXPERIMENTS.push({id:"tp-border", n:"Transport: border crossings", d:"Overland legs into another country get a card: the visa to sort first, the crossing, and what to watch for (gov.uk)."});
const BORDER_CHECKED = "23 Nov 2026";
const BORDER_IN = {
  KH:{name:"Cambodia", url:"https://www.gov.uk/foreign-travel-advice/cambodia/entry-requirements", pts:[
    "You need a visa. Best: an <b>e-visa</b>, applied for at least 4 days ahead on the official site. You can also get one on arrival at land border crossings.",
    "Tourist visas last 30 days from the day you enter. Make sure your passport is stamped and keep the departure form.",
    "At land borders, officials or tour companies may ask for unofficial fees or inflate the visa price: know the real price before you go.",
    "At the more remote crossing points, conditions can be basic."]},
  VN:{name:"Vietnam", url:"https://www.gov.uk/foreign-travel-advice/vietnam/entry-requirements", pts:[
    "British passports don’t need a visa for up to <b>45 days</b>.",
    "Check the date stamped in your passport is 45 days from arrival: immigration won’t change it after you’ve left the land border."]},
  TH:{name:"Thailand", url:"https://www.gov.uk/foreign-travel-advice/thailand/entry-requirements", pts:[
    "No visa needed for tourism for up to <b>30 days</b> (since 15 September 2026).",
    "Fill in the free digital arrival card (TDAC) online within the 3 days before you arrive, for land crossings too."]},
  LA:{name:"Laos", url:"https://www.gov.uk/foreign-travel-advice/thailand/regional-risks", pts:[
    "Not all land crossings into Laos are open to foreign nationals, and even where one is open you may need a Lao visa in advance."]}
};
// the Thai–Cambodian land border itself: FCDO advises against all but essential travel within 20 km of it (both sides)
const BORDER_WARN = {"KH|TH":"The UK advises against all but essential travel within 20 km of the Thailand–Cambodia land border, on both sides. Travelling against that advice can invalidate travel insurance: fly instead."};
function borderCard(t, k){
  if (!exp("tp-border")) return "";
  const L = t.legs[k]; if (L.o.mode === "Flight") return "";
  const a = nodeCc(NODE[L.from]), b = nodeCc(NODE[L.to]);
  if (!a || !b || a === b) return "";
  const into = BORDER_IN[b], warn = BORDER_WARN[[a, b].sort().join("|")];
  return `<div class="callout border-card">${icon("flag")}<div><b>Crossing into ${esc(into ? into.name : (D.countries[b] || {name:b}).name)}</b>
    ${warn ? `<p class="bad-note">${esc(warn)}</p>` : ""}
    <ul class="known">${(into ? into.pts : []).map(x => `<li>${x}</li>`).join("")}</ul>
    <p class="note">From gov.uk, checked ${BORDER_CHECKED}${into ? `: <a href="${esc(into.url)}" target="_blank" rel="noopener">gov.uk travel advice for ${esc(into.name)}</a>` : ""}.</p></div></div>`;
}
/* Experiment tp-sea: boat legs show the sea forecast for the travel day (today if no date is picked, up to a week ahead):
   the highest waves forecast midway (Open-Meteo marine, free, no key), described with the WMO sea-state scale. */
EXPERIMENTS.push({id:"tp-sea", n:"Transport: sea forecast on boat legs", d:"Ferry legs show the waves forecast for your travel day (Open-Meteo), as calm, slight, moderate or rough."});
const isBoat = o => /ferry|boat/i.test(o.mode) || /speedboat|longtail/i.test(o.op || "");
// WMO sea state (code table 3700), by wave height in metres
const seaState = h => h < 0.1 ? "calm" : h < 0.5 ? "smooth" : h < 1.25 ? "slight" : h < 2.5 ? "moderate" : h < 4 ? "rough" : "very rough";
const seaCache = {};
async function seaFor(lat, lng, day){
  const key = `${lat.toFixed(2)},${lng.toFixed(2)},${day}`;
  if (!(key in seaCache)) seaCache[key] = getJSON(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}&daily=wave_height_max&timezone=auto&start_date=${day}&end_date=${day}&cell_selection=sea`, {timeout:10000})
    .then(j => { const v = j && j.daily && j.daily.wave_height_max && j.daily.wave_height_max[0]; return isFinite(v) && v != null ? +v : null; }).catch(() => { delete seaCache[key]; return null; });
  return seaCache[key];
}
async function paintSea(t){
  if (!exp("tp-sea")) return;
  const day = ui.tp.date && ui.tp.date >= todayISO() ? ui.tp.date : todayISO();
  if ((new Date(day + "T12:00:00") - new Date(todayISO() + "T12:00:00")) / 864e5 > 6) return;      // the forecast only goes a week ahead
  t.legs.forEach(async (L, k) => {
    if (!isBoat(L.o)) return;
    const a = NODE[L.from], b = NODE[L.to], el = document.querySelector(`#sheetRoot [data-sea="${k}"]`); if (!el) return;
    el.hidden = false; el.textContent = "Checking the sea…";
    const h = await seaFor((a.lat + b.lat) / 2, (a.lng + b.lng) / 2, day);
    if (!el.isConnected) return;
    if (h == null){ el.textContent = "Sea forecast: needs signal (Open-Meteo)."; return; }
    const st = seaState(h);
    el.className = "sea-line" + (h >= 2.5 ? " bad" : h >= 1.25 ? " warn" : "");
    el.innerHTML = `${icon("waves","i xs")} Sea ${day === todayISO() ? "today" : "on " + esc(fmtDay(day))}: waves up to <b>${h.toFixed(1)} m</b>, ${esc(st)}${h >= 1.25 ? ". Bumpy for small boats: seasickness tablets help, and check with the operator before going" : ""}. <span class="note">Open-Meteo forecast; WMO sea-state scale.</span>`;
  });
}
/* Local clock where a leg starts: departure times are local, and Thailand, Cambodia, Vietnam and Laos share UTC+7 while
   Malaysia, Singapore and central Indonesia are an hour ahead */
const CC_TZ = {TH:"Asia/Bangkok", KH:"Asia/Phnom_Penh", VN:"Asia/Ho_Chi_Minh", LA:"Asia/Vientiane", MY:"Asia/Kuala_Lumpur", SG:"Asia/Singapore"};
const tzAt = n => { const cc = nodeCc(n); if (cc === "ID") return n.lng >= 134 ? "Asia/Jayapura" : n.lng >= 114.4 ? "Asia/Makassar" : "Asia/Jakarta"; return CC_TZ[cc] || "Asia/Bangkok"; };
function clockAt(n, when = new Date()){
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {timeZone:tzAt(n), hour:"2-digit", minute:"2-digit", year:"numeric", month:"2-digit", day:"2-digit", hourCycle:"h23"}).formatToParts(when).map(x => [x.type, x.value]));
    return {min:(+p.hour % 24) * 60 + +p.minute, iso:`${p.year}-${p.month}-${p.day}`};
  } catch(e){ return {min:when.getHours() * 60 + when.getMinutes(), iso:todayISO()}; }
}
const hm = s => +s.slice(0, 2) * 60 + +s.slice(3, 5);
/* Experiment tp-times: legs with a saved timetable (D.net edges' dep: {fromHub: [[leaves, arrives, +days, service]]}, from the
   sources in tools/transport-route.js and tools/transport-asia.js) show the next departures today and the last one, or every
   departure on the chosen date. A saved baseline, never live. */
EXPERIMENTS.push({id:"tp-times", n:"Transport: departure times", d:"Ferries, night trains and buses with a saved timetable show today’s next departures and the last one (a saved guide, not live)."});
function legDeps(L){ const d = L.o.dep && L.o.dep[L.from]; return Array.isArray(d) && d.length ? d.slice().sort((a, b) => hm(a[0]) - hm(b[0])) : null; }
// {left: departures still to come today, first, last}
function depsLeft(list, nowMin){ return {left:list.filter(d => hm(d[0]) >= nowMin), first:list[0], last:list[list.length - 1]}; }
function legTimesHTML(L){
  if (!exp("tp-times")) return "";
  const list = legDeps(L); if (!list) return "";
  const src = L.o.depSrc, now = clockAt(NODE[L.from]), day = ui.tp.date && ui.tp.date > now.iso ? ui.tp.date : null;
  const fmt = d => `<b>${esc(d[0])}</b>${d[1] ? `–${esc(d[1])}${d[2] ? "<sup>+1</sup>" : ""}` : ""}${d[3] ? " " + esc(d[3]) : ""}`;
  const r = depsLeft(list, now.min);
  const head = day ? `On ${esc(fmtDay(day))}: ${list.length} departure${list.length > 1 ? "s" : ""}, first <b>${esc(r.first[0])}</b>, last <b>${esc(r.last[0])}</b>`
    : r.left.length ? `Next today: ${r.left.slice(0, 3).map(fmt).join(", ")}${r.left.length > 3 ? ` and ${r.left.length - 3} more` : ""}. Last one <b>${esc(r.last[0])}</b>` : `No more today. First tomorrow: ${fmt(r.first)}`;
  return `<div class="dep-line">${icon("clock","i xs")} ${head}</div>
    <details class="deps"><summary>All ${list.length} saved departures</summary><ul class="known">${list.map(d => `<li>${fmt(d)}</li>`).join("")}</ul></details>
    <p class="note dep-src">Saved timetable${src ? ` from <a href="${esc(src[1])}" target="_blank" rel="noopener">${esc(src[0])}</a>` : ""}: not live, so check with the operator before you go.</p>`;
}
/* Experiment tp-day: what to know on the day, per leg and direction (D.net edges' day: {fromHub: {at, to, early, bag, tips, src}}):
   which pier, station or office, how early to be there, luggage, and tips, each from its source */
EXPERIMENTS.push({id:"tp-day", n:"Transport: on the day", d:"Legs show a card for the travel day: which pier, station or office, how early to be there, luggage limits and tips, from the sources."});
function dayCard(L){
  if (!exp("tp-day")) return "";
  const d = L.o.day && L.o.day[L.from]; if (!d) return "";
  const li = [d.at && `<li><b>Leaves from</b> ${esc(d.at)}</li>`, d.to && `<li><b>Arrives at</b> ${esc(d.to)}</li>`, d.early && `<li><b>Timing</b> ${esc(d.early)}</li>`,
    d.bag && `<li><b>Luggage</b> ${esc(d.bag)}</li>`].concat((d.tips || []).map(x => `<li>${esc(x)}</li>`)).filter(Boolean);
  return `<div class="callout day-card">${icon("pin")}<div><b>On the day</b><ul class="known">${li.join("")}</ul>
    <p class="note">From ${(d.src || []).map(x => `<a href="${esc(x[1])}" target="_blank" rel="noopener">${esc(x[0])}</a>`).join(", ")}.</p></div></div>`;
}
/* Experiment tp-book: booking pressure on the travel date (or today): Full Moon Party nights on Koh Phangan's boats, New Year on
   Thai trains, and how far ahead Thai and Vietnamese trains open. Only what the sources say; where they give no number of days,
   the advice is "as soon as you know your date". */
EXPERIMENTS.push({id:"tp-book", n:"Transport: when to book", d:"Warns when your travel date is near a Full Moon Party (Koh Phangan boats) or New Year (Thai trains), and says how far ahead trains open."});
// Full Moon Party nights in Haad Rin (31 Dec is the New Year countdown party): the AirAsia guide, checked 23 Nov 2026
const FULL_MOONS = ["2026-11-24", "2026-12-24", "2026-12-31", "2027-01-22", "2027-02-22"];
const FMP_SRC = ["AirAsia: Full Moon Party Koh Phangan 2026 & 2027", "https://www.airasia.com/blog/thailand/surat-thani/full-moon-party-koh-phangan/"];
const WV = page => [`Wikivoyage: ${page.replace(/_/g, " ")}`, `https://en.wikivoyage.org/wiki/${page}`];
const S61_TH = ["Seat 61: Thailand", "https://www.seat61.com/Thailand.htm"], S61_VN = ["Seat 61: Vietnam", "https://www.seat61.com/Vietnam.htm"];
const dayDiff = (a, b) => Math.round((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 864e5);
const BOOK_RULES = [
  {id:"fullmoon", leg:L => (L.from === "phangan" || L.to === "phangan") && isBoat(L.o),
    on:iso => FULL_MOONS.find(d => Math.abs(dayDiff(iso, d)) <= 3),
    text:d => `Full Moon Party on ${fmtDay(d)}: the boats to and from Koh Phangan fill up around it, so book your ferry as soon as you know your date. Rooms go too, unless you book ahead.`,
    src:[WV("Ko_Pha_Ngan"), FMP_SRC], warn:true},
  {id:"thai-ny", leg:L => L.o.mode === "Train" && nodeCc(NODE[L.from]) === "TH", on:iso => { const md = iso.slice(5); return md >= "12-30" || md <= "01-03" ? iso : null; },
    text:() => "New Year (30 December to 3 January) is one of the two busiest times on Thai trains: book on the day booking opens. Long trips like Bangkok–Chiang Mai open up to 6 months ahead; trips of a quarter to 60% of a train’s route open 30 days ahead.",
    src:[S61_TH], warn:true},
  {id:"thai-1st", leg:L => L.o.mode === "Train" && L.o.night && nodeCc(NODE[L.from]) === "TH", on:iso => iso,
    text:() => "There’s usually just one 1st-class sleeping car per train, and it fills soon after booking opens. 2nd-class berths are easier to get.", src:[S61_TH]},
  {id:"vn-train", leg:L => L.o.mode === "Train" && nodeCc(NODE[L.from]) === "VN", on:iso => iso,
    text:() => "Booking opens 60 days before (sometimes over 90 for the whole line; short hops later). At Tet, Vietnamese New Year in late January or February, book the day it opens; other times you can usually buy at the station a few days ahead.", src:[S61_VN]}
];
// [{rule, L, d}] for the journey on the chosen date (or today)
function bookNotes(t, iso = ui.tp.date && ui.tp.date >= todayISO() ? ui.tp.date : todayISO()){
  if (!exp("tp-book")) return [];
  const out = [];
  BOOK_RULES.forEach(r => { const L = t.legs.find(r.leg); if (!L) return; const d = r.on(iso); if (d) out.push({r, L, d}); });
  return out;
}
function bookCard(t){
  const n = bookNotes(t); if (!n.length) return "";
  return `<div class="callout book-card${n.some(x => x.r.warn) ? " warn" : ""}">${icon("calendar")}<div><b>When to book</b><ul class="known">${n.map(x => `<li>${esc(x.r.text(x.d))}</li>`).join("")}</ul>
    <p class="note">From ${[...new Map(n.flatMap(x => x.r.src).map(s => [s[1], s])).values()].map(s => `<a href="${esc(s[1])}" target="_blank" rel="noopener">${esc(s[0])}</a>`).join(", ")}${n.some(x => x.r.id === "fullmoon") ? ". Party dates can move for Buddhist holidays: check before you go" : ""}.</p></div></div>`;
}
/* Experiment tp-town: getting around each stop on our route (metro, boats, songthaews, taxis, scooters, tuk-tuks), from each
   town's Wikivoyage "Get around" section (read 23 Nov 2026), on Transport for the place you're heading to (or where you are).
   Grab and Bolt publish no link that fills in a destination, so the button copies the place's name to paste into either app. */
EXPERIMENTS.push({id:"tp-town", n:"Transport: getting around town", d:"Transport shows how to get around the town you’re heading to (or in): metro, boats, songthaews, taxis, scooters, fair fares, and copies the place for Grab or Bolt."});
const TOWN = {
  bkk:{w:"Bangkok", i:[
    ["train", "BTS Skytrain and MRT metro", "06:00 to midnight. The MRT takes contactless Visa or Mastercard at the gates; the BTS doesn’t yet, so buy a single ticket, a Rabbit card (200 baht, 100 of it to spend; passport needed) or a 150-baht day pass."],
    ["train", "Airport Rail Link", "Suvarnabhumi to Phaya Thai 45 baht, 27 minutes; to Makkasan (for the MRT) 35 baht."],
    ["ship", "Chao Phraya Express Boat", "Orange-flag boat 14 baht, every day 06:00–19:00, stopping at Tha Chang for the Grand Palace; Phra Arthit is the pier for Khao San Road. The blue-flag tourist boat is 40 baht (150 for a day pass): touts may say the orange boat isn’t coming, but it runs every 5–20 minutes."],
    ["car", "Taxis", "Ask for the meter. Hail a moving taxi on the main road, away from the tourist spots, or use Grab or Bolt."],
    ["car", "Tuk-tuks", "Never get in one that someone else is steering you to, and ignore ‘all-day tours’ for 10 baht: they end at gem and souvenir shops."]]},
  cnx:{w:"Chiang_Mai", i:[
    ["bus", "RTC city bus", "Air-conditioned, a few useful routes including the airport: 20 baht, cash to the driver."],
    ["car", "Red songthaews (rot daeng)", "Shared trucks with no fixed route. The sign says at most 30 baht a person, inside the second ring road."],
    ["car", "Tuk-tuks", "Rarely under 100 baht, even for a few kilometres."]]},
  pai:{w:"Pai", i:[
    ["nav", "On foot", "The town centre is small and easy to walk."],
    ["car", "Bicycles and scooters", "Bicycles 40–100 baht a day; a 125cc scooter about 100–300 baht a day, with a 2,000–3,000 baht cash deposit or your passport."]]},
  tao:{w:"Ko_Tao", i:[
    ["car", "Taxis", "Pickup taxis in Sairee and Mae Haad: at least 300 baht a trip, or about 100 baht each for a bigger group."],
    ["car", "Scooters", "Some shops keep your passport, then charge for scratches that were already there (mostly on or near the ‘Up Road’ from Mae Haad). Photograph the bike before you ride."]]},
  phangan:{w:"Ko_Pha_Ngan", i:[
    ["car", "Songthaews", "200–300 baht a person: bargain, especially for short trips, and share to pay less."],
    ["car", "Scooters", "About 250 baht a day, 200 for longer rentals. Wear a helmet: the police fine 200 baht."]]},
  samui:{w:"Ko_Samui", i:[
    ["car", "Songthaews", "Fixed routes and prices until 18:00: 20–80 baht a person (Na Thon pier to Bophut 50). After 18:00 they work as taxis: agree the price first."],
    ["car", "Scooters", "120–700 baht a day; a small 125cc shouldn’t be over 200, even at New Year. Rent from a reputable shop."]]},
  aonang:{w:"Ao_Nang", i:[
    ["car", "Songthaews", "Around Ao Nang from 20 baht; the white ones to Krabi Town and its bus station are 60 baht."],
    ["car", "Tuk-tuks", "About 100 baht inside Ao Nang, 400 to Krabi Town (2019 prices: agree first)."],
    ["car", "Scooters", "150–200 baht for 24 hours."]]},
  krabi:{w:"Krabi_Town", i:[
    ["car", "White songthaew to Ao Nang", "60 baht, from near the Vogue department store on Maharaj Road."],
    ["car", "Taxi", "Bus station to the town centre about 100 baht (4 km)."]]},
  phuket:{w:"Phuket", i:[
    ["bus", "Smart Bus", "100 baht a trip wherever you get on and off: the airport to the beaches, and between them."],
    ["car", "Tuk-tuks", "At least 200 baht; about half as much again at night."],
    ["car", "Motorbike taxis", "From 20 baht for 1–2 km; drivers wear numbered vests."]]},
  rep:{w:"Siem_Reap", i:[
    ["car", "Motodops (motorbike taxis)", "About US$0.50 (2,000 riel) in town, up to double at night or in the rain: agree first. A full day about US$10."],
    ["car", "Scooters", "From about US$8 a day. Wear a helmet: police checkpoints fine US$15."]]},
  pnh:{w:"Phnom_Penh", i:[
    ["car", "Tuk-tuks", "US$2–3 a trip in the city, US$8 to the airport. PassApp tuk-tuks are metered."],
    ["car", "Motodops", "Riverfront to Central Market about 2,000 riel; more at night."],
    ["alert", "Bag snatching", "Keep phones and bags in the middle of a tuk-tuk, not on the side by the road."]]},
  hoian:{w:"Hoi_An", i:[
    ["car", "Bicycles", "From 20,000 dong a day: the best way round town."],
    ["car", "Scooters", "About 125,000 dong a day (2018). No motorbikes in the Old Town on the 14th and 15th of each lunar month."]]},
  dad:{w:"Da_Nang", i:[
    ["car", "Grab", "Widely used, and its chat translates both ways."],
    ["car", "Motorbike taxis", "Short hops about 20,000 dong; to the airport about 70,000."],
    ["car", "Taxis", "Mai Linh and Vinasun are reliable; their meters start by themselves."]]},
  han:{w:"Hanoi", i:[
    ["train", "Metro", "8,000–15,000 dong; tap a contactless card or phone at the gates."],
    ["bus", "Buses", "7,000–12,000 dong; pay the assistant on board."],
    ["car", "Grab", "The easiest way round: fixed fares, cash or card."],
    ["car", "Taxis", "Insist on the meter: 20,000 dong for the first 2 km."]]}
};
// the stop to describe: where you're heading (if it's one of ours), else where you are
function townFor(fN, tN){
  for (const n of [tN, fN]) if (n && n.id && TOWN[n.id]) return n.id;
  return null;
}
async function copyText(text){
  try { await navigator.clipboard.writeText(text); return true; } catch(e){ return false; }
}
function townHTML(id, dest){
  const T = TOWN[id]; if (!T) return "";
  return `<div class="block town" style="margin-top:18px"><h2>Getting around ${esc(HUB[id].n)}</h2>
    <ul class="town-list">${T.i.map(x => `<li>${icon(x[0], "i s")}<div><b>${esc(x[1])}</b><span>${esc(x[2])}</span></div></li>`).join("")}</ul>
    ${dest ? `<button class="btn small" type="button" id="tpCopy" data-copy="${esc(dest)}">${icon("car","i s")}Copy “${esc(dest)}” for Grab or Bolt</button>` : ""}
    <p class="note" style="margin-top:8px">From <a href="https://en.wikivoyage.org/wiki/${esc(T.w)}" target="_blank" rel="noopener">Wikivoyage: ${esc(T.w.replace(/_/g, " "))}</a>, read 23 Nov 2026. Prices change: agree the fare before you ride.</p></div>`;
}
// the whole journey, leg by leg, in a sheet with its own map
function tripSheetHTML(t){
  const allUnpriced = t.unpriced === t.legs.length;
  const tc = tripCur(t);
  const price = tripPrice(t);
  const legs = t.legs.map((L, k) => {
    const o = L.o, fromStn = stationOf(L.from === o.a ? o.da : o.db);
    const lp = o.p ? (o.from ? "from " : "") + withGBP(localRange(o.p, o.cur, ccCur(nodeCc(NODE[L.from]))), o.p, o.cur) : "price not saved";
    return `<div class="leg"><span class="li legn" style="--lc:${LEG_COLS[k % LEG_COLS.length]}"><i>${k + 1}</i>${icon(MODE_IC[o.mode] || "bus", "i s")}</span><div>
      <b>${esc(legTitle(t, k))}</b>
      <div class="m">${esc(legKind(o))}</div>
      <div class="m">${fRange(o.dur[0], o.dur[1])}${o.mode === "Flight" ? " flying, plus airport time" : ""}, ${esc(lp)}${fromStn && fromStn.lat != null ? `, from ${esc(fromStn.n)}` : ""}${o.verified ? "" : ' <span class="tag warn">Estimate</span>'}</div>
      ${exp("tp-sea") && isBoat(o) ? `<div class="sea-line" data-sea="${k}" hidden></div>` : ""}${legTimesHTML(L)}${dayCard(L)}${borderCard(t, k)}${legBookBtn(L)}${o.mode === "Flight" ? `<a class="btn small" style="margin-top:6px" href="${esc(flightLink(L))}" target="_blank" rel="noopener">${icon("plane","i s")}Flight times${ui.tp.date ? " on " + esc(fmtDay(ui.tp.date)) : ""} on Google Flights ${icon("ext","i s")}</a>` : ""}
    </div></div>`;
  }).join("");
  const first = t.legs[0], firstStn = stationOf(first.from === first.o.a ? first.o.da : first.o.db);
  const a = NODE[t.legs[0].from].n, b = NODE[t.legs[t.legs.length - 1].to].n;
  const notes = t.legs.flatMap((L, k) => L.o.notes.map(n => `${legTitle(t, k)}: ${n}`));
  const srcs = t.legs.flatMap(L => L.o.src || []);
  return `<div class="sheet-head"><h2 id="trip-title" style="margin:0">${esc(a)} → ${esc(b)}</h2><button class="icon-btn" data-close aria-label="Close">${icon("x")}</button></div>
    <div class="trip open">
    <div>${t.fastest ? '<span class="badge">Fastest</span>' : ""}${t.cheapest ? '<span class="badge cheap">Cheapest</span>' : ""}</div>
    <div class="sum" style="margin-top:6px"><div><div class="big">${fRange(t.dmin, t.dmax)}</div><div class="m note">${t.legs.length === 1 ? "Direct" : `${t.legs.length} legs, ${t.legs.length - 1} change${t.legs.length > 2 ? "s" : ""}`}${t.legs.some(L => L.o.mode === "Flight") ? ", includes airport time" : ""}</div></div>
      <div class="price">${price}</div></div>${nightLine(t)}
    <div class="legmap" id="legMap" role="img" aria-label="Map of the journey, each leg in its own colour"></div>
    ${typeof leaveByHTML === "function" ? leaveByHTML(t) : ""}<div style="margin-top:8px">${legs}</div>${bookCard(t)}
    ${getThere(firstStn)}
    <div class="row" style="margin-top:12px">${t.legs.length > 1 && go12(t.legs[0].from, t.legs[t.legs.length - 1].to) ? ext(go12(t.legs[0].from, t.legs[t.legs.length - 1].to), "Search the whole route on 12Go " + icon("ext","i s")) : ""}${ext(`https://www.rome2rio.com/s/${enc(a)}/${enc(b)}`, "Rome2Rio " + icon("ext","i s"))}</div>
    ${t.legs.some(L => legBook(L)) ? `<p class="note" style="margin-top:6px">12Go shows the real departures and confirms the service, today’s price and seats; these times and prices are a saved guide.${ui.tp.date && t.legs.length > 1 ? " Your date is used for every leg: change it on 12Go if a later leg is the next day." : ""}</p>` : ""}
    <details class="more"><summary>Details and sources</summary>
      ${notes.length ? `<ul class="known">${notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
      <p class="note">${srcs.length ? "Checked " + esc(D.checked) + ": " + srcs.map(s => `<a href="${esc(s[1])}" target="_blank" rel="noopener">${esc(s[0])}</a>`).join(", ") : "Estimate, not checked."}${t.legs.some(L => L.o.mode === "Flight") ? " Flight times include about 2–3 hours for getting to, through and out of the airports." : ""}</p>
    </details>
    ${ui.tp.date ? "" : `<p class="note" style="margin-top:8px">Pick a travel date on the planner to see flight times and 12Go departures for that day.</p>`}
  </div>`;
}
const fmtDay = iso => new Date(iso + "T12:00:00").toLocaleDateString("en-GB", {weekday:"short", day:"numeric", month:"short"});
// the journey map: each leg a line in its own colour (flights dashed), a numbered dot at every stop and the mode's icon halfway
let legMap = null;
/* Experiment tp-saved: save a journey from the results (the whole sheet, kept on the phone, so it opens with no signal) and pin
   one as "our next journey" at the top of Transport. Up to 12 are kept. */
EXPERIMENTS.push({id:"tp-saved", n:"Transport: saved journeys", d:"Save a journey (it opens offline) and pin one as “our next journey” at the top of Transport."});
const savedTrips = () => Array.isArray(S.savedTrips) ? S.savedTrips : (S.savedTrips = []);
function saveTrip(t){
  const a = NODE[t.legs[0].from].n, b = NODE[t.legs[t.legs.length - 1].to].n, html = tripSheetHTML(t).replace(/<div[^>]*id="legMap"[^>]*><\/div>/, "");
  const list = savedTrips(), id = "j" + Date.now().toString(36);
  list.unshift({id, title:`${a} → ${b}`, sub:`${t.legs.map(L => L.o.mode).join(" › ")} · ${fRange(t.dmin, t.dmax)}`, date:ui.tp.date || "", at:Date.now(), pin:!list.some(x => x.pin), html});
  S.savedTrips = list.slice(0, 12); persist();
  return id;
}
function savedTripsHTML(){
  const list = savedTrips(); if (!exp("tp-saved") || !list.length) return "";
  const pin = list.find(x => x.pin), row = x => `<div class="sj-row"><button class="sj-open" type="button" data-sjopen="${esc(x.id)}"><b>${esc(x.title)}</b><small>${esc(x.sub)}${x.date ? " · " + esc(fmtDay(x.date)) : ""}</small></button>
    <button class="icon-btn" type="button" data-sjpin="${esc(x.id)}" aria-pressed="${!!x.pin}" aria-label="${x.pin ? "Pinned as our next journey" : "Pin as our next journey"}">${icon("bookmark","i s")}</button>
    <button class="icon-btn" type="button" data-sjdel="${esc(x.id)}" aria-label="Remove ${esc(x.title)}">${icon("trash","i s")}</button></div>`;
  return `${pin ? `<div class="block sj-next"><div class="note">Our next journey</div>${row(pin)}</div>` : ""}
    ${list.filter(x => !x.pin).length ? `<details class="block more sj-list"><summary><b>Saved journeys</b> <span class="note">${list.filter(x => !x.pin).length}</span></summary>${list.filter(x => !x.pin).map(row).join("")}</details>` : ""}`;
}
function bindSavedTrips(root){
  root.querySelectorAll("[data-sjopen]").forEach(b => b.onclick = () => { const x = savedTrips().find(y => y.id === b.dataset.sjopen); if (x) openSheet(x.html.replace('id="trip-title"', 'id="trip-title" data-saved="1"') + `<p class="note" style="margin-top:8px">Saved ${esc(typeof agoText === "function" ? agoText(x.at) : "")}: prices and times as they were then.</p>`, "trip-title"); });
  root.querySelectorAll("[data-sjpin]").forEach(b => b.onclick = () => { savedTrips().forEach(y => y.pin = y.id === b.dataset.sjpin); persist(); renderPage(); });
  root.querySelectorAll("[data-sjdel]").forEach(b => b.onclick = () => { S.savedTrips = savedTrips().filter(y => y.id !== b.dataset.sjdel); if (S.savedTrips.length && !S.savedTrips.some(y => y.pin)) S.savedTrips[0].pin = true; persist(); renderPage(); });
}
function openTripSheet(t){
  if (legMap){ try { legMap.remove(); } catch(e){} legMap = null; }
  openSheet(tripSheetHTML(t), "trip-title");
  paintSea(t);
  if (exp("tp-saved")){
    const head = $("#sheetRoot .sheet-head");
    if (head){ head.insertAdjacentHTML("afterend", `<button class="btn small" type="button" id="tpSave" style="margin:6px 0 2px">${icon("bookmark","i s")}Save this journey</button>`);
      $("#tpSave").onclick = () => { saveTrip(t); const b = $("#tpSave"); b.disabled = true; b.textContent = "Saved: it’s at the top of Transport, and opens offline"; }; }
  }
  const el = $("#legMap"); if (!el || typeof maplibregl === "undefined") { if (el) el.remove(); return; }
  const pts = [t.legs[0].from].concat(t.legs.map(L => L.to)).map(k => NODE[k]);
  try {
    legMap = new maplibregl.Map({container:el, style:{version:8, glyphs:MAP_STYLE.glyphs, sources:{}, layers:[{id:"bg", type:"background", paint:{"background-color":cssv("--sea")}}]},
      bounds:[[Math.min(...pts.map(p => p.lng)), Math.min(...pts.map(p => p.lat))], [Math.max(...pts.map(p => p.lng)), Math.max(...pts.map(p => p.lat))]],
      fitBoundsOptions:{padding:40, maxZoom:10}, attributionControl:false, dragRotate:false, pitchWithRotate:false, touchPitch:false});
  } catch(e){ el.remove(); return; }
  legMap.on("load", () => {
    legMap.addSource("land", {type:"geojson", data:geoFC()});
    legMap.addLayer({id:"land", type:"fill", source:"land", paint:{"fill-color":["case", ["==", ["get", "cc"], ""], cssv("--land"), cssv("--land-trip")], "fill-outline-color":cssv("--border-land")}});
    const lines = t.legs.map((L, k) => ({type:"Feature", geometry:{type:"LineString", coordinates:[[NODE[L.from].lng, NODE[L.from].lat], [NODE[L.to].lng, NODE[L.to].lat]]}, properties:{col:LEG_COLS[k % LEG_COLS.length], fly:L.o.mode === "Flight"}}));
    legMap.addSource("legs", {type:"geojson", data:fc(lines)});
    legMap.addLayer({id:"leg-casing", type:"line", source:"legs", layout:{"line-cap":"round"}, paint:{"line-color":cssv("--bg"), "line-width":8}});
    legMap.addLayer({id:"leg-line", type:"line", source:"legs", filter:["!=", ["get", "fly"], true], layout:{"line-cap":"round"}, paint:{"line-color":["get", "col"], "line-width":5}});
    legMap.addLayer({id:"leg-fly", type:"line", source:"legs", filter:["==", ["get", "fly"], true], paint:{"line-color":["get", "col"], "line-width":4, "line-dasharray":[1.2, 1.6]}});
    // the mode's icon halfway along each leg, and a numbered dot at each stop
    t.legs.forEach((L, k) => {
      const a = NODE[L.from], b = NODE[L.to], m = document.createElement("div");
      m.className = "leg-ic"; m.style.setProperty("--lc", LEG_COLS[k % LEG_COLS.length]); m.innerHTML = icon(MODE_IC[L.o.mode] || "bus", "i s");
      new maplibregl.Marker({element:m}).setLngLat([(a.lng + b.lng) / 2, (a.lat + b.lat) / 2]).addTo(legMap);
    });
    pts.forEach((p, k) => {
      const m = document.createElement("div"); m.className = "leg-stop" + (k === 0 ? " first" : k === pts.length - 1 ? " last" : "");
      m.innerHTML = `<b>${k === 0 ? "A" : k === pts.length - 1 ? "B" : k}</b><span>${esc(p.n)}</span>`;
      new maplibregl.Marker({element:m, anchor:"left", offset:[-11, 0]}).setLngLat([p.lng, p.lat]).addTo(legMap);
    });
  });
}
function routeCard(r){
  const pr = routeLocal(r);
  return `<div class="block"><div class="kind2">${icon(MODE_IC[r.mode] || "bus","i s")}${esc(r.mode)}</div>
    <h2 style="margin-top:4px">${esc(r.a)} → ${esc(r.b)}</h2>
    <div class="meta">${r.dur ? `<span>${esc(r.dur)}</span>` : ""}${pr ? `<span>${esc(pr)} (${esc(gbpRange(r.p, r.cur))})</span>` : "<span>Price: check live</span>"}${r.op ? `<span>${esc(r.op)}</span>` : ""}</div>
    ${r.notes.length ? `<ul class="known">${r.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
    <div class="row" style="margin-top:10px">${ext(r.live || L_google(`12Go ${r.a} to ${r.b}`), "Check live on 12Go " + icon("ext","i s"))}</div></div>`;
}
// "From" defaults to where you are: snap to a hub if you're in one of its cities, otherwise your exact spot
function hereNode(){
  if (!userLoc) return hubNode("bkk");
  let best = null, bk = 1e9;
  Object.values(HUB).filter(h => !isAirport(h.id)).forEach(h => { const k = dist(userLoc, h); if (k < bk){ bk = k; best = h; } });
  if (bk <= (best.island ? (ISLAND_R[best.id] || 8) : 25)) return Object.assign(hubNode(best.id), {here:true});
  return {n:"Your location", lat:userLoc.lat, lng:userLoc.lng, here:true};
}
const fromNode = () => ui.tp.from || hereNode();
const nodeLabel = n => n ? (n.here ? (n.id ? `${n.n} (you’re here)` : "Your location") : n.n) : "";
function transportPage(){
  const fN = fromNode(), tN = ui.tp.to;
  const trips = tN && ui.tp.go ? planTrips(fN, tN) : [];
  if (ui.tp.sel >= trips.length) ui.tp.sel = 0;
  ui._trips = trips;
  let html = hero({title:"Transport", sub:"Search anywhere, see every way to get there"}) + `<div class="page">${savedTripsHTML()}
    <div class="block plan">
      <div class="pair">
        <label class="field sfield">From<input id="tp-from" type="search" autocomplete="off" enterkeyhint="search" value="${esc(nodeLabel(fN))}" placeholder="Search a place"><div class="sugs" id="sug-from" hidden></div></label>
        <button class="icon-btn" id="tp-swap" type="button" aria-label="Swap start and destination" style="margin-bottom:2px">${icon("swap")}</button>
        <label class="field sfield">To<input id="tp-to" type="search" autocomplete="off" enterkeyhint="search" value="${esc(nodeLabel(tN))}" placeholder="Where to?"><div class="sugs" id="sug-to" hidden></div></label>
      </div>
      <div class="seg" role="group" aria-label="Sort journeys"><button data-tsort="fast" aria-pressed="${ui.tp.sort === "fast"}">Fastest</button><button data-tsort="cheap" aria-pressed="${ui.tp.sort === "cheap"}">Cheapest</button></div>
      <div class="pair tp-when"><label class="field">Travel date<input type="date" id="tp-date" min="${todayISO()}" value="${esc(ui.tp.date || "")}"></label>
        <label class="field">People<select id="tp-people">${[1,2,3,4,5,6,7,8,9].map(n => `<option value="${n}" ${+ui.tp.people === n ? "selected" : ""}>${n}</option>`).join("")}</select></label></div>
      <p class="note" style="margin:0">Optional: the date is used for flight times and 12Go’s departures on that day.</p>
      <button class="btn primary wide" type="button" id="tp-go" style="margin-top:10px" ${tN ? "" : "disabled"}>${icon("search","i s")}Search</button>
    </div>
    <div id="tpMap" class="tmap" role="application" aria-label="Transport map"></div>
    <p class="note" style="margin:0 0 14px">Tap a dot on the map to head there, or search any town, beach, hostel or sight.</p>`;
  if (ui.tp.busy) html += `<div class="empty tp-busy" role="status"><span class="spin" aria-hidden="true"></span><b>Finding every way to get there…</b></div>`;
  else if (tN && !ui.tp.go) html += `<p class="note" style="margin:0 0 14px">Press <b>Search</b> to see the ways to get to ${esc(tN.n)}.</p>`;
  else if (!tN) html += emptyBlock("Where are you heading?", `<div>Search for any place, or tap a dot on the map. You’ll see every way to get there: trains, buses, minivans, ferries, flights and taxis, with times, prices and where each one leaves from.</div>`);
  else if (!trips.length){
    const far = !tN.id && !connectors(tN, "@x").length;
    html += emptyBlock(far ? "That’s outside the saved network" : "No saved connections yet", `<div>${far ? "The planner covers Thailand, Cambodia, Vietnam, Laos, Singapore, Malaysia and Indonesia’s main stops. Check Rome2Rio for this one." : "This trip isn’t in the saved network yet."}</div>`,
      ext(`https://www.rome2rio.com/s/${enc(fN.n)}/${enc(tN.n)}`, "Search Rome2Rio " + icon("ext","i s")));
  }
  else html += `<p class="note" style="margin:0 0 8px">${trips.length} way${trips.length === 1 ? "" : "s"} to get there. Times and prices are a saved baseline, so confirm live before you pay.</p>` + trips.map(tripCard).join("");
  const town = exp("tp-town") ? townFor(fN, tN) : null;
  if (town) html += townHTML(town, tN && !tN.here ? tN.n : "");
  else html += `<div class="block" style="margin-top:18px"><h2>Getting a ride in town</h2><p class="note" style="margin:2px 0 10px">${esc(D.countries[S.country].name)}, general tips (not price-checked)</p><p style="margin:0">${esc(D.rides[S.country])}</p></div>`;
  const other = D.routes.filter(r => !r.cc.every(c => c === "TH"));
  html += `<details class="more" style="margin-top:6px"><summary>Saved routes in the other countries (${other.length})</summary><div style="margin-top:10px">${other.map(routeCard).join("")}</div></details></div>`;
  return html;
}
/* the planner's own small map: country outlines, the hubs and the chosen journey */
let tmap = null, tmapLoaded = false, tmapEl = null;
function detachTransportMap(){ if (tmapEl && tmapEl.parentNode) tmapEl.remove(); }
function drawTripOnMap(){
  if (!tmap || !tmapLoaded) return;
  const t = ui._trips && ui._trips[ui.tp.sel];
  const fN = fromNode(), tN = ui.tp.to;
  const lines = [], pts = [];
  if (t) t.legs.forEach(lg => {
    const a = NODE[lg.from], b = NODE[lg.to]; pts.push([a.lng, a.lat], [b.lng, b.lat]);
    lines.push({type:"Feature", geometry:{type:"LineString", coordinates:[[a.lng, a.lat], [b.lng, b.lat]]}, properties:{col:cssv(MODE_COL[lg.o.mode] || "--move"), fly:lg.o.mode === "Flight"}});
  });
  tmap.getSource("trip").setData(fc(lines));
  const ends = [[fN, "--food"], [tN, "--accent"]].filter(([n]) => n && !n.id).map(([n, c]) => ({type:"Feature", geometry:{type:"Point", coordinates:[n.lng, n.lat]}, properties:{col:cssv(c)}}));
  tmap.getSource("ends").setData(fc(ends));
  const all = t ? pts : Object.values(HUB).map(h => [h.lng, h.lat]).concat(tN ? [[tN.lng, tN.lat]] : []);
  const w = Math.min(...all.map(p => p[0])), e = Math.max(...all.map(p => p[0])), s = Math.min(...all.map(p => p[1])), n = Math.max(...all.map(p => p[1]));
  try { tmap.fitBounds([[w, s], [e, n]], {padding:t ? 34 : 20, maxZoom:t ? 10.5 : 8, duration:0}); } catch(err){}
}
function paintTransportMap(){
  if (!tmap || !tmapLoaded) return;
  const fN = fromNode(), tN = ui.tp.to;
  const hubs = Object.values(HUB).map(h => {
    const isF = !!fN && fN.id === h.id, isT = !!tN && tN.id === h.id;
    return {type:"Feature", geometry:{type:"Point", coordinates:[h.lng, h.lat]}, properties:{id:h.id, n:h.n, isF, big:isF || isT, col:isF ? cssv("--food") : isT ? cssv("--accent") : cssv("--move")}};
  });
  if (userLoc) hubs.push({type:"Feature", geometry:{type:"Point", coordinates:[userLoc.lng, userLoc.lat]}, properties:{n:"", big:false, col:"#ffffff"}});
  tmap.getSource("hubs").setData(fc(hubs));
  drawTripOnMap();
}
function initTransportMap(){
  const slot = $("#tpMap"); if (!slot || typeof maplibregl === "undefined") return;
  if (tmap){ slot.replaceWith(tmapEl); setTimeout(() => { try { tmap.resize(); } catch(e){} paintTransportMap(); }, 0); return; }
  tmapEl = slot;
  try {
    tmap = new maplibregl.Map({container:slot, style:{version:8, glyphs:MAP_STYLE.glyphs, sources:{}, layers:[{id:"bg", type:"background", paint:{"background-color":cssv("--sea")}}]},
      center:[100.4, 12.5], zoom:4.2, minZoom:3, maxZoom:13, attributionControl:false, dragRotate:false, pitchWithRotate:false, touchPitch:false, renderWorldCopies:false});
  } catch(e){ tmap = null; slot.innerHTML = '<div class="map-msg">The route map can’t run on this device. The journeys below still work.</div>'; return; }
  if (tmap.touchZoomRotate && tmap.touchZoomRotate.disableRotation) tmap.touchZoomRotate.disableRotation();
  tmap.on("load", () => {
    tmapLoaded = true;
    tmap.addSource("land", {type:"geojson", data:geoFC()});
    tmap.addLayer({id:"land", type:"fill", source:"land", paint:{"fill-color":["case", ["==", ["get", "cc"], ""], cssv("--land"), cssv("--land-trip")], "fill-outline-color":cssv("--border-land")}});
    tmap.addSource("trip", {type:"geojson", data:fc([])});
    tmap.addLayer({id:"trip-line", type:"line", source:"trip", filter:["!=", ["get", "fly"], true], layout:{"line-cap":"round", "line-join":"round"}, paint:{"line-color":["get", "col"], "line-width":4}});
    tmap.addLayer({id:"trip-fly", type:"line", source:"trip", filter:["==", ["get", "fly"], true], paint:{"line-color":["get", "col"], "line-width":3, "line-dasharray":[1, 2.5]}});
    tmap.addSource("hubs", {type:"geojson", data:fc([])});
    tmap.addLayer({id:"hub-dot", type:"circle", source:"hubs", paint:{"circle-radius":["case", ["get", "big"], 8, 5.5], "circle-color":["get", "col"], "circle-stroke-color":cssv("--bg"), "circle-stroke-width":2}});
    // the trip's towns and islands by name (those that aren't also a stop, which has its own name below its dot)
    const hubNames = new Set(Object.values(HUB).map(h => h.n.toLowerCase()));
    tmap.addSource("cities", {type:"geojson", data:fc(D.cities.filter(c => !hubNames.has(String(c[0]).toLowerCase())).map(c => ({type:"Feature", geometry:{type:"Point", coordinates:[c[2], c[1]]}, properties:{n:c[0]}})))});
    tmap.addLayer({id:"city-name", type:"symbol", source:"cities", minzoom:4, layout:{"text-field":["get", "n"], "text-font":["Noto Sans Regular"], "text-size":11, "text-optional":true, "text-padding":3},
      paint:{"text-color":cssv("--ink"), "text-halo-color":cssv("--halo"), "text-halo-width":1.2}});
    tmap.addLayer({id:"hub-name", type:"symbol", source:"hubs", minzoom:4.6, layout:{"text-field":["get", "n"], "text-font":["Noto Sans Regular"], "text-size":10.5, "text-offset":[0, .9], "text-anchor":"top", "text-optional":true},
      paint:{"text-color":cssv("--muted"), "text-halo-color":cssv("--halo"), "text-halo-width":1.1}});
    tmap.addSource("ends", {type:"geojson", data:fc([])});
    tmap.addLayer({id:"end-dot", type:"circle", source:"ends", paint:{"circle-radius":8, "circle-color":["get", "col"], "circle-stroke-color":cssv("--bg"), "circle-stroke-width":2}});
    tmap.on("click", "hub-dot", e => { const f = e.features && e.features[0]; if (f && f.properties.id && !f.properties.isF){ ui.tp.to = hubNode(f.properties.id); ui.tp.sel = 0; renderPage(); } });
    tmap.on("mouseenter", "hub-dot", () => tmap.getCanvas().style.cursor = "pointer"); tmap.on("mouseleave", "hub-dot", () => tmap.getCanvas().style.cursor = "");
    paintTransportMap();
  });
}
/* place search: saved places instantly; with a Google key, live suggestions; without one, an OpenStreetMap search on request */
let gSession = null;
async function googleSuggest(q){
  const maps = await loadGoogle(); if (!maps) return null;
  try {
    const { AutocompleteSuggestion, AutocompleteSessionToken } = await maps.importLibrary("places");
    if (!gSession) gSession = new AutocompleteSessionToken();
    const req = {input:q, sessionToken:gSession, includedRegionCodes:["th","kh","vn","la","my","sg","id"]};
    if (userLoc) req.origin = {lat:userLoc.lat, lng:userLoc.lng};
    const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
    return (suggestions || []).filter(s => s.placePrediction).slice(0, 5).map(s => {
      const p = s.placePrediction, txt = x => x ? String(x.text != null ? x.text : x) : "";
      return {n: txt(p.mainText) || txt(p.text), sub: txt(p.secondaryText), resolve: async () => {
        const pl = p.toPlace(); await pl.fetchFields({fields:["location"]}); gSession = null;
        return {lat: pl.location.lat(), lng: pl.location.lng()};
      }};
    });
  } catch(e){ return null; }
}
function bindSearch(which){
  const inp = $(`#tp-${which}`), box = $(`#sug-${which}`);
  let timer = null, online = [], lastQ = "", searching = false;
  const choose = node => { ui.tp[which] = node; ui.tp.sel = 0; ui.tp.go = false; renderPage(); };
  const paint = () => {
    const q = inp.value.trim(); const local = localMatches(q, true);
    let h = "";
    if (which === "from") h += `<button type="button" data-here>${icon("locate","i s")} Where I am<small>${esc(nodeLabel(hereNode()))}</small></button>`;
    h += local.map((s, i) => `<button type="button" data-l="${i}">${esc(s.n)}<small>${esc(s.sub)}</small></button>`).join("");
    const localNames = new Set(local.map(s => s.n.toLowerCase()));
    online = online.filter(s => !localNames.has(s.n.toLowerCase()));
    if (online.length) h += `<div class="hd">More places</div>` + online.map((s, i) => `<button type="button" data-o="${i}">${esc(s.n)}<small>${esc(s.sub)}</small></button>`).join("");
    else if (q.length >= 3 && !googleKey()) h += `<button type="button" data-osm>${icon("search","i s")} Search the map for “${esc(q)}”<small>OpenStreetMap, needs signal</small></button>`;
    else if (q.length >= 3 && !local.length) h += `<div class="hd">${searching ? "Searching…" : "No matches. Try another spelling."}</div>`;
    box.innerHTML = h; box.hidden = !h;
    box.querySelectorAll("[data-l]").forEach(b => b.onmousedown = e => { e.preventDefault(); choose(local[+b.dataset.l].node); });
    box.querySelectorAll("[data-o]").forEach(b => b.onmousedown = async e => { e.preventDefault(); const s = online[+b.dataset.o]; if (s.node) return choose(s.node); try { const loc = await s.resolve(); choose({n:s.n, lat:loc.lat, lng:loc.lng}); } catch(err){ toast("Couldn’t get that place. Try again with signal."); } });
    const hb = box.querySelector("[data-here]"); if (hb) hb.onmousedown = e => { e.preventDefault(); choose(null); };
    const ob = box.querySelector("[data-osm]"); if (ob) ob.onmousedown = async e => { e.preventDefault(); ob.innerHTML = "Searching…"; const r = await osmSearch(q); online = r || []; if (!r) toast("Search needs signal"); else if (!r.length) toast("Nothing found. Try another spelling."); paint(); };
  };
  inp.onfocus = () => { inp.select(); paint(); };
  inp.oninput = () => {
    online = []; paint();
    clearTimeout(timer);
    const q = inp.value.trim(); lastQ = q;
    if (q.length >= 3 && googleKey()){ searching = true; timer = setTimeout(async () => { const r = await googleSuggest(q); if (q !== lastQ) return; searching = false; online = r || []; paint(); }, 350); }
  };
  inp.onkeydown = e => { if (e.key === "Enter"){ const first = box.querySelector("button"); if (first) first.dispatchEvent(new MouseEvent("mousedown")); } if (e.key === "Escape"){ box.hidden = true; inp.blur(); } };
  inp.onblur = () => setTimeout(() => { box.hidden = true; inp.value = nodeLabel(which === "from" ? fromNode() : ui.tp.to); }, 150);
}
function bindTransport(){
  bindSavedTrips($("#pageview"));
  const cp = $("#tpCopy");
  if (cp) cp.onclick = async () => toast(await copyText(cp.dataset.copy) ? `Copied “${cp.dataset.copy}”: paste it into Grab or Bolt as where you’re going` : "Couldn’t copy: type it into Grab or Bolt");
  const root = $("#pageview");
  bindSearch("from"); bindSearch("to");
  $("#tp-swap").onclick = () => { if (!ui.tp.to) return; const f = fromNode(); ui.tp.from = ui.tp.to; ui.tp.to = f; ui.tp.sel = 0; ui.tp.go = false; renderPage(); };
  const gob = $("#tp-go");
  if (gob) gob.onclick = () => {
    if (!ui.tp.to){ toast("Pick where you’re going first"); return; }
    ui.tp.busy = true; ui.tp.go = true; renderPage();
    // a moment for the "finding" message to show, then the answers
    setTimeout(() => { ui.tp.busy = false; renderPage(); const r = $(".trip"); if (r) r.scrollIntoView({behavior: reduceMotion ? "auto" : "smooth", block:"start"}); }, 450);
  };
  root.querySelectorAll("[data-tsort]").forEach(b => b.onclick = () => { ui.tp.sort = b.dataset.tsort; ui.tp.sel = 0; renderPage(); });
  const td = $("#tp-date"), tpp = $("#tp-people");
  if (td) td.onchange = () => { ui.tp.date = td.value && td.value >= todayISO() ? td.value : ""; if (td.value && !ui.tp.date) toast("Pick today or a later date"); ui.tp.go = false; renderPage(); };
  if (tpp) tpp.onchange = () => { ui.tp.people = clamp(+tpp.value || 1, 1, 9); ui.tp.go = false; renderPage(); };
  root.querySelectorAll("[data-trip]").forEach(c => {
    const pick = e => { if (e.target.closest("a, summary, details")) return; ui.tp.sel = +c.dataset.trip; drawTripOnMap(); const t = ui._trips && ui._trips[ui.tp.sel]; if (t) openTripSheet(t); };
    c.onclick = pick; c.onkeydown = e => { if (e.key === "Enter" || e.key === " "){ e.preventDefault(); pick(e); } };
  });
  initTransportMap();
}
