/* ============================================================
   50-transport: the journey planner (lives in Tools). The planning logic is unchanged from v1.4.
   ============================================================ */
/* ---------- transport planner ---------- */
const NET = D.net;
const HUB = Object.fromEntries(NET.hubs.map(h => [h[0], {id:h[0], n:h[1], lat:h[2], lng:h[3], g:h[4], island:h[5]}]));
const MODE_IC = {"Train":"train","Bus":"bus","Ferry":"ship","Flight":"plane","Minivan":"bus","Bus + ferry":"ship","Taxi":"car","Local ride":"car"};
const MODE_COL = {"Train":"--accent-2","Bus":"--food","Minivan":"--food","Ferry":"--move","Bus + ferry":"--move","Flight":"--do","Taxi":"--ess","Local ride":"--ess"};
const FLIGHT_EXTRA = [2, 3], CHANGE_EXTRA = [0.5, 1];
const roadKm = (a, b) => dist(a, b) * 1.35;
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
    opts.push({a:a.id, b:b.id, mode:"Taxi", op:"Taxi, Grab or Bolt", dur:[km / 45, km / 30], p:null, cur:"THB", da:"hotel", db:"hotel",
      notes:[`About ${Math.round(km)} km by road`, "Check Grab or Bolt for the price"], src:[], verified:false});
  }
  return opts;
})();
const ADJ = {};
LEGS.forEach(o => { (ADJ[o.a] = ADJ[o.a] || []).push({o, to:o.b}); (ADJ[o.b] = ADJ[o.b] || []).push({o, to:o.a}); });
const isAir = h => h === "bkkair" || h === "dmk";
const GO12 = D.net.go12 || {};
const go12 = (a, b) => GO12[a] && GO12[b] ? `https://12go.asia/en/travel/${GO12[a]}/${GO12[b]}` : null;
const ISLAND_R = {samui:14, phangan:10, tao:5, phiphi:5, kohchang:14, lipe:3, railay:2};
let NODE = HUB;
const hubNode = id => ({id, n:HUB[id].n, lat:HUB[id].lat, lng:HUB[id].lng});
// Link a searched place (not one of the saved hubs) to the network with a local ride to the nearest hubs
function connectors(node, key){
  const legs = [];
  const add = (h, label) => {
    const km = roadKm(node, HUB[h]);
    const inBkk = dist(node, HUB.bkk) < 40 && dist(HUB[h], HUB.bkk) < 40;
    const m = inBkk ? meterFare(km) : null;
    legs.push({a:key, b:h, mode: inBkk ? "Taxi" : "Local ride", op: inBkk ? "Taxi, Grab or Bolt" : (label || "Taxi, Grab, songthaew or longtail boat, depending on the place"), dur:[Math.max(.15, km / 45), Math.max(.25, km / 28)],
      p: m ? [Math.round(m * 1.05), Math.round(m * 1.4)] : null, cur:"THB", da:null, db:null,
      notes:[`About ${Math.round(km)} km by road`, inBkk ? "Estimated from Bangkok’s taxi meter rates" : "Check Grab or Bolt for the price, or ask locally for a bus or songthaew"], src:[], verified:false});
  };
  for (const [h, r] of Object.entries(ISLAND_R)) if (dist(node, HUB[h]) <= r){ add(h, "Taxi, songthaew or scooter taxi"); return legs; }
  const ranked = Object.values(HUB).filter(h => !h.island && !isAir(h.id)).map(h => ({h:h.id, km:roadKm(node, h)})).sort((x, y) => x.km - y.km);
  const close = ranked.filter(x => x.km <= 170).slice(0, 3);
  if (close.length){ close.forEach(x => add(x.h)); return legs; }
  // further from the saved hubs but still in Thailand: link the two nearest by bus or taxi, flagged as an estimate
  if (countryAt(node.lat, node.lng) === "TH") ranked.slice(0, 2).forEach(x => legs.push({a:key, b:x.h, mode:"Bus", op:"Bus, minivan or taxi (check live)", dur:[x.km / 65, x.km / 45], p:null, cur:"THB", da:null, db:null,
    notes:[`About ${Math.round(x.km)} km by road`, "This stretch isn’t in the saved network yet, so the time is a rough estimate"], src:[], verified:false}));
  return legs;
}
function hubPaths(adj, from, to, maxLegs){
  const out = [];
  (function walk(at, seen, path){
    if (at === to && path.length){ out.push(path.slice()); return; }
    if (path.length === maxLegs) return;
    for (const {o, to:nx} of (adj[at] || [])){
      if (seen.has(nx) || (isAir(nx) && nx !== to)) continue;
      seen.add(nx); path.push({o, from:at, to:nx}); walk(nx, seen, path); path.pop(); seen.delete(nx);
    }
  })(from, new Set([from]), []);
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
  if (!fromN.id && !toN.id && roadKm(fromN, toN) <= 60){ const km = roadKm(fromN, toN); link({a:"@from", b:"@to", mode:"Taxi", op:"Taxi, Grab or Bolt", dur:[km / 45, km / 28], p:null, cur:"THB", da:null, db:null, notes:[`About ${Math.round(km)} km by road`], src:[], verified:false}); }
  let trips = hubPaths(adj, fk, tk, 3 + extra).map(legs => {
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
  // local rides at either end are always unpriced outside Bangkok, so judge prices on the main legs
  const core = t => t.unpriced - t.legs.filter(L => L.from[0] === "@" || L.to[0] === "@").filter(L => !L.o.p).length;
  const best = Math.min(...trips.map(t => t.mid));
  trips = trips.filter(t => t.mid <= best * 2.5 + 2);
  const priced = trips.filter(t => !core(t));
  const keepUnpriced = new Set(trips.filter(t => core(t) && t.mid <= best * 1.6 + 1).sort((a, b) => (core(a) - core(b)) || (a.mid - b.mid)).slice(0, 3));
  trips = trips.filter(t => core(t) ? keepUnpriced.has(t)
    : !priced.some(u => u !== t && u.mid <= t.mid && u.pmin <= t.pmin && (u.mid < t.mid || u.pmin < t.pmin)));
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
const thb = gbp => money(niceRound(gbp * rate("THB"), "THB"), "THB");
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
  return `<div class="getthere">${esc(stn.n)} is about ${km.toFixed(1)} km from you. Outside Bangkok taxis rarely use meters, so check Grab or Bolt for the price.</div>`;
}
function tripCard(t, idx){
  const allUnpriced = t.unpriced === t.legs.length;
  const price = allUnpriced ? `<small>Price: check live</small>` : `${thb(t.pmin)}${t.pmax - t.pmin > 0.3 ? "–" + fmtNum(niceRound(t.pmax * rate("THB"), "THB")) : ""}<small>£${fmtNum(t.pmin)}${t.pmax - t.pmin > 0.3 ? "–" + fmtNum(t.pmax) : ""}${t.unpriced ? ", plus a leg without a saved price" : ""}</small>`;
  const legs = t.legs.map(L => {
    const o = L.o, fromStn = stationOf(L.from === o.a ? o.da : o.db);
    const lp = o.p ? withGBP(localRange(o.p, o.cur, "THB"), o.p, o.cur) : "price not saved";
    return `<div class="leg"><span class="li" style="color:${cssv(MODE_COL[o.mode] || "--move")}">${icon(MODE_IC[o.mode] || "bus")}</span><div>
      <b>${esc(NODE[L.from].n)} → ${esc(NODE[L.to].n)}</b>
      <div class="m">${esc(o.mode)}${o.op ? ", " + esc(o.op) : ""}</div>
      <div class="m">${fRange(o.dur[0], o.dur[1])}${o.mode === "Flight" ? " flying, plus airport time" : ""}, ${esc(lp)}${fromStn && fromStn.lat != null ? `, from ${esc(fromStn.n)}` : ""}${o.verified ? "" : ' <span class="tag warn">Estimate</span>'}</div>
      ${go12(L.from, L.to) && o.mode !== "Taxi" && o.mode !== "Local ride" ? `<a class="btn small" style="margin-top:6px" href="${go12(L.from, L.to)}" target="_blank" rel="noopener">Book this leg on 12Go ${icon("ext","i s")}</a>` : ""}
    </div></div>`;
  }).join("");
  const first = t.legs[0], firstStn = stationOf(first.from === first.o.a ? first.o.da : first.o.db);
  const a = NODE[t.legs[0].from].n, b = NODE[t.legs[t.legs.length - 1].to].n;
  const notes = t.legs.flatMap(L => L.o.notes.map(n => `${NODE[L.from].n} → ${NODE[L.to].n}: ${n}`));
  const srcs = t.legs.flatMap(L => L.o.src || []);
  return `<div class="trip" data-trip="${idx}" aria-pressed="${ui.tp.sel === idx}" role="button" tabindex="0">
    <div>${t.fastest ? '<span class="badge">Fastest</span>' : ""}${t.cheapest ? '<span class="badge cheap">Cheapest</span>' : ""}</div>
    <div class="sum" style="margin-top:6px"><div><div class="big">${fRange(t.dmin, t.dmax)}</div><div class="m note">${t.legs.length === 1 ? "Direct" : `${t.legs.length} legs, ${t.legs.length - 1} change${t.legs.length > 2 ? "s" : ""}`}${t.legs.some(L => L.o.mode === "Flight") ? ", includes airport time" : ""}</div></div>
      <div class="price">${price}</div></div>
    <div style="margin-top:8px">${legs}</div>
    ${getThere(firstStn)}
    <div class="row" style="margin-top:12px">${t.legs.length > 1 && go12(t.legs[0].from, t.legs[t.legs.length - 1].to) ? ext(go12(t.legs[0].from, t.legs[t.legs.length - 1].to), "Whole trip on 12Go " + icon("ext","i s")) : ""}${ext(`https://www.rome2rio.com/s/${enc(a)}/${enc(b)}`, "Rome2Rio " + icon("ext","i s"))}</div>
    <details class="more"><summary>Details and sources</summary>
      ${notes.length ? `<ul class="known">${notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
      <p class="note">${srcs.length ? "Checked " + esc(D.checked) + ": " + srcs.map(s => `<a href="${esc(s[1])}" target="_blank" rel="noopener">${esc(s[0])}</a>`).join(", ") : "Estimate, not checked."}${t.legs.some(L => L.o.mode === "Flight") ? " Flight times include about 2–3 hours for getting to, through and out of the airports." : ""}</p>
    </details>
  </div>`;
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
  Object.values(HUB).filter(h => !isAir(h.id)).forEach(h => { const k = dist(userLoc, h); if (k < bk){ bk = k; best = h; } });
  if (bk <= (best.island ? (ISLAND_R[best.id] || 8) : 25)) return Object.assign(hubNode(best.id), {here:true});
  return {n:"Your location", lat:userLoc.lat, lng:userLoc.lng, here:true};
}
const fromNode = () => ui.tp.from || hereNode();
const nodeLabel = n => n ? (n.here ? (n.id ? `${n.n} (you’re here)` : "Your location") : n.n) : "";
function transportPage(){
  const fN = fromNode(), tN = ui.tp.to;
  const trips = planTrips(fN, tN);
  if (ui.tp.sel >= trips.length) ui.tp.sel = 0;
  ui._trips = trips;
  let html = hero({title:"Transport", sub:"Search anywhere, see every way to get there", back:["#tools", "Tools"]}) + `<div class="page">
    <div class="block plan">
      <div class="pair">
        <label class="field sfield">From<input id="tp-from" type="search" autocomplete="off" enterkeyhint="search" value="${esc(nodeLabel(fN))}" placeholder="Search a place"><div class="sugs" id="sug-from" hidden></div></label>
        <button class="icon-btn" id="tp-swap" type="button" aria-label="Swap start and destination" style="margin-bottom:2px">${icon("swap")}</button>
        <label class="field sfield">To<input id="tp-to" type="search" autocomplete="off" enterkeyhint="search" value="${esc(nodeLabel(tN))}" placeholder="Where to?"><div class="sugs" id="sug-to" hidden></div></label>
      </div>
      <div class="seg" role="group" aria-label="Sort journeys"><button data-tsort="fast" aria-pressed="${ui.tp.sort === "fast"}">Fastest</button><button data-tsort="cheap" aria-pressed="${ui.tp.sort === "cheap"}">Cheapest</button></div>
    </div>
    <div id="tpMap" class="tmap" role="application" aria-label="Transport map"></div>
    <p class="note" style="margin:0 0 14px">Tap a dot on the map to head there, or search any town, beach, hostel or sight.</p>`;
  if (!tN) html += emptyBlock("Where are you heading?", `<div>Search for any place, or tap a dot on the map. You’ll see every way to get there: trains, buses, minivans, ferries, flights and taxis, with times, prices and where each one leaves from.</div>`);
  else if (!trips.length){
    const far = !tN.id && !connectors(tN, "@x").length;
    html += emptyBlock(far ? "That’s outside the saved Thailand network" : "No saved connections yet", `<div>${far ? "The planner covers Thailand so far. Check Rome2Rio for this one, or the saved routes for other countries below." : "This trip isn’t in the saved network yet."}</div>`,
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
    tmap.addLayer({id:"hub-name", type:"symbol", source:"hubs", minzoom:5.4, layout:{"text-field":["get", "n"], "text-font":["Noto Sans Regular"], "text-size":10.5, "text-offset":[0, .9], "text-anchor":"top", "text-optional":true},
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
  const choose = node => { ui.tp[which] = node; ui.tp.sel = 0; renderPage(); };
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
  const root = $("#pageview");
  bindSearch("from"); bindSearch("to");
  $("#tp-swap").onclick = () => { if (!ui.tp.to) return; const f = fromNode(); ui.tp.from = ui.tp.to; ui.tp.to = f; ui.tp.sel = 0; renderPage(); };
  root.querySelectorAll("[data-tsort]").forEach(b => b.onclick = () => { ui.tp.sort = b.dataset.tsort; ui.tp.sel = 0; renderPage(); });
  root.querySelectorAll("[data-trip]").forEach(c => {
    const pick = e => { if (e.target.closest("a, summary, details")) return; ui.tp.sel = +c.dataset.trip; root.querySelectorAll("[data-trip]").forEach(x => x.setAttribute("aria-pressed", x === c)); drawTripOnMap(); $("#tpMap").scrollIntoView({behavior: reduceMotion ? "auto" : "smooth", block:"center"}); };
    c.onclick = pick; c.onkeydown = e => { if (e.key === "Enter" || e.key === " "){ e.preventDefault(); pick(e); } };
  });
  initTransportMap();
}
