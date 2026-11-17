/* ============================================================
   Funny mode (Settings › Funny mode, off until someone switches it on). When it's on:
   - the app opens with Tommy's intro (media/tommy.mp4) full screen, then fades into the app;
   - tapping China on the main map plays media/chinese.mp3 (GEO already has China's outline, so no download);
   - opening Tools › Friends makes Ben pop up and wave (img/ben-wave.png, cut out of media/ben-wave.mp4 by
     tools/ben-sprite.py; css/app.css animates the strip of frames with steps()).
   Nothing here does anything while it's off.
   ============================================================ */
const FUNNY_INTRO = "media/tommy.mp4", FUNNY_CHINA = "media/chinese.mp3", FUNNY_BEN = "img/ben-wave.png";
const funnyOn = () => typeof S !== "undefined" && S.funny === true;

// a whole file as a blob: URL, so iPhones play it from memory (no half-loaded video, and it works offline once saved)
async function funnyBlobUrl(src){
  const r = await fetch(src);
  if (!r || !r.ok) throw new Error("HTTP " + (r ? r.status : "error"));
  return URL.createObjectURL(await r.blob());
}

/* ---------- the intro: Tommy, full screen, then a fade into the app ---------- */
function funnyIntro(){
  if (!funnyOn() || typeof document === "undefined" || !document.body || $("#funnyIntro")) return;
  const el = document.createElement("div");
  el.id = "funnyIntro"; el.className = "funny-intro";
  el.innerHTML = `<video playsinline webkit-playsinline preload="auto" aria-label="Funny mode intro"></video><button class="funny-skip" type="button">Skip</button>`;
  document.body.appendChild(el);
  const v = el.querySelector("video");
  v.playsInline = true;
  let url = "", done = false, safety = 0;
  const finish = () => {
    if (done) return; done = true; clearTimeout(safety);
    el.classList.add("out");
    setTimeout(() => { el.remove(); if (url) URL.revokeObjectURL(url); }, 650);
  };
  safety = setTimeout(finish, 6000);                        // no signal or it won't play: never stuck on a black screen
  el.onclick = finish;                                      // tap (or Skip) to go straight to the app
  v.onended = finish; v.onerror = finish;
  v.onplaying = () => { clearTimeout(safety); safety = setTimeout(finish, ((isFinite(v.duration) && v.duration) || 3) * 1000 + 1500); };
  funnyBlobUrl(FUNNY_INTRO).then(u => {
    if (done){ URL.revokeObjectURL(u); return; }
    url = u; v.src = u;
    // with sound if the phone allows it; phones that block sound before the first tap play it silently instead
    v.muted = false;
    return v.play().catch(() => { v.muted = true; return v.play(); });
  }).catch(finish);
}

