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
const legMin = o => o.dur[0] + (o.mode === "Flight" ? FLIGHT_EXTRA[0] : 0) + CHANGE_EXTRA[0];
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
    return {legs, dmin, dmax, mid:(dmin + dmax) / 2, pmin, pmax, unpriced, unverified};
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
      trips = trips.filter(t => !third(t) || (c0 !== c1 && t.mid < best));
    }
  }
  // local rides at either end are always unpriced outside Bangkok, so judge prices on the main legs
  const core = t => t.unpriced - t.legs.filter(L => L.from[0] === "@" || L.to[0] === "@").filter(L => !L.o.p).length;
  const best = Math.min(...trips.map(t => t.mid));
  // experiment: the truly fastest journey is always kept, even when a leg on it has no saved price
  const quickest = exp("tp-fastest") ? trips.reduce((a, b) => (a.mid < b.mid || (a.mid === b.mid && core(a) <= core(b))) ? a : b) : null;
  trips = trips.filter(t => t.mid <= best * 2.5 + 2);
  const priced = trips.filter(t => !core(t));
  const keepUnpriced = new Set(trips.filter(t => core(t) && t.mid <= best * 1.6 + 1).sort((a, b) => (core(a) - core(b)) || (a.mid - b.mid)).slice(0, 3));
  trips = trips.filter(t => core(t) ? keepUnpriced.has(t)
    : !priced.some(u => u !== t && u.mid <= t.mid && u.pmin <= t.pmin && (u.mid < t.mid || u.pmin < t.pmin)));
  if (quickest && !trips.includes(quickest)) trips.push(quickest);
  // and no long way round: a trip goes if another is much quicker, no dearer, with no more legs and no more legs without a price
  trips = trips.filter(t => !trips.some(u => u !== t && u.mid * 1.3 < t.mid && u.legs.length <= t.legs.length && core(u) <= core(t) && u.pmin <= t.pmin + 0.5));
  const fastest = trips.reduce((a, b) => a.mid <= b.mid ? a : b);
  const cheapPool = trips.filter(t => !core(t));
  const cheapest = cheapPool.length ? cheapPool.reduce((a, b) => a.pmin <= b.pmin ? a : b) : null;
  trips.forEach(t => { t.fastest = t === fastest; t.cheapest = t === cheapest; });
  trips.sort(ui.tp.sort === "cheap"
    ? (a, b) => (core(a) - core(b)) || (a.pmin - b.pmin) || (a.mid - b.mid)
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
function tripPrice(t){
  const tc = tripCur(t);
  return t.unpriced === t.legs.length ? `<small>Price: check live</small>` : `${money(inCur(t.pmin, tc), tc)}${t.pmax - t.pmin > 0.3 ? "–" + fmtNum(inCur(t.pmax, tc)) : ""}<small>£${fmtNum(t.pmin)}${t.pmax - t.pmin > 0.3 ? "–" + fmtNum(t.pmax) : ""}${t.unpriced ? ", plus a leg without a saved price" : ""}</small>`;
}
function tripCard(t, idx){
  const stops = [t.legs[0].from].concat(t.legs.map(L => L.to)).map(k => NODE[k].n);
  const chain = t.legs.map((L, k) => `<span class="lchip" style="--lc:${LEG_COLS[k % LEG_COLS.length]}">${icon(MODE_IC[L.o.mode] || "bus", "i xs")}${esc(L.o.mode)}</span>`).join('<span class="larr" aria-hidden="true">›</span>');
  return `<div class="trip compact" data-trip="${idx}" role="button" tabindex="0" aria-label="See every leg of this journey">
    <div>${t.fastest ? '<span class="badge">Fastest</span>' : ""}${t.cheapest ? '<span class="badge cheap">Cheapest</span>' : ""}</div>
    <div class="sum" style="margin-top:6px"><div><div class="big">${fRange(t.dmin, t.dmax)}</div><div class="m note">${t.legs.length === 1 ? "Direct" : `${t.legs.length} legs, ${t.legs.length - 1} change${t.legs.length > 2 ? "s" : ""}`}${t.legs.some(L => L.o.mode === "Flight") ? ", includes airport time" : ""}</div></div>
      <div class="price">${tripPrice(t)}</div></div>${groupLine(t)}
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
  if (!exp("tp-legnames")) return plain;
  const local = L.o.mode === "Local ride" || (L.o.mode === "Taxi" && !(L.o.src || []).length);
  if (!local) return plain;
  const nx = t.legs[k + 1], pv = t.legs[k - 1];
  if (nx && L.to[0] !== "@"){ const s = stationOf(nx.from === nx.o.a ? nx.o.da : nx.o.db); return `To ${s && s.lat != null ? s.n : NODE[L.to].n}`; }
  if (pv && L.from[0] !== "@"){ const s = stationOf(pv.to === pv.o.b ? pv.o.db : pv.o.da); return `From ${s && s.lat != null ? s.n : NODE[L.from].n} to ${NODE[L.to].n}`; }
  return NODE[L.from].n === NODE[L.to].n ? `Around ${NODE[L.to].n}` : plain;
}
// "Bus" and "Bus, minivan or taxi" together read "Bus, Bus, minivan or taxi": drop the mode when the operator already says it
const legKind = o => exp("tp-legnames") && o.op && o.op.toLowerCase().startsWith(o.mode.toLowerCase()) ? o.op : `${o.mode}${o.op ? ", " + o.op : ""}`;
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
// the whole journey, leg by leg, in a sheet with its own map
function tripSheetHTML(t){
  const allUnpriced = t.unpriced === t.legs.length;
  const tc = tripCur(t);
  const price = allUnpriced ? `<small>Price: check live</small>` : `${money(inCur(t.pmin, tc), tc)}${t.pmax - t.pmin > 0.3 ? "–" + fmtNum(inCur(t.pmax, tc)) : ""}<small>£${fmtNum(t.pmin)}${t.pmax - t.pmin > 0.3 ? "–" + fmtNum(t.pmax) : ""}${t.unpriced ? ", plus a leg without a saved price" : ""}</small>`;
  const legs = t.legs.map((L, k) => {
    const o = L.o, fromStn = stationOf(L.from === o.a ? o.da : o.db);
    const lp = o.p ? withGBP(localRange(o.p, o.cur, ccCur(nodeCc(NODE[L.from]))), o.p, o.cur) : "price not saved";
    return `<div class="leg"><span class="li legn" style="--lc:${LEG_COLS[k % LEG_COLS.length]}"><i>${k + 1}</i>${icon(MODE_IC[o.mode] || "bus", "i s")}</span><div>
      <b>${esc(legTitle(t, k))}</b>
      <div class="m">${esc(legKind(o))}</div>
      <div class="m">${fRange(o.dur[0], o.dur[1])}${o.mode === "Flight" ? " flying, plus airport time" : ""}, ${esc(lp)}${fromStn && fromStn.lat != null ? `, from ${esc(fromStn.n)}` : ""}${o.verified ? "" : ' <span class="tag warn">Estimate</span>'}</div>
      ${borderCard(t, k)}${legBookBtn(L)}${o.mode === "Flight" ? `<a class="btn small" style="margin-top:6px" href="${esc(flightLink(L))}" target="_blank" rel="noopener">${icon("plane","i s")}Flight times${ui.tp.date ? " on " + esc(fmtDay(ui.tp.date)) : ""} on Google Flights ${icon("ext","i s")}</a>` : ""}
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
      <div class="price">${price}</div></div>
    <div class="legmap" id="legMap" role="img" aria-label="Map of the journey, each leg in its own colour"></div>
    <div style="margin-top:8px">${legs}</div>
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
  html += `<div class="block" style="margin-top:18px"><h2>Getting a ride in town</h2><p class="note" style="margin:2px 0 10px">${esc(D.countries[S.country].name)}, general tips (not price-checked)</p><p style="margin:0">${esc(D.rides[S.country])}</p></div>`;
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
