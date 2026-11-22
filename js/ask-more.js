/* ============================================================
   48-ask-more: more questions for the map search, typed or spoken. Rule-based, no AI.
     "how much should a tuk-tuk cost from here to MBK"     a fare for that distance (estimates, marked "est.")
     "how long to get to Chiang Mai"                        journey times (the planner for long trips)
     "how far is Khao San Road"                              distance, and walking time
     "I'm hungover, what would cure me" / "I've got the shits, what should I buy"
                                                            the pharmacy list for the country you're in (REMEDIES)
   moreIntent() is pure and tested in tests/unit.js. askOffer() and showAnswer() in js/ask.js send these questions here.
   ============================================================ */

/* ---------- what to buy for a hangover, the shits, or dehydration, by country ----------
   Researched Nov 2026. Prices only where a shop or price list showed one (with its source); otherwise "price not checked".
   Medical advice follows the NHS. Nothing here is a diagnosis: the "see a doctor" signs are always shown. */
const RX_SRC = {
  nhsD:["NHS: diarrhoea and vomiting", "https://www.nhs.uk/conditions/diarrhoea-and-vomiting/"],
  nhsH:["NHS 111 Wales: hangover", "https://111.wales.nhs.uk/hangover/"],
  nhsP:["NHS: alcohol and painkillers", "https://www.nhs.uk/common-health-questions/medicines/can-i-drink-alcohol-if-i-am-taking-painkillers/"],
  bh:["Bangkok Hospital Chiang Mai: medicines for travellers", "https://www.bangkokhospital.com/en/chiangmai/content/five-drugs-for-traveller-bcm"],
  ksr:["Khaosan Road: Thailand medication list", "https://www.khaosanroad.com/articles/thailand-medication-packing-list"],
  bigc:["Big C via HappyFresh: Royal-D", "https://www.happyfresh.co.th/big-c-rajdamri/products/royal-d-electrolyte-beverage-53375/"],
  k24o:["K24klik: Oralit", "https://www.k24klik.com/cariObat/oralit"],
  k24e:["K24klik: Entrostop", "https://www.k24klik.com/cariObat/entrostop"],
  k24n:["K24klik: Norit", "https://www.k24klik.com/cariObat/norit"],
  k24d:["K24klik: diarrhoea medicines", "https://www.k24klik.com/cariObat/diare+mencret+pencernaan+diare+anak+apotek+online"],
  k24p:["K24klik: Pocari Sweat", "https://www.k24klik.com/p/pocari-sweat-350ml-btl-1139"],
  halo:["Halodoc: Imodium (obat keras)", "https://www.halodoc.com/obat-dan-vitamin/imodium-2-mg-10-tablet"],
  kh:["Expat Exchange: pharmacies in Cambodia", "https://expatexchange.com/article/22155/Pharmacies-and-Medications-in-Cambodia--"]
};
// for: s = the shits / upset stomach, h = hangover, d = dehydration. at: where to buy. rx: what you need to buy it.
const REMEDIES = {
  TH:[
    {n:"ORS rehydration salts (ผงเกลือแร่ ORS)", for:"sd h", best:true, what:"The most useful thing for diarrhoea, being sick or a bad hangover: replaces the water and salts you’ve lost. Mix one sachet with the water it says, sip it.",
      at:"Any pharmacy, Boots and Watsons", price:"About ฿10–15 a sachet", src:["ksr", "bh", "nhsD"], rx:"No prescription"},
    {n:"Royal-D electrolyte powder", for:"hd", what:"Thailand’s own electrolyte drink powder. Good for a hangover or after sweating all day; for proper diarrhoea, ORS is better.",
      at:"7-Eleven, supermarkets, pharmacies", price:"฿265 for 50 sachets at Big C (about ฿5 each)", src:["bigc"], rx:"No prescription"},
    {n:"Pocari Sweat or Sponsor", for:"hd", what:"Ready-made electrolyte drinks in the fridge at every 7-Eleven. Easy hangover fix with water and food.",
      at:"7-Eleven and minimarts", price:"Price not checked", src:["ksr"], rx:"No prescription"},
    {n:"Ultracarbon (activated charcoal)", for:"s", what:"Used in Thailand for food poisoning and an upset stomach. Take it 2 hours away from other medicines, as it stops them working.",
      at:"Pharmacies", price:"Price not checked", src:["bh"], rx:"No prescription"},
    {n:"Imodium (loperamide)", for:"s", what:"Stops diarrhoea for a few hours, handy for a long bus or boat. Not if you have a fever or blood in your poo, and not for under-12s.",
      at:"Pharmacies (ask the pharmacist)", price:"Price not checked", src:["bh", "nhsD"], rx:"From the pharmacist, no prescription"},
    {n:"Paracetamol (Tylenol, Sara)", for:"h", what:"For the headache. The NHS prefers paracetamol to aspirin for a hangover, as aspirin upsets the stomach. Never more than the packet says, and don’t double up with other cold or flu pills that contain it.",
      at:"Pharmacies and 7-Eleven", price:"Price not checked", src:["nhsH", "nhsP", "bh"], rx:"No prescription"}
  ],
  ID:[
    {n:"Oralit (ORS rehydration salts)", for:"sd h", best:true, what:"The most useful thing for Bali belly, being sick or a bad hangover: replaces the water and salts you’ve lost. One sachet in a glass of water, sip it.",
      at:"Any apotek (Kimia Farma, K24, Guardian, Century)", price:"Rp584–1,184 a sachet (K24klik online)", src:["k24o", "nhsD"], rx:"No prescription"},
    {n:"Pocari Sweat", for:"hd", what:"Ready-made electrolyte drink. Easy hangover fix with water and food.",
      at:"Indomaret, Alfamart, apotek", price:"Rp7,840 for 350 ml (K24klik online)", src:["k24p"], rx:"No prescription"},
    {n:"Entrostop", for:"s", what:"Indonesia’s everyday diarrhoea tablets (attapulgite and pectin), sold everywhere.",
      at:"Apotek, Indomaret, Alfamart", price:"Rp10,961 for 10 tablets (K24klik online)", src:["k24e"], rx:"No prescription"},
    {n:"Diapet", for:"s", what:"Herbal diarrhoea capsules that locals swear by.",
      at:"Apotek and minimarts", price:"Rp7,551 for 10 capsules (K24klik online)", src:["k24d"], rx:"No prescription"},
    {n:"Norit (activated charcoal)", for:"s", what:"For food poisoning and an upset stomach. Take it 2 hours away from other medicines.",
      at:"Apotek", price:"Rp22,718 a tube (K24klik online)", src:["k24n", "bh"], rx:"No prescription"},
    {n:"Imodium (loperamide)", for:"s", what:"Stops diarrhoea for a few hours. In Indonesia it’s an “obat keras” (red dot), so officially it needs a doctor’s prescription. Not with a fever or blood in your poo.",
      at:"Apotek, with a prescription", price:"Price not checked", src:["halo", "nhsD"], rx:"Prescription (obat keras)"},
    {n:"Paracetamol (Panadol)", for:"h", what:"For the headache. The NHS prefers paracetamol to aspirin for a hangover. Never more than the packet says.",
      at:"Apotek and minimarts", price:"Price not checked", src:["nhsH", "nhsP"], rx:"No prescription"}
  ],
  KH:[
    {n:"ORS rehydration salts", for:"sd h", best:true, what:"The most useful thing for diarrhoea, being sick or a bad hangover: replaces the water and salts you’ve lost. Mix as the sachet says, sip it.",
      at:"Pharmacies (look for the green cross)", price:"Price not checked", src:["nhsD", "kh"], rx:"No prescription"},
    {n:"Electrolyte drinks", for:"hd", what:"Bottled electrolyte drinks from minimarts help with a hangover, with water and food. For proper diarrhoea, ORS is better.",
      at:"Minimarts and petrol station shops", price:"Price not checked", src:["nhsH"], rx:"No prescription"},
    {n:"Loperamide (Imodium)", for:"s", what:"Stops diarrhoea for a few hours. Not with a fever or blood in your poo, and not for under-12s.",
      at:"Pharmacies", price:"Price not checked", src:["nhsD", "kh"], rx:"Pharmacies usually sell it without one"},
    {n:"Activated charcoal", for:"s", what:"For food poisoning and an upset stomach. Take it 2 hours away from other medicines.",
      at:"Pharmacies", price:"Price not checked", src:["bh", "kh"], rx:"No prescription"},
    {n:"Paracetamol", for:"h", what:"For the headache. The NHS prefers paracetamol to aspirin for a hangover. Never more than the packet says.",
      at:"Pharmacies", price:"Price not checked", src:["nhsH", "nhsP"], rx:"No prescription"}
  ]
};
/* Vietnam, Laos and Singapore: the same NHS advice on what helps. What each pharmacy sells over the counter wasn't checked,
   so these say to ask the pharmacist rather than guess. */
