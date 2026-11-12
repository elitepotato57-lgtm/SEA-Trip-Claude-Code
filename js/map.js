/* ============================================================
   40-map: the main map (MapLibre GL + OpenFreeMap street tiles)
   - only loads the places for the area on screen (tiles from places/<cc>/)
   - zoomed out, it shows counts from a small summary grid instead of every place
   - clustering, search, category chips, essentials, Map/List, place preview, satellite
   ============================================================ */
let map = null, mapReady = false, mapLoaded = false;
const SAT_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const satLink = (lat, lng, z) => `https://www.google.com/maps/@?api=1&map_action=map&center=${(+lat).toFixed(5)},${(+lng).toFixed(5)}&zoom=${Math.round(z)}&basemap=satellite`;
let satOK = null;
const MAP_BUDGET = 9000;          // most individual places drawn at once; above this the map shows counts
const mapRun = {pending:new Map(), mode:"", shown:0, total:0, loading:false, items:[], sig:"", stash:null};
window.__mapStats = {setData:0, features:0, lastMs:0, leafFetches:0, aborted:0};

function testSatellite(){
  return new Promise(res => {
    let done = false; const fin = v => { if (!done){ done = true; res(v); } };
    const img = new Image();
    img.onload = () => fin(true); img.onerror = () => fin(false);
    setTimeout(() => fin(false), 6000);
    img.src = SAT_URL.replace("{z}", "4").replace("{y}", "7").replace("{x}", "12");
  });
}
const geoFC = () => { const feats = []; GEO.forEach(c => c.p.forEach(r => feats.push({type:"Feature", properties:{cc:c.cc || ""}, geometry:{type:"Polygon", coordinates:[r]}}))); return {type:"FeatureCollection", features:feats}; };
const fc = feats => ({type:"FeatureCollection", features:feats});

/* ---------- pin pictures, drawn once from the app's own icons ---------- */
function pinSVG(ic, fill, ring){
  return `<svg xmlns="http://www.w3.org/2000/svg" width="68" height="68" viewBox="0 0 34 34"><circle cx="17" cy="17" r="14.5" fill="${fill}" stroke="${ring}" stroke-width="2.4"/><g transform="translate(8 8) scale(.75)" fill="none" stroke="#20262B" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${IC[ic] || IC.pin}</g></svg>`;
}
function addPinImages(){
  const col = {stay:cssv("--stay"), food:cssv("--food"), do:cssv("--do"), ess:cssv("--ess"), move:cssv("--move")};
  const grpOf = k => { const m = Places.meta && Places.meta.kinds[k]; return m ? m[0] : null; };
  const GRP = {hostel:"stay",hotel:"stay",guesthouse:"stay",resort:"stay",bungalow:"stay",apartment:"stay",motel:"stay",campsite:"stay",hut:"stay",
    restaurant:"food",cafe:"food",fastfood:"food",foodcourt:"food",bakery:"food",dessert:"food",market:"food",
    airport:"move",train:"move",metro:"move",bus:"move",ferry:"move",carrental:"move",scooter:"move",bike:"move",taxi:"move"};
  const ESSK = new Set(ESS.flatMap(e => e.kinds).concat(["luggage"]));
  Object.keys(KIND).forEach(k => {
    const g = GRP[k] || (ESSK.has(k) ? "ess" : grpOf(k) || "do");
    [["", "#20262B"], ["-r", "#F2F1ED"]].forEach(([suffix, ring]) => {
      const name = `pin-${k}${suffix}`;
      const img = new Image(68, 68);
      img.onload = () => { try { if (!map) return; if (map.hasImage(name)) map.updateImage(name, img); else map.addImage(name, img, {pixelRatio:2}); } catch(e){} };
      img.src = "data:image/svg+xml;charset=utf-8," + enc(pinSVG(KIND[k].ic, col[g], ring));
    });
  });
}
/* Each category has its own clustered layer on the map, so a bunch of hostels is a coral circle and a bunch of cafés a green one,
   matching the chip colours. Circles grow with the number of places inside: 4 is small, 300 is big. */
const MAP_GROUPS = ["stay", "food", "do", "ess", "move"];
const grpOfItem = it => (it.g && MAP_GROUPS.includes(it.g)) ? it.g : (CAT[it.c] ? CAT[it.c].grp : "do");
const CL_RADIUS = ["interpolate", ["linear"], ["ln", ["max", ["get", "w"], 1]], 0, 8, 2.303, 10, 4.605, 14, 6.908, 18, 9.21, 23];    // 1 → 8 px, 10 → 10, 100 → 14, 1,000 → 18, 10,000 → 23
// where several categories bunch up in one spot, nudge each a few pixels so every colour shows
const CL_NUDGE = {stay:[-5, -3], food:[5, -3], do:[0, 5], ess:[-5, 4], move:[5, 4]};
const featOf = it => it._f || (it._f = {type:"Feature", geometry:{type:"Point", coordinates:[it.lng, it.lat]},
  properties:{id:it.id, g:grpOfItem(it), n:it.unnamed ? "" : it.n, ic:`pin-${KIND[it.k] ? it.k : "attraction"}${it.cur_ ? "-r" : ""}`, w:1}});

