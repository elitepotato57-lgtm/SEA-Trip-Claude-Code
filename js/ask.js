/* ============================================================
   47-ask: questions in the map's search box, typed or spoken.
   "where's the nearest toilet", "best cheap restaurant near me", "something to do today that isn't far".
   Worked out on the phone from what the app already knows (no AI). Places in saved cities answer with no signal.
   parseAsk() is pure and tested in tests/unit.js; answerAsk() finds the places; showAnswer() draws the sheet.
   ============================================================ */
IC.mic = '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/><path d="M8 22h8"/>';

// what someone might call each essential
const ASK_ESS = [
  ["toilet", /\b(toilets?|loos?|restrooms?|bathrooms?|wc|washrooms?|pee|wee)\b/],
  ["atm", /\b(atms?|cash ?machines?|cash ?points?|withdraw|get (some )?cash|banks?)\b/],
  ["exchange", /\b(exchange|change (some )?money|money changers?|currency)\b/],
  ["pharmacy", /\b(pharmac(y|ies)|chemists?|medicine|paracetamol|plasters?|painkillers?|boots|watsons)\b/],
  ["hospital", /\b(hospitals?|a ?& ?e|emergency room)\b/],
  ["clinic", /\b(clinics?|doctors?|gp|dentists?)\b/],
  ["laundry", /\b(laundr(y|ies)|launderettes?|laundrettes?|wash(ing)? (my )?clothes)\b/],
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

/* does this text read like a question rather than a place name? */
function isAsk(text){
  const t = String(text || "").toLowerCase().trim();
  if (t.length < 4) return false;
  if (/\?$/.test(t)) return true;
  if (/^(where|what|which|find|show|any|is there|are there|nearest|closest|best|cheap|cheapest|good|great|i need|i want|i'?m|we need|we want|take me|how far|somewhere|anywhere|recommend|suggest|need a|need an|need some|looking for)\b/.test(t)) return true;
  return /\b(near me|nearby|nearest|closest|around here|close by|near here|walking distance)\b|\b(not|isn'?t|aren'?t) (too |that |very )?far\b/.test(t);
}

/* what is being asked for: {kind, ess?, move?, kinds?, ft?, cheap, best, open, maxKm, what} or null */
function parseAsk(text){
  const t = " " + String(text || "").toLowerCase().replace(/[’']/g, "'") + " ";
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
  const cap = x => x.charAt(0).toUpperCase() + x.slice(1);
  if (a.kind === "ess" || a.kind === "move") return cap(a.what) + " nearby";
  return cap((a.best ? "best " : "") + (a.cheap ? "cheap " : "") + a.what + (a.open ? ", open now" : ""));
}
/* a plain category word ("atm", "hostel", "food") gets an answer row too; a place name like "Wat Pho" doesn't */
function askOffer(text){
  const a = parseAsk(text); if (!a) return null;
  if (isAsk(text)) return {a, first:true};
  const t = " " + String(text).toLowerCase() + " ";
  return a.kind === "ess" || a.kind === "move" || ASK_STAY.test(t) || ASK_FOOD.test(t) ? {a, first:false} : null;
}
async function showAnswer(text){
  openSheet(`<div class="sheet-head"><div><span class="kind">${icon("search", "i xs")} Your question</span><h2 id="askTitle">“${esc(text)}”</h2></div>
    <button class="icon-btn" type="button" data-close aria-label="Close">${icon("x")}</button></div><div id="askBody"><p class="note" style="margin-top:10px">Looking…</p></div>`, "askTitle");
  let r = null;
  try { r = await answerAsk(text); } catch(e){}
  const body = $("#askBody"); if (!body) return;
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

/* ---------- speaking the question ---------- */
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
function listen(onText, onDone){
  if (!SpeechRec) return false;
  const rec = new SpeechRec();
  rec.lang = "en-GB"; rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = false;
  let final = "";
  rec.onresult = e => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++){ const t = e.results[i][0].transcript; if (e.results[i].isFinal) final += t; else interim += t; }
    onText((final + interim).trim());
  };
  rec.onerror = e => { onDone(null, e.error); };
  rec.onend = () => onDone(final.trim());
  try { rec.start(); } catch(e){ return false; }
  return rec;
}