const REMEDY_BASIC = (where, mini) => [
  {n:"ORS rehydration salts", for:"sd h", best:true, what:"The most useful thing for diarrhoea, being sick or a bad hangover: replaces the water and salts you’ve lost. Mix as the packet says, with safe water.",
    at:where, price:"Price not checked", src:["nhsD"], rx:"Ask the pharmacist"},
  {n:"Electrolyte drinks", for:"hd", what:"Bottled electrolyte drinks help with a hangover, with water and food. For proper diarrhoea, ORS is better.",
    at:mini, price:"Price not checked", src:["nhsH"], rx:"No prescription"},
  {n:"Loperamide (Imodium)", for:"s", what:"Stops diarrhoea for a few hours. Not with a fever or blood in your poo, and not for under-12s.",
    at:where, price:"Price not checked", src:["nhsD"], rx:"Ask the pharmacist"},
  {n:"Paracetamol", for:"h", what:"For the headache. The NHS prefers paracetamol to aspirin for a hangover. Never more than the packet says.",
    at:where, price:"Price not checked", src:["nhsH", "nhsP"], rx:"Ask the pharmacist"}];
REMEDIES.VN = REMEDY_BASIC("Pharmacies (nhà thuốc)", "Convenience stores and minimarts");
REMEDIES.LA = REMEDY_BASIC("Pharmacies (ຮ້ານຂາຍຢາ, han khai ya)", "Minimarts");
REMEDIES.SG = REMEDY_BASIC("Pharmacies (Guardian, Watsons and others)", "7-Eleven, Cheers and supermarkets");
// Malaysia: the chains are the most common pharmacies and convenience stores in OpenStreetMap's Malaysia data (Nov 2026)
REMEDIES.MY = REMEDY_BASIC("Pharmacies (farmasi: Watsons, Guardian and others)", "7-Eleven, KK Mart, FamilyMart and myNEWS");
const RX_NOTE = {
  KH:"In Cambodia, check the expiry date on the packet: some pharmacies sell old stock.",
  ID:"Bali belly that lasts more than a couple of days, or comes with a fever, needs a clinic, not more tablets.",
  TH:"Thai pharmacists usually speak some English and will suggest what to take. Point at the name in this list."
};
const RX_DOCTOR = ["Blood in your poo, or being sick with blood in it", "A high temperature with diarrhoea", "Can’t keep any drinks down, or still dehydrated after ORS (dark pee, peeing very little, dizzy)",
  "Diarrhoea for more than 7 days, or being sick for more than 2", "Sudden, severe tummy pain, a stiff neck or confusion: go to a hospital"];
