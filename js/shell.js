/* ============================================================
   20-shell: bottom tabs, routing, page header, "where" picker, location
   ============================================================ */
const VIEWS = ["map","gaffs","munch","activities","tools","saved","discover"];
const HERO_IMG = {gaffs:"img/hero-gaffs.jpg", munch:"img/hero-munch.jpg", activities:"img/hero-activities.jpg", tools:"img/hero-tools.jpg", discover:"img/hero-discover.jpg"};
// The photo credits (PHOTO_CREDITS) and the destination pictures (DEST_IMG) are in 05-photos.js, which tools/photos.js writes.

function parseHash(){
  let h = (location.hash || "").slice(1);
  if (h === "transport") h = "tools/transport";            // links from the old version still work
  if (h === "setup") h = "tools/settings";
  const i = h.indexOf("/");
  const v = i < 0 ? h : h.slice(0, i), sub = i < 0 ? "" : h.slice(i + 1);
  return VIEWS.includes(v) ? {view:v, sub} : {view:"map", sub:""};
}
function renderNav(){
  const cur = ui.view === "saved" || ui.view === "discover" ? "" : ui.view;
  $("#tabs").innerHTML = TABS.map(t => `<a href="#${t.id}" ${cur === t.id ? 'aria-current="page"' : ""}>${icon(t.ic)}${t.label}</a>`).join("");
}
function show(r = parseHash()){
  ui.view = r.view; ui.sub = r.sub;
  document.documentElement.dataset.theme = S.country;
  renderNav();
  const isMap = r.view === "map";
  $("#mapview").hidden = !isMap; $("#pageview").hidden = isMap;
  if (isMap){ ensureMap(); mapShown(); renderMapUI(); }
  else { renderPage(); $("#pageview").scrollTop = 0; }
}
window.addEventListener("hashchange", () => show());
function rerender(){ if (ui.view === "map") renderMapUI(); else renderPage(); }
function go(hash){ if (location.hash === hash) show(); else location.hash = hash; }

/* ---------- page header ---------- */
function hero({title, sub = "", img = "", back = null, where = true}){
  const n = Object.keys(S.saved).length;
  const left = back ? `<a class="crumb" href="${back[0]}">${icon("back","i s")}${esc(back[1])}</a>`
    : where ? `<button class="where" type="button" data-where aria-label="Change where you are looking">${icon("pin","i s")}<span>${esc(focusLabel())}</span>${icon("chevd","i xs")}</button>` : "";
  return `<header class="hero ${back ? "slim" : ""}" ${img ? `style="--hero:url('${img}')"` : ""}>
    <div class="hero-top">${left}<span class="sp"></span>
      <a class="hbtn" href="#saved" aria-label="Saved places${n ? `, ${n}` : ""}">${icon("bookmark")}${n ? `<span class="n" id="savedCount">${n}</span>` : ""}</a>
      <a class="hbtn" href="#tools/settings" aria-label="Settings">${icon("cog")}</a></div>
    <h1>${esc(title)}</h1>${sub ? `<p class="sub">${esc(sub)}</p>` : ""}</header>`;
}
function emptyBlock(title, body, actions = ""){ return `<div class="empty"><b>${esc(title)}</b>${body}${actions ? `<div class="row" style="margin-top:10px">${actions}</div>` : ""}</div>`; }

/* ---------- page dispatcher ---------- */
function renderPage(){
  const v = ui.view;
  if (typeof detachTransportMap === "function") detachTransportMap();
  if (v === "gaffs") renderList("gaff");
  else if (v === "munch") renderList("munch");
  else if (v === "activities") renderList("cool");
  else if (v === "tools") renderTools();
  else if (v === "saved") renderSaved();
  else if (v === "discover") renderDiscover();
}