/* ---------- China talks back ---------- */
// GEO's China (js/data.js) stops at 30°N, because the app's maps only go that far north. The rest of China, so a tap
// on Beijing counts too: Natural Earth's 1:110m outline (public domain, the same source as GEO), north of 29.5°N only.
const FUNNY_CHINA_NORTH = [[80.26,42.35],[80.18,42.92],[80.87,43.18],[79.97,44.92],[81.95,45.32],[82.46,45.54],[83.18,47.33],[85.16,47.0],[85.72,47.45],[85.77,48.46],[86.6,48.55],[87.36,49.21],[87.75,49.3],[88.01,48.6],[88.85,48.07],[90.28,47.69],[90.97,46.89],[90.59,45.72],[90.95,45.29],[92.13,45.12],[93.48,44.98],[94.69,44.35],[95.31,44.24],[95.76,43.32],[96.35,42.73],[97.45,42.75],[99.52,42.52],[100.85,42.66],[101.83,42.51],[103.31,41.91],[104.52,41.91],[104.96,41.6],[106.13,42.13],[107.74,42.48],[109.24,42.52],[110.41,42.87],[111.13,43.41],[111.83,43.74],[111.67,44.07],[111.35,44.46],[111.87,45.1],[112.44,45.01],[113.46,44.81],[114.46,45.34],[115.99,45.73],[116.72,46.39],[117.42,46.67],[118.87,46.81],[119.66,46.69],[119.77,47.05],[118.87,47.75],[118.06,48.07],[117.3,47.7],[116.31,47.85],[115.74,47.73],[115.49,48.14],[116.19,49.13],[116.68,49.89],[117.88,49.51],[119.29,50.14],[119.28,50.58],[120.18,51.64],[120.74,51.96],[120.73,52.52],[120.18,52.75],[121.0,53.25],[122.25,53.43],[123.57,53.46],[125.07,53.16],[125.95,52.79],[126.56,51.78],[126.94,51.35],[127.29,50.74],[127.66,49.76],[129.4,49.44],[130.58,48.73],[130.99,47.79],[132.51,47.79],[133.37,48.18],[135.03,48.48],[134.5,47.58],[134.11,47.21],[133.77,46.12],[133.1,45.14],[131.88,45.32],[131.03,44.97],[131.29,44.11],[131.14,42.93],[130.63,42.9],[130.64,42.4],[129.99,42.99],[129.6,42.42],[128.05,41.99],[128.21,41.47],[127.34,41.5],[126.87,41.82],[126.18,41.11],[125.08,40.57],[124.27,39.93],[122.87,39.64],[122.13,39.17],[121.05,38.9],[121.59,39.36],[121.38,39.75],[122.17,40.42],[121.64,40.95],[120.77,40.59],[119.64,39.9],[119.02,39.25],[118.04,39.2],[117.53,38.74],[118.06,38.06],[118.88,37.9],[118.91,37.45],[119.7,37.16],[120.82,37.87],[121.71,37.48],[122.36,37.45],[122.52,36.93],[121.1,36.65],[120.64,36.11],[119.66,35.61],[119.15,34.91],[120.23,34.36],[120.62,33.38],[121.23,32.46],[121.91,31.69],[121.89,30.95],[121.26,30.68],[121.5,30.14],[122.09,29.83],[122.03,29.5],[83.28,29.5],[82.33,30.12],[81.53,30.42],[81.11,30.18],[79.72,30.88],[78.74,31.52],[78.46,32.62],[79.18,32.48],[79.21,32.99],[78.81,33.51],[78.91,34.32],[77.84,35.49],[76.19,35.9],[75.9,36.67],[75.16,37.13],[74.98,37.42],[74.83,37.99],[74.86,38.38],[74.26,38.61],[73.93,38.51],[73.68,39.43],[73.96,39.66],[73.82,39.89],[74.78,40.37],[75.47,40.56],[76.53,40.43],[76.9,41.07],[78.19,41.19],[78.54,41.58],[80.12,42.12]];
let funnyChinaRings = null, funnyAudio = null, funnyAudioUrl = "";
const funnyInChina = (lat, lng) => {
  if (!funnyChinaRings){ const c = GEO.find(g => g.n === "China"); funnyChinaRings = (c ? c.p : []).concat([FUNNY_CHINA_NORTH]); }
  return funnyChinaRings.some(r => inRing(lat, lng, r));
};
// loads the sound ahead of time, so a tap plays it straight away
function funnyPrep(){
  if (!funnyOn() || funnyAudioUrl || typeof Audio === "undefined") return;
  funnyAudioUrl = "loading";
  funnyBlobUrl(FUNNY_CHINA).then(u => { funnyAudioUrl = u; funnyAudio = new Audio(u); funnyAudio.preload = "auto"; }).catch(() => { funnyAudioUrl = ""; });
  try { const im = new Image(); im.src = FUNNY_BEN; } catch(e){}
}
// called by the main map's tap handler (js/map.js). hit: the tap was on a place pin. Returns true when it played.
function funnyMapTap(ll, hit){
  if (!funnyOn() || hit || !ll || !funnyInChina(ll.lat, ll.lng)) return false;
  try {
    const a = funnyAudio || new Audio(FUNNY_CHINA);
    a.currentTime = 0;
    const p = a.play(); if (p && p.catch) p.catch(() => {});
  } catch(e){}
  return true;
}

/* ---------- Ben waves when you open Friends ---------- */
let funnyRoute = "";
function funnyBen(){
  if (!funnyOn() || typeof document === "undefined") return;
  const host = $("main"); if (!host) return;
  const old = $("#funnyBen"); if (old) old.remove();
  const el = document.createElement("div");
  el.id = "funnyBen"; el.className = "funny-ben-wrap"; el.setAttribute("aria-hidden", "true");
  el.innerHTML = `<div class="funny-ben"></div>`;
  host.appendChild(el);
  setTimeout(() => el.remove(), 3100);
}
function funnyOnRoute(){
  const r = parseHash(), key = r.view + "/" + r.sub;
  if (key === "tools/friends" && funnyRoute !== key) funnyBen();
  else if (key !== "tools/friends"){ const b = $("#funnyBen"); if (b) b.remove(); }       // he only waves on Friends
  funnyRoute = key;
}
if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("hashchange", funnyOnRoute);

// js/boot.js calls this once the app has drawn its first screen
function funnyStart(){
  funnyRoute = "";
  if (!funnyOn()){ funnyRoute = (r => r.view + "/" + r.sub)(parseHash()); return; }
  funnyPrep();
  funnyIntro();
  funnyOnRoute();
}
// Settings › Funny mode
function funnySet(on){
  S.funny = !!on; persist();
  if (on) funnyPrep();
  else { const i = $("#funnyIntro"); if (i) i.remove(); const b = $("#funnyBen"); if (b) b.remove(); }
}