const RX_HANGOVER = "There’s no real cure for a hangover (and “hair of the dog” doesn’t work). What helps: water and electrolytes, something to eat, sleep, and paracetamol for the headache.";
const rxCc = () => { const c = typeof userLoc !== "undefined" && userLoc ? ccAt(userLoc.lat, userLoc.lng) : null; return REMEDIES[c] ? c : REMEDIES[S.country] ? S.country : "TH"; };
function remedyList(cc, topic){
  const all = REMEDIES[cc] || REMEDIES.TH, key = {hangover:"h", stomach:"s", dehydration:"d"}[topic];
  const list = key ? all.filter(r => r.for.includes(key)) : all;
  return list.sort((a, b) => (b.best ? 1 : 0) - (a.best ? 1 : 0));
}
function remedyCardHTML(r){
  return `<div class="rx"><div class="rx-top"><b>${esc(r.n)}</b>${r.best ? `<span class="tag good">Best first buy</span>` : ""}</div>
    <p>${esc(r.what)}</p>
    <div class="rx-facts"><span>${icon("cart","i xs")}${esc(r.at)}</span><span>${icon("cash","i xs")}${esc(r.price)}</span><span>${icon("info","i xs")}${esc(r.rx)}</span></div>
    <p class="note rx-src">${r.src.map(k => `<a href="${esc(RX_SRC[k][1])}" target="_blank" rel="noopener">${esc(RX_SRC[k][0])}</a>`).join(" · ")}</p></div>`;
}
const rxDoctorHTML = () => `<div class="callout warn rx-doc">${icon("alert")}<div><b>See a doctor or clinic if you have:</b><ul>${RX_DOCTOR.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
  <span class="note">From the <a href="${RX_SRC.nhsD[1]}" target="_blank" rel="noopener">NHS</a>. Antibiotics only from a doctor.</span></div></div>`;
