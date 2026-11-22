/* ============================================================
   47-ask: questions in the map's search box, typed or spoken.
   "where's the nearest toilet", "best cheap restaurant near me", "something to do today that isn't far".
   Worked out on the phone from what the app already knows (no AI). Places in saved cities answer with no signal.
   parseAsk() is pure and tested in tests/unit.js; answerAsk() finds the places; showAnswer() draws the sheet.
   ============================================================ */
IC.mic = '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/><path d="M8 22h8"/>';

// what someone might call each essential
const ASK_ESS = [
  ["toilet", /\b(toilets?|loos?|restrooms?|rest rooms?|bathrooms?|wc|washrooms?|lavator(y|ies)|ladies|gents|pee|wee|toilette)\b/],
  ["atm", /\b(atms?|cash ?machines?|cash ?points?|money machines?|withdraw|get (some )?cash|banks?)\b/],
  ["exchange", /\b(exchange|change (some )?money|money changers?|currency)\b/],
  ["pharmacy", /\b(pharmac(y|ies)|farmac(y|ies)|chemists?|drug ?stores?|apotek|medicine|paracetamol|plasters?|painkillers?|boots|watsons)\b/],
  ["hospital", /\b(hospitals?|a ?& ?e|emergency room)\b/],
  ["clinic", /\b(clinics?|doctors?|gp|dentists?)\b/],
  ["laundry", /\b(laundr(y|ies)|laundromats?|launderettes?|laundrettes?|wash(ing)? (my )?clothes|dry clean(ers?|ing)?)\b/],
  ["shop", /\b(7-?(eleven|11)|seven ?eleven|convenience|minimarts?|corner shops?|snacks?|family ?mart)\b/],
  ["supermarket", /\b(supermarkets?|groceries|grocery|malls?|shopping centres?)\b/],
  ["sim", /\b(sim( cards?)?|e-?sim|mobile data|phone shops?)\b/],
  ["water", /\b(water (refill|station|machine)s?|refill (my )?(bottle|water)|drinking water)\b/],
  ["wifi", /\b(wi-?fi|internet|co-?working|work from)\b/],
  ["police", /\b(police|tourist police)\b/],
  ["embassy", /\b(embass(y|ies)|consulates?|immigration)\b/],
  ["fuel", /\b(petrol|fuel|gas stations?|filling stations?)\b/],
  ["post", /\b(post offices?|send a (parcel|postcard)|stamps)\b/]
];
const ASK_MOVE = [["bus", /\b(bus (station|stop|terminal)s?|coach station|buses|minivans?)\b/], ["train", /\b(train|railway|metro|bts|mrt|skytrain)( station)?s?\b/],
  ["ferry", /\b(ferr(y|ies)|piers?|boats?)\b/], ["airport", /\b(airports?)\b/], ["taxi", /\b(taxis?|grab|scooters?|motorbikes?|bike (hire|rental)|car (hire|rental))\b/]];
const ASK_DO = [
  [["temple", "worship"], "temples", /\b(temples?|wats?|shrines?)\b/], [["beach"], "beaches", /\b(beach(es)?|swim(ming)?|sea)\b/], [["museum", "culture"], "museums and galleries", /\b(museums?|galler(y|ies)|art|theatres?|a show|shows)\b/],
  [["market"], "markets", /\b(markets?|night market)\b/], [["park", "nationalpark"], "parks", /\b(parks?|green space|nature)\b/], [["viewpoint", "peak"], "viewpoints", /\b(views?|viewpoints?|sunset|hike|hiking)\b/],
  [["waterfall"], "waterfalls", /\b(waterfalls?)\b/], [["massage"], "massages and spas", /\b(massages?|spa)\b/], [["bar", "club"], "bars and nightlife", /\b(bars?|pubs?|drinks?|nightlife|clubs?|party|beer)\b/],
  [["muaythai"], "Muay Thai", /\b(muay thai|boxing)\b/], [["cooking"], "cooking classes", /\b(cooking class(es)?)\b/], [["dive"], "diving and snorkelling", /\b(div(e|ing)|snorkel(ling)?)\b/]
];
const ASK_FOOD = /\b(eat|eats|food|restaurants?|hungry|lunch|dinner|breakfast|brunch|snack|coffee|caf[eé]s?|street food|noodles?|pad thai|curry|pizza|burgers?|vegan|vegetarian|som tam|dessert|ice cream|bakery|cake|juice|smoothie|meal|grub)\b/;
const ASK_STAY = /\b(hostels?|hotels?|stay|sleep|beds?|guest ?houses?|rooms?|accommodation|dorms?|somewhere to stay)\b/;
const ASK_DO_ANY = /\b(do|see|visit|activit(y|ies)|things?|sights?|attractions?|explore|fun)\b/;

