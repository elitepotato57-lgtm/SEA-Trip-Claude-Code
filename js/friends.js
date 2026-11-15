/* ============================================================
   67-friends: your mates on a map, who sees you, live split costs and games, all on Tools › Friends.
   Uses a free Firebase project (Realtime Database + anonymous sign-in, Spark plan, no card), talked to over its plain web
   address (REST, and its live "event stream" for games), so there is no extra library. config.js has
     window.SEA_FIREBASE = {apiKey:"…", databaseURL:"https://….firebasedatabase.app"};
   Who can read what is enforced by the database's rules (firebase/database.rules.json; tests/fakefirebase.js copies them).
   Data:  users/{uid} {n,c}   codes/{CODE} uid   requests/{uid}/{from} {n,c}   share/{uid}/{friend} true   loc/{uid} {lat,lng,acc,t}
          photos/{uid} small JPEG (only the developer phone can set them)   admins/{uid} true   invites/{uid}/{from} {g,n,t}
          games/{uidA_uidB} {g,round,r:{n:{uid:choice}}}   groups/… and mygroups/… (live split, at the bottom)
   Sharing uses the phone's own GPS (never the pretend test location) and only while the app is open: iPhones don't let
   web apps run in the background.
   ============================================================ */
const FB_AUTH_KEY = "fb-auth-v1", FR_PHOTOS_KEY = "fr-photos-v1";
const FR_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";       // no 0/O or 1/I to mix up
const FR_SEND_MS = 60e3, FR_POLL_MS = 20e3, FR_MOVE_M = 40;
const FR_COLORS = ["#F2C14E", "#7FD1AE", "#F28B82", "#A8B8FF", "#E39FF6", "#6FD0E6", "#FFB37A", "#C5E17A"];
const frCfg = () => { const c = window.SEA_FIREBASE; return c && c.apiKey && /^https:\/\/[\w.-]+\.(firebaseio\.com|firebasedatabase\.app)\/?$/.test(c.databaseURL || "") ? c : null; };
function frState(){
  const f = S.friends && typeof S.friends === "object" ? S.friends : (S.friends = {});
  if (typeof f.on !== "boolean") f.on = false;                    // share my location at all (off until you turn it on)
  if (typeof f.name !== "string") f.name = "";
  if (!f.list || typeof f.list !== "object") f.list = {};         // uid -> {n, share, at}
  return f;
}
const frNow = () => Date.now();