// the guide section (Tools › country guide): "Hangover and the shits"
function remedyGuideHTML(cc){
  const name = (D.countries[cc] || {name:"Thailand"}).name;
  return `<section class="block" id="g-rx"><h2>Hangover and the shits</h2>
    <p class="note">The best things to buy in ${esc(name)} for diarrhoea, a hangover or not enough electrolytes, and where to get them. Prices checked Nov 2026 where a shop showed one.</p>
    <h3 style="margin-top:10px">The shits (diarrhoea, food poisoning)</h3>${remedyList(cc, "stomach").map(remedyCardHTML).join("")}
    <h3 style="margin-top:10px">Hangover and electrolytes</h3><p class="note">${esc(RX_HANGOVER)}</p>${remedyList(cc, "hangover").map(remedyCardHTML).join("")}
    ${RX_NOTE[cc] ? `<p class="note">${esc(RX_NOTE[cc])}</p>` : ""}
    ${rxDoctorHTML()}
    <div class="row" style="margin-top:10px;flex-wrap:wrap;gap:8px"><button class="btn small" type="button" data-rxnear>${icon("nav","i s")}Nearest pharmacy</button><button class="btn small" type="button" data-rxmap="pharmacy">${icon("pill","i s")}Pharmacies on the map</button><button class="btn small" type="button" data-rxmap="shop">${icon("cart","i s")}7-Elevens on the map</button></div></section>`;
}
function bindRemedyButtons(root){
  root.querySelectorAll("[data-rxnear]").forEach(b => b.onclick = () => { closeDetail(); goNearest("nearest pharmacy"); });
  root.querySelectorAll("[data-rxmap]").forEach(b => b.onclick = () => {
    closeDetail();
    if (!ui.essKinds.size && typeof mapRun !== "undefined" && !mapRun.stash) mapRun.stash = new Set(ui.mapCats);
    ui.mapCats.clear(); ui.essKinds = new Set([b.dataset.rxmap]); ui.essOpen = true; ui.mapSaved = false; ui.mapMode = "map";
    go("#map"); setTimeout(() => { renderMapUI(); if (typeof userLoc !== "undefined" && userLoc && map) flyTo(userLoc, 15); }, 150);
  });
}