/* speech recognition and thumbs spell things oddly: tidy the question up first ("a t m" becomes "atm", full stops go) */
function normAsk(text){
  return " " + String(text || "").toLowerCase().replace(/[’']/g, "'").replace(/[.!,;:]+/g, " ")
    .replace(/\ba\s?t\s?m'?s?\b/g, "atm").replace(/\bw\s?c\b/g, "wc").replace(/\bseven (eleven|11)\b/g, "7-eleven")
    .replace(/\bwhere is\b/g, "where's").replace(/\s+/g, " ").trim() + " ";
}
/* "find me the nearest toilet", "where's the closest pharmacy", "take me to the nearest ATM", "bring me to the closest laundry":
   one kind of place, and the single nearest one wanted. Returns parseAsk's answer with nearest:true, or null.
   Not for "best"/"cheap" questions or vague ones ("things to do"), which get the list of answers instead. */
const NEAREST_RE = /\b(nearest|closest)\b/;
const GOTO_RE = /\b(take|bring|get|guide|lead|navigate|direct) (me|us)( over)? to\b|\b(directions|route|way) to\b|\bhow (do|can) (i|we) get to\b/;
function nearestIntent(text){
  const t = normAsk(text);
  if (!NEAREST_RE.test(t) && !GOTO_RE.test(t)) return null;
  if (!NEAREST_RE.test(t) && !/\b(to|find) (a|an|the|some) /.test(t)) return null;        // "take me to Wat Pho" is a place, not a kind of place
  const a = parseAsk(t); if (!a || a.best || a.cheap) return null;
  if (a.kind === "do" && !a.kinds) return null;                 // "nearest things to do": a list, not one place
  if (a.kind === "stay" && !a.kinds) return null;
  return Object.assign(a, {nearest:true});
}

/* does this text read like a question rather than a place name? */
function isAsk(text){
  const t = String(text || "").toLowerCase().trim();
  if (t.length < 4) return false;
  if (/\?$/.test(t)) return true;
  if (/^(where|what|which|find|show|any|is there|are there|nearest|closest|best|cheap|cheapest|good|great|i need|i want|i'?m|we need|we want|take me|take us|bring me|bring us|get me|navigate|directions|how far|somewhere|anywhere|recommend|suggest|need a|need an|need some|looking for)\b/.test(t)) return true;
  return /\b(near me|nearby|nearest|closest|around here|close by|near here|walking distance)\b|\b(not|isn'?t|aren'?t) (too |that |very )?far\b/.test(t);
}

/* what is being asked for: {kind, ess?, move?, kinds?, ft?, cheap, best, open, maxKm, what} or null */
function parseAsk(text){
  const t = normAsk(text);
  const cheap = /\b(cheap(est)?|budget|inexpensive|affordable|not (too )?(expensive|pricey|dear)|on a budget|free)\b/.test(t);
  const best = /\b(best|good|great|top|nice|decent|recommended|popular|worth)\b/.test(t);
  const open = /\b(open|now|today|tonight|right now|late)\b/.test(t);
  const walk = /\b(walk(ing)?( distance)?|on foot)\b/.test(t);
  const close = /\b((not|isn't|aren't|isnt|arent) (too |that |very )?far|close|nearby|near me|near here|around here|close by)\b/.test(t);
  const nearest = /\b(nearest|closest)\b/.test(t);
  const maxKm = walk ? 1.5 : close ? 5 : nearest ? 25 : 10;
  for (const [id, re] of ASK_ESS) if (re.test(t)) return {kind:"ess", ess:id, cheap, best, open, maxKm, what:ESS_BY_ID[id] ? ESS_BY_ID[id].l : id};
  for (const [id, re] of ASK_MOVE) if (re.test(t)) return {kind:"move", move:id, cheap, best, open, maxKm, what:{bus:"bus stations", train:"train and metro stations", ferry:"piers", airport:"airports", taxi:"taxis and rentals"}[id]};
  if (ASK_STAY.test(t)){
    const kinds = /\bhostels?|dorms?\b/.test(t) ? ["hostel"] : /\bhotels?\b/.test(t) ? ["hotel", "resort"] : /\bguest ?houses?\b/.test(t) ? ["guesthouse", "bungalow"] : null;
    return {kind:"stay", kinds, cheap, best, open:false, maxKm, what:kinds && kinds[0] === "hostel" ? "hostels" : kinds && kinds[0] === "hotel" ? "hotels" : "places to stay"};
  }
  // any food word counts (seafood, sushi, noodles…), but not the very general ones ("Thai massage" isn't food)
  const ftHit = FOOD_TYPES.find(([label, , nameRe]) => !["Thai", "Asian", "Western"].includes(label) && nameRe.test(t));
  if (ASK_FOOD.test(t) || ftHit){
    let ft = ftHit ? ftHit[0] : null;
    if (!ft && /\bcoffee|caf[eé]s?\b/.test(t)) ft = "Café & coffee";
    if (!ft && /\bthai food\b/.test(t)) ft = "Thai";
    if (!ft && /\bstreet food\b/.test(t)) ft = "Street food";
    const kinds = /\bstreet food|stalls?\b/.test(t) ? ["fastfood", "foodcourt", "market"] : null;
    return {kind:"food", ft, kinds, cheap, best, open, maxKm, what:ft ? ft.toLowerCase() : "places to eat"};
  }
  for (const [kinds, label, re] of ASK_DO) if (re.test(t)) return {kind:"do", kinds, cheap, best, open, maxKm, what:label};
  if (ASK_DO_ANY.test(t)) return {kind:"do", kinds:null, cheap, best, open, maxKm, what:"things to do"};
  return null;
}

/* find the places that answer it, best first */
async function answerAsk(text){
  const a = parseAsk(text); if (!a) return null;
  const ref = userLoc ? {lat:userLoc.lat, lng:userLoc.lng, here:true} : (typeof map !== "undefined" && map && mapLoaded ? {lat:map.getCenter().lat, lng:map.getCenter().lng, mapc:true} : focusPt());
  const grp = {ess:"ess", move:"move", stay:"stay", food:"food", do:"do"}[a.kind];
  const essKinds = a.ess && ESS_BY_ID[a.ess] ? new Set(ESS_BY_ID[a.ess].kinds) : null;
  const test = p => {
    if (essKinds && !essKinds.has(p.k)) return false;
    if (a.move && MOVE_KIND_TYPE[p.k] !== a.move) return false;
    if (a.kinds && !a.kinds.includes(p.k)) return false;
    if (a.ft && foodType(p) !== a.ft) return false;
    if (a.kind === "do" && !a.kinds && ["bar", "club", "tour", "worship"].includes(p.k)) return false;     // "something to do": sights first, not bars or agencies
    if (a.cheap && a.kind !== "ess" && a.kind !== "move"){ const b = priceBand(p); if (b == null || b > 1) return false; }
    return true;
  };
  const res = await Places.near(grp, ref, {maxKm:a.maxKm, want:150, test});
  const cat = {stay:"gaff", food:"munch", do:"cool", move:"move"}[a.kind];
  const curated = cat ? D.places.filter(p => p.c === cat && dist(ref, p) <= a.maxKm && test(p)) : [];
  const seen = new Set(), all = [];
  for (const p of curated.concat(res.items)) if (!seen.has(p.id)){ seen.add(p.id); all.push(p); }
  const scored = all.map(p => {
    const km = dist(ref, p), oh = isOpenNow(p);
    if (a.open && oh && !oh.open) return null;                     // known to be shut: leave it out
    let s = km;
    if (a.best || a.kind === "do" || a.kind === "stay") s -= (p.cur_ ? 2.5 : 0) + (p.x || p.wd ? 1.2 : 0) + (knownRating(p) ? knownRating(p) / 10 : 0);
    if (a.open && oh && oh.open) s -= .4;                              // known to be open beats "hours unknown"
    if (p.unnamed) s += 1.5;
    return {p, km, s};
  }).filter(Boolean).sort((x, y) => x.s - y.s);
  return {a, ref, items:scored.slice(0, 8), state:res.state};
}

function askTitle(a){
  if (a.kind === "more") return a.title;
  const cap = x => x.charAt(0).toUpperCase() + x.slice(1);
  if (a.nearest) return "Go to the nearest " + nearestNoun(a);
  if (a.kind === "ess" || a.kind === "move") return cap(a.what) + " nearby";
  return cap((a.best ? "best " : "") + (a.cheap ? "cheap " : "") + a.what + (a.open ? ", open now" : ""));
}
/* a plain category word ("atm", "hostel", "food") gets an answer row too; a place name like "Wat Pho" doesn't */
function askOffer(text){
  const tn = parseTopN(text); if (tn) return {a:{kind:"more", title:tn.title}, first:true, top:true};      // "top 5 temples": straight onto the map
  const mi = typeof moreIntent === "function" ? moreIntent(text) : null; if (mi) return {a:mi, first:true};       // costs, times, distances, feeling rough (js/ask-more.js)
  const n = nearestIntent(text); if (n) return {a:n, first:true, nearest:true};
  const a = parseAsk(text); if (!a) return null;
  if (isAsk(text)) return {a, first:true};
  const t = " " + String(text).toLowerCase() + " ";
  return a.kind === "ess" || a.kind === "move" || ASK_STAY.test(t) || ASK_FOOD.test(t) ? {a, first:false} : null;
}
async function showAnswer(text){
  const mi = typeof moreIntent === "function" ? moreIntent(text) : null; if (mi) return showMore(text, mi);
  openSheet(`<div class="sheet-head"><div><span class="kind">${icon("search", "i xs")} Your question</span><h2 id="askTitle">“${esc(text)}”</h2></div>
    <button class="icon-btn" type="button" data-close aria-label="Close">${icon("x")}</button></div><div id="askBody"><p class="note" style="margin-top:10px">Looking…</p></div>`, "askTitle");
  let r = null;
  try { r = await answerAsk(text); } catch(e){}
  const body = $("#askBody"); if (!body) return;
  // experiment tools-groups: the Trip assistant's tile is hidden, so questions the map search can't place go to it here
  if (!r && exp("tools-groups") && typeof assistantAnswer === "function"){
    let html = null; try { html = await assistantAnswer(text); } catch(e){}
    if (html && $("#askBody")){
      body.innerHTML = `<div class="asst-ans" style="margin-top:10px">${html}</div><p class="note" style="margin-top:8px">Worked out on your phone from the app’s own data.</p>`;
      body.querySelectorAll("[data-act]").forEach(b => b.onclick = () => { closeDetail(); asstAct(b, q => showAnswer(q)); });
      return;
    }
  }
  if (!r){ body.innerHTML = `<p class="note" style="margin-top:10px">I can answer things like “nearest toilet”, “cheap noodles near me”, “best hostel”, “ATM” or “something to do today that isn't far”. For anything else, try the <a href="#tools/assistant">Trip assistant</a>.</p>`; return; }
  const where = r.ref.here ? "you" : r.ref.mapc ? "the middle of the map" : esc(focusLabel());
  if (!r.items.length){
    body.innerHTML = `<h3 style="margin-top:12px">${esc(askTitle(r.a))}</h3><p class="note">${r.state === "off" || r.state === "error" ? "Couldn't load places: this needs signal, or a saved city (Tools › Offline & backup)." : `Nothing found within ${r.a.maxKm} km of ${where}.${r.a.cheap ? " Try without “cheap”." : ""}${r.a.open ? " Try without “open now”." : ""}`}</p>`;
    return;
  }
  body.innerHTML = `<h3 style="margin-top:12px">${esc(askTitle(r.a))}</h3><p class="note">Nearest to ${where}${r.a.best ? ", researched and well-known places first" : ""}.${r.a.cheap ? " Prices are estimates where unknown." : ""}</p>
    <div class="ask-list">${r.items.map(({p, km}) => {
      const oh = isOpenNow(p), e = p.p ? null : estPrice(p), ft = p.c === "munch" ? foodType(p) : null;
      const bits = [esc(kindLabel(p) + (ft ? " · " + ft : "")), esc(distText(km))];          // each piece is safe HTML
      if (oh) bits.push(`<span class="${oh.open ? "open" : "shut"}">${esc(oh.text)}</span>`);
      if (itemLocal(p)) bits.push(esc(itemLocal(p))); else if (e && p.c !== "ess") bits.push(esc(estText(e)));
      return `<div class="ask-row"><button class="ask-main" type="button" data-open="${esc(p.id)}"><span class="ask-ic" style="--c:${cssv((CAT[p.c] || CAT.ess).v)}">${icon(kindIcon(p), "i s")}</span>
          <span class="ask-txt"><b>${esc(p.n)}</b><small>${bits.join(" · ")}</small></span></button>
        <a class="btn small" href="${esc(L_dir(p))}" target="_blank" rel="noopener" aria-label="Directions to ${esc(p.n)}">${icon("nav", "i s")}</a></div>`;
    }).join("")}</div>
    <div class="row" style="margin-top:10px"><button class="btn" type="button" id="askMap">${icon("map", "i s")}Show these on the map</button></div>`;
  $("#askMap").onclick = () => {
    closeDetail();
    const pts = r.items.map(x => x.p);
    if (r.a.kind === "ess"){ ui.essKinds = new Set([r.a.ess]); ui.essOpen = true; }
    else { const c = {stay:"gaff", food:"munch", do:"cool", move:"move"}[r.a.kind]; ui.mapCats = new Set([c]); ui.essKinds.clear(); }
    ui.mapSaved = false; ui.mapMode = "map";
    if (location.hash !== "#map") go("#map");
    setTimeout(() => {
      renderMapUI();
      if (map && pts.length){
        const b = new maplibregl.LngLatBounds(); pts.forEach(p => b.extend([p.lng, p.lat])); if (r.ref.here) b.extend([r.ref.lng, r.ref.lat]);
        map.fitBounds(b, {padding:{top:190, bottom:220, left:50, right:70}, maxZoom:16.5, duration:reduceMotion ? 0 : 600});
      }
    }, 120);
  };
}

/* ---------- "take me to the nearest ...": find it, then select it on the map exactly as if it had been tapped ---------- */
const NEAREST_NOUN = {toilet:"toilet", atm:"ATM", exchange:"money exchange", pharmacy:"pharmacy", hospital:"hospital", clinic:"clinic or doctor", laundry:"laundry",
  shop:"7-Eleven or minimart", supermarket:"supermarket", sim:"SIM card shop", water:"water refill", wifi:"Wi-Fi spot", police:"police station", embassy:"embassy",
  fuel:"petrol station", post:"post office", bus:"bus station", train:"train station", ferry:"pier", airport:"airport", taxi:"taxi or rental"};
function nearestNoun(a){
  if (a.ess || a.move) return NEAREST_NOUN[a.ess || a.move] || a.what;
  if (a.what === "places to eat") return "place to eat";
  if (a.what === "museums and galleries") return "museum or gallery";
  return a.what.replace(/es$/, a.what === "beaches" ? "" : "es").replace(/s$/, "");
}
function nearestTest(a){
  const essKinds = a.ess && ESS_BY_ID[a.ess] ? new Set(ESS_BY_ID[a.ess].kinds) : null;
  return p => {
    if (essKinds && !essKinds.has(p.k)) return false;
    if (a.move && MOVE_KIND_TYPE[p.k] !== a.move) return false;
    if (a.kinds && !a.kinds.includes(p.k)) return false;
    if (a.ft && foodType(p) !== a.ft) return false;
    if (p.unnamed && !["toilet", "atm", "water"].includes(a.ess)) return false;      // an unnamed "restaurant" is a poor answer
    return true;
  };
}
let nearestBusy = false;
async function goNearest(text, a = nearestIntent(text)){
  if (!a || nearestBusy) return false;
  nearestBusy = true;
  const noun = nearestNoun(a);
  try {
    toast(`Finding the nearest ${noun}...`);
    const st = await locateNow();
    const real = !!userLoc && (st === "ok" || st === "test" || st === "outside");
    // without the phone's position, say so plainly and use the middle of the map (never pretend it's where you are)
    const ref = real ? {lat:userLoc.lat, lng:userLoc.lng} : (map && mapLoaded ? {lat:map.getCenter().lat, lng:map.getCenter().lng} : focusPt());
    if (ref.none){ toast("Turn on location, or pick a place to look around first"); return false; }
    if (real && st === "outside"){ toast("You're outside the countries this app covers, so there's nothing near you in its data"); return false; }
    const grp = {ess:"ess", move:"move", stay:"stay", food:"food", do:"do"}[a.kind], test = nearestTest(a);
    const r = await Places.nearest(grp, ref, {test, maxKm:60});
    // the app's own researched places count too (transport hubs, food, sights)
    const cat = {stay:"gaff", food:"munch", do:"cool", move:"move"}[a.kind];
    let best = r.p, km = r.km;
    if (cat) for (const p of D.places) if (p.c === cat && test(p)){ const k = dist(ref, p); if (km == null || k < km){ best = p; km = k; } }
    if (!best){
      toast(r.state === "off" || r.state === "error" ? "Couldn't load the places data. It needs signal once, or a saved city" : `No ${noun} within 60 km in the app's map data`);
      return false;
    }
    showNearestOnMap(best, a, ref, real);
    const where = real ? (st === "test" ? "your test location" : "you") : "the middle of the map (your location is off)";
    toast(`${r.complete ? "Nearest" : "Closest found"} ${noun}: ${distShort(km)} from ${where}${r.complete ? "" : ". Some map data couldn't load, so there may be one closer"}`);
    return true;
  } finally { nearestBusy = false; }
}
function showNearestOnMap(p, a, ref, real){
  // show its section on the map (and only the essential asked for), so its pin is drawn like any other
  if (a.kind === "ess"){ if (!ui.essKinds.size && !mapRun.stash) mapRun.stash = new Set(ui.mapCats); ui.mapCats.clear(); ui.essKinds = new Set([a.ess]); ui.essOpen = true; }
  else { const c = {stay:"gaff", food:"munch", do:"cool", move:"move"}[a.kind]; ui.essKinds.clear(); ui.mapCats = new Set([c]); if (c === "move") ui.mf.move.t = a.move; }
  ui.mapSaved = false; ui.mapMode = "map";
  const done = () => {
    renderMapUI();
    selectPlace(p.id);
    if (!map) return;
    if (real && dist(ref, p) < 4){ const b = new maplibregl.LngLatBounds(); b.extend([p.lng, p.lat]); b.extend([ref.lng, ref.lat]); map.fitBounds(b, {padding:{top:200, bottom:260, left:60, right:80}, maxZoom:17, duration:reduceMotion ? 0 : 700}); }
    else flyTo(p, 16);
  };
  if (location.hash !== "#map") go("#map");
  // the map may still be starting: wait for it to exist, then for its load event (the preview still opens if it never loads)
  const start = (n = 0) => {
    if (!map){ if (n < 40) setTimeout(() => start(n + 1), 100); else done(); return; }
    if (mapLoaded){ done(); return; }
    let fired = false; const once = () => { if (!fired){ fired = true; done(); } };
    map.once("load", () => setTimeout(once, 30)); setTimeout(once, 12000);
  };
  setTimeout(start, 60);
}

/* ---------- speaking the question ---------- */
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
// iPhones often never mark the words as final and can keep listening, so: stop after a short silence (or as soon as the words
// are final), and if nothing was marked final, use the last words heard. onDone is called once.
const LISTEN_QUIET_MS = 1400;
// one recogniser for the whole visit: iPhones tend to ask about the microphone for each new one
let recOne = null;
function listen(onText, onDone){
  if (!SpeechRec) return false;
  const rec = recOne || (recOne = new SpeechRec());
  try { rec.abort(); } catch(e){}
  rec.lang = "en-GB"; rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = false;
  let final = "", heard = "", quiet = null, done = false;
  const finish = (text, err) => { if (done) return; done = true; clearTimeout(quiet); onDone(text, err); };
  const stopSoon = ms => { clearTimeout(quiet); quiet = setTimeout(() => { try { rec.stop(); } catch(e){} setTimeout(() => finish((final || heard).trim()), 900); }, ms); };
  rec.onresult = e => {
    let interim = "", isFinal = false;
    for (let i = e.resultIndex; i < e.results.length; i++){ const t = e.results[i][0].transcript; if (e.results[i].isFinal){ final += t; isFinal = true; } else interim += t; }
    heard = (final + interim).trim() || heard;
    onText(heard);
    stopSoon(isFinal ? 150 : LISTEN_QUIET_MS);          // finished words: search now; otherwise wait for a pause
  };
  rec.onerror = e => { if (e.error === "no-speech" && heard) finish(heard.trim()); else finish(null, e.error); };
  rec.onend = () => finish((final || heard).trim());
  try { rec.start(); } catch(e){ return false; }
  return rec;
}

/* ---------- "top 5 temples", "cheapest 3 hostels", "worst 3 bars in Pai", "10 most expensive restaurants near me" ----------
   Any number (1 to 25) with a ranking word, and any kind of place. The answer goes straight onto the map as numbered pins (only
   those), with a strip along the bottom to jump between them; a place's details sheet has Back / previous / next, so the
   question never has to be asked again (Dylan, 23 Nov 2026). Prices rank by the researched price, else the estimate. */
const TOP_NUMW = {one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, eleven:11, twelve:12, fifteen:15, twenty:20, "a dozen":12};
const TOP_NUM = "(\\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|a dozen)";
const TOP_RANKS = [["dear", "most expensive|priciest|dearest|poshest|fanciest|most pricey"], ["cheap", "cheapest|least expensive|most affordable|cheap"],
  ["worst", "worst rated|lowest rated|worst|lowest|shittest|crappiest"], ["near", "nearest|closest"], ["top", "top rated|best rated|highest rated|top|best|most popular|greatest|finest"]];
const TOP_UNIT = /^\s*(km|kms|k|kilomet|mile|min|minute|hour|hr|baht|thb|dollar|usd|pound|gbp|quid|ringgit|rm|dong|kip|rupiah|star|night|day|person|people|guest)/;
const TOP_STAY_KINDS = new Set(["hostel","hotel","guesthouse","resort","bungalow","apartment","motel","campsite","hut"]);
const TOP_FOOD_KINDS = new Set(["restaurant","cafe","fastfood","foodcourt","bakery","dessert","market"]);
const TOP_MOVE_KINDS = new Set(["airport","train","metro","bus","ferry","carrental","scooter","bike","taxi"]);
const TOP_ESS_KINDS = new Set(["laundry","atm","bank","exchange","pharmacy","hospital","clinic","dentist","police","embassy","immigration","supermarket","convenience","mall","sim","water","toilet","fuel","post","cowork","wifi","luggage"]);
const topGroupOfKind = k => TOP_STAY_KINDS.has(k) ? "stay" : TOP_FOOD_KINDS.has(k) ? "food" : TOP_MOVE_KINDS.has(k) ? "move" : TOP_ESS_KINDS.has(k) ? "ess" : "do";
const topPlural1 = l => /s$/.test(l) ? l : /(sh|ch|x)$/.test(l) ? l + "es" : /[^aeiou]y$/.test(l) ? l.slice(0, -1) + "ies" : l + "s";
const topPlural = l => { const low = /^[A-Z]{2,}/.test(l) ? l : l.toLowerCase(); return low.split(/ or | and /).map(w => topPlural1(w.trim())).join(" and "); };
// a kind of place named by the app's own labels ("hot spring", "zoo", "bottle shop", "dentist"), for anything the question words above miss
function topKindHit(t){
  for (const [k, v] of Object.entries(KIND)){
    if (k === "surf") continue;
    for (const part of v.l.toLowerCase().split(/ or | and /)){
      const w = part.trim().replace(/é/g, "e"); if (w.length < 3) continue;
      const re = new RegExp("\\b" + w.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&") + "(s|es)?\\b");
      if (re.test(t.replace(/é/g, "e"))) return {k, label:v.l};
    }
  }
  return null;
}
/* the question, or null: {n, rank, kind, ess?, move?, kinds?, ft?, what, title, maxKm, dest?} (pure: tested in tests/unit.js) */
function parseTopN(text){
  const t = normAsk(text);
  const ranks = TOP_RANKS.map(([id, w]) => `(?:${w})`).join("|");
  let n = null, rank = null, m, rest = t;
  const rankOf = w => (TOP_RANKS.find(([id, re]) => new RegExp(`^(?:${re})$`).test(w.trim())) || [null])[0];
  if ((m = t.match(new RegExp(`\\b(${ranks})\\s+${TOP_NUM}\\b(?!\\s*(?:km|k\\b|min|hour|baht|star))`))) && !TOP_UNIT.test(t.slice(m.index + m[0].length))){ rank = rankOf(m[1]); n = m[2]; rest = t.replace(m[0], " "); }
  else if ((m = t.match(new RegExp(`\\b${TOP_NUM}\\s+(${ranks})\\b`)))){ n = m[1]; rank = rankOf(m[2]); rest = t.replace(m[0], " "); }
  else if ((m = t.match(new RegExp(`\\b(?:show|find|give|list|get|what are|which are|tell)(?: me| us)?(?: the)? ${TOP_NUM}\\b`))) && !TOP_UNIT.test(t.slice(m.index + m[0].length))){ n = m[1]; rank = "top"; rest = t.replace(m[0], " "); }
  if (n == null || !rank) return null;
  n = /^\d+$/.test(n) ? +n : TOP_NUMW[n];
  if (!n || n < 1) return null;
  n = Math.min(n, 25);
  // where: a trip destination named in the question ("in Chiang Mai") beats where you are
  let dest = null;
  if (typeof D !== "undefined") for (const c of D.cities){ const nm = c[0].toLowerCase(); if (rest.includes(" " + nm + " ")){ if (!dest || nm.length > dest[0].length) dest = c; } }
  if (dest) rest = rest.replace(" " + dest[0].toLowerCase() + " ", " ");
  const gaffs = /\bgaffs?\b/.test(rest);
  rest = " " + rest.replace(/\bgaffs?\b/g, "places to stay").replace(/\b(munch(es)?)\b/g, "food").replace(/\s+/g, " ").trim() + " ";
  let a = parseAsk(rest);
  const kh = topKindHit(rest);
  const generic = !a || (a.kind === "do" && !a.kinds) || (a.kind === "stay" && !a.kinds) || (a.kind === "food" && !a.ft && !a.kinds);
  if (kh && generic && !gaffs){
    const g = topGroupOfKind(kh.k);
    a = {kind:g, kinds:[kh.k], cheap:false, best:false, open:false, maxKm:a ? a.maxKm : 10, what:topPlural(kh.label)};
  }
  if (!a){
    if (/\b(places?|spots?|things?|anything|stuff)\b/.test(rest)) a = {kind:"do", kinds:null, cheap:false, best:false, open:false, maxKm:10, what:"things to do"};
    else return null;
  }
  const what = gaffs && a.kind === "stay" && !a.kinds ? "gaffs" : a.kind === "ess" ? topPlural(a.what) : a.what;
  const title = rank === "top" || rank === "worst" ? `${rank === "top" ? "Top" : "Worst"} ${n} ${what}` : `${n} ${{cheap:"cheapest", dear:"most expensive", near:"nearest"}[rank]} ${what}`;
  return Object.assign({}, a, {n, rank, what, dest:dest ? {n:dest[0], lat:dest[1], lng:dest[2]} : null, title, maxKm:dest ? Math.max(a.maxKm, 12) : a.maxKm});
}
// a price to rank by, in pounds: the researched price, else the middle of the estimate; null when nothing is known
function topPrice(p){
  if (p.p && p.p.length) return toGBP(p.p[0], p.cur);
  const e = estPrice(p); return e ? toGBP((e.lo + e.hi) / 2, e.cur) : null;
}
// how good a place looks from what the app knows: its rating (0–5), researched, well known (Wikipedia/Wikidata), and a little for being close
const topQuality = (p, km) => (knownRating(p) != null ? knownRating(p) / 2 - 2.5 : 0) + (p.cur_ ? 2 : 0) + (p.wd || p.wp || p.x ? 1.5 : 0) - km * 0.08;
/* rank found places: [{p, km}] in order, plus a note saying what the order is based on (pure: tested in tests/unit.js) */
function rankTop(list, rank, n){
  let out = list.slice(), note = "";
  if (rank === "near") out.sort((x, y) => x.km - y.km);
  else if (rank === "top"){ out.sort((x, y) => topQuality(y.p, y.km) - topQuality(x.p, x.km) || x.km - y.km); note = "Rated and researched places first, then well-known ones, then the nearest."; }
  else if (rank === "worst"){
    out = out.filter(x => knownRating(x.p) != null).sort((x, y) => knownRating(x.p) - knownRating(y.p) || x.km - y.km);
    note = out.length < n ? `Only ${out.length} place${out.length === 1 ? " has" : "s have"} a rating here, so only ${out.length === 1 ? "it" : "they"} can be ranked worst.` : "Lowest rated first (only places with a rating count).";
  } else {
    out = out.map(x => Object.assign({}, x, {gbp:topPrice(x.p)})).filter(x => x.gbp != null).sort((x, y) => (rank === "cheap" ? x.gbp - y.gbp : y.gbp - x.gbp) || x.km - y.km);
    note = "Ranked by price: the researched price where there is one, otherwise the typical estimate (marked est.).";
  }
  return {items:out.slice(0, n), note};
}
async function answerTop(text){
  const a = parseTopN(text); if (!a) return null;
  const t = normAsk(text), nearMe = /\b(near me|around me|nearby|near here|around here|close by|walking distance)\b/.test(t);
  const ref = a.dest ? {lat:a.dest.lat, lng:a.dest.lng, n:a.dest.n}
    : nearMe && userLoc ? {lat:userLoc.lat, lng:userLoc.lng, n:"you", here:true}
    : S.focus ? {lat:S.focus.lat, lng:S.focus.lng, n:S.focus.n}
    : userLoc ? {lat:userLoc.lat, lng:userLoc.lng, n:"you", here:true}
    : (typeof map !== "undefined" && map && mapLoaded) ? {lat:map.getCenter().lat, lng:map.getCenter().lng, n:"the middle of the map"} : null;
  if (!ref) return {a, err:"noplace"};
  const grp = {ess:"ess", move:"move", stay:"stay", food:"food", do:"do"}[a.kind];
  const essKinds = a.ess && ESS_BY_ID[a.ess] ? new Set(ESS_BY_ID[a.ess].kinds) : null;
  const test = p => {
    if (essKinds && !essKinds.has(p.k)) return false;
    if (a.move && MOVE_KIND_TYPE[p.k] !== a.move) return false;
    if (a.kinds && !a.kinds.includes(p.k)) return false;
    if (a.ft && foodType(p) !== a.ft) return false;
    if (a.kind === "do" && !a.kinds && ["bar", "club", "tour", "worship", "liquor"].includes(p.k)) return false;
    if (p.unnamed || !p.n) return false;
    return true;
  };
  const res = await Places.near(grp, ref, {maxKm:a.maxKm, want:400, test});
  const cat = {stay:"gaff", food:"munch", do:"cool", move:"move"}[a.kind];
  const curated = cat ? D.places.filter(p => p.c === cat && test(p) && dist(ref, p) <= a.maxKm) : [];
  const seen = new Set(), all = [];
  for (const p of curated.concat(res.items)) if (!seen.has(p.id)){ seen.add(p.id); all.push({p, km:dist(ref, p)}); }
  const r = rankTop(all, a.rank, a.n);
  return {a, ref, items:r.items, note:r.note, found:all.length, state:res.state};
}
/* ask it, then show the answer on the map */
let topBusy = false;
async function goTop(text){
  if (topBusy) return false; topBusy = true;
  try {
    const a0 = parseTopN(text); if (!a0) return false;
    toast(`Finding the ${a0.title.charAt(0).toLowerCase() + a0.title.slice(1)}…`);
    let r = null; try { r = await answerTop(text); } catch(e){}
    if (!r) return false;
    if (r.err === "noplace"){ toast("Turn on location, pick a place to look around, or say where (e.g. “in Chiang Mai”)"); return false; }
    if (!r.items.length){
      toast(r.state === "off" || r.state === "error" ? "Couldn't load places: this needs signal once, or a saved city"
        : r.a.rank === "worst" ? `None of the ${r.a.what} near ${r.ref.n} have a rating, so they can't be ranked worst`
        : (r.a.rank === "cheap" || r.a.rank === "dear") && r.found ? `No prices are known for the ${r.a.what} near ${r.ref.n}, so they can't be ranked by price`
        : `No ${r.a.what} found within ${r.a.maxKm} km of ${r.ref.n}`);
      return false;
    }
    showTopOnMap(r);
    return true;
  } finally { topBusy = false; }
}
function topWhy(p, rank){
  if (rank === "cheap" || rank === "dear"){ const loc = itemLocal(p); if (loc) return loc; const e = estPrice(p); return e ? estText(e) : ""; }
  const r = knownRating(p); if ((rank === "top" || rank === "worst") && r != null) return `${(r / 2).toFixed(1)}★`;
  return "";
}
function showTopOnMap(r){
  const items = r.items.map(x => x.p);
  ui.mapPick = {title:r.a.title, where:r.ref.n, rank:r.a.rank, note:r.note, ids:items.map(p => p.id), byId:Object.fromEntries(items.map(p => [p.id, p])),
    why:Object.fromEntries(r.items.map(x => [x.p.id, [topWhy(x.p, r.a.rank), distShort(x.km)].filter(Boolean).join(" · ")]))};
  ui.mapSel = null; ui.mapSaved = false; ui.mapSurf = false; ui.mapMode = "map";
  if (location.hash !== "#map") go("#map");
  const done = () => {
    renderMapUI(); drawPick();
    if (map && items.length){
      const b = new maplibregl.LngLatBounds(); items.forEach(p => b.extend([p.lng, p.lat]));
      map.fitBounds(b, {padding:{top:170, bottom:260, left:50, right:70}, maxZoom:16, duration:reduceMotion ? 0 : 600});
    }
    if (r.note) toast(r.note);
  };
  const start = (k = 0) => {
    if (!map){ if (k < 40) setTimeout(() => start(k + 1), 100); else done(); return; }
    if (mapLoaded){ done(); return; }
    let fired = false; const once = () => { if (!fired){ fired = true; done(); } };
    map.once("load", () => setTimeout(once, 30)); setTimeout(once, 12000);
  };
  setTimeout(start, 60);
}
function clearPick(){ ui.mapPick = null; drawPick(); }
const pickIndex = id => ui.mapPick ? ui.mapPick.ids.indexOf(id) : -1;
// the numbered pins: only the answer's places, in its order; the one picked is drawn in the accent colour
function drawPick(){
  if (typeof map === "undefined" || !map || !mapLoaded || !map.getSource("pick")) return;
  const P = ui.mapPick;
  map.getSource("pick").setData(fc(P ? P.ids.map((id, i) => { const p = P.byId[id]; return {type:"Feature", geometry:{type:"Point", coordinates:[p.lng, p.lat]},
    properties:{id, num:String(i + 1), sel:ui.mapSel === id ? 1 : 0, col:cssv((CAT[p.c] || CAT.ess).v)}}; }).sort((x, y) => x.properties.sel - y.properties.sel) : []));
}
// the strip along the bottom of the map: the question, and a numbered button for each answer
function pickBar(){
  const P = ui.mapPick; if (!P) return "";
  return `<div class="pickbar" id="pickbar"><div class="pb-head"><div><b>${esc(P.title)}</b><small>near ${esc(P.where)}</small></div>
      <button class="icon-btn" type="button" id="pbClose" aria-label="Clear these results">${icon("x","i s")}</button></div>
    <div class="pb-row scroller" role="group" aria-label="${esc(P.title)}">${P.ids.map((id, i) => { const p = P.byId[id]; return `<button class="chip" type="button" data-pk="${esc(id)}" aria-pressed="${ui.mapSel === id}"><span class="pb-n">${i + 1}</span><span class="pb-t">${esc(p.n)}${P.why[id] ? `<small>${esc(P.why[id])}</small>` : ""}</span></button>`; }).join("")}</div></div>`;
}
function bindPickBar(el){
  const c = el.querySelector("#pbClose"); if (c) c.onclick = () => { clearPick(); ui.mapSel = null; renderMapUI(); };
  el.querySelectorAll("[data-pk]").forEach(b => b.onclick = () => selectPlace(b.dataset.pk, true));
  const on = el.querySelector('[data-pk][aria-pressed="true"]'); if (on && on.scrollIntoView) on.scrollIntoView({block:"nearest", inline:"center"});
}
// Back / previous / next at the top of a place's details sheet when it's one of the answers
function pickNavHTML(id){
  const i = pickIndex(id); if (i < 0) return "";
  const P = ui.mapPick, N = P.ids.length;
  return `<div class="pick-nav"><button class="btn small" type="button" data-pn="back">${icon("back","i s")}Back to all ${N}</button>
    <span class="sp"></span><button class="icon-btn" type="button" data-pn="prev" aria-label="Previous" ${i === 0 ? "disabled" : ""}>${icon("back","i s")}</button><span class="note">${i + 1} of ${N}</span>
    <button class="icon-btn pn-next" type="button" data-pn="next" aria-label="Next" ${i === N - 1 ? "disabled" : ""}>${icon("back","i s")}</button></div>`;
}
function bindPickNav(id){
  const i = pickIndex(id); if (i < 0) return;
  const P = ui.mapPick, go2 = j => { const nid = P.ids[j]; if (!nid) return; ui.mapSel = nid; drawPick(); openDetail(nid); };
  $$("#sheetRoot [data-pn]").forEach(b => b.onclick = () => {
    if (b.dataset.pn === "back"){ closeDetail(); if (location.hash !== "#map") go("#map"); setTimeout(() => selectPlace(id, true), 80); }
    else go2(i + (b.dataset.pn === "next" ? 1 : -1));
  });
}
