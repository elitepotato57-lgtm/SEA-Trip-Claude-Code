// Keeps the app working offline, but always shows the newest version when there's signal.
const APP = "sea-trip-app-v2-42";        // the app itself: bump this name when the files below change
const TILES = "sea-trip-tiles-v2";      // street-map and satellite tiles you have already looked at
const PLACES = "sea-trip-places-v1";    // the parts of the places database you have already opened
const MEDIA = "sea-trip-media-v1";      // funny mode's video and sounds: kept across updates, so the intro never has to download again
const PACKS = "sea-trip-packs-v1";      // cities saved for offline in Tools > Offline & backup (the page fills it; never trimmed here)
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png", "./config.js",
  "./css/app.css", "./js/data.js", "./js/core.js", "./js/design.js", "./js/places.js", "./js/estimate.js", "./js/shell.js", "./js/lists.js", "./js/map.js", "./js/ask.js",
  "./js/transport.js", "./js/tools.js", "./js/camera.js", "./js/tools-more.js", "./js/ask-more.js", "./js/split.js", "./js/friends.js", "./js/games.js", "./js/funny.js", "./js/offline.js", "./js/docs.js", "./js/trips.js", "./js/detail.js", "./js/road.js", "./js/boot.js",
  "./vendor/maplibre-gl.js", "./vendor/maplibre-gl.css", "./vendor/pdfjs/pdf.min.mjs", "./vendor/pdfjs/pdf.worker.min.mjs",
  "./img/hero-gaffs.jpg", "./img/hero-munch.jpg", "./img/hero-activities.jpg", "./img/hero-tools.jpg", "./img/hero-discover.jpg", "./img/ben-wave.png", "./img/tom-fried.jpg", "./img/tom-aid-ping.png",
  // typical photos for places that have none of their own (js/detail.js KIND_PHOTO), so toilets and ATMs show one offline too
  "./img/kind/airport.jpg", "./img/kind/atm.jpg", "./img/kind/bakery.jpg", "./img/kind/bar.jpg", "./img/kind/beach.jpg", "./img/kind/bike.jpg", "./img/kind/bus.jpg", "./img/kind/cafe.jpg", "./img/kind/campsite.jpg", "./img/kind/carrental.jpg", "./img/kind/cave.jpg", "./img/kind/climbing.jpg", "./img/kind/club.jpg", "./img/kind/convenience.jpg", "./img/kind/cooking.jpg", "./img/kind/culture.jpg", "./img/kind/dessert.jpg", "./img/kind/dive.jpg", "./img/kind/fastfood.jpg", "./img/kind/ferry.jpg", "./img/kind/foodcourt.jpg", "./img/kind/fuel.jpg", "./img/kind/historic.jpg", "./img/kind/hospital.jpg", "./img/kind/hostel.jpg", "./img/kind/hotel.jpg", "./img/kind/hotspring.jpg", "./img/kind/laundry.jpg", "./img/kind/liquor.jpg", "./img/kind/luggage.jpg", "./img/kind/mall.jpg", "./img/kind/massage.jpg", "./img/kind/metro.jpg", "./img/kind/motel.jpg", "./img/kind/muaythai.jpg", "./img/kind/nationalpark.jpg", "./img/kind/park.jpg", "./img/kind/pharmacy.jpg", "./img/kind/police.jpg", "./img/kind/post.jpg", "./img/kind/resort.jpg", "./img/kind/restaurant.jpg", "./img/kind/sim.jpg", "./img/kind/supermarket.jpg", "./img/kind/taxi.jpg", "./img/kind/themepark.jpg", "./img/kind/toilet.jpg", "./img/kind/tour.jpg", "./img/kind/train.jpg", "./img/kind/viewpoint.jpg", "./img/kind/water.jpg", "./img/kind/waterfall.jpg", "./img/kind/wifi.jpg", "./img/kind/zoo.jpg"];
const PLACES_CORE = ["./places/th/meta.json", "./places/th/coverage.json", "./places/th/sum-stay.json", "./places/th/sum-food.json", "./places/th/sum-do.json",
  "./places/id/meta.json", "./places/id/coverage.json", "./places/id/sum-stay.json", "./places/id/sum-food.json", "./places/id/sum-do.json",
  "./places/photos.json", "./places/kh/meta.json", "./places/kh/coverage.json", "./places/kh/sum-stay.json", "./places/kh/sum-food.json", "./places/kh/sum-do.json",
  ...["vn", "la", "sg", "my"].flatMap(d => ["meta.json", "coverage.json", "sum-stay.json", "sum-food.json", "sum-do.json"].map(f => `./places/${d}/${f}`))];
const MAX_TILES = 900;

const saveAll = (name, urls) => caches.open(name).then(cache => Promise.all(urls.map(u =>
  // cache:"reload" skips the browser's short-term cache, so we never save an old copy
  fetch(u, {cache: "reload"}).then(res => { if (res.ok) return cache.put(u, res); }).catch(() => {}))));

