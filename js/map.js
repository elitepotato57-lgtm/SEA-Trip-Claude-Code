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
      img.onload = () => { try { if (map && !map.hasImage(name)) map.addImage(name, img, {pixelRatio:2}); } catch(e){} };
      img.src = "data:image/svg+xml;charset=utf-8," + enc(pinSVG(KIND[k].ic, col[g], ring));
    });
  });
}
/* Each category has its own clustered layer on the map, so a bunch of hostels is a coral circle and a bunch of cafés a green one,
   matching the chip colours. Circles grow with the number of places inside: 4 is small, 300 is big. */
const MAP_GROUPS = ["stay", "food", "do", "ess", "move"];
const grpOfItem = it => (it.g && MAP_GROUPS.includes(it.g)) ? it.g : (CAT[it.c] ? CAT[it.c].grp : "do");
const CL_RADIUS = ["interpolate", ["linear"], ["ln", ["max", ["get", "w"], 1]], 0, 12, 2.303, 15, 4.605, 21, 6.908, 28, 9.21, 36];   // 1 → 12 px, 10 → 15, 100 → 21, 1,000 → 28, 10,000 → 36
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
      <label class="sbar"><span class="vis-hidden">Search the map</span>${icon("search")}<input type="search" id="m-q" autocomplete="off" enterkeyhint="search" placeholder="Search stays, food, activities, places"><button class="sbtn" type="button" id="m-clear" aria-label="Clear search" hidden>${icon("x","i s")}</button><a class="sbtn" href="#discover" aria-label="Discover Thailand">${icon("compass")}</a><a class="sbtn" href="#saved" aria-label="Saved places">${icon("bookmark")}</a></label>
      <div class="map-sugs" id="mapSugs" hidden></div>
      <div class="map-chips" id="mapChips" role="group" aria-label="What to show"></div>
      <div class="map-chips" id="mapEss" role="group" aria-label="Essentials" hidden></div>
      <div id="mapModeRow" style="display:flex;gap:8px;align-items:center"></div>
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
      "circle-color":cssv("--" + g), "circle-stroke-color":cssv("--cl-ring"), "circle-stroke-width":2, "circle-opacity":.94, "circle-radius":CL_RADIUS, "circle-translate":CL_NUDGE[g]}});
    map.addLayer({id:"cl-count-" + g, type:"symbol", source:"pts-" + g, filter:isGroup, layout:{
      "text-field":["case", [">=", ["get", "w"], 10000], ["concat", ["to-string", ["round", ["/", ["get", "w"], 1000]]], "k"],
        [">=", ["get", "w"], 1000], ["concat", ["to-string", ["/", ["round", ["/", ["get", "w"], 100]], 10]], "k"], ["to-string", ["get", "w"]]],
      "text-font":["Noto Sans Bold"], "text-size":12, "text-allow-overlap":true, "text-ignore-placement":true}, paint:{"text-color":cssv("--on-cat"), "text-translate":CL_NUDGE[g]}});
  });
  map.addSource("sel", {type:"geojson", data:fc([])});
  map.addLayer({id:"sel-ring", type:"circle", source:"sel", paint:{"circle-radius":21, "circle-color":"rgba(232,198,165,.18)", "circle-stroke-color":cssv("--accent-2"), "circle-stroke-width":2.5}});
  MAP_GROUPS.forEach(g => map.addLayer({id:"pt-icon-" + g, type:"symbol", source:"pts-" + g, filter:["all", ["!", ["has", "point_count"]], ["==", ["get", "w"], 1]], layout:{
    "icon-image":["get", "ic"], "icon-size":["interpolate", ["linear"], ["zoom"], 9, .62, 14, .86, 17, 1], "icon-allow-overlap":true, "icon-ignore-placement":true,
    "text-field":["step", ["zoom"], "", 15.5, ["get", "n"]], "text-font":["Noto Sans Regular"], "text-size":11, "text-offset":[0, 1.45], "text-anchor":"top",
    "text-optional":true, "text-max-width":9}, paint:{"text-color":cssv("--ink"), "text-halo-color":cssv("--halo"), "text-halo-width":1.2}}));
  // the chosen place gets its own pin on top, so it stays visible even when its neighbours are bunched into a count
  map.addLayer({id:"sel-icon", type:"symbol", source:"sel", layout:{"icon-image":["get", "ic"], "icon-size":1.08, "icon-allow-overlap":true, "icon-ignore-placement":true}});
  map.addSource("me", {type:"geojson", data:fc([])});
  map.addLayer({id:"me-halo", type:"circle", source:"me", paint:{"circle-radius":16, "circle-color":"rgba(127,178,210,.22)"}});
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
  const moved = debounce(() => { refreshMapData(); const c = map.getCenter(); S.mapView = {c:[+c.lng.toFixed(5), +c.lat.toFixed(5)], z:+map.getZoom().toFixed(2)}; persist(); }, 140);
  map.on("moveend", moved);
  map.on("sourcedata", e => { if (e.sourceId === "openmaptiles" && e.tile && !mapRun.tilesOk){ mapRun.tilesOk = true; setOfflineBase(false); } });
  if (navigator.onLine === false) setOfflineBase(true);
  window.addEventListener("offline", () => { if (!mapRun.tilesOk) setOfflineBase(true); });
  updateMe(); refreshMapData(); renderMapUI();
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
  map.getSource("me").setData(fc(userLoc ? [{type:"Feature", geometry:{type:"Point", coordinates:[userLoc.lng, userLoc.lat]}, properties:{}}] : []));
}
function highlightPin(it){
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
  return D.places.filter(p => ui.mapCats.has(p.c)).filter(p => p.c !== "gaff" || (passPrice(p, ui.mapMaxGBP) && passRating(p, ui.mapMinR)));
}
function mapItems(){ return mapRun.items; }
function refreshMapData(){
  if (!map || !mapLoaded) return;
  const t0 = performance.now();
  const b = map.getBounds(), z = map.getZoom();
  const padLng = (b.getEast() - b.getWest()) * .25, padLat = (b.getNorth() - b.getSouth()) * .25;
  const bb = [b.getWest() - padLng, b.getSouth() - padLat, b.getEast() + padLng, b.getNorth() + padLat];
  const inBB = p => p.lng >= bb[0] && p.lng <= bb[2] && p.lat >= bb[1] && p.lat <= bb[3];
  const feats = [], items = [];
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
          for (const c of cells[g]) est += g === "ess" ? Object.entries(c.counts).reduce((a, [k, n]) => a + (ek.has(k) ? n : 0), 0) : c.total;
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
              const w = g === "ess" ? Object.entries(c.counts).reduce((a, [k, n]) => a + (ek.has(k) ? n : 0), 0) : c.total;
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
            if (got){ for (const p of got) if (inBB(p) && (g !== "ess" || ek.has(p.k))){ feats.push(featOf(p)); items.push(p); } }
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
  mapRun.mode = summaryMode ? "summary" : "detail"; mapRun.loading = loading; mapRun.total = total; mapRun.shown = uniq.length;
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
  else if (mapRun.mode === "summary" && mapRun.total) txt = `${mapRun.total.toLocaleString("en-GB")} places here. Zoom in to see them`;
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
  top.querySelectorAll("[data-cat]").forEach(b => b.onclick = () => { const k = b.dataset.cat; ui.mapSaved = false; ui.mapCats.has(k) ? ui.mapCats.delete(k) : ui.mapCats.add(k); renderMapUI(); });
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
  $("#locBtn").onclick = () => { if (userLoc && map) flyTo(userLoc, Math.max(13, map.getZoom())); locate(true); };
  $("#fitBtn").onclick = () => { const c = D.countries[S.country]; flyTo({lat:c.c[0], lng:c.c[1]}, c.z); };
  $("#zinBtn").onclick = () => map && map.zoomIn(); $("#zoutBtn").onclick = () => map && map.zoomOut();

  const list = $("#mapList"); list.hidden = ui.mapMode !== "list";
  $("#mapview").classList.toggle("listmode", ui.mapMode === "list");
  padMapList();
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
function showEssentialOnMap(id){
  ui.essKinds.clear(); mapRun.stash = mapRun.stash || new Set(ui.mapCats.size ? ui.mapCats : ["gaff","munch","cool"]); ui.mapCats.clear();
  ui.essKinds.add(id); ui.essOpen = true; ui.mapSaved = false; ui.mapMode = "map"; ui.mapSel = null;
  const p = focusPt(); if (!p.none) flyTo(p, 14);
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
function previewCard(it){
  const c = CAT[it.c] || CAT.ess, col = cssv(c.v), pt = userLoc || (S.focus ? focusPt() : null);
  const oh = isOpenNow(it), loc = itemLocal(it);
  const bits = [esc(it.area || it.city)];
  if (pt) bits.push(distShort(dist(pt, it)));
  if (it.r != null) bits.push(`${(it.r / 2).toFixed(1)} stars`);
  if (loc) bits.push(esc(withGBP(loc, it.p, it.cur)));
  return `<div class="preview" style="--c:${col}" id="preview">
    <div class="ph">${icon(kindIcon(it))}</div>
    <div class="body"><div class="eyebrow">${esc(kindLabel(it))}</div><h3>${esc(it.n)}</h3><div class="m">${bits.join(" · ")}</div>
      ${oh ? `<div class="m" style="color:${oh.open ? "var(--ok)" : "var(--faint)"}">${esc(oh.text)}</div>` : ""}</div>
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
      <div class="controls"><label class="field">Researched gaffs: top price<select id="mf-max">${[["","Any"],["5","£5"],["8","£8"],["10","£10"],["15","£15"],["20","£20"]].map(([v, l]) => `<option value="${v}" ${String(ui.mapMaxGBP) === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="field">Researched gaffs: reviews<select id="mf-minr">${[[0,"Any"],[4,"4 stars and up"],[4.5,"4.5 stars and up"]].map(([v, l]) => `<option value="${v}" ${+ui.mapMinR === v ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
      <button class="btn small" id="mf-done" type="button">Done</button></div>`;
    $("#mf-sort").onchange = e => { ui.mapSort = e.target.value; };
    $("#mf-max").onchange = e => { ui.mapMaxGBP = e.target.value; refreshMapData(); };
    $("#mf-minr").onchange = e => { ui.mapMinR = +e.target.value; refreshMapData(); };
    $("#mf-done").onclick = () => { ui.mapFilters = false; renderMapUI(); };
    placeSide(el.offsetHeight); return;
  }
  if (sel){
    el.innerHTML = previewCard(sel);
    $("#pvClose").onclick = () => selectPlace(null);
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
    let h = local.map((s, i) => `<button type="button" data-l="${i}">${icon(s.dest ? "pin" : "star","i s")}<span>${esc(s.n)}<small>${esc(s.sub)}</small></span></button>`).join("");
    if (rem.length) h += `<div class="hd">More places in Thailand</div>` + rem.map((s, i) => `<button type="button" data-r="${i}">${icon((KIND[s.k] || {ic:"pin"}).ic,"i s")}<span>${esc(s.n)}<small>${esc((KIND[s.k] || {l:"Place"}).l)} · ${esc(s.area)}</small></span></button>`).join("");
    if (online.length) h += `<div class="hd">From the web map</div>` + online.map((s, i) => `<button type="button" data-o="${i}">${icon("globe","i s")}<span>${esc(s.n)}<small>${esc(s.sub)}</small></span></button>`).join("");
    else if (text.length >= 3) h += `<button type="button" data-web>${icon("search","i s")}<span>Search everywhere for “${esc(text)}”<small>${busy ? "Searching…" : "OpenStreetMap search, needs signal"}</small></span></button>`;
    if (!local.length && !rem.length && !online.length && text.length < 3) h = `<div class="hd">Keep typing…</div>`;
    box.innerHTML = h; box.hidden = !h;
    box.querySelectorAll("[data-l]").forEach(b => b.onclick = () => choose(local[+b.dataset.l]));
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
  document.addEventListener("pointerdown", e => { if (!box.hidden && !e.target.closest("#mapTop")) close(); });
}
window.addEventListener("resize", () => { if (ui.view === "map"){ mapShown(); renderMapBottom(); } });