/* ---------- reading the question ---------- */
const RX_RE = /\b(hung ?over|hangover|hanging|the shits|shits|shitting|diarrh?o?ea|diarrhea|the runs|bali belly|delhi belly|upset (stomach|tummy)|stomach (bug|ache|upset|cramps?)|tummy (bug|ache)|food poisoning|dehydrated|dehydration|electrolytes?|rehydrat\w*|vomit\w*|being sick|throwing up|puking|not feeling (great|good|well|too good|100)|feel(ing)? (rough|sick|ill|awful|terrible|like death|shit|crap|rubbish)|poorly)\b/;
const FARE_RE = /\b(tuk[- ]?tuks?|taxis?|cabs?|grab|bolt|gojek|uber|ride|motorbike taxi|moto|songthaews?|remork|bike taxi)\b/;
// what "to" means: "from where I am to MBK", "to MBK market from here"
function askDest(t){
  const m = /^.* (?:to|till|until) (?:get to |go to )?(.+?)(?: from (?:here|where i am|me|my (?:hostel|hotel))| from .+)?(?: cost| be| take)?\s*\??\s*$/.exec(t);      // the last "to"
  let d = m ? m[1] : "";
  if (!d){ const f = /\b(?:how far(?: away)?|distance)(?: is| to| from here to)? (.+?)\s*\??\s*$/.exec(t); d = f ? f[1] : ""; }
  d = d.replace(/\b(from here|from me|near me|right now|please|away|from where i am|by (tuk[- ]?tuk|taxi|grab|bolt|car|bus|train|boat|ferry))\b/g, "").replace(/^(a|an) /, "").replace(/\s+/g, " ").trim();
  if (!d || /^(get|go|there|it|me|us|here)$/.test(d)) return "";
  return d;
}
// "mbk market" → "MBK Market", "chiang mai" → "Chiang Mai"
const askCap = d => d.split(" ").map(w => w.length <= 3 && !/^(the|to|of|and|on|in|at|by)$/.test(w) && !/[aeiou]{2}/.test(w) && /^[a-z]+$/.test(w) && !/[aeiou]/.test(w.slice(1)) ? w.toUpperCase() : /^(the|to|of|and|on|in|at|by)$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
function moreIntent(text){
  const t = normAsk(text);
  if (RX_RE.test(t) || /\b(cure|fix) (me|a hangover|my hangover)\b|\bwhat (should|can|do) i (buy|take|get)\b.*\b(sick|ill|stomach|hangover|diarrh)/.test(t)){
    const topic = /hung ?over|hangover|hanging|drunk|drinking/.test(t) ? "hangover" : /shit|diarrh|runs|belly|stomach|tummy|poisoning|vomit|being sick|throwing up|puking/.test(t) ? "stomach"
      : /dehydrat|electrolyte|rehydrat/.test(t) ? "dehydration" : "general";
    return {kind:"more", type:"rx", topic, title:{hangover:"What to buy for a hangover", stomach:"What to buy for the shits", dehydration:"Electrolytes: what to buy", general:"Feeling rough: what to buy"}[topic]};
  }
  const dest = askCap(askDest(t)), veh = (FARE_RE.exec(t) || [])[1] || "";
  if (/\bhow much\b|\bwhat (should|would|will|does) (i|we|it) (pay|cost)\b|\b(cost|price|fare) (of|for|to)\b|\bshould (it|i|we) (cost|pay)\b/.test(t) && (veh || dest))
    return {kind:"more", type:"fare", veh:vehKind(veh), dest, title:`What a ${vehName(vehKind(veh))} should cost${dest ? ` to ${dest}` : ""}`};
  if (/\bhow long\b/.test(t) && dest) return {kind:"more", type:"time", veh:vehKind(veh), dest, title:`How long to ${dest}`};
  if (/\bhow far\b|\bdistance (to|from)\b/.test(t) && dest) return {kind:"more", type:"far", dest, title:`How far is ${dest}`};
  return null;
}
const vehKind = v => /tuk|remork/.test(v) ? "tuktuk" : /grab|bolt|gojek|uber|ride/.test(v) ? "app" : /moto|motorbike|bike/.test(v) ? "moto" : /songthaew/.test(v) ? "songthaew" : /taxi|cab/.test(v) ? "taxi" : "";
const vehName = k => ({tuktuk:"tuk-tuk", app:"Grab or Bolt", moto:"motorbike taxi", songthaew:"songthaew", taxi:"taxi"})[k] || "ride";

/* ---------- fares: estimates from researched rules (shown as "est.") ----------
   Bangkok: the official taxi meter (D.net.taxi, in js/transport.js); Grab or Bolt about 1.2–1.8 times the meter (min ฿100–150);
   tuk-tuks aren't metered, and guides put them at about the meter fare to twice it (min ฿50–100), agreed before you get in.
   Cambodia: PassApp or Grab tuk-tuks about US$1–1.50 for 2–3 km and US$3–4 for 6–8 km; street tuk-tuks ask 2–3 times more. */
const FARE_SRC = {
  bkkTuk:[["Thaiest", "https://thaiest.com/en/thailand/bangkok/taxi"], ["Portail Asie: tuk-tuks in Thailand", "https://portail-asie.com/en/tuk-tuks-in-thailand-guide"]],
  khTuk:[["Move to Cambodia", "https://movetocambodia.com/?p=922602"], ["Expat.com: transport in Phnom Penh", "https://www.expat.com/en/guide/asia/cambodia/13254-transports-in-phnom-penh.html"]]
};
// [{k, label, lo, hi, cur, note}] for a road distance in km at a place, best guess first; null prices mean "check the app"
function fareEstimates(km, at){
  const cc = ccAt(at.lat, at.lng) || "TH", out = [];
  if (cc === "TH" && typeof HUB !== "undefined" && dist(at, HUB.bkk) < 40){
    const m = meterFare(km);
    out.push({k:"taxi", label:"Metered taxi", lo:Math.round(m * 1.05), hi:Math.round(m * 1.4), cur:"THB", note:"Ask for the meter; get out if they refuse"});
    out.push({k:"app", label:"Grab or Bolt", lo:Math.round(Math.max(100, m * 1.2)), hi:Math.round(Math.max(150, m * 1.8)), cur:"THB", note:"The app shows the real price before you book"});
    out.push({k:"tuktuk", label:"Tuk-tuk", lo:Math.round(Math.max(50, m) / 10) * 10, hi:Math.round(Math.max(100, m * 2) / 10) * 10, cur:"THB", note:"Agree the price before you get in. Anything much over this is a tourist price", src:FARE_SRC.bkkTuk});
    out.push({k:"moto", label:"Motorbike taxi", lo:null, hi:null, cur:"THB", note:"Orange vests; prices are on a board at the rank, or use Grab Bike"});
  } else if (cc === "KH"){
    out.push({k:"tuktuk", label:"Tuk-tuk on PassApp or Grab", lo:Math.max(1, Math.round(km * .45 * 2) / 2), hi:Math.max(1.5, Math.round(km * .6 * 2) / 2), cur:"USD", note:"Street tuk-tuks ask 2–3 times this: agree first, or use the app", src:FARE_SRC.khTuk});
    out.push({k:"app", label:"Car on PassApp or Grab", lo:null, hi:null, cur:"USD", note:"The app shows the price before you book"});
  } else {
    // no researched fares outside Bangkok and Cambodia: which ride apps work comes from each country's ride tips (D.rides)
    const APPS = {ID:"Grab or Gojek", VN:"Grab or Xanh SM", SG:"Grab, Gojek or TADA", LA:"LOCA (Vientiane) or a tuk-tuk", MY:"Grab"};
    out.push({k:"app", label:APPS[cc] || "Grab or Bolt", lo:null, hi:null, cur:ccCur(cc), note:"The app shows the price before you book: the fairest guide to what a ride should cost here"});
    if (cc === "SG") out.push({k:"taxi", label:"Metered taxi", lo:null, hi:null, cur:"SGD", note:"Metered and honest; the MRT is cheaper still"});
    // gov.uk Malaysia travel advice (safety and security), checked 22 Nov 2026
    else if (cc === "MY") out.push({k:"taxi", label:"Taxi", lo:null, hi:null, cur:"MYR", note:"Taxis should use the meter. At airports you buy a fixed-price coupon at a counter in the terminal"});
    else out.push({k:"tuktuk", label:cc === "ID" ? "Local taxi or bemo" : cc === "VN" ? "Metered taxi (Mai Linh or Vinasun) or xe ôm" : "Tuk-tuk or songthaew", lo:null, hi:null, cur:ccCur(cc), note:"Not metered: check the app price first, then agree a price before you get in"});
  }
  return out;
}
const fareText = f => f.lo == null ? "Check the app" : `${money(f.lo, f.cur)}–${fmtNum(f.hi)} est. (${gbpRange([f.lo, f.hi], f.cur)})`;
// rough door-to-door times in town traffic, and walking
const cityMins = km => [Math.max(5, Math.round(km / 25 * 60 / 5) * 5), Math.max(10, Math.round(km / 14 * 60 / 5) * 5)];
const walkMins = km => Math.round(km / 4.5 * 60);
const minsText = ([a, b]) => b < 60 ? `${a}–${b} min` : `${fh(a / 60)}–${fh(b / 60)}`;

/* ---------- finding the place the question names ---------- */
async function askFindPlace(name, ref){
    name = name.replace(/^the /i, "");
  const hit = localMatches(name, true)[0]; if (hit && hit.node) return hit.node;
  const tries = [name, name.replace(/\b(market|mall|centre|center|shopping|station|road|street|the|beach|temple)\b/gi, "").replace(/\s+/g, " ").trim()].filter((x, i, a) => x && a.indexOf(x) === i);
  for (const q of tries){
    const r = await Places.search(q, ref).catch(() => []);
    if (r && r.length) return {n:r[0].n, lat:r[0].lat, lng:r[0].lng};
  }
  const o = await osmSearch(name);
  if (o && o.length) return o[0].node;
  return null;
}
async function askRef(){
  if (typeof userLoc !== "undefined" && userLoc) return {lat:userLoc.lat, lng:userLoc.lng, here:true};
  try { await locateNow(); } catch(e){}
  if (typeof userLoc !== "undefined" && userLoc) return {lat:userLoc.lat, lng:userLoc.lng, here:true};
  if (typeof map !== "undefined" && map && mapLoaded) return {lat:map.getCenter().lat, lng:map.getCenter().lng, mapc:true};
  const f = focusPt(); return {lat:f.lat, lng:f.lng};
}

/* ---------- the answer sheet ---------- */
async function showMore(text, a){
  openSheet(`<div class="sheet-head"><div><span class="kind">${icon("search", "i xs")} Your question</span><h2 id="askTitle">“${esc(text)}”</h2></div>
    <button class="icon-btn" type="button" data-close aria-label="Close">${icon("x")}</button></div><div id="askBody"><p class="note" style="margin-top:10px">Working it out…</p></div>`, "askTitle");
  const body = $("#askBody");
  if (a.type === "rx"){
    const cc = rxCc(), list = remedyList(cc, a.topic === "general" ? "" : a.topic === "dehydration" ? "dehydration" : a.topic);
    body.innerHTML = `<h3 style="margin-top:12px">${esc(a.title)} in ${esc((D.countries[cc] || {name:""}).name)}</h3>
      ${a.topic === "hangover" || a.topic === "general" ? `<p class="note">${esc(RX_HANGOVER)}</p>` : ""}
      ${list.map(remedyCardHTML).join("")}${RX_NOTE[cc] ? `<p class="note">${esc(RX_NOTE[cc])}</p>` : ""}
      ${a.topic === "hangover" ? "" : rxDoctorHTML()}
      <div class="row" style="margin-top:10px;flex-wrap:wrap;gap:8px"><button class="btn small primary" type="button" data-rxnear>${icon("nav","i s")}Nearest pharmacy</button><button class="btn small" type="button" data-rxmap="pharmacy">${icon("pill","i s")}Pharmacies on the map</button>
        <button class="btn small" type="button" data-rxmap="shop">${icon("cart","i s")}7-Elevens</button><a class="btn small" href="#tools/guide" data-close>${icon("book","i s")}In the guide</a></div>`;
    bindRemedyButtons(body);
    return;
  }
  const ref = await askRef(), dest = await askFindPlace(a.dest, ref);
  if (!$("#askBody")) return;
  const from = ref.here ? "you" : ref.mapc ? "the middle of the map" : esc(focusLabel());
  if (!dest){ body.innerHTML = `<p class="note" style="margin-top:10px">I couldn’t find “${esc(a.dest)}”. Try its full name (“MBK Center”), or search for it and tap it on the map.</p>`; return; }
  const straight = dist(ref, dest), km = roadKm(ref, dest);
  let html = `<h3 style="margin-top:12px">${esc(dest.n)}</h3><p class="note">${straight < 1 ? `${Math.round(straight * 1000)} m` : `${straight.toFixed(1)} km`} from ${from} in a straight line, about ${km.toFixed(1)} km by road.</p>`;
  if (km <= 60){
    const fares = fareEstimates(km, ref), first = fares.findIndex(f => f.k === a.veh);
    if (first > 0) fares.unshift(fares.splice(first, 1)[0]);
    if (a.type === "far" && straight < 3) html += `<p><b>Walking:</b> about ${walkMins(km)} min.</p>`;
    html += `<div class="fare-list">${fares.map(f => `<div class="fare"><b>${esc(f.label)}</b><span class="${f.lo == null ? "note" : ""}">${esc(fareText(f))}</span><small>${esc(f.note)}${f.src ? ` · ${f.src.map(s => `<a href="${esc(s[1])}" target="_blank" rel="noopener">${esc(s[0])}</a>`).join(", ")}` : ""}</small></div>`).join("")}</div>
      <p><b>Time by road:</b> about ${minsText(cityMins(km))}, depending on traffic${km < 3 ? `; walking about ${walkMins(km)} min` : ""}.</p>
      <p class="note">Prices are estimates (“est.”) from the rules in the app: Bangkok’s official taxi meter, and what travel guides say tuk-tuks and apps charge. A Grab or Bolt quote is the best check.</p>`;
  } else {
    const trips = typeof planTrips === "function" ? planTrips(ref.here ? {n:"You", lat:ref.lat, lng:ref.lng} : {n:"Map centre", lat:ref.lat, lng:ref.lng}, dest) : [];
    html += trips.length ? `<div class="fare-list">${trips.slice(0, 3).map(t => `<div class="fare"><b>${esc([...new Set(t.legs.map(L => L.o.mode))].join(" + "))}</b><span>${esc(fRange(t.dmin, t.dmax))}</span><small>${t.unpriced ? "Some legs unpriced" : `From ${esc(tripFrom(t))}`}${t.fastest ? " · fastest" : ""}${t.cheapest ? " · cheapest" : ""}</small></div>`).join("")}</div>`
      : `<p class="note">Too far for a taxi estimate, and the journey planner has no route for it yet.</p>`;
  }
  html += `<div class="row" style="margin-top:10px;flex-wrap:wrap;gap:8px"><button class="btn small primary" type="button" id="askPlan">${icon("route","i s")}Plan it in Transport</button><a class="btn small" href="${esc(L_dir(dest))}" target="_blank" rel="noopener">${icon("nav","i s")}Directions</a></div>`;
  body.innerHTML = html;
  $("#askPlan").onclick = () => { ui.tp.to = {n:dest.n, lat:dest.lat, lng:dest.lng}; closeDetail(); go("#tools/transport"); };
}