/* ---------- build the map ---------- */
function ensureMap(){
  if (map || mapReady) return;
  mapReady = true;
  $("#mapview").innerHTML = `<div id="map" role="application" aria-label="Map of places"></div>
    <div class="map-loading" id="mapLoading" role="status"><div><span class="spin" aria-hidden="true"></span>Loading map…</div></div>
    <div class="map-top" id="mapTop">
      <label class="sbar"><span class="vis-hidden">Search the map</span>${icon("search")}<input type="search" id="m-q" autocomplete="off" enterkeyhint="search" placeholder="Search places or ask a question"><button class="sbtn" type="button" id="m-clear" aria-label="Clear search" hidden>${icon("x","i s")}</button><button class="sbtn" type="button" id="m-mic" aria-label="Ask a question out loud" aria-pressed="false">${icon("mic")}</button><a class="sbtn" href="#discover" aria-label="Discover Thailand">${icon("compass")}</a><a class="sbtn" href="#saved" aria-label="Saved places">${icon("bookmark")}</a></label>
      <div class="map-sugs" id="mapSugs" hidden></div>
      <div class="map-chips" id="mapChips" role="group" aria-label="What to show"></div>
      <div class="map-chips" id="mapEss" role="group" aria-label="Essentials" hidden></div>
      <div id="mapModeRow" style="display:flex;gap:8px;align-items:center"></div>
      <div class="map-chips mfilt" id="mapFilt" role="group" aria-label="Filter what's on the map" hidden></div>
    </div>
    <div class="maplist" id="mapList" hidden></div>
    <div class="map-side" id="mapSide"></div>
    <div class="map-bottom" id="mapBottom"></div>`;
  bindMapSearch();
  if (typeof maplibregl === "undefined"){
    $("#mapLoading").remove();
    $("#map").innerHTML = `<div class="map-msg"><div><b>The map couldn’t load.</b><br>It needs a connection the first time. Your lists in Gaffs, Munch and Activities still work.</div></div>`;
    return;
  }
  const cc = D.countries[S.country];
  const start = S.mapView && isFinite(S.mapView.z) ? {c:S.mapView.c, z:S.mapView.z} : userLoc ? {c:[userLoc.lng, userLoc.lat], z:14} : {c:[cc.c[1], cc.c[0]], z:cc.z};
  try {
    map = new maplibregl.Map({container:"map", style:mapStyle(), center:start.c, zoom:start.z, minZoom:4, maxZoom:19, maxBounds:[[82, -16], [132, 33]],
      attributionControl:false, dragRotate:false, pitchWithRotate:false, touchPitch:false, renderWorldCopies:false, fadeDuration:120});
  } catch(e){
    map = null; $("#mapLoading").remove();
    $("#map").innerHTML = `<div class="map-msg"><div><b>The map can’t run on this device.</b><br>${esc(e.message || "")}<br>Gaffs, Munch and Activities still work.</div></div>`;
    return;
  }
  if (map.touchZoomRotate && map.touchZoomRotate.disableRotation) map.touchZoomRotate.disableRotation();
  if (map.keyboard && map.keyboard.disableRotation) map.keyboard.disableRotation();
  map.addControl(new maplibregl.AttributionControl({compact:true, customAttribution:'Places © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}), "bottom-left");
  map.on("load", onMapLoad);
  // if the street map never arrives (no signal, first run), don't leave the spinner up forever
  setTimeout(() => hideMapLoading(), 15000);
  map.on("error", e => { const m = e && e.error && String(e.error.message || ""); if (!mapRun.tilesOk && /Failed to fetch|NetworkError|planet|tiles\.openfreemap/i.test(m)) setOfflineBase(true); });
}
function hideMapLoading(){
  const el = $("#mapLoading"); if (!el || el.classList.contains("gone")) return;
  el.classList.add("gone"); setTimeout(() => el.remove(), 300);
}
function onMapLoad(){
  mapLoaded = true;
  hideMapLoading();
  addPinImages();
  const first = MAP_STYLE.layers.find(l => l.id !== "background");
  map.addSource("fb", {type:"geojson", data:geoFC()});
  map.addLayer({id:"fb-land", type:"fill", source:"fb", layout:{visibility:"none"}, paint:{"fill-color":["case", ["==", ["get", "cc"], ""], cssv("--land"), cssv("--land-trip")], "fill-outline-color":cssv("--border-land")}}, first && first.id);
  const isGroup = ["any", ["has", "point_count"], [">", ["get", "w"], 1]];
  MAP_GROUPS.forEach(g => {
    map.addSource("pts-" + g, {type:"geojson", data:fc([]), cluster:true, clusterRadius:46, clusterMaxZoom:16, clusterProperties:{w:["+", ["get", "w"]]}});
    map.addLayer({id:"cl-circle-" + g, type:"circle", source:"pts-" + g, filter:isGroup, paint:{
      "circle-color":cssv("--" + g), "circle-stroke-color":cssv("--cl-ring"), "circle-stroke-width":1.5, "circle-opacity":.72, "circle-stroke-opacity":.85, "circle-radius":CL_RADIUS, "circle-translate":CL_NUDGE[g]}});
    map.addLayer({id:"cl-count-" + g, type:"symbol", source:"pts-" + g, filter:isGroup, layout:{
      "text-field":["case", [">=", ["get", "w"], 10000], ["concat", ["to-string", ["round", ["/", ["get", "w"], 1000]]], "k"],
        [">=", ["get", "w"], 1000], ["concat", ["to-string", ["/", ["round", ["/", ["get", "w"], 100]], 10]], "k"], ["to-string", ["get", "w"]]],
      "text-font":["Noto Sans Bold"], "text-size":11, "text-allow-overlap":true, "text-ignore-placement":true}, paint:{"text-color":cssv("--on-cat"), "text-halo-color":"rgba(0,0,0,.35)", "text-halo-width":1, "text-translate":CL_NUDGE[g]}});
  });
  map.addSource("sel", {type:"geojson", data:fc([])});
  map.addLayer({id:"sel-ring", type:"circle", source:"sel", paint:{"circle-radius":21, "circle-color":"rgba(232,198,165,.18)", "circle-stroke-color":cssv("--accent-2"), "circle-stroke-width":2.5}});
  MAP_GROUPS.forEach(g => map.addLayer({id:"pt-icon-" + g, type:"symbol", source:"pts-" + g, filter:["all", ["!", ["has", "point_count"]], ["==", ["get", "w"], 1]], layout:{
    "icon-image":["get", "ic"], "icon-size":["interpolate", ["linear"], ["zoom"], 9, .5, 14, .7, 17, .85], "icon-allow-overlap":true, "icon-ignore-placement":true,
    "text-field":["step", ["zoom"], "", 15.5, ["get", "n"]], "text-font":["Noto Sans Regular"], "text-size":11, "text-offset":[0, 1.45], "text-anchor":"top",
    "text-optional":true, "text-max-width":9}, paint:{"text-color":cssv("--ink"), "text-halo-color":cssv("--halo"), "text-halo-width":1.2}}));
  // the chosen place gets its own pin on top, so it stays visible even when its neighbours are bunched into a count
  map.addLayer({id:"sel-icon", type:"symbol", source:"sel", layout:{"icon-image":["get", "ic"], "icon-size":1.08, "icon-allow-overlap":true, "icon-ignore-placement":true}});
  map.addSource("me", {type:"geojson", data:fc([])});
  map.addLayer({id:"me-halo", type:"circle", source:"me", paint:{"circle-radius":16, "circle-color":"rgba(127,178,210,.22)"}});
  addHeadingImages();
  // which way the phone points (a beam) or which way you are moving (an arrow): drawn under the dot, turned with the map's north
  map.addLayer({id:"me-head", type:"symbol", source:"me", filter:[">=", ["get", "hd"], 0], layout:{"icon-image":["case", ["==", ["get", "mode"], "travel"], "me-arrow", "me-beam"],
    "icon-rotate":["get", "hd"], "icon-rotation-alignment":"map", "icon-allow-overlap":true, "icon-ignore-placement":true},
    paint:{"icon-opacity":["case", ["get", "rough"], .45, .95]}});
  map.addLayer({id:"me-dot", type:"circle", source:"me", paint:{"circle-radius":6.5, "circle-color":cssv("--move"), "circle-stroke-color":"#fff", "circle-stroke-width":2.5}});

  MAP_GROUPS.forEach(g => {
    map.on("click", "pt-icon-" + g, e => { const f = e.features && e.features[0]; if (f && !(e.originalEvent && e.originalEvent._hit)){ e.originalEvent && (e.originalEvent._hit = true); selectPlace(f.properties.id); } });
    map.on("click", "cl-circle-" + g, async e => {
      const f = e.features && e.features[0]; if (!f || (e.originalEvent && e.originalEvent._hit)) return;      // two colours overlapping: only the top one acts
      e.originalEvent && (e.originalEvent._hit = true);
      let z = map.getZoom() + 2;
      if (f.properties.cluster_id != null){ try { z = await map.getSource("pts-" + g).getClusterExpansionZoom(f.properties.cluster_id); } catch(err){} }
      map.easeTo({center:f.geometry.coordinates, zoom:Math.min(18, Math.max(z, map.getZoom() + 1)), duration:reduceMotion ? 0 : 450});
    });
    ["pt-icon-" + g, "cl-circle-" + g].forEach(l => { map.on("mouseenter", l, () => map.getCanvas().style.cursor = "pointer"); map.on("mouseleave", l, () => map.getCanvas().style.cursor = ""); });
  });
  map.on("click", e => { if (!(e.originalEvent && e.originalEvent._hit) && ui.mapSel) selectPlace(null); });
  const moved = debounce(() => { refreshMapData(); if (soloCat()) renderMapFilt(); const c = map.getCenter(); S.mapView = {c:[+c.lng.toFixed(5), +c.lat.toFixed(5)], z:+map.getZoom().toFixed(2)}; persist(); }, 140);
  map.on("moveend", moved);
  map.on("sourcedata", e => { if (e.sourceId === "openmaptiles" && e.tile && !mapRun.tilesOk){ mapRun.tilesOk = true; setOfflineBase(false); } });
  if (navigator.onLine === false) setOfflineBase(true);
  window.addEventListener("offline", () => { if (!mapRun.tilesOk) setOfflineBase(true); });
  updateMe(); refreshMapData(); renderMapUI();
  if (typeof applyDesignToMap === "function") applyDesignToMap();      // Design Lab sizes and colours (js/design.js)
  if (ui.mapSel) highlightPin(findPlace(ui.mapSel));
}
/* With no signal and no saved map tiles, fall back to the built-in country outlines so the pins still make sense */
function setOfflineBase(on){
  if (!map || !mapLoaded || mapRun.offline === on) return;
  mapRun.offline = on;
  try {
    map.setLayoutProperty("fb-land", "visibility", on ? "visible" : "none");
    map.setPaintProperty("background", "background-color", on ? cssv("--sea") : cssv("--land"));
  } catch(e){}
}
function mapShown(){ if (map){ setTimeout(() => { try { map.resize(); } catch(e){} }, 0); } }
function flyTo(pt, z){
  if (!map) { S.mapView = {c:[pt.lng, pt.lat], z:z || 12}; return; }
  const o = {center:[pt.lng, pt.lat], zoom:z != null ? z : map.getZoom()};
  reduceMotion ? map.jumpTo(o) : map.flyTo(Object.assign(o, {duration:700, essential:true}));
}
function updateMe(){
  if (!map || !mapLoaded) return;
  const h = Heading.now();
  map.getSource("me").setData(fc(userLoc ? [{type:"Feature", geometry:{type:"Point", coordinates:[userLoc.lng, userLoc.lat]}, properties:{hd:h ? h.deg : -1, mode:h ? h.mode : "", rough:!!(h && h.rough)}}] : []));
}

/* ---------- live location and heading ----------
   While the map is on screen (and the app is in front), the blue dot follows the phone, and shows:
   - a beam for the direction the phone is pointing (the compass), when the phone has a real compass reading;
   - an arrow for the direction you are moving (from GPS), once you're moving faster than a walk, because that beats a shaky compass.
   iPhone only lets a page read the compass after a tap and a yes, so it's asked for when the locate button is tapped, never on its own.
   Readings are smoothed as a direction (so 359° to 1° is a small turn, not a spin), corrected for the screen being turned sideways,
   and dropped when stale. Everything stops when the map is hidden or the app goes to the background, to save battery. */
const Heading = {
  compass:null, compassAt:0, rough:false, travel:null, travelAt:0, watchId:null, listening:false, asked:false, lastDraw:0, drawn:null, sm:null,
  // smoothing on the unit circle: average the sine and cosine, never the raw angles
  smooth(deg){
    const r = deg * Math.PI / 180, k = .25;
    if (!this.sm) this.sm = {s:Math.sin(r), c:Math.cos(r)};
    else { this.sm.s += (Math.sin(r) - this.sm.s) * k; this.sm.c += (Math.cos(r) - this.sm.c) * k; }
    return (Math.atan2(this.sm.s, this.sm.c) * 180 / Math.PI + 360) % 360;
  },
  screenAngle(){ const o = screen.orientation; return o && typeof o.angle === "number" ? o.angle : typeof window.orientation === "number" ? window.orientation : 0; },
  onOrient(e){
    let deg = null, rough = false;
    if (typeof e.webkitCompassHeading === "number" && !isNaN(e.webkitCompassHeading)){      // iPhone: degrees from north, already a compass
      deg = e.webkitCompassHeading; rough = !(e.webkitCompassAccuracy >= 0 && e.webkitCompassAccuracy <= 25);
    } else if (e.absolute && typeof e.alpha === "number"){                                // Android: the absolute event, alpha turns anticlockwise
      deg = 360 - e.alpha;
    } else return;                                                                         // a relative reading isn't a compass: show nothing rather than guess
    deg = (deg + Heading.screenAngle() + 360) % 360;
    Heading.compass = Heading.smooth(deg); Heading.compassAt = Date.now(); Heading.rough = rough;
    if (rough && !Heading.hinted){ Heading.hinted = true; toast("The compass reading is rough, so the beam is faint. Move the phone in a figure of eight to calibrate it."); }
    Heading.draw();
  },
  // which reading to show right now: {deg, mode:"compass"|"travel", rough} or null
  now(){
    const t = Date.now();
    if (this.travel != null && t - this.travelAt < 8000) return {deg:this.travel, mode:"travel", rough:false};
    if (this.compass != null && t - this.compassAt < 3000) return {deg:this.compass, mode:"compass", rough:this.rough};
    return null;
  },
  draw(){
    const t = Date.now(); if (t - this.lastDraw < 120) return;         // at most about 8 updates a second
    const h = this.now(), key = h ? Math.round(h.deg / 2) + h.mode + h.rough : "none";
    if (key === this.drawn) return;
    this.lastDraw = t; this.drawn = key; updateMe();
    const b = $("#locBtn"); if (b) b.dataset.heading = h ? h.mode : "";
  },
  startCompass(){
    if (this.listening) return;
    const ev = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
    this.evName = ev; this.handler = e => this.onOrient(e);
    window.addEventListener(ev, this.handler, true); this.listening = true;
  },
  stopCompass(){ if (this.listening){ window.removeEventListener(this.evName, this.handler, true); this.listening = false; } this.sm = null; this.compass = null; },
  // asked only from a tap: iPhone shows its "Motion & Orientation" question; elsewhere there's nothing to ask
  async askCompass(){
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === "function"){
      if (this.asked === "denied") return;
      try { const r = await DOE.requestPermission(); this.asked = r; if (r !== "granted"){ toast("Compass is off, so the dot can't show which way you face. Location and directions still work."); return; } }
      catch(e){ return; }
    }
    this.startCompass();
  },
  startWatch(high){
    if (!("geolocation" in navigator) || locStatus === "test" || locStatus === "denied") return;
    if (this.watchId != null && (!high || this.high)) return;
    this.stopWatch(); this.high = !!high;
    this.watchId = navigator.geolocation.watchPosition(pos => {
      const c = pos.coords;
      userLoc = {lat:c.latitude, lng:c.longitude, acc:c.accuracy};
      if (locStatus !== "ok" && locStatus !== "outside"){ const cc = countryAt(userLoc.lat, userLoc.lng); locStatus = cc ? "ok" : "outside"; }
      // the direction of travel only means something when actually moving (faster than about 5 km/h)
      if (typeof c.heading === "number" && !isNaN(c.heading) && c.speed > 1.4){ this.travel = c.heading; this.travelAt = Date.now(); } else this.travel = null;
      this.drawn = null; this.draw(); updateMe();
    }, err => { if (err && err.code === 1){ locStatus = "denied"; this.stopWatch(); } }, {enableHighAccuracy:!!high, maximumAge:high ? 2000 : 15000, timeout:30000});
  },
  stopWatch(){ if (this.watchId != null){ navigator.geolocation.clearWatch(this.watchId); this.watchId = null; } this.travel = null; },
  // run only while the map is on screen and the app is in front
  sync(){
    const on = ui.view === "map" && document.visibilityState !== "hidden";
    if (on){ if (locStatus === "ok" || locStatus === "outside") this.startWatch(this.high); if (this.asked === "granted" || (this.asked !== "denied" && !(window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission))) this.startCompass(); }
    else { this.stopWatch(); this.stopCompass(); this.drawn = null; }
  }
};
document.addEventListener("visibilitychange", () => Heading.sync());
window.addEventListener("hashchange", () => setTimeout(() => Heading.sync(), 0));
function addHeadingImages(){
  const col = cssv("--move") || "#7FB2D2";
  // the beam: a soft wedge pointing up (north), centred on the dot; the arrow: a navigation arrow for the direction of travel
  const beam = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><defs><radialGradient id="g" cx="60" cy="60" r="56" gradientUnits="userSpaceOnUse"><stop offset=".15" stop-color="${col}" stop-opacity=".75"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient></defs><path d="M60 60 L37 8 A56 56 0 0 1 83 8 Z" fill="url(#g)"/></svg>`;
  const arrow = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><path d="M60 22 L76 56 L60 49 L44 56 Z" fill="${col}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg>`;
  [["me-beam", beam], ["me-arrow", arrow]].forEach(([name, svg]) => {
    const img = new Image(120, 120);
    img.onload = () => { try { if (map.hasImage(name)) map.updateImage(name, img); else map.addImage(name, img, {pixelRatio:2}); } catch(e){} };
    img.src = "data:image/svg+xml;charset=utf-8," + enc(svg);
  });
}
function highlightPin(it){
  mapRun.hl = it ? it.id : null;                 // which pin is ringed (read by tests)
  if (!map || !mapLoaded) return;
  map.getSource("sel").setData(fc(it ? [{type:"Feature", geometry:{type:"Point", coordinates:[it.lng, it.lat]}, properties:{ic:`pin-${KIND[it.k] ? it.k : "attraction"}-r`}}] : []));
}
const drawPins = () => refreshMapData();

/* ---------- what should be on the map right now? ---------- */
function activeGroups(){
  const g = [];
  ["gaff","munch","cool","move"].forEach(c => { if (ui.mapCats.has(c)) g.push(CAT[c].grp); });
  if (ui.essKinds.size) g.push("ess");
  return g;
}
const essKindSet = () => new Set([...ui.essKinds].flatMap(id => ESS_BY_ID[id].kinds));
function curatedForMap(){
  return D.places.filter(p => ui.mapCats.has(p.c)).filter(passMapFilter);
}

/* ---------- the filter row: shown when one section is picked ---------- */
const MOVE_TYPES = [["all", "All"], ["bus", "Buses"], ["train", "Trains"], ["ferry", "Ferries"], ["airport", "Airports"], ["taxi", "Taxis & scooters"]];
const MOVE_KIND_TYPE = {bus:"bus", train:"train", metro:"train", ferry:"ferry", airport:"airport", taxi:"taxi", scooter:"taxi", bike:"taxi", carrental:"taxi"};
function soloCat(){
  if (ui.mapSaved || ui.essKinds.size) return null;
  const c = [...ui.mapCats]; return c.length === 1 ? c[0] : null;
}
// filters set for the sections on the map: a maximum price (shared with the lists) and the transport type
const shownFilterCats = () => ui.mapSaved ? [] : [...ui.mapCats].filter(c => c === "move" ? ui.mf.move.t !== "all" : pfOn(c));
function mapFilterOn(){ return shownFilterCats().length > 0; }
// the same rules as the Gaffs, Munch and Activities lists (passPF in js/estimate.js), so the map and the lists always agree
function passMapFilter(it){
  if (ui.mapSaved) return true;
  if (it.c === "move") return ui.mf.move.t === "all" || MOVE_KIND_TYPE[it.k] === ui.mf.move.t;
  if (PF_GRP[it.c]) return passPF(it, it.c);
  return true;
}
// does a summary-grid kind count under the transport filter? (zoomed out, the counts come from the grid, not the places)
const moveKindOk = k => ui.mf.move.t === "all" || MOVE_KIND_TYPE[k] === ui.mf.move.t;
function renderMapFilt(){
  const el = $("#mapFilt"); if (!el) return;
  const c = soloCat();
  if (!c || (c !== "move" && !PF_GRP[c])){
    // several sections showing: list the filters still in force, each with a way to clear it, so none is invisible
    const on = shownFilterCats();
    if (!on.length){ el.hidden = true; el.innerHTML = ""; return; }
    el.innerHTML = `<span class="mf-lab">Filters on</span>` + on.map(k => `<button class="chip" type="button" data-unf="${k}" aria-pressed="true" aria-label="Clear the ${esc(CAT[k].label)} filter">${esc(CAT[k].label)}: ${esc(k === "move" ? MOVE_TYPES.find(t => t[0] === ui.mf.move.t)[1] : pfSummary(k))} ${icon("x","i xs")}</button>`).join("");
    el.hidden = false;
    el.querySelectorAll("[data-unf]").forEach(x => x.onclick = () => { const k = x.dataset.unf; if (k === "move") ui.mf.move.t = "all"; else setPF(k, null); renderMapFilt(); refreshMapData(); });
    return;
  }
  const b = (attr, label, on, title) => `<button class="chip" type="button" ${attr} aria-pressed="${on}"${title ? ` aria-label="${esc(title)}"` : ""}>${label}</button>`;
  const here = map && mapLoaded ? ccAt(map.getCenter().lat, map.getCenter().lng) : null;
  if (c === "move") el.innerHTML = MOVE_TYPES.map(([id, l]) => b(`data-mt="${id}"`, l, ui.mf.move.t === id)).join("");
  else el.innerHTML = pfControls(c, here || S.country);
  el.hidden = false;
  bindPF(el, c, () => { renderMapFilt(); refreshMapData(); });
  el.querySelectorAll("[data-mt]").forEach(x => x.onclick = () => { ui.mf.move.t = x.dataset.mt; renderMapFilt(); refreshMapData(); });
  if (typeof updateFade === "function") updateFade(el);
}
function mapItems(){ return mapRun.items; }
// how many places of a summary cell count: only the essentials picked, only the transport type picked
function cellWeight(g, c, ek){
  if (g === "ess") return Object.entries(c.counts).reduce((a, [k, n]) => a + (ek.has(k) ? n : 0), 0);
  if (g === "move" && ui.mf.move.t !== "all") return Object.entries(c.counts).reduce((a, [k, n]) => a + (moveKindOk(k) ? n : 0), 0);
  return c.total;
}
function refreshMapData(){
  if (!map || !mapLoaded) return;
  const t0 = performance.now();
  const b = map.getBounds(), z = map.getZoom();
  const padLng = (b.getEast() - b.getWest()) * .25, padLat = (b.getNorth() - b.getSouth()) * .25;
  const bb = [b.getWest() - padLng, b.getSouth() - padLat, b.getEast() + padLng, b.getNorth() + padLat];
  const inBB = p => p.lng >= bb[0] && p.lng <= bb[2] && p.lat >= bb[1] && p.lat <= bb[3];
  const feats = [], items = [], hidden = {};
  let loading = false, summaryMode = false, total = 0;
  if (ui.mapSaved){
    savedPlaces().forEach(p => { feats.push(featOf(p)); if (inBB(p)) items.push(p); });
  } else {
    curatedForMap().forEach(p => { feats.push(featOf(p)); if (inBB(p)) items.push(p); });
    const groups = activeGroups(), ek = essKindSet(), needed = new Set();
    if (groups.length && Places.state !== "off"){
      if (!Places.meta){ loading = true; Places.ready().then(m => { if (m){ addPinImages(); refreshMapData(); } else renderMapStatus(); }); }
      else {
        // 1. how many places are in view? (from the summary grid, a few small files)
        const cells = {}; let est = 0, sumsReady = true;
        for (const g of groups){
          const s = Places._sumData && Places._sumData[g];
          if (!s){
            sumsReady = false;
            Places._sumWait = Places._sumWait || new Set();
            if (!Places._sumWait.has(g)){ Places._sumWait.add(g); Places.summary(g).then(d => { Places._sumWait.delete(g); (Places._sumData = Places._sumData || {})[g] = d || []; refreshMapData(); }); }
            continue;
          }
          cells[g] = s.filter(c => c.lng >= bb[0] && c.lng <= bb[2] && c.lat >= bb[1] && c.lat <= bb[3]);
          for (const c of cells[g]) est += cellWeight(g, c, ek);
        }
        total = est;
        if (!sumsReady) loading = true;
        else if (z < 9.5 || est > MAP_BUDGET){
          // 2a. too many to draw one by one: show the counts
          // The further out you are, the coarser the grid the counts are added up on, so the whole country is a few hundred dots rather than 13,000.
          summaryMode = true;
          // Each category is added up on its own, so the counts keep their colours.
          const gz = Math.min(13, Math.floor(z) + 5);
          for (const g of groups){
            const sums = new Map();
            for (const c of cells[g]){
              const w = cellWeight(g, c, ek);
              if (w <= 0) continue;
              const key = lng2tile(c.lng, gz) * 16384 + lat2tile(c.lat, gz);
              let a = sums.get(key); if (!a){ a = {w:0, x:0, y:0}; sums.set(key, a); }
              a.w += w; a.x += c.lng * w; a.y += c.lat * w;
            }
            for (const a of sums.values()) feats.push({type:"Feature", geometry:{type:"Point", coordinates:[a.x / a.w, a.y / a.w]}, properties:{w:a.w, g}});
          }
        } else {
          // 2b. few enough: load just the tiles that cover the screen
          for (const g of groups) for (const leaf of Places.leavesIn(g, bb)){
            needed.add(leaf.key);
            const got = Places.loaded(leaf);
            if (got){ for (const p of got) if (inBB(p) && (g !== "ess" || ek.has(p.k))){ if (passMapFilter(p)){ feats.push(featOf(p)); items.push(p); } else if (PF_GRP[p.c]){ const r = pfReason(p, p.c); if (r) hidden[r] = (hidden[r] || 0) + 1; } } }
            else {
              loading = true;
              if (!mapRun.pending.has(leaf.key)){
                const ctl = new AbortController(); mapRun.pending.set(leaf.key, ctl); window.__mapStats.leafFetches++;
                Places.leaf(leaf, ctl.signal).then(() => { mapRun.pending.delete(leaf.key); mapRun.failed = false; refreshMapSoon(); })
                  .catch(() => {
                    if (mapRun.pending.get(leaf.key) !== ctl) return;        // we cancelled it ourselves when it scrolled out of view: not a failure
                    mapRun.pending.delete(leaf.key); mapRun.failed = true; mapRun.loading = false; renderMapStatus();
                  });
              }
            }
          }
        }
      }
      // stop downloads for tiles that have scrolled out of view
      for (const [k, ctl] of mapRun.pending) if (!needed.has(k)){ ctl.abort(); mapRun.pending.delete(k); window.__mapStats.aborted++; }
    }
  }
  // the same place can arrive twice (a market is food and an activity; a researched place and its Wi-Fi twin)
  const seen = new Set(), uniq = [];
  for (const f of feats){ const id = f.properties.id; if (id){ if (seen.has(id)) continue; seen.add(id); } uniq.push(f); }
  const byGrp = Object.fromEntries(MAP_GROUPS.map(g => [g, []]));
  for (const f of uniq) (byGrp[f.properties.g] || byGrp.do).push(f);
  mapRun.counts = mapRun.counts || {};
  for (const g of MAP_GROUPS){
    if (!byGrp[g].length && !mapRun.counts[g]) continue;              // was empty and still is: nothing to redraw
    map.getSource("pts-" + g).setData(fc(byGrp[g])); mapRun.counts[g] = byGrp[g].length;
  }
  const seenI = new Set();
  mapRun.items = items.filter(p => !seenI.has(p.id) && seenI.add(p.id));
  mapRun.mode = summaryMode ? "summary" : "detail"; mapRun.loading = loading; mapRun.total = total; mapRun.shown = uniq.length; mapRun.hidden = hidden;
  if (!loading) mapRun.failed = false;             // everything this view needs is here, so any earlier failure is behind us
  window.__mapStats.setData++; window.__mapStats.features = uniq.length; window.__mapStats.lastMs = Math.round(performance.now() - t0);
  renderMapStatus(); renderMapBottom();
  if (ui.mapMode === "list") renderMapList();
}
const refreshMapSoon = debounce(() => refreshMapData(), 60);
function renderMapStatus(){
  const side = $("#mapModeRow"); if (!side) return;
  let txt = "";
  if (Places.state === "off" && activeGroups().length && !ui.mapSaved) txt = "Showing researched places only (the full list needs signal once)";
  else if (mapRun.failed && !ui.mapSaved && activeGroups().length) txt = "Some places couldn’t load. Check your signal, then move the map";
  else if (mapRun.loading) txt = "Loading places…";
  else if (mapRun.mode === "summary" && mapRun.total){
    const priced = shownFilterCats().some(k => k !== "move");
    const what = ui.mapCats.size === 1 && ui.mapCats.has("move") && ui.mf.move.t !== "all" ? MOVE_TYPES.find(t => t[0] === ui.mf.move.t)[1].toLowerCase() : "places";
    txt = `${mapRun.total.toLocaleString("en-GB")} ${what} here. ${priced ? "Counts are before the price filter: zoom in to filter" : "Zoom in to see them"}`;
  }
  else if (mapFilterOn()){
    const n = mapRun.items.length, h = mapRun.hidden || {};
    const why = [h.unknown ? `${h.unknown} with no known price hidden` : "", h.basis ? `${h.basis} priced per ${ui.pf.gaff.basis === "bed" ? "room" : "bed"} hidden` : ""].filter(Boolean).join(", ");
    txt = n ? `${n.toLocaleString("en-GB")} ${n === 1 ? "match" : "matches"}${why ? " · " + why : ""}` : `Nothing here matches${why ? " (" + why + ")" : ""}. Try another price or zoom out`;
  }
  else if (ui.mapSaved) txt = `${Object.keys(S.saved).length} saved`;
  const el = $("#mapStatusTxt"); if (el){ el.textContent = txt; el.hidden = !txt; }
}

/* ---------- controls ---------- */
function renderMapUI(){
  if (!$("#mapChips")) return;
  const all = ["gaff","munch","cool"].every(c => ui.mapCats.has(c)) && !ui.mapCats.has("move") && !ui.essKinds.size && !ui.mapSaved;
  const chip = (attrs, label, on, col) => `<button class="chip" type="button" ${attrs} aria-pressed="${on}" ${col ? `style="--c:${col}"` : ""}>${col ? '<span class="dot"></span>' : ""}${label}</button>`;
  $("#mapChips").innerHTML = chip("data-all", "All", all)
    + ["gaff","munch","cool"].map(k => chip(`data-cat="${k}"`, CAT[k].label, ui.mapCats.has(k) && !ui.mapSaved, cssv(CAT[k].v))).join("")
    + chip("data-ess", `Essentials${ui.essKinds.size ? ` (${ui.essKinds.size})` : ""}`, !!ui.essKinds.size || !!ui.essOpen, cssv("--ess"))
    + chip(`data-cat="move"`, "Transport", ui.mapCats.has("move") && !ui.mapSaved, cssv("--move"))
    + chip("data-saved", `${icon("bookmark","i xs")}Saved`, ui.mapSaved)
    + chip("data-filters", `${icon("sliders","i xs")}Filters`, ui.mapFilters);
  const essRow = $("#mapEss");
  essRow.hidden = !(ui.essOpen || ui.essKinds.size);
  essRow.innerHTML = ESS.map(e => `<button class="chip" type="button" data-essk="${e.id}" aria-pressed="${ui.essKinds.has(e.id)}">${icon(e.ic)}${e.l}</button>`).join("");
  $("#mapModeRow").innerHTML = `<div class="seg" role="group" aria-label="Map or list" style="background:rgba(48,58,64,.96)"><button type="button" data-mode="map" aria-pressed="${ui.mapMode === "map"}">${icon("map","i s")}Map</button><button type="button" data-mode="list" aria-pressed="${ui.mapMode === "list"}">${icon("list","i s")}List</button></div>
    <span class="map-status" id="mapStatusTxt" style="position:static;transform:none" hidden></span>`;
  const top = $("#mapTop");
  top.querySelector("[data-all]").onclick = () => { ui.mapCats = new Set(["gaff","munch","cool"]); ui.essKinds.clear(); ui.essOpen = false; ui.mapSaved = false; mapRun.stash = null; renderMapUI(); };
  top.querySelectorAll("[data-cat]").forEach(b => b.onclick = () => {
    const k = b.dataset.cat; ui.mapSaved = false;
    if (all) ui.mapCats = new Set([k]);                       // everything showing: tapping a section shows just that one
    else if (ui.mapCats.has(k)) ui.mapCats.delete(k);          // switching the last one off leaves the map clear
    else ui.mapCats.add(k);
    renderMapUI();
  });
  top.querySelector("[data-ess]").onclick = () => { ui.essOpen = !(ui.essOpen || ui.essKinds.size); if (!ui.essOpen && ui.essKinds.size){ ui.essKinds.clear(); if (mapRun.stash){ ui.mapCats = mapRun.stash; mapRun.stash = null; } } renderMapUI(); };
  top.querySelector("[data-saved]").onclick = () => { ui.mapSaved = !ui.mapSaved; if (ui.mapSaved && !Object.keys(S.saved).length) toast("Nothing saved yet. Tap the bookmark on a place."); renderMapUI(); };
  top.querySelector("[data-filters]").onclick = () => { ui.mapFilters = !ui.mapFilters; renderMapUI(); };
  top.querySelectorAll("[data-essk]").forEach(b => b.onclick = () => toggleEssential(b.dataset.essk));
  top.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { ui.mapMode = b.dataset.mode; renderMapUI(); });

  $("#mapSide").innerHTML = `<button class="icon-btn" id="satBtn" type="button" aria-label="${ui.satChecking ? "Checking satellite" : ui.basemap === "sat" ? "Back to map view" : "Satellite view"}" aria-pressed="${ui.basemap === "sat"}">${icon("layers")}</button>
    <button class="icon-btn" id="locBtn" type="button" aria-label="Show where I am">${icon("locate")}</button>
    <button class="icon-btn" id="fitBtn" type="button" aria-label="Show the whole country">${icon("fit")}</button>
    <button class="icon-btn zoomb" id="zinBtn" type="button" aria-label="Zoom in">${icon("plus")}</button>
    <button class="icon-btn zoomb" id="zoutBtn" type="button" aria-label="Zoom out">${icon("minus")}</button>`;
  $("#satBtn").onclick = () => setBasemap(ui.basemap === "sat" ? "map" : "sat");
  // a tap on locate is the one place the compass is asked for (iPhone needs a tap), and it turns on precise GPS while the map is open
  $("#locBtn").onclick = () => { if (userLoc && map) flyTo(userLoc, Math.max(13, map.getZoom())); Heading.askCompass(); locate(true, st => { if (st === "ok" || st === "outside") Heading.startWatch(true); }); };
  $("#fitBtn").onclick = () => { const c = D.countries[S.country]; flyTo({lat:c.c[0], lng:c.c[1]}, c.z); };
  $("#zinBtn").onclick = () => map && map.zoomIn(); $("#zoutBtn").onclick = () => map && map.zoomOut();

  const list = $("#mapList"); list.hidden = ui.mapMode !== "list";
  $("#mapview").classList.toggle("listmode", ui.mapMode === "list");
  padMapList();
  renderMapFilt();
  refreshMapData(); renderMapStatus(); renderMapBottom();
  if (ui.mapMode === "list") renderMapList();
}
function toggleEssential(id, solo){
  if (!ui.essKinds.size && !mapRun.stash){ mapRun.stash = new Set(ui.mapCats); ui.mapCats.clear(); }
  if (solo){ ui.essKinds = new Set([id]); }
  else ui.essKinds.has(id) ? ui.essKinds.delete(id) : ui.essKinds.add(id);
  if (!ui.essKinds.size && mapRun.stash){ ui.mapCats = mapRun.stash; mapRun.stash = null; }
  ui.essOpen = true; ui.mapSaved = false;
  if (map && ui.essKinds.size && map.getZoom() < 12){ const p = focusPt(); if (!p.none) flyTo(p, 13.5); }
  renderMapUI();
}
/* open the map on one essential, for example Laundry, near where you are looking */
// nearMe: centre on the phone's position when it's known (the Wi-Fi finder), rather than the place being looked around
function showEssentialOnMap(id, {nearMe = false} = {}){
  ui.essKinds.clear(); mapRun.stash = mapRun.stash || new Set(ui.mapCats.size ? ui.mapCats : ["gaff","munch","cool"]); ui.mapCats.clear();
  ui.essKinds.add(id); ui.essOpen = true; ui.mapSaved = false; ui.mapMode = "map"; ui.mapSel = null; highlightPin(null);
  const real = userLoc && (locStatus === "ok" || locStatus === "test");
  if (nearMe && real) flyTo(userLoc, 15);
  else if (nearMe && !userLoc && locStatus !== "denied") locate(true, st => { if (userLoc && (st === "ok" || st === "test")) flyTo(userLoc, 15); }, true);
  else { const p = focusPt(); if (!p.none) flyTo(p, 14); }
  go("#map");
}
async function setBasemap(mode){
  if (!map || !mapLoaded) return;
  if (mode === "sat"){
    if (satOK === null){ ui.satChecking = true; renderMapUI(); satOK = await testSatellite(); ui.satChecking = false; }
    if (!satOK){ ui.basemap = "map"; toast("Satellite pictures couldn’t load here. Check your signal."); renderMapUI(); return; }
    if (!map.getSource("sat")) map.addSource("sat", {type:"raster", tiles:[SAT_URL], tileSize:256, maxzoom:18, attribution:"Imagery © Esri, Maxar, Earthstar Geographics"});
    if (!map.getLayer("sat")) map.addLayer({id:"sat", type:"raster", source:"sat"}, map.getLayer("waterway") ? "waterway" : undefined);
    ["building"].forEach(l => map.getLayer(l) && map.setLayoutProperty(l, "visibility", "none"));
    ui.basemap = "sat";
  } else {
    if (map.getLayer("sat")) map.removeLayer("sat");
    ["building"].forEach(l => map.getLayer(l) && map.setLayoutProperty(l, "visibility", "visible"));
    ui.basemap = "map";
  }
  renderMapUI();
}

/* ---------- bottom: the selected place, or what is closest ---------- */
function selectPlace(id, fly){
  ui.mapSel = id || null;
  const it = id ? findPlace(id) : null;
  highlightPin(it);
  if (it && fly && map) flyTo(it, Math.max(map.getZoom(), 15));
  renderMapBottom();
}
// a selected place keeps its preview when a filter hides its pin, and the preview says why
function selFilterNote(it){
  if (ui.mapSaved || !ui.mapCats.has(it.c) || passMapFilter(it)) return "";
  if (it.c === "move") return "The transport filter hides this kind of place";
  return pfReason(it, it.c) === "unknown" ? "No known price, so the price filter hides its pin" : "Outside the current price filter, so its pin is hidden";
}
function previewCard(it, filterNote = ""){
  const c = CAT[it.c] || CAT.ess, col = cssv(c.v), pt = userLoc || (S.focus ? focusPt() : null);
  const oh = isOpenNow(it), loc = itemLocal(it);
  const bits = [esc(it.area || it.city)];
  if (pt) bits.push(distShort(dist(pt, it)));
  if (it.r != null) bits.push(`${(it.r / 2).toFixed(1)} stars`);
  if (loc) bits.push(esc(withGBP(loc, it.p, it.cur)));
  return `<div class="preview" style="--c:${col}" id="preview">
    <div class="ph" data-ph="${esc(it.id)}">${icon(kindIcon(it))}</div>
    <div class="body"><div class="eyebrow">${esc(kindLabel(it))}</div><h3>${esc(it.n)}</h3><div class="m">${bits.join(" · ")}</div>
      ${oh ? `<div class="m" style="color:${oh.open ? "var(--ok)" : "var(--faint)"}">${esc(oh.text)}</div>` : ""}${filterNote ? `<div class="m pv-filt">${icon("info","i xs")} ${esc(filterNote)}</div>` : ""}</div>
    ${saveBtn(it)}<button class="close" type="button" id="pvClose" aria-label="Close preview">${icon("x","i s")}</button>
    <div class="acts"><button class="btn small primary" type="button" data-open="${esc(it.id)}">View details</button><a class="btn small" href="${esc(L_dir(it))}" target="_blank" rel="noopener">${icon("nav","i s")}Directions</a></div></div>`;
}
function renderMapBottom(){
  const el = $("#mapBottom"); if (!el) return;
  if (ui.mapMode === "list"){ el.innerHTML = ""; placeSide(0); return; }
  const sel = ui.mapSel ? findPlace(ui.mapSel) : null;
  if (ui.mapFilters){
    el.innerHTML = `<div class="fpanel" style="box-shadow:var(--shadow)">
      <label class="field">Sort the nearby strip<select id="mf-sort">${[["near","Nearest"],["rated","Best reviewed"],["cheap","Cheapest first"],["dear","Priciest first"],["match","Best match"]].map(([v, l]) => `<option value="${v}" ${ui.mapSort === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <button class="btn small" id="mf-done" type="button">Done</button></div>`;
    $("#mf-sort").onchange = e => { ui.mapSort = e.target.value; };
    $("#mf-done").onclick = () => { ui.mapFilters = false; renderMapUI(); };
    placeSide(el.offsetHeight); return;
  }
  if (sel){
    el.innerHTML = previewCard(sel, selFilterNote(sel));
    $("#pvClose").onclick = () => selectPlace(null);
    watchCardPhotos(el);
    placeSide(el.offsetHeight); return;
  }
  let items = mapRun.items.slice();
  const ref = userLoc || (map && mapLoaded ? {lat:map.getCenter().lat, lng:map.getCenter().lng} : null);
  const title = ui.mapSaved ? "Saved places" : userLoc && (locStatus === "ok" || locStatus === "test") ? "Closest to you" : "Nearby spotlight";
  const how = ui.mapSort === "near" && !ref ? "rated" : ui.mapSort;
  items = sortItems(items, how, ref).slice(0, 15);
  if (!items.length){ el.innerHTML = ""; placeSide(0); return; }
  el.innerHTML = `<div class="near ${S.nearClosed ? "closed" : ""}" id="near"><button class="near-title" type="button" aria-expanded="${!S.nearClosed}">${esc(title)}${icon("chev","i")}</button>${S.nearClosed ? "" : `<div class="near-row">${items.map(p => {
    const c = CAT[p.c] || CAT.ess, pr = itemLocal(p);
    const bits = [ref ? distText(dist(ref, p)) : p.city, pr ? `${pr} (${gbpRange(p.p, p.cur)})` : null, p.r != null ? `${(p.r / 2).toFixed(1)} stars` : null].filter(Boolean);
    return `<button class="ncard" type="button" style="--c:${cssv(c.v)}" data-near="${esc(p.id)}"><span class="k"><span class="dot"></span>${esc(kindLabel(p))}</span><b>${esc(p.n)}</b><span class="m">${esc(bits.join(", "))}</span></button>`;
  }).join("")}</div>`}</div>`;
  el.querySelector(".near-title").onclick = () => { S.nearClosed = !S.nearClosed; persist(); renderMapBottom(); };
  el.querySelectorAll("[data-near]").forEach(b => b.onclick = () => selectPlace(b.dataset.near, true));
  placeSide(el.offsetHeight);
}
function placeSide(h){ const s = $("#mapSide"); if (s) s.style.bottom = (Math.max(0, h) + 16) + "px"; }
/* the list starts just below the search box and chips, however many rows of chips are showing */
function padMapList(){
  const el = $("#mapList"), top = $("#mapTop"); if (!el || !top || el.hidden) return;
  const h = top.getBoundingClientRect().bottom - el.getBoundingClientRect().top;
  if (h > 0) el.style.paddingTop = Math.round(h + 14) + "px";
}
function renderMapList(){
  const el = $("#mapList"); if (!el || ui.mapMode !== "list") return;
  padMapList();
  const ref = userLoc || (map && mapLoaded ? {lat:map.getCenter().lat, lng:map.getCenter().lng} : focusPt());
  const items = sortItems(mapRun.items, "near", ref);
  const head = mapRun.mode === "summary" && !ui.mapSaved
    ? `<div class="callout">${icon("info")}<div><b>${mapRun.total.toLocaleString("en-GB")} places in this area.</b> Zoom the map in to list them all. Showing the researched places for now.</div></div>` : "";
  el.innerHTML = head + (items.length ? `<p class="note" style="margin:0 2px 8px">${items.length.toLocaleString("en-GB")} places on screen, nearest first${items.length > 80 ? ". Showing the first 80" : ""}.</p><div class="cards">${items.slice(0, 80).map(p => placeCard(p, ref)).join("")}</div>`
    : emptyBlock("Nothing on screen", "<div>Move or zoom the map, or turn on a category.</div>"));
  watchCardPhotos(el);
}

/* ---------- search ---------- */
function localMatches(text, hubsFirst){
  const s = text.trim().toLowerCase(); if (!s) return [];
  const seen = new Set(), out = [];
  const push = (n, sub, node, extra = {}) => { const k = n.toLowerCase(); if (seen.has(k)) return; seen.add(k); out.push(Object.assign({n, sub, node}, extra)); };
  const hubs = () => Object.values(HUB).filter(h => h.n.toLowerCase().includes(s)).forEach(h => push(h.n, "Transport hub", hubNode(h.id)));
  if (hubsFirst) hubs();                 // the journey planner works best from its own hubs
  D.cities.filter(c => c[0].toLowerCase().includes(s)).forEach(c => push(c[0], hubsFirst ? "Town" : "Destination", {n:c[0], lat:c[1], lng:c[2]}, {dest:true}));
  if (!hubsFirst) hubs();
  D.places.filter(p => p.n.toLowerCase().includes(s) || p.city.toLowerCase().startsWith(s)).slice(0, 8).forEach(p => push(p.n, `${kindLabel(p)}, ${p.city}`, {n:p.n, lat:p.lat, lng:p.lng}, {id:p.id}));
  return out.slice(0, 6);
}
async function osmSearch(text){
  try {
    const j = await getJSON(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=en&countrycodes=th,kh,vn,la,my,sg,id&q=${enc(text)}`);
    return j.map(x => ({n: x.name || x.display_name.split(",")[0], sub: x.display_name.split(",").slice(1, 3).join(",").trim(), node:{n: x.name || x.display_name.split(",")[0], lat:+x.lat, lng:+x.lon}}));
  } catch(e){ return null; }
}
function bindMapSearch(){
  const inp = $("#m-q"), box = $("#mapSugs"), clear = $("#m-clear");
  let remote = [], online = [], lastQ = "", busy = false;
  const close = () => { box.hidden = true; };
  const choose = async s => {
    close(); inp.blur();
    if (s.dest){ setFocus(s.node); if (S.country !== countryAt(s.node.lat, s.node.lng) && countryAt(s.node.lat, s.node.lng)) setCountry(countryAt(s.node.lat, s.node.lng), true); flyTo(s.node, 12.5); toast(`Looking around ${s.node.n}`); return; }
    let id = s.id;
    if (id && id.startsWith("o:") && !Places.byId.get(id)){
      const p = await Places.findLeafPlace(s.g, id, s.node.lat, s.node.lng);
      if (!p) id = null;
    }
    if (id){ const c = (findPlace(id) || {}).c; if (c && c !== "ess" && !ui.mapCats.has(c)){ ui.mapCats.add(c); renderMapUI(); } ui.mapMode = "map"; $("#mapList").hidden = true; selectPlace(id); flyTo(s.node, 16); }
    else flyTo(s.node, 15);
  };
  const paint = () => {
    const text = inp.value.trim(); clear.hidden = !text;
    if (!text){ close(); return; }
    const local = localMatches(text), names = new Set(local.map(s => s.n.toLowerCase()));
    const rem = remote.filter(s => !names.has(s.n.toLowerCase()));
    const offer = typeof askOffer === "function" ? askOffer(text) : null;
    const askRow = offer ? `<button type="button" data-ask class="ask-sug">${icon(offer.nearest ? "nav" : "spark","i s")}<span>${esc(askTitle(offer.a))}<small>${offer.nearest ? `Shows it on the map${userLoc ? ", nearest to you" : ", using your location"}` : `Answer from the app's places${userLoc ? ", nearest to you" : ""}`}</small></span></button>` : "";
    let h = (offer && offer.first ? askRow : "") + local.map((s, i) => `<button type="button" data-l="${i}">${icon(s.dest ? "pin" : "star","i s")}<span>${esc(s.n)}<small>${esc(s.sub)}</small></span></button>`).join("");
    if (offer && !offer.first) h += askRow;
    if (rem.length) h += `<div class="hd">More places in Thailand</div>` + rem.map((s, i) => `<button type="button" data-r="${i}">${icon((KIND[s.k] || {ic:"pin"}).ic,"i s")}<span>${esc(s.n)}<small>${esc((KIND[s.k] || {l:"Place"}).l)} · ${esc(s.area)}</small></span></button>`).join("");
    if (online.length) h += `<div class="hd">From the web map</div>` + online.map((s, i) => `<button type="button" data-o="${i}">${icon("globe","i s")}<span>${esc(s.n)}<small>${esc(s.sub)}</small></span></button>`).join("");
    else if (text.length >= 3) h += `<button type="button" data-web>${icon("search","i s")}<span>Search everywhere for “${esc(text)}”<small>${busy ? "Searching…" : "OpenStreetMap search, needs signal"}</small></span></button>`;
    if (!local.length && !rem.length && !online.length && text.length < 3) h = `<div class="hd">Keep typing…</div>`;
    box.innerHTML = h; box.hidden = !h;
    box.querySelectorAll("[data-l]").forEach(b => b.onclick = () => choose(local[+b.dataset.l]));
    const ab = box.querySelector("[data-ask]"); if (ab) ab.onclick = () => { close(); inp.blur(); if (offer.nearest) goNearest(text, offer.a); else showAnswer(text); };
    box.querySelectorAll("[data-r]").forEach(b => b.onclick = () => { const s = rem[+b.dataset.r]; choose({id:s.id, g:s.g, node:{n:s.n, lat:s.lat, lng:s.lng}}); });
    box.querySelectorAll("[data-o]").forEach(b => b.onclick = () => choose(online[+b.dataset.o]));
    const wb = box.querySelector("[data-web]"); if (wb) wb.onclick = async () => { busy = true; paint(); const r = await osmSearch(text); busy = false; online = r || []; if (!r) toast("Search needs signal"); else if (!r.length) toast("Nothing found. Try another spelling."); paint(); };
  };
  const runRemote = debounce(async () => {
    const text = inp.value.trim(); lastQ = text;
    if (text.length < 2){ remote = []; return; }
    const ref = map && mapLoaded ? {lat:map.getCenter().lat, lng:map.getCenter().lng} : focusPt();
    const r = await Places.search(text, ref);
    if (text !== lastQ) return;
    remote = r; paint();
  }, 220);
  inp.oninput = () => { online = []; paint(); runRemote(); };
  inp.onfocus = () => paint();
  inp.onkeydown = e => { if (e.key === "Enter"){ const first = box.querySelector("button"); if (first) first.click(); } if (e.key === "Escape"){ close(); inp.blur(); } };
  clear.onclick = () => { inp.value = ""; remote = []; online = []; paint(); inp.focus(); };
  const mic = $("#m-mic"); let rec = null;
  mic.onclick = () => {
    if (rec){ try { rec.stop(); } catch(e){} return; }
    rec = listen(t => { inp.value = t; clear.hidden = !t; }, (final, err) => {
      rec = null; mic.setAttribute("aria-pressed", "false"); mic.classList.remove("on");
      if (err === "not-allowed" || err === "service-not-allowed"){ toast("The microphone is switched off for this app. You can still tap the mic on the keyboard."); return; }
      if (err === "no-speech"){ toast("Didn't catch that. Tap the mic and try again"); return; }
      if (!final) return;
      inp.value = final;
      // the same intents as typing: "nearest pharmacy" goes straight to it, other questions get the list of answers
      if (nearestIntent(final)){ close(); inp.blur(); goNearest(final); }
      else if (typeof parseAsk === "function" && parseAsk(final)){ close(); inp.blur(); showAnswer(final); }
      else { online = []; paint(); runRemote(); }
    });
    if (rec){ mic.setAttribute("aria-pressed", "true"); mic.classList.add("on"); inp.value = ""; inp.placeholder = "Listening…"; setTimeout(() => inp.placeholder = "Search places or ask a question", 6000); }
    else { inp.focus(); toast("Tap the microphone on your keyboard and ask, e.g. “nearest toilet”"); }
  };
  document.addEventListener("pointerdown", e => { if (!box.hidden && !e.target.closest("#mapTop")) close(); });
}
window.addEventListener("resize", () => { if (ui.view === "map"){ mapShown(); renderMapBottom(); } });