/* ---------- one click handler for the things that appear everywhere ---------- */
document.addEventListener("click", e => {
  const t = e.target;
  if (!t.closest) return;
  const s = t.closest("[data-save]");
  if (s){ e.preventDefault(); e.stopPropagation(); toggleSave(findPlace(s.dataset.save)); return; }
  if (t.closest("[data-where]")){ openWherePicker(); return; }
  if (t.closest("a, button, input, select, textarea, summary") && !t.closest("button[data-open]")) return;
  const o = t.closest("[data-open]");
  if (o) openDetail(o.dataset.open);
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && $("#sheetRoot").innerHTML){ closeDetail(); return; }
  if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("[role=button][data-open]")){ e.preventDefault(); openDetail(e.target.dataset.open); }
});

/* ---------- sheets ---------- */
let lastFocus = null;
function openSheet(inner, labelId, style = ""){
  if (!$("#sheetRoot").innerHTML) lastFocus = document.activeElement;
  $("#sheetRoot").innerHTML = `<div class="sheet-wrap"><div class="backdrop" data-close></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="${labelId}" style="${style}"><div class="grab" aria-hidden="true"></div>${inner}</div></div>`;
  $$("#sheetRoot [data-close]").forEach(b => b.onclick = closeDetail);
  const x = $("#sheetRoot button[data-close]"); if (x) x.focus();
  return $("#sheetRoot .sheet");
}
function closeDetail(){
  $("#sheetRoot").innerHTML = "";
  if (typeof highlightPin === "function" && !ui.mapSel) highlightPin(null);
  if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus();
}

/* ---------- where am I looking? ---------- */
const LOC_LINE = () => ({ok:"Your location is on.", test:`Using a test location: ${S.testLoc}. Change it in Settings.`, asking:"Looking for you…",
  denied:"Location is blocked for this page. Allow it in your browser settings, or pick a place below.", unavailable:"Your location isn’t available right now. Pick a place below.",
  outside:"You’re outside the trip countries, so pick a place below.", idle:"Location hasn’t been checked yet."}[locStatus]);
function openWherePicker(){
  const here = userLoc ? focusPtHere() : null;
  const dests = PLACE_DESTS.map(c => ({n:c[0], lat:c[1], lng:c[2], km: userLoc ? dist(userLoc, {lat:c[1], lng:c[2]}) : null}));
  if (userLoc) dests.sort((a, b) => a.km - b.km); else dests.sort((a, b) => a.n.localeCompare(b.n));
  const sheet = openSheet(`<div class="sheet-head"><h2 id="wp-title" style="margin:0 0 4px">Where are you looking?</h2><button class="icon-btn" data-close aria-label="Close">${icon("x")}</button></div>
    <p class="note" style="margin-bottom:10px">Gaffs, Munch, Activities and the map all look around this place. ${esc(LOC_LINE())}</p>
    <div class="pick-list">
      <button type="button" id="wp-here" aria-pressed="${!S.focus}">${icon("locate")}<span>Near me<small>${here ? esc(here) : "Uses your phone’s location"}</small></span></button>
      ${dests.map((d, i) => `<button type="button" data-dest="${i}" aria-pressed="${!!S.focus && S.focus.n === d.n}">${icon("pin")}<span>${esc(d.n)}${d.km != null ? `<small>${distText(d.km)}</small>` : ""}</span></button>`).join("")}
    </div>
    <details class="more" style="margin-top:14px"><summary>Other countries on the trip</summary>
      <p class="note" style="margin:8px 0">Thailand is covered in depth, and so are Bali, Lombok and three provinces of Sumatra in Indonesia (Lampung, South Sumatra and Bengkulu). The other countries have a starter set of researched places, money and ride tips.</p>
      <div class="cgrid">${Object.entries(D.countries).map(([k, x]) => `<button type="button" data-pick="${k}" aria-pressed="${S.country === k}"><span class="f" aria-hidden="true">${x.flag}</span>${esc(x.name)}</button>`).join("")}</div>
    </details>`, "wp-title");
  $("#wp-here").onclick = () => { setFocus(null); S.countryMode = "auto"; persist(); closeDetail(); locate(true); if (map && userLoc) flyTo(userLoc, 13); rerender(); };
  sheet.querySelectorAll("[data-dest]").forEach(b => b.onclick = () => {
    const d = dests[+b.dataset.dest]; setFocus(d); closeDetail();
    const cc = ccAt(d.lat, d.lng) || "TH"; if (S.country !== cc) setCountry(cc, true);
    if (map) flyTo(d, 12.5);
    rerender();
  });
  sheet.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => { closeDetail(); setFocus(null); setCountry(b.dataset.pick, true); });
}
function focusPtHere(){ const d = nearestDest(userLoc); return locStatus === "test" ? `Test location: ${S.testLoc}` : d ? `You’re in or near ${d}` : "Your current location"; }
function openCountryPicker(){ openWherePicker(); }

