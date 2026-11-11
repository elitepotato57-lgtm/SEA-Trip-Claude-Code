// Keeps the app working offline, but always shows the newest version when there's signal.
const APP = "sea-trip-app-v2-1";        // the app itself: bump this name when the files below change
const TILES = "sea-trip-tiles-v2";      // street-map and satellite tiles you have already looked at
const PLACES = "sea-trip-places-v1";    // the parts of the places database you have already opened
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png", "./config.js",
  "./vendor/maplibre-gl.js", "./vendor/maplibre-gl.css",
  "./img/hero-gaffs.jpg", "./img/hero-munch.jpg", "./img/hero-activities.jpg", "./img/hero-tools.jpg", "./img/hero-discover.jpg"];
const PLACES_CORE = ["./places/th/meta.json", "./places/th/coverage.json", "./places/th/sum-stay.json", "./places/th/sum-food.json", "./places/th/sum-do.json"];
const MAX_TILES = 900;

const saveAll = (name, urls) => caches.open(name).then(cache => Promise.all(urls.map(u =>
  // cache:"reload" skips the browser's short-term cache, so we never save an old copy
  fetch(u, {cache: "reload"}).then(res => { if (res.ok) return cache.put(u, res); }).catch(() => {}))));

self.addEventListener("install", e => {
  e.waitUntil(Promise.all([saveAll(APP, CORE), saveAll(PLACES, PLACES_CORE)]).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  const keep = [APP, TILES, PLACES];
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
// Internet first, saved copy if that fails (the map's small index file, which says where today's tiles live)
async function netFirst(req, name){
  const cache = await caches.open(name);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) { return (await cache.match(req)) || new Response("", {status: 504}); }
}
// Saved copy if we have one, otherwise fetch and keep it (map tiles never change once made)
async function cacheFirst(req, name, max){
  const cache = await caches.open(name);
  const hit = await cache.match(req);
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
  const hit = await cache.match(req, {ignoreSearch});
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
  if (MAP_HOSTS.test(url.hostname)){
    const isIndex = url.hostname === "tiles.openfreemap.org" && !/\.(pbf|png|jpg|jpeg|webp|json)$/.test(url.pathname) && !/\/fonts\//.test(url.pathname);
    e.respondWith(isIndex ? netFirst(req, TILES) : cacheFirst(req, TILES, MAX_TILES));
    return;
  }
  if (same && /\/places\//.test(url.pathname)){ e.respondWith(savedThenFresh(req, PLACES, true)); return; }
  if (!same && !SAVE.test(url.hostname)) return;      // weather, exchange rates, translation and Google always go straight to the internet
  // icons, the map engine, header photos, fonts and sight photos
  e.respondWith(savedThenFresh(req, APP, same));
});