/* ---------- signing in (anonymous: no email or password, just this phone) ---------- */
let frAuthP = null;
function frAuthSaved(){ return lsGet(FB_AUTH_KEY, null); }
async function frPost(url, body, form){
  const r = await fetch(url, {method:"POST", headers:{"Content-Type":form ? "application/x-www-form-urlencoded" : "application/json"}, body:form ? body : JSON.stringify(body)});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && (j.error.message || j.error)) || "HTTP " + r.status);
  return j;
}
// a fresh sign-in token (they last an hour); signs this phone up the first time
function frAuth(){
  const cfg = frCfg(); if (!cfg) return Promise.reject(new Error("not set up"));
  if (frAuthP) return frAuthP;
  frAuthP = (async () => {
    let a = frAuthSaved();
    if (a && a.tok && a.exp > frNow() + 60e3) return a;
    if (a && a.ref){
      try {
        const j = await frPost(`https://securetoken.googleapis.com/v1/token?key=${enc(cfg.apiKey)}`, `grant_type=refresh_token&refresh_token=${enc(a.ref)}`, true);
        a = {uid:j.user_id, tok:j.id_token, ref:j.refresh_token, exp:frNow() + (+j.expires_in || 3600) * 1000};
        lsSet(FB_AUTH_KEY, a); return a;
      } catch(e){ if (!/TOKEN_EXPIRED|INVALID_REFRESH_TOKEN|USER_NOT_FOUND|USER_DISABLED/.test(e.message)) throw e; }
    }
    const j = await frPost(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${enc(cfg.apiKey)}`, {returnSecureToken:true});
    a = {uid:j.localId, tok:j.idToken, ref:j.refreshToken, exp:frNow() + (+j.expiresIn || 3600) * 1000};
    lsSet(FB_AUTH_KEY, a); return a;
  })().finally(() => { setTimeout(() => { frAuthP = null; }, 0); });
  return frAuthP;
}
const frBase = () => frCfg().databaseURL.replace(/\/$/, "");
// read or write one path of the database
async function frDb(method, path, data){
  const a = await frAuth();
  const url = `${frBase()}/${path}.json?auth=${enc(a.tok)}`;
  const r = await fetch(url, {method, headers:data !== undefined ? {"Content-Type":"application/json"} : {}, body:data !== undefined ? JSON.stringify(data) : undefined});
  if (r.status === 401 || r.status === 403){ const e = new Error("permission"); e.status = r.status; throw e; }
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.status === 204 ? null : r.json();
}
// follow one path live: the database's event stream (changes arrive in well under a second), or every 1.2 s if a stream
// can't be opened. cb gets the whole value each time it changes. Returns a function that stops it.
function frSetIn(obj, path, val){
  const parts = path.split("/").filter(Boolean);
  if (!parts.length) return val;
  const root = obj && typeof obj === "object" ? JSON.parse(JSON.stringify(obj)) : {};
  let o = root; for (let i = 0; i < parts.length - 1; i++){ if (!o[parts[i]] || typeof o[parts[i]] !== "object") o[parts[i]] = {}; o = o[parts[i]]; }
  if (val === null) delete o[parts[parts.length - 1]]; else o[parts[parts.length - 1]] = val;
  return root;
}
function frListen(path, cb){
  let es = null, timer = null, stop = false, data, seen = "";
  const emit = v => { const s = JSON.stringify(v); if (s !== seen){ seen = s; data = v; cb(v); } };
  const poll = async () => { if (stop) return; try { emit(await frDb("GET", path)); } catch(e){} if (!stop) timer = setTimeout(poll, 1200); };
  const open = async () => {
    try {
      if (typeof EventSource === "undefined") throw new Error("no stream");
      const a = await frAuth(); if (stop) return;
      let got = false;
      es = new EventSource(`${frBase()}/${path}.json?auth=${enc(a.tok)}`);
      es.addEventListener("put", e => { got = true; const m = JSON.parse(e.data); emit(frSetIn(data, m.path, m.data)); });
      es.addEventListener("patch", e => { got = true; const m = JSON.parse(e.data); let d = data; for (const [k, v] of Object.entries(m.data || {})) d = frSetIn(d, m.path.replace(/\/$/, "") + "/" + k, v); emit(d); });
      es.addEventListener("auth_revoked", () => { es.close(); es = null; if (!stop) open(); });     // token ran out: reconnect
      es.addEventListener("cancel", () => { es.close(); es = null; });
      es.onerror = () => { if (!got && es){ es.close(); es = null; poll(); } };                     // no stream here: poll instead
    } catch(e){ poll(); }
  };
  open();
  return () => { stop = true; if (es) es.close(); clearTimeout(timer); };
}

/* ---------- my friend code ---------- */
function frNewCode(){ let s = ""; const b = new Uint32Array(6); crypto.getRandomValues(b); b.forEach(x => s += FR_CODE_CHARS[x % FR_CODE_CHARS.length]); return s; }
const frCleanCode = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
async function frMe(){
  const f = frState(), a = await frAuth();
  if (f.uid !== a.uid){ f.uid = a.uid; f.code = ""; }
  if (!f.code){
    for (let i = 0; i < 6 && !f.code; i++){
      const c = frNewCode(), owner = await frDb("GET", `codes/${c}`);
      if (owner == null){ await frDb("PUT", `codes/${c}`, a.uid); f.code = c; }
    }
    if (!f.code) throw new Error("Couldn’t make a friend code");
  }
  await frDb("PATCH", `users/${a.uid}`, {n:f.name || "A friend", c:f.code});
  persist();
  return {uid:a.uid, code:f.code};
}

/* ---------- adding, sharing, removing ---------- */
// add someone by their code; you start sharing with them unless you say otherwise. Returns their name.
async function frAdd(code, share = true){
  const f = frState(), me = await frMe(), c = frCleanCode(code);
  if (c.length !== 6) throw new Error("A friend code is 6 letters and numbers");
  if (c === f.code) throw new Error("That’s your own code");
  const uid = await frDb("GET", `codes/${c}`); if (!uid) throw new Error("No one has that code. Check it with them.");
  const u = await frDb("GET", `users/${uid}`) || {};
  f.list[uid] = {n:String(u.n || "Friend").slice(0, 30), share:!!share, at:frNow()};
  persist();
  if (share) await frDb("PUT", `share/${me.uid}/${uid}`, true);
  await frDb("PUT", `requests/${uid}/${me.uid}`, {n:f.name || "A friend", c:f.code});      // so they can add you back in one tap
  await frDb("DELETE", `requests/${me.uid}/${uid}`).catch(() => {});
  if (share && f.on) frSendNow(true).catch(() => {});
  return f.list[uid].n;
}
async function frSetShare(uid, on){
  const f = frState(), me = await frMe(); if (!f.list[uid]) return;
  f.list[uid].share = !!on; persist();
  if (on) await frDb("PUT", `share/${me.uid}/${uid}`, true); else await frDb("DELETE", `share/${me.uid}/${uid}`);
  if (on && f.on) frSendNow(true).catch(() => {});
}
async function frRemove(uid){
  const f = frState(), me = await frMe();
  delete f.list[uid]; delete frLocs[uid]; persist();
  await frDb("DELETE", `share/${me.uid}/${uid}`).catch(() => {});
  drawFriends();
}
async function frSetOn(on){
  const f = frState(); f.on = !!on; persist();
  if (on){ await frMe(); frGpsStart(); frSendNow(true).catch(() => {}); frLoop(); }
  else { frGpsStop(); frLast = null; const a = frAuthSaved(); if (a) await frDb("DELETE", `loc/${a.uid}`).catch(() => {}); }       // stop: your last position is removed
}
async function frRequests(){
  const me = await frMe(), r = await frDb("GET", `requests/${me.uid}`) || {}, f = frState();
  return Object.entries(r).filter(([uid]) => !f.list[uid]).map(([uid, v]) => ({uid, n:(v && v.n) || "A friend", c:v && v.c}));
}
async function frIgnore(uid){ const me = await frMe(); await frDb("DELETE", `requests/${me.uid}/${uid}`); }

/* ---------- colours and faces ---------- */
const frMyId = () => (frAuthSaved() || {}).uid || frState().uid || "";
// each friend keeps one colour (the order you added them), so pins, list and split costs match; you are the blue dot's blue
function frColor(uid){
  if (uid === frMyId()) return "#7FB2D2";
  const ids = Object.entries(frState().list).sort((a, b) => (a[1].at || 0) - (b[1].at || 0)).map(x => x[0]);
  const i = ids.indexOf(uid);
  return FR_COLORS[(i < 0 ? [...String(uid)].reduce((s, ch) => s + ch.charCodeAt(0), 0) : i) % FR_COLORS.length];
}
let frPhotos = lsGet(FR_PHOTOS_KEY, {}) || {}, frPhotosAt = 0;
const frInitials = n => String(n || "?").trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
const frNameOf = uid => uid === frMyId() ? (frState().name || "You") : (frState().list[uid] || {}).n || "Friend";
function frAvatar(uid, size = 36, name){
  const p = frPhotos[uid], n = name || frNameOf(uid);
  return `<span class="fr-av" style="--c:${frColor(uid)};--s:${size}px" aria-hidden="true">${p ? `<img src="${esc(p)}" alt="">` : esc(frInitials(n))}</span>`;
}
async function frLoadPhotos(force){
  if (!force && frNow() - frPhotosAt < 5 * 60e3) return frPhotos;
  frPhotosAt = frNow();
  const all = await frDb("GET", "photos").catch(() => null);
  if (all && typeof all === "object"){ frPhotos = all; lsSet(FR_PHOTOS_KEY, all); }
  return frPhotos;
}

/* ---------- developer phone: only it can set everyone's photo ----------
   Developer mode is switched on by tapping "About the data" in Settings 7 times. The first phone to claim it in the database
   becomes the developer (admins/{uid}); after that the rules refuse anyone else. */
let frAdmin = null;
async function frCheckAdmin(){ const me = await frMe(); frAdmin = (await frDb("GET", `admins/${me.uid}`).catch(() => null)) === true; return frAdmin; }
async function frClaimAdmin(){ const me = await frMe(); await frDb("PUT", `admins/${me.uid}`, true); frAdmin = true; return true; }
// a small square face (128 px JPEG, about 8 KB) from a photo on the phone
async function frResizePhoto(file){
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const s = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement("canvas"); c.width = c.height = 128;
    c.getContext("2d").drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 128, 128);
    return c.toDataURL("image/jpeg", 0.82);
  } finally { URL.revokeObjectURL(url); }
}
async function frSetPhoto(uid, dataUrl){
  await frDb("PUT", `photos/${uid}`, dataUrl);
  frPhotos[uid] = dataUrl; lsSet(FR_PHOTOS_KEY, frPhotos);
}

/* ---------- my position: the phone's own GPS, only while sharing is on and the app is open ---------- */
let frHere = null, frGpsId = null, frGpsErr = "", frLast = null, frTimer = null, frSentErr = "";
function frGpsStart(){
  if (frGpsId != null || typeof navigator === "undefined" || !navigator.geolocation) return;
  frGpsId = navigator.geolocation.watchPosition(p => {
    frHere = {lat:p.coords.latitude, lng:p.coords.longitude, acc:p.coords.accuracy, at:frNow()}; frGpsErr = "";
    frSendNow(false).catch(() => {}); paintFriendsLive();
  }, e => { frGpsErr = e && e.code === 1 ? "denied" : "unavailable"; paintFriendsLive(); }, {enableHighAccuracy:true, maximumAge:30e3, timeout:30e3});
}
function frGpsStop(){ if (frGpsId != null && navigator.geolocation) navigator.geolocation.clearWatch(frGpsId); frGpsId = null; }
const frMeHere = () => frHere || (typeof userLoc !== "undefined" && userLoc && locStatus === "ok" ? userLoc : null);
// sends only a real GPS position (never the pretend test location), at most once a minute unless you've moved 40 m
async function frSendNow(force, here, status){
  if (here === undefined){ here = frMeHere(); status = here ? "ok" : locStatus; }
  const f = frState();
  if (!frCfg() || !f.on || !here || status === "test" || !Object.values(f.list).some(x => x.share)) return false;
  if (!force && frLast && frNow() - frLast.at < FR_SEND_MS && dist(frLast, here) * 1000 < FR_MOVE_M) return false;
  const a = await frAuth();
  try { await frDb("PUT", `loc/${a.uid}`, {lat:+here.lat.toFixed(5), lng:+here.lng.toFixed(5), acc:Math.round(here.acc || 0), t:{".sv":"timestamp"}}); frSentErr = ""; }
  catch(e){ frSentErr = e.message === "permission" ? "Firebase refused it: re-publish the rules (FIREBASE-SETUP.md)" : "No signal"; throw e; }
  frLast = {lat:here.lat, lng:here.lng, at:frNow()};
  return true;
}
// one plain sentence on whether friends can see you, and if not, why
function frSendStatus(){
  const f = frState(), n = Object.values(f.list).filter(x => x.share).length;
  if (!f.on) return {ok:false, t:"You’re hidden: Share my location is off."};
  if (!n) return {ok:false, t:"Nobody can see you yet: switch “Sees you” on for a friend."};
  if (frGpsErr === "denied") return {ok:false, t:"Location is blocked for this app. iPhone: Settings › Privacy & Security › Location Services › Safari Websites › While Using. Then reopen the app."};
  if (frSentErr) return {ok:false, t:"Couldn’t send your location: " + frSentErr + "."};
  if (!frLast) return {ok:false, t:frGpsErr ? "Can’t get a GPS fix. Try outside, or check Location Services." : "Finding you…"};
  return {ok:true, t:`Sharing with ${n} ${n === 1 ? "friend" : "friends"} · sent ${frAgo(frLast.at)}.`};
}

/* ---------- reading theirs ---------- */
const frLocs = {};                                    // uid -> {lat,lng,acc,t} or {none} / {hidden}
let frInvites = {}, frInviteSeen = lsGet("fr-inv-seen", 0) || 0;
async function frPoll(){
  const f = frState(), ids = Object.keys(f.list);
  await Promise.all(ids.map(async uid => {
    try { const v = await frDb("GET", `loc/${uid}`); frLocs[uid] = v && isFinite(v.lat) ? v : {none:true}; }
    catch(e){ frLocs[uid] = e.status === 401 || e.status === 403 ? {hidden:true} : (frLocs[uid] || {err:true}); }
  }));
  try {
    const me = frMyId(); if (me) frInvites = await frDb("GET", `invites/${me}`) || {};
    const fresh = Object.entries(frInvites).filter(([, v]) => v && v.t > frInviteSeen);
    if (fresh.length && !(ui.view === "tools" && ui.sub === "friends")){ const [, v] = fresh[0]; toast(`${v.n || "A friend"} wants to play Rock Paper Scissors. Open Tools › Friends.`); }
    if (fresh.length){ frInviteSeen = Math.max(...fresh.map(([, v]) => v.t)); lsSet("fr-inv-seen", frInviteSeen); }
  } catch(e){}
  frLoadPhotos().catch(() => {});
  // someone added you to a live split group while Friends is open: show it
  if (ui.view === "tools" && ui.sub === "friends" && $("#fr-split")){
    const before = liveGroupsCached().map(g => g.id).join();
    await liveListGroups().catch(() => {});
    const busy = document.activeElement && $("#fr-split").contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
    if (!busy && (liveGroupsCached().map(g => g.id).join() !== before || !frSplitGid)) frSplitPaint();
  }
  drawFriends(); paintFriendsLive(); frFitOnce();
}
function frLoop(){
  clearTimeout(frTimer);
  if (!frCfg() || document.hidden) return;
  const f = frState();
  if (!Object.keys(f.list).length && !f.on) return;
  if (f.on) frGpsStart();
  Promise.allSettled([frSendNow(false), frPoll()]).finally(() => { frTimer = setTimeout(frLoop, FR_POLL_MS); });
}
if (typeof document !== "undefined" && document.addEventListener) document.addEventListener("visibilitychange", () => { if (!document.hidden) frLoop(); else { clearTimeout(frTimer); frGpsStop(); } });

/* ---------- friends on a map (the main map, and the one on the Friends page) ---------- */
const frAgo = t => { const m = Math.round((frNow() - t) / 60e3); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
const frMarkers = {}, frMapMarkers = {};
function frDrawOn(m, store, onTap){
  if (!m || typeof maplibregl === "undefined") return;
  const f = frState();
  Object.keys(store).forEach(uid => { const v = frLocs[uid]; if (!f.list[uid] || !v || !isFinite(v.lat)){ store[uid].remove(); delete store[uid]; } });
  for (const uid of Object.keys(f.list)){
    const v = frLocs[uid]; if (!v || !isFinite(v.lat)) continue;
    if (!store[uid]){
      const el = document.createElement("button"); el.type = "button"; el.className = "fr-pin";
      el.onclick = e => { e.stopPropagation(); onTap(uid); };
      store[uid] = new maplibregl.Marker({element:el, anchor:"center"}).setLngLat([v.lng, v.lat]).addTo(m);
    }
    const el = store[uid].getElement();
    el.innerHTML = frAvatar(uid, 24);
    el.classList.toggle("old", frNow() - v.t > 3 * 3600e3);
    el.setAttribute("aria-label", `${frNameOf(uid)}, seen ${frAgo(v.t)}`);
    store[uid].setLngLat([v.lng, v.lat]);
  }
}
const frTapToast = uid => { const w = frLocs[uid], me = frMeHere(); if (w) toast(`${frNameOf(uid)}: seen ${frAgo(w.t)}${me ? `, ${distShort(dist(me, w))} away` : ""}`); };
function drawFriends(){
  if (typeof map !== "undefined" && map) frDrawOn(map, frMarkers, frTapToast);
  if (frMapI) { frDrawOn(frMapI, frMapMarkers, uid => frFlyTo(uid)); frDrawMe(); }
}
let frMapI = null, frMapEl = null, frMeMarker = null, frMapFitted = false;
// the first time friends' positions are in after opening the page, glide out from you to show everyone
function frFitOnce(){
  if (frMapFitted || !frMapI || !frMapI.loaded()) return;
  if (!Object.keys(frState().list).some(uid => frLocs[uid] && isFinite(frLocs[uid].lat))) return;
  frMapFitted = true; setTimeout(frFitAll, 400);
}
function frDrawMe(){
  const me = frMeHere(); if (!frMapI || !me) return;
  if (!frMeMarker){ const el = document.createElement("div"); el.className = "fr-me"; frMeMarker = new maplibregl.Marker({element:el}).setLngLat([me.lng, me.lat]).addTo(frMapI); }
  frMeMarker.setLngLat([me.lng, me.lat]);
}
function initFriendsMap(){
  const slot = $("#frMap"); if (!slot || typeof maplibregl === "undefined") return;
  if (frMapI){ slot.replaceWith(frMapEl); setTimeout(() => { try { frMapI.resize(); } catch(e){} drawFriends(); }, 0); return; }
  frMapEl = slot;
  const me = frMeHere(), c = D.countries[S.country];
  try {
    frMapI = new maplibregl.Map({container:slot, style:mapStyle(), center:me ? [me.lng, me.lat] : [c.c[1], c.c[0]], zoom:me ? 14 : c.z,
      minZoom:2, maxZoom:18, attributionControl:false, dragRotate:false, pitchWithRotate:false, touchPitch:false, renderWorldCopies:false});
  } catch(e){ frMapI = null; slot.innerHTML = `<div class="map-msg">The map can’t run on this device.</div>`; return; }
  if (frMapI.touchZoomRotate && frMapI.touchZoomRotate.disableRotation) frMapI.touchZoomRotate.disableRotation();
  frMapI.addControl(new maplibregl.AttributionControl({compact:true}), "bottom-left");
  const shut = () => slot.querySelectorAll(".maplibregl-ctrl-attrib").forEach(a => a.classList.remove("maplibregl-compact-show"));
  frMapI.once("load", shut); frMapI.once("idle", shut);
  frMapI.on("load", () => { drawFriends(); frFitOnce(); });
}
// glide from where the map is to a view with you and everyone you can see (zooming out and back in, not a jump)
function frFitAll(){
  if (!frMapI) return;
  const pts = Object.keys(frState().list).map(uid => frLocs[uid]).filter(v => v && isFinite(v.lat)), me = frMeHere();
  if (me) pts.push(me);
  if (!pts.length) return;
  if (pts.length === 1){ frMapI.flyTo({center:[pts[0].lng, pts[0].lat], zoom:15, duration:2200, essential:true}); return; }
  const b = [[Math.min(...pts.map(p => p.lng)), Math.min(...pts.map(p => p.lat))], [Math.max(...pts.map(p => p.lng)), Math.max(...pts.map(p => p.lat))]];
  const cam = frMapI.cameraForBounds(b, {padding:{top:50, bottom:50, left:50, right:50}, maxZoom:16});
  if (cam) frMapI.flyTo(Object.assign(cam, {duration:2600, curve:1.5, essential:true}));
}
// glide to show you and one friend together
function frFlyTo(uid){
  const v = frLocs[uid]; if (!v || !isFinite(v.lat)){ const s = frLocs[uid]; toast(s && s.hidden ? `${frNameOf(uid)} isn’t sharing with you` : `${frNameOf(uid)} hasn’t sent a location yet`); return; }
  if (!frMapI) return;
  const me = frMeHere();
  if (!me){ frMapI.flyTo({center:[v.lng, v.lat], zoom:15, duration:2500, curve:1.5, essential:true}); return; }
  const cam = frMapI.cameraForBounds([[Math.min(me.lng, v.lng), Math.min(me.lat, v.lat)], [Math.max(me.lng, v.lng), Math.max(me.lat, v.lat)]], {padding:60, maxZoom:16});
  if (cam) frMapI.flyTo(Object.assign(cam, {duration:2600, curve:1.5, essential:true}));
  frTapToast(uid);
}

/* ---------- the Friends page ----------
   Top: your friends (face, name, where they are, whether they see you). Then the map. Then the live split costs. Then games.
   "You", adding friends and the developer bits live behind the green Add friend button. */
function friendsSetupHTML(){
  return `<div class="callout">${icon("info")}<div><b>Friends needs switching on once.</b> It uses a free Firebase project (Google’s, no card needed) so phones can see each other.
    Dylan sets it up and adds its two settings to <code>config.js</code> on GitHub: about 10 minutes, step by step in <code>FIREBASE-SETUP.md</code>. Everyone gets it after that.</div></div>`;
}
function frLocText(uid){
  const v = frLocs[uid], me = frMeHere();
  return !v ? "Checking…" : v.hidden ? "Not sharing with you" : v.none ? "Hasn’t sent a location (their sharing is off, or their app is closed)" : v.err ? "Couldn’t check (no signal?)"
    : `Seen ${frAgo(v.t)}${me ? ` · ${distShort(dist(me, v))} away` : ""}`;
}
function paintFriendsLive(){
  if (typeof document === "undefined" || !document.querySelector) return;
  document.querySelectorAll("[data-frloc]").forEach(el => el.textContent = frLocText(el.dataset.frloc));
  document.querySelectorAll("[data-frav]").forEach(el => el.innerHTML = frAvatar(el.dataset.frav, +el.dataset.size || 40));
  const st = $("#fr-status"); if (st){ const s = frSendStatus(); st.textContent = s.t; st.classList.toggle("good", s.ok); }
  const al = $("#fr-alerts"); if (al) paintFrAlerts(al);
}
function paintFrAlerts(el){
  const inv = Object.entries(frInvites).filter(([uid, v]) => v && frState().list[uid]);
  el.innerHTML = inv.map(([uid, v]) => `<div class="callout fr-alert">${frAvatar(uid, 32)}<div><b>${esc(frNameOf(uid))}</b> wants to play Rock Paper Scissors</div><button class="btn small primary" type="button" data-frplay="${esc(uid)}">Play</button></div>`).join("")
    + (frReqs || []).map(r => `<div class="callout fr-alert">${frAvatar(r.uid, 32, r.n)}<div><b>${esc(r.n)}</b> added you</div><button class="btn small primary" type="button" data-frback="${esc(r.c || "")}">Add back</button><button class="icon-btn" type="button" data-frign="${esc(r.uid)}" aria-label="Ignore ${esc(r.n)}">${icon("x","i s")}</button></div>`).join("");
  el.querySelectorAll("[data-frplay]").forEach(b => b.onclick = () => openRps(b.dataset.frplay));
  el.querySelectorAll("[data-frback]").forEach(b => b.onclick = () => frAdd(b.dataset.frback).then(n => { toast(`Added ${n}`); frReqs = frReqs.filter(r => r.c !== b.dataset.frback); frLoop(); renderFriendsPage(); }, frFail));
  el.querySelectorAll("[data-frign]").forEach(b => b.onclick = () => frIgnore(b.dataset.frign).then(() => { frReqs = frReqs.filter(r => r.uid !== b.dataset.frign); paintFriendsLive(); }, frFail));
}
let frReqs = [];
const frFail = e => toast(e && e.message === "permission" ? "Firebase said no. Re-publish its rules (FIREBASE-SETUP.md)." : (e && e.message) || "No signal? Try again.");
TOOL_PAGES.friends = root => { frMapFitted = false; renderFriendsPage(root); };
function renderFriendsPage(root = $("#pageview")){
  if (!root || !(ui.view === "tools" && ui.sub === "friends")) return;
  const f = frState(), cfg = frCfg();
  const add = cfg ? `<button class="crumb fr-addbtn" type="button" id="fr-open">${icon("plus","i s")}Add friend</button>` : "";
  let html = hero({title:"Friends", sub:"See your mates on the map and choose who sees you", back:["#tools", "Tools"], action:add}) + `<div class="page friends">`;
  if (!cfg){ root.innerHTML = html + friendsSetupHTML() + `</div>`; return; }
  const list = Object.entries(f.list).sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
  html += `<div id="fr-alerts"></div>
    <div class="block"><h2>Your friends</h2>${list.length ? list.map(([uid, x]) => `<div class="fr-row" data-frgo="${esc(uid)}" role="button" tabindex="0">
      <span data-frav="${esc(uid)}" data-size="40">${frAvatar(uid, 40)}</span>
      <div><b>${esc(x.n)}</b><div class="note" data-frloc="${esc(uid)}">${esc(frLocText(uid))}</div></div>
      <button class="pill" type="button" data-frshare="${esc(uid)}" aria-pressed="${x.share}" aria-label="${x.share ? `${esc(x.n)} can see you. Tap to hide` : `${esc(x.n)} can’t see you. Tap to share`}">${x.share ? "Sees you" : "Hidden"}</button></div>`).join("")
      : `<p class="note">No friends yet. Tap <b>Add friend</b> at the top, send your code to your mates, or type theirs.</p>`}</div>
    <div class="block"><div class="sect" style="margin:0 0 8px"><h2>Map</h2><button class="btn small" type="button" id="fr-all">${icon("fit","i s")}Everyone</button></div>
      <div id="frMap" class="frmap" role="application" aria-label="Map of your friends"></div>
      <p class="note fr-st" id="fr-status"></p></div>
    <div class="block"><h2>Split costs</h2><div id="fr-split" class="split"><p class="note">Loading…</p></div></div>
    <div class="block"><h2>Play</h2><div class="fr-game"><span class="fr-game-ic">✊✋✌️</span><div><b>Rock Paper Scissors</b><div class="note">Live against a friend, best of as many rounds as the bus ride lasts.</div></div></div>
      ${list.length ? `<div class="flags" style="margin-top:8px">${list.map(([uid, x]) => `<button class="chip soft" type="button" data-frplay="${esc(uid)}">${frAvatar(uid, 20)} ${esc(x.n)}</button>`).join("")}</div>` : `<p class="note">Add a friend to play.</p>`}</div>
  </div>`;
  root.innerHTML = html;
  initFriendsMap();
  paintFriendsLive();
  $("#fr-open").onclick = openFriendSheet;
  $("#fr-all").onclick = () => frFitAll();
  root.querySelectorAll("[data-frgo]").forEach(r => { const go = () => frFlyTo(r.dataset.frgo); r.onclick = e => { if (!e.target.closest("[data-frshare]")) go(); }; r.onkeydown = e => { if (e.key === "Enter") go(); }; });
  root.querySelectorAll("[data-frshare]").forEach(b => b.onclick = e => { e.stopPropagation(); const uid = b.dataset.frshare; frSetShare(uid, !f.list[uid].share).then(() => renderFriendsPage(root), frFail); });
  root.querySelectorAll(".fr-game ~ .flags [data-frplay]").forEach(b => b.onclick = () => openRps(b.dataset.frplay));
  frMe().then(() => frRequests()).then(rs => { frReqs = rs; paintFriendsLive(); }).catch(() => {});
  frLoadPhotos(true).then(paintFriendsLive).catch(() => {});
  frSplitPaint();
  frLoop();
}

/* ---------- the Add friend sheet: you, your code, adding, removing, and the developer bits ---------- */
function openFriendSheet(){
  const f = frState(), list = Object.entries(f.list).sort((a, b) => (a[1].at || 0) - (b[1].at || 0)), dev = S.dev === true;
  openSheet(`<div class="sheet-head"><div><h2 id="fr-sheet-t">Add friend</h2><div class="note">You, your code, and who’s on your list</div></div>
      <button class="icon-btn" data-close aria-label="Close">${icon("x")}</button></div>
    <div class="friends">
    <div class="block"><h2>You</h2>
      <div class="row" style="gap:10px;align-items:center"><span data-frav="${esc(frMyId())}" data-size="44">${frAvatar(frMyId(), 44)}</span>
        <label class="field" style="flex:1;margin:0">Your name (what friends see)<input id="fr-name" type="text" maxlength="30" autocomplete="nickname" value="${esc(f.name)}" placeholder="Your name"></label></div>
      <div class="fr-code"><div><div class="note">Your friend code</div><b id="fr-code">${esc(f.code || "……")}</b></div><button class="btn small" type="button" id="fr-sharecode">${icon("share","i s")}Send it</button></div>
      <button class="switch" type="button" id="fr-on" aria-pressed="${f.on}"><i></i>Share my location</button>
      <p class="note fr-st" id="fr-status"></p>
      <p class="note">Your position goes only to friends marked “Sees you”, only while the app is open, through Google’s Firebase. Turning this off deletes your last position.</p></div>
    <div class="block"><h2>Add a friend</h2><div class="row"><input class="sp-in" id="fr-add" type="text" maxlength="8" autocapitalize="characters" autocomplete="off" placeholder="Their 6-letter code" aria-label="Friend code"><button class="btn small primary" type="button" id="fr-addb">Add</button></div></div>
    ${list.length ? `<div class="block"><h2>On your list</h2>${list.map(([uid, x]) => `<div class="fr-row"><span data-frav="${esc(uid)}" data-size="36">${frAvatar(uid, 36)}</span><div><b>${esc(x.n)}</b></div>
      ${dev && frAdmin ? `<label class="btn small fr-photo">${icon("camera","i s")}Photo<input type="file" accept="image/*" data-frphoto="${esc(uid)}" hidden></label>` : ""}
      <button class="icon-btn" type="button" data-frrm="${esc(uid)}" aria-label="Remove ${esc(x.n)}">${icon("x","i s")}</button></div>`).join("")}</div>` : ""}
    ${dev ? `<div class="block"><h2>Developer</h2><div id="fr-dev"><p class="note">Checking…</p></div></div>` : ""}
    </div>`, "fr-sheet-t");
  const sheet = $("#sheetRoot");
  paintFriendsLive();
  frMe().then(me => { const c = $("#fr-code"); if (c) c.textContent = me.code; }).catch(frFail);
  $("#fr-name").onchange = e => { f.name = e.target.value.trim().slice(0, 30); persist(); frMe().catch(frFail); };
  $("#fr-sharecode").onclick = async () => {
    const me = await frMe().catch(frFail); if (!me) return;
    const text = `Add me on the trip app: my friend code is ${me.code} (Tools › Friends › Add friend).`;
    try { if (navigator.share){ await navigator.share({text}); return; } } catch(e){ return; }
    try { await navigator.clipboard.writeText(text); toast("Copied"); } catch(e){ toast(text); }
  };
  $("#fr-on").onclick = () => {
    if (!f.on && !f.name){ toast("Add your name first, so friends know it’s you"); $("#fr-name").focus(); return; }
    frSetOn(!f.on).then(() => { const b = $("#fr-on"); if (b) b.setAttribute("aria-pressed", f.on); paintFriendsLive(); renderFriendsPage(); }, frFail);
  };
  const add = () => { const v = $("#fr-add").value; if (!v.trim()) return; frAdd(v).then(n => { toast(`Added ${n}`); frLoop(); renderFriendsPage(); openFriendSheet(); }, frFail); };
  $("#fr-addb").onclick = add;
  $("#fr-add").onkeydown = e => { if (e.key === "Enter"){ e.preventDefault(); add(); } };
  sheet.querySelectorAll("[data-frrm]").forEach(b => b.onclick = () => { const uid = b.dataset.frrm; if (!confirm(`Remove ${f.list[uid].n}? You stop seeing each other unless you add them again.`)) return; frRemove(uid).then(() => { renderFriendsPage(); openFriendSheet(); }, frFail); });
  sheet.querySelectorAll("[data-frphoto]").forEach(inp => inp.onchange = async () => {
    const file = inp.files && inp.files[0]; if (!file) return;
    try { await frSetPhoto(inp.dataset.frphoto, await frResizePhoto(file)); toast("Photo saved: everyone sees it"); paintFriendsLive(); drawFriends(); renderFriendsPage(); openFriendSheet(); } catch(e){ frFail(e); }
  });
  if (dev) paintDev();
}
async function paintDev(){
  const el = $("#fr-dev"); if (!el) return;
  try { await frCheckAdmin(); } catch(e){ el.innerHTML = `<p class="note">Couldn’t check (no signal?).</p>`; return; }
  const any = await frDb("GET", `admins/${frMyId()}`).catch(() => null);
  el.innerHTML = frAdmin
    ? `<p class="note">This phone is the developer: you can set everyone’s photo (Photo buttons above). Your own photo:</p>
       <label class="btn small fr-photo">${icon("camera","i s")}My photo<input type="file" accept="image/*" data-frphoto="${esc(frMyId())}" hidden></label>`
    : `<p class="note">Make this phone the developer. Only the first phone to do this gets it, and the database refuses everyone else after that.</p>
       <button class="btn small primary" type="button" id="fr-claim">Make this phone the developer</button>`;
  const cl = $("#fr-claim"); if (cl) cl.onclick = () => frClaimAdmin().then(() => { toast("This phone is the developer"); openFriendSheet(); }, e => toast(e.message === "permission" ? "Another phone is already the developer" : "No signal? Try again."));
  el.querySelectorAll("[data-frphoto]").forEach(inp => inp.onchange = async () => {
    const file = inp.files && inp.files[0]; if (!file) return;
    try { await frSetPhoto(inp.dataset.frphoto, await frResizePhoto(file)); toast("Photo saved"); openFriendSheet(); renderFriendsPage(); } catch(e){ frFail(e); }
  });
  void any;
}
// developer mode: tap "About the data" in Settings 7 times (only changes this phone)
let frDevTaps = 0, frDevTimer = null;
if (typeof document !== "undefined" && document.addEventListener) document.addEventListener("click", e => {
  if (!e.target || !e.target.closest || !e.target.closest("#aboutData h2")) return;
  frDevTaps++; clearTimeout(frDevTimer); frDevTimer = setTimeout(() => { frDevTaps = 0; }, 2500);
  if (frDevTaps >= 7){ frDevTaps = 0; S.dev = !(S.dev === true); persist(); toast(S.dev ? "Developer mode on (this phone only)" : "Developer mode off"); }
});

/* ---------- Rock Paper Scissors, live between two friends ----------
   games/{a_b} (the two IDs, sorted) {g:"rps", round:n, r:{n:{uid:"rock"|"paper"|"scissors"}}}. Only the two players can read it.
   Each phone shows the other's pick only once both have picked; a round ends a few seconds after both picks are in. */
const RPS = {rock:"✊", paper:"✋", scissors:"✌️"};
const rpsBeats = {rock:"scissors", paper:"rock", scissors:"paper"};
const rpsRoom = (a, b) => [a, b].sort().join("_");
function rpsScore(g, me, them){
  const r = (g && g.r) || {}; let mine = 0, theirs = 0;
  for (const k of Object.keys(r)){ const a = r[k][me], b = r[k][them]; if (!a || !b || a === b) continue; if (rpsBeats[a] === b) mine++; else theirs++; }
  return [mine, theirs];
}
let rpsStop = null;
async function openRps(them){
  const me = await frMe().catch(frFail); if (!me) return;
  const room = rpsRoom(me.uid, them), f = frState();
  frDb("DELETE", `invites/${me.uid}/${them}`).catch(() => {}); delete frInvites[them];
  frDb("PUT", `invites/${them}/${me.uid}`, {g:"rps", n:f.name || "A friend", t:{".sv":"timestamp"}}).catch(() => {});
  const g0 = await frDb("GET", `games/${room}`).catch(() => null);
  if (!g0 || !g0.round) await frDb("PUT", `games/${room}`, {g:"rps", round:1}).catch(frFail);
  openSheet(`<div class="sheet-head"><div><h2 id="rps-t">Rock Paper Scissors</h2><div class="note">You vs ${esc(frNameOf(them))}</div></div><button class="icon-btn" data-close aria-label="Close">${icon("x")}</button></div>
    <div class="rps" id="rpsBox">
      <div class="rps-score"><div>${frAvatar(me.uid, 44)}<b id="rps-me">0</b><small>You</small></div><div class="rps-round" id="rps-round">Round 1</div><div>${frAvatar(them, 44)}<b id="rps-them">0</b><small>${esc(frNameOf(them))}</small></div></div>
      <div class="rps-stage"><span class="hand me" id="rps-hme">✊</span><span class="vs">vs</span><span class="hand them" id="rps-hthem">✊</span></div>
      <p class="rps-msg" id="rps-msg">Pick one</p>
      <div class="rps-pick">${Object.entries(RPS).map(([k, e]) => `<button type="button" data-rps="${k}"><span>${e}</span><small>${k[0].toUpperCase() + k.slice(1)}</small></button>`).join("")}</div>
      <p class="note">${esc(frNameOf(them))} gets an invite next time their app checks. Picks stay hidden until you’ve both chosen.</p>
    </div>`, "rps-t");
  let g = g0, shown = 0, nextT = null;
  const paint = () => {
    const box = $("#rpsBox"); if (!box){ if (rpsStop) rpsStop(); rpsStop = null; clearTimeout(nextT); return; }
    const round = (g && g.round) || 1, cur = ((g && g.r) || {})[round] || {}, mine = cur[me.uid], theirs = cur[them];
    const [a, b] = rpsScore({r:Object.fromEntries(Object.entries((g && g.r) || {}).filter(([k]) => +k < round || (cur[me.uid] && cur[them] && +k === round)))}, me.uid, them);
    $("#rps-me").textContent = a; $("#rps-them").textContent = b; $("#rps-round").textContent = `Round ${round}`;
    box.querySelectorAll("[data-rps]").forEach(x => { x.disabled = !!mine; x.classList.toggle("on", x.dataset.rps === mine); });
    const hm = $("#rps-hme"), ht = $("#rps-hthem"), msg = $("#rps-msg");
    if (mine && theirs){
      if (shown !== round){
        shown = round; hm.textContent = ht.textContent = "✊"; box.classList.add("shake"); msg.textContent = "Rock… paper… scissors…";
        setTimeout(() => {
          box.classList.remove("shake"); hm.textContent = RPS[mine]; ht.textContent = RPS[theirs];
          msg.textContent = mine === theirs ? "Draw!" : rpsBeats[mine] === theirs ? "You win! 🎉" : `${frNameOf(them)} wins`;
          msg.className = "rps-msg " + (mine === theirs ? "" : rpsBeats[mine] === theirs ? "good" : "bad");
          clearTimeout(nextT); nextT = setTimeout(() => { if ($("#rpsBox") && g.round === round) frDb("PUT", `games/${room}/round`, round + 1).catch(() => {}); }, 2600);
        }, 900);
      }
    } else {
      hm.textContent = mine ? RPS[mine] : "✊"; ht.textContent = "✊"; msg.className = "rps-msg";
      msg.textContent = mine ? (theirs ? "" : `Waiting for ${frNameOf(them)}…`) : theirs ? `${frNameOf(them)} has picked. Your turn!` : "Pick one";
    }
  };
  $("#rpsBox").querySelectorAll("[data-rps]").forEach(b => b.onclick = () => {
    const round = (g && g.round) || 1;
    if ((((g && g.r) || {})[round] || {})[me.uid]) return;
    g = frSetIn(g, `r/${round}/${me.uid}`, b.dataset.rps); paint();
    frDb("PUT", `games/${room}/r/${round}/${me.uid}`, b.dataset.rps).catch(frFail);
  });
  paint();
  if (rpsStop) rpsStop();
  rpsStop = frListen(`games/${room}`, v => { g = v || {g:"rps", round:1}; paint(); });
}

/* ---------- live split costs on the Friends page (the same groups as Tools › Split costs) ---------- */
async function frSplitPaint(){
  const box = $("#fr-split"); if (!box) return;
  await liveListGroups().catch(() => {});
  const sp = splitData(), groups = liveGroupsCached();
  const gid = groups.some(g => g.id === sp.cur) ? sp.cur : (groups[0] || {}).id;
  const m = gid ? await liveSplitModel(gid).catch(() => null) : null;
  if (!$("#fr-split")) return;
  if (!m){
    box.innerHTML = (splitUi.newGroup ? newGroupHTML() : `<p class="note">Start a live tally with your friends: anyone in it adds what they paid and who it was for, and everyone’s phone shows who owes whom.</p>
      <button class="btn small primary" type="button" id="sp-newg">+ Live group</button>`);
    bindSplit(box, {people:[], items:[], live:true}, frSplitPaint);
    return;
  }
  box.innerHTML = splitSectionHTML(m, groups, true, {embedded:true});
  bindSplit(box, m, frSplitPaint);
  // follow this group live: a payment a friend adds appears here straight away (not while you're typing)
  if (frSplitGid !== gid){
    if (frSplitStop) frSplitStop();
    frSplitGid = gid;
    let first = true;
    frSplitStop = frListen(`groups/${gid}`, v => {
      if (!$("#fr-split")){ frSplitStop(); frSplitStop = null; frSplitGid = ""; return; }
      if (first){ first = false; return; }
      if (v) liveKeep(gid, {n:v.n || "Group", members:v.members || {}, items:v.items || {}});
      const busy = document.activeElement && $("#fr-split").contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
      if (!busy) frSplitPaint();
    });
  }
}
let frSplitStop = null, frSplitGid = "";

// start quietly: friends show on the map once it's ready
if (typeof window !== "undefined" && frCfg()) setTimeout(frLoop, 4000);

/* ---------- live split groups: one tally the whole group adds to (Split costs) ----------
   groups/{gid} {n, members:{uid:name}, items:{id:{w,a,c,by,to:{uid:true},t,s,add}}}   mygroups/{uid}/{gid} name
   Only members can read or write a group (firebase/database.rules.json). The last copy of each group is kept on the phone,
   so the tally still shows with no signal. */
const LIVE_KEY = "live-groups-v1";
const liveSplitReady = () => !!frCfg();
const liveStore = () => lsGet(LIVE_KEY, {}) || {};
const liveGroupsCached = () => Object.entries(liveStore()).map(([id, g]) => ({id, n:g.n || "Group"})).sort((a, b) => a.n.localeCompare(b.n));
const liveNewId = () => { const b = new Uint32Array(3); crypto.getRandomValues(b); return "g" + [...b].map(x => x.toString(36)).join("").slice(0, 14); };
function liveKeep(id, g){ const st = liveStore(); if (g) st[id] = Object.assign({}, g, {at:frNow()}); else delete st[id]; lsSet(LIVE_KEY, st); }
async function liveCreateGroup(name, friendUids){
  const f = frState(), me = await frMe(), id = liveNewId(), nm = String(name).slice(0, 30);
  await frDb("PUT", `groups/${id}/members/${me.uid}`, f.name || "Me");          // the first member creates the group
  await frDb("PUT", `groups/${id}/n`, nm);
  await frDb("PUT", `mygroups/${me.uid}/${id}`, nm);
  for (const uid of friendUids) await liveAddMember(id, uid, nm);
  await liveFetch(id);
  return id;
}
async function liveAddMember(id, uid, groupName){
  const f = frState(), fr = f.list[uid]; if (!fr) throw new Error("Add them as a friend first");
  const n = groupName || (liveStore()[id] || {}).n || "Group";
  await frDb("PUT", `groups/${id}/members/${uid}`, fr.n);
  await frDb("PUT", `mygroups/${uid}/${id}`, n);
  await liveFetch(id).catch(() => {});
}
// the groups this phone is in (other people can add you to theirs)
async function liveListGroups(){
  const me = await frMe(), mine = await frDb("GET", `mygroups/${me.uid}`) || {}, st = liveStore();
  Object.entries(mine).forEach(([id, n]) => { if (!st[id]) st[id] = {n:String(n || "Group"), members:{}, items:{}}; });
  Object.keys(st).forEach(id => { if (!mine[id]) delete st[id]; });          // removed from a group: it goes
  lsSet(LIVE_KEY, st);
  return liveGroupsCached();
}
async function liveFetch(id){
  const g = await frDb("GET", `groups/${id}`);
  if (!g){ liveKeep(id, null); return null; }
  liveKeep(id, {n:g.n || "Group", members:g.members || {}, items:g.items || {}});
  return liveStore()[id];
}
// the same shape the Split page uses for this phone's tally, but stored in the group
async function liveSplitModel(id){
  let g = liveStore()[id], stale = "";
  try { g = await liveFetch(id) || null; } catch(e){ if (e.status === 401 || e.status === 403){ liveKeep(id, null); throw e; } stale = g && g.at ? frAgo(g.at) : "earlier"; }
  if (!g) throw new Error("gone");
  const me = (frAuthSaved() || {}).uid, people = Object.keys(g.members || {}).sort((a, b) => (a === me ? -1 : b === me ? 1 : String(g.members[a]).localeCompare(g.members[b])));
  const names = Object.assign({}, g.members);
  const items = Object.entries(g.items || {}).map(([iid, x]) => ({id:iid, w:x.w, a:+x.a, c:x.c, by:x.by, to:Object.keys(x.to || {}), t:x.t, s:x.s ? 1 : 0, add:x.add}));
  const f = frState(), addable = Object.entries(f.list).filter(([uid]) => !names[uid]);
  const write = async x => { await frDb("PUT", `groups/${id}/items/${x.id}`, x); };
  return {live:true, id, title:g.n || "Group", me, people, name:p => names[p] || "Someone", items, addable, stale,
    add:async ({what, amount, cur, by, to}) => {
      const a = parseFloat(String(amount).replace(/[, ]/g, ""));
      if (!isFinite(a) || a <= 0) return "Type how much it cost";
      if (a > 1e9) return "That amount looks wrong";
      if (!people.includes(by)) return "Pick who paid";
      const who = (to || []).filter(p => people.includes(p)); if (!who.length) return "Pick who it was for";
      await write({id:splitId(), w:String(what || "").trim().slice(0, 60) || "Payment", a:r2(a), c:cur, by, to:Object.fromEntries(who.map(p => [p, true])), t:{".sv":"timestamp"}, add:me});
      return "";
    },
    paid:async (from, to, gbp) => { const c = splitLocal(); await write({id:splitId(), w:"Paid back", a:r2(gbp * rate(c)), c, by:from, to:{[to]:true}, t:{".sv":"timestamp"}, s:1, add:me}); },
    del:async iid => { await frDb("DELETE", `groups/${id}/items/${iid}`); }};
}
// while the Split page is open, check the group list and the shown group every 15 seconds and redraw when something changed
let liveTimer = null;
function liveSplitRefresh(root){
  clearTimeout(liveTimer);
  liveTimer = setTimeout(async () => {
    if (!root.isConnected || ui.view !== "tools" || !/^split/.test(ui.sub || "") || document.hidden){ return; }
    const before = JSON.stringify(liveStore());
    try { await liveListGroups(); const cur = splitData().cur; if (cur) await liveFetch(cur); } catch(e){}
    const busy = document.activeElement && root.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
    if (JSON.stringify(liveStore()) !== before && !busy) TOOL_PAGES.split(root, ""); else liveSplitRefresh(root);
  }, 15e3);
}