function setCountry(cc, manual){
  if (manual) S.countryMode = "manual";
  const changed = S.country !== cc;
  S.country = cc; persist();
  document.documentElement.dataset.theme = cc;
  if (changed && map){ const c = D.countries[cc]; flyTo({lat:c.c[0], lng:c.c[1]}, c.z); }
  rerender();
}

/* ---------- location ---------- */
const TEST_SPOTS = D.cities.map(c => c[0] === "Bangkok" ? ["Bangkok", 13.7466, 100.5393] : c);
function applyTestLocation(){
  if (!S.testLoc || S.testLoc === "off") return false;
  const c = TEST_SPOTS.find(x => x[0] === S.testLoc) || TEST_SPOTS[0];
  userLoc = {lat: c[1], lng: c[2]}; locStatus = "test";
  const cc = countryAt(userLoc.lat, userLoc.lng);
  if (S.countryMode === "auto" && cc && cc !== S.country){ S.country = cc; persist(); }
  return true;
}
// done (optional) runs once the answer is in, whatever it is: used by "take me to the nearest …"
function locate(prompted, done, quiet){
  const fin = () => { if (done) done(locStatus); };
  if (applyTestLocation()){
    updateMe(); rerender();
    if (prompted && !quiet){ if (map && ui.view === "map") flyTo(userLoc, 13); toast(`Using your test location: ${S.testLoc}. Turn it off in Settings.`); }
    return fin();
  }
  if (!("geolocation" in navigator)){ locStatus = "unavailable"; rerender(); if (prompted && !quiet) toast("Location isn’t available here. Pick a place instead."); return fin(); }
  locStatus = "asking";
  navigator.geolocation.getCurrentPosition(pos => {
    userLoc = {lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy};
    const cc = countryAt(userLoc.lat, userLoc.lng);
    locStatus = cc ? "ok" : "outside";
    if (S.countryMode === "auto" && cc && cc !== S.country) setCountry(cc, false);
    updateMe();
    if (prompted && !quiet && map && ui.view === "map" && cc) flyTo(userLoc, 13);
    if (typeof Heading !== "undefined") Heading.sync();          // keep the dot following the phone while the map is open
    rerender(); fin();
  }, err => {
    locStatus = err && err.code === 1 ? "denied" : "unavailable";
    rerender();
    if (prompted && !quiet) toast(locStatus === "denied" ? "Location is blocked. Pick a place instead." : "Couldn’t find you. Try again with signal.");
    fin();
  }, {enableHighAccuracy:false, timeout:12000, maximumAge:600000});
}
// the phone's position if it can be had (asks once if needed): resolves to locStatus
const locateNow = () => (userLoc && (locStatus === "ok" || locStatus === "test" || locStatus === "outside")) ? Promise.resolve(locStatus) : new Promise(r => locate(true, r, true));

/* ---------- full-height fix for home-screen mode ---------- */
function fitStandalone(){
  const sa = window.navigator.standalone === true || (window.matchMedia && matchMedia("(display-mode: standalone)").matches);
  const root = document.documentElement;
  root.classList.toggle("standalone", !!sa);
  root.classList.toggle("fill-bottom", !!sa);      // fill the strip iOS leaves under the tabs (works well on iPhone)
}
fitStandalone();
window.addEventListener("resize", fitStandalone);
window.addEventListener("orientationchange", () => setTimeout(fitStandalone, 300));