self.addEventListener("install", e => {
  e.waitUntil(Promise.all([saveAll(APP, CORE), saveAll(PLACES, PLACES_CORE)]).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  const keep = [APP, TILES, PLACES, PACKS, MEDIA];
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => !keep.includes(k)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

let puts = 0;
async function trim(cache, max){
  if (++puts % 40) return;                 // counting every entry is slow, so only tidy up now and then
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

const SAVE = /^fonts\.(googleapis|gstatic)\.com$|(^|\.)wikipedia\.org$|(^|\.)wikimedia\.org$/;
const MAP_HOSTS = /^tiles\.openfreemap\.org$|^server\.arcgisonline\.com$/;

// The app page itself: get the latest from the internet first; fall back to the saved copy with no signal.
async function pageFirst(req){
  const cache = await caches.open(APP);
  try {
    const res = await Promise.race([
      fetch(req.url, {cache: "no-cache", credentials: "same-origin"}),
      new Promise((_, rej) => setTimeout(() => rej(new Error("slow")), 5000))
    ]);
    if (res && res.ok){ cache.put("./index.html", res.clone()).catch(() => {}); return res; }
    throw new Error("bad response");
  } catch (err) {
    return (await cache.match("./index.html")) || (await cache.match("./")) || new Response("Offline and not saved yet. Open the app once with signal.", {status: 503});
  }
}
// The app's own code (js/, css/, config.js): newest from the internet when there's signal, so a phone never mixes
// an updated page with old code files; the saved copy if there's no signal or it takes more than 5 seconds.
async function codeFirst(req){
  const cache = await caches.open(APP);
  const key = new URL(req.url); key.search = "";
  try {
    const res = await Promise.race([
      fetch(req, {cache: "no-cache"}),
      new Promise((_, rej) => setTimeout(() => rej(new Error("slow")), 5000))
    ]);
    if (res && res.ok){ cache.put(key.href, res.clone()).catch(() => {}); return res; }
    if (res && res.status === 404) return res;                 // config.js is optional
    throw new Error("bad response");
  } catch (err) {
    return (await cache.match(key.href)) || new Response("", {status: 504});
  }
}
// Internet first, saved copy if that fails (the map's small index file, which says where today's tiles live)
async function netFirst(req, name){
  const cache = await caches.open(name);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) { return (await caches.match(req)) || new Response("", {status: 504}); }
}
// Saved copy if we have one, otherwise fetch and keep it (map tiles never change once made)
async function cacheFirst(req, name, max){
  const cache = await caches.open(name);
  const hit = await caches.match(req);              // any cache, including saved cities
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()).then(() => trim(cache, max)).catch(() => {});
    return res;
  } catch (err) { return new Response("", {status: 504}); }
}
// Show the saved copy straight away and refresh it in the background
async function savedThenFresh(req, name, ignoreSearch){
  const cache = await caches.open(name);
  const hit = (await cache.match(req, {ignoreSearch})) || (await caches.match(req, {ignoreSearch}));
  const fresh = fetch(req).then(res => {
    if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()).catch(() => {});
    return res;
  }).catch(() => null);
  if (hit) return hit;
  return (await fresh) || new Response("", {status: 504});
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  const isPage = req.mode === "navigate" || (same && /\/(index\.html)?$/.test(url.pathname));
  if (same && isPage){ e.respondWith(pageFirst(req)); return; }
  if (same && (/\/(js|css)\/[^/]+$/.test(url.pathname) || /\/config\.js$/.test(url.pathname))){ e.respondWith(codeFirst(req)); return; }
  if (MAP_HOSTS.test(url.hostname)){
    const isIndex = url.hostname === "tiles.openfreemap.org" && !/\.(pbf|png|jpg|jpeg|webp|json)$/.test(url.pathname) && !/\/fonts\//.test(url.pathname);
    e.respondWith(isIndex ? netFirst(req, TILES) : cacheFirst(req, TILES, MAX_TILES));
    return;
  }
  if (same && /\/media\//.test(url.pathname)){ e.respondWith(savedThenFresh(req, MEDIA, true)); return; }
  if (same && /\/places\//.test(url.pathname)){ e.respondWith(savedThenFresh(req, PLACES, true)); return; }
  if (!same && !SAVE.test(url.hostname)) return;      // weather, exchange rates, translation and Google always go straight to the internet
  // icons, the map engine, header photos, fonts and sight photos
  e.respondWith(savedThenFresh(req, APP, same));
});

// notifications when the app is closed (experiment push; push/worker.js sends them, PUSH-SETUP.md sets it up): show the
// message, and a tap opens the app (or brings it to the front)
self.addEventListener("push", e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch(err){}
  e.waitUntil(self.registration.showNotification(d.title || "SE Asia Trip", {body:d.body || "", tag:d.tag || "trip", renotify:true, icon:"icon-192.png", badge:"icon-192.png", data:{url:d.url || "./"}}));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:"window", includeUncontrolled:true}).then(list => {
    const open = list.find(c => "focus" in c);
    return open ? open.focus() : self.clients.openWindow(new URL((e.notification.data || {}).url || "./", self.registration.scope).href);
  }));
});
