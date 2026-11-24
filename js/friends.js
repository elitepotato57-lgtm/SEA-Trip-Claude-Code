/* ============================================================
   67-friends: your mates on a map, who sees you, live split costs and games, all on Tools › Friends.
   Uses a free Firebase project (Realtime Database + anonymous sign-in, Spark plan, no card), talked to over its plain web
   address (REST, and its live "event stream" for games), so there is no extra library. config.js has
     window.SEA_FIREBASE = {apiKey:"…", databaseURL:"https://….firebasedatabase.app"};
   Who can read what is enforced by the database's rules (firebase/database.rules.json; tests/fakefirebase.js copies them).
   Data:  users/{uid} {n,c}   codes/{CODE} uid   requests/{uid}/{from} {n,c}   share/{uid}/{friend} true   loc/{uid} {lat,lng,acc,t}
          photos/{uid} small JPEG (only the developer phone can set them)   admins/{uid} true   invites/{uid}/{from} {g,n,t,p}
          parties/{pid} and tally/{uid} (the games: js/games.js)   msgs/{uid}/{id} (stickers)   groups/… and mygroups/… (live split, at the bottom)
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
  let es = null, timer = null, backup = null, stop = false, data, seen = "";
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
      es.addEventListener("cancel", () => { es.close(); es = null; poll(); });
      // no stream here, or the server closed it: check every 1.2 s instead
      es.onerror = () => { if (es && (!got || es.readyState === 2)){ es.close(); es = null; poll(); } };
      // and a slow check alongside the stream, in case a phone's stream goes quiet without saying so
      backup = setInterval(async () => { if (es && !stop) try { emit(await frDb("GET", path)); } catch(e){} }, 4000);
    } catch(e){ poll(); }
  };
  open();
  return () => { stop = true; if (es) es.close(); clearTimeout(timer); clearInterval(backup); };
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
  await frDb("PUT", `requests/${uid}/${me.uid}`, {n:f.name || "A friend", c:f.code, t:frNow()});      // so they can add you back in one tap
  if (f.removed) delete f.removed[uid];
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
// removing someone: they stop seeing you, their old "added you" doesn't come back, and they leave the map and lists on this phone.
// It only changes your phone (and what you share); if they add you again later, you're asked as usual.
async function frRemove(uid){
  const f = frState();
  const at = (f.list[uid] || {}).at || 0;
  delete f.list[uid]; delete frLocs[uid];
  f.removed = f.removed || {}; f.removed[uid] = frNow();
  persist();
  if (frMarkers[uid]){ frMarkers[uid].remove(); delete frMarkers[uid]; }
  const me = await frMe();
  await Promise.all([frDb("DELETE", `share/${me.uid}/${uid}`), frDb("DELETE", `requests/${me.uid}/${uid}`), frDb("DELETE", `pallow/${me.uid}/${uid}`)].map(p => p.catch(() => {})));
  drawFriends();
  return at;
}
async function frSetOn(on){
  const f = frState(); f.on = !!on; persist();
  if (on){ await frMe(); frGpsStart(); frSendNow(true).catch(() => {}); frLoop(); }
  else { frGpsStop(); frLast = null; const a = frAuthSaved(); if (a) await frDb("DELETE", `loc/${a.uid}`).catch(() => {}); }       // stop: your last position is removed
}
async function frRequests(){
  const me = await frMe(), r = await frDb("GET", `requests/${me.uid}`) || {}, f = frState();
  const gone = f.removed || {};
  return Object.entries(r).filter(([uid, v]) => !f.list[uid] && !(gone[uid] && !(v && v.t > gone[uid]))).map(([uid, v]) => ({uid, n:(v && v.n) || "A friend", c:v && v.c}));
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
// the face: a photo you chose for them on this phone first, then the one the developer set for everyone, then initials
function frAvatar(uid, size = 36, name){
  const p = (frState().list[uid] || {}).pic || frPhotos[uid], n = name || frNameOf(uid);
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
let frAdmin = null, frOwner = null;
// the owner (owner/: Dylan's phone, claimed once by a developer) is the only phone that can delete a split group or take someone out
async function frCheckAdmin(){
  const me = await frMe();
  frAdmin = (await frDb("GET", `admins/${me.uid}`).catch(() => null)) === true;
  frOwner = await frDb("GET", "owner").catch(() => null);
  return frAdmin;
}
const frIsOwner = () => !!frOwner && frOwner === frMyId();
async function frClaimOwner(){ const me = await frMe(); await frDb("PUT", "owner", me.uid); frOwner = me.uid; return true; }
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
    if (typeof geoKeep === "function") geoKeep(p.coords);
    frHere = {lat:p.coords.latitude, lng:p.coords.longitude, acc:p.coords.accuracy, at:frNow()}; frGpsErr = "";
    frSendNow(false).catch(() => {}); paintFriendsLive();
  }, e => { frGpsErr = e && e.code === 1 ? "denied" : "unavailable"; paintFriendsLive(); }, {enableHighAccuracy:true, maximumAge:30e3, timeout:30e3});
}
function frGpsStop(){ if (frGpsId != null && navigator.geolocation) navigator.geolocation.clearWatch(frGpsId); frGpsId = null; }
// FOR TESTING (Dylan's request): while a pretend location is set in Settings › Testing, that is what friends see.
// Otherwise it's the phone's own GPS.
const frTesting = () => typeof locStatus !== "undefined" && locStatus === "test" && typeof userLoc !== "undefined" && !!userLoc;
const frMeHere = () => frTesting() ? userLoc : frHere || (typeof userLoc !== "undefined" && userLoc && locStatus === "ok" ? userLoc : null);
// sends your position at most once a minute unless you've moved 40 m
async function frSendNow(force, here, status){
  if (here === undefined){ here = frMeHere(); status = here ? "ok" : locStatus; }
  const f = frState();
  if (!frCfg() || !f.on || !here || !Object.values(f.list).some(x => x.share)) return false;
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
  if (frTesting() && frLast) return {ok:true, t:`Sharing your pretend test location (${S.testLoc}) with ${n} ${n === 1 ? "friend" : "friends"} · sent ${frAgo(frLast.at)}. Turn it off in Settings › Testing.`};
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
  try { const me = frMyId(); if (me) frGotInvites(await frDb("GET", `invites/${me}`)); } catch(e){}
  frDevSync().catch(() => {});
  frLoadPhotos().catch(() => {});
  try {
    const me = frMyId();
    if (me){
      const got = await frDb("GET", `msgs/${me}`) || {};
      frMsgs = got;
      frMsgPopup();
      frSosCheck().catch(() => {});
    }
  } catch(e){}
  // someone added you to a live split group while Friends is open: show it
  if ($("#fr-split")){
    const before = liveGroupsCached().map(g => g.id).join();
    await liveListGroups().catch(() => {});
    const busy = document.activeElement && $("#fr-split").contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
    if (!busy && (liveGroupsCached().map(g => g.id).join() !== before || !frSplitGid)) frSplitPaint();
  }
  drawFriends(); paintFriendsLive();
}
// a game invite: asks straight away (Play / Not now) unless you're already playing them; it also stays at the top of Friends
let frInvStop = null, frInvFor = "";
function frGotInvites(v){
  frInvites = v && typeof v === "object" ? v : {};
  const fresh = Object.entries(frInvites).filter(([uid, x]) => x && x.t > frInviteSeen && frState().list[uid]);
  if (!fresh.length) return;
  frInviteSeen = Math.max(...fresh.map(([, x]) => x.t)); lsSet("fr-inv-seen", frInviteSeen);
  const [uid, inv] = fresh.sort((a, b) => a[1].t - b[1].t)[fresh.length - 1];
  if (typeof gmInvited === "function") gmInvited(uid, inv);
  paintFriendsLive();
}
function frListenInvites(){
  const me = frMyId(); if (!me || frInvFor === me) return;
  if (frInvStop) frInvStop();
  frInvFor = me; frInvStop = frListen(`invites/${me}`, frGotInvites);
}
function frLoop(){
  clearTimeout(frTimer);
  if (!frCfg() || document.hidden) return;
  const f = frState();
  if (!Object.keys(f.list).length && !f.on) return;
  if (f.on) frGpsStart();
  frListenInvites();
  Promise.allSettled([frSendNow(false), frPoll(), gkSync(), statFlush()]).finally(() => { frTimer = setTimeout(frLoop, FR_POLL_MS); });
}
if (typeof document !== "undefined" && document.addEventListener) document.addEventListener("visibilitychange", () => { if (!document.hidden) frLoop(); else { clearTimeout(frTimer); frGpsStop(); } });

/* ---------- friends on the main map (Essentials › Friends, first in the row) ---------- */
const frAgo = t => { const m = Math.round((frNow() - t) / 60e3); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
const frMarkers = {};
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
const frTapToast = uid => { const w = frLocs[uid], me = frMeHere(); if (w && isFinite(w.lat)) toast(`${frNameOf(uid)}: seen ${frAgo(w.t)}${me ? `, ${distShort(dist(me, w))} away` : ""}`); };
const frOnMap = () => typeof ui !== "undefined" && ui.mapFriends === true;
function drawFriends(){
  if (typeof map === "undefined" || !map) return;
  if (frOnMap()) frDrawOn(map, frMarkers, uid => { frFlyTo(uid); });
  else Object.keys(frMarkers).forEach(uid => { frMarkers[uid].remove(); delete frMarkers[uid]; });
}
// glide (zooming out and back in, not a jump) to a view with you and everyone you can see
function frFitAll(){
  if (!map) return;
  const pts = Object.keys(frState().list).map(uid => frLocs[uid]).filter(v => v && isFinite(v.lat)), me = frMeHere();
  if (me) pts.push(me);
  if (!pts.length){ toast("No friends are sharing a location right now"); return; }
  if (pts.length === 1){ map.flyTo({center:[pts[0].lng, pts[0].lat], zoom:15, duration:2400, curve:1.5, essential:true}); return; }
  const cam = map.cameraForBounds([[Math.min(...pts.map(p => p.lng)), Math.min(...pts.map(p => p.lat))], [Math.max(...pts.map(p => p.lng)), Math.max(...pts.map(p => p.lat))]],
    {padding:{top:170, bottom:90, left:50, right:70}, maxZoom:16});
  if (cam) map.flyTo(Object.assign(cam, {duration:2800, curve:1.5, essential:true}));
}
// glide to show you and one friend together
function frFlyTo(uid){
  const v = frLocs[uid];
  if (!v || !isFinite(v.lat)){ toast(v && v.hidden ? `${frNameOf(uid)} isn’t sharing with you` : `${frNameOf(uid)} hasn’t sent a location yet`); return; }
  if (!map) return;
  const me = frMeHere();
  if (!me) map.flyTo({center:[v.lng, v.lat], zoom:15, duration:2600, curve:1.5, essential:true});
  else {
    const cam = map.cameraForBounds([[Math.min(me.lng, v.lng), Math.min(me.lat, v.lat)], [Math.max(me.lng, v.lng), Math.max(me.lat, v.lat)]], {padding:{top:170, bottom:90, left:60, right:70}, maxZoom:16});
    if (cam) map.flyTo(Object.assign(cam, {duration:2800, curve:1.5, essential:true}));
  }
  frTapToast(uid);
}
// Friends › Map (or tapping a friend): the normal map showing just your friends (tap All for places again),
// starting on you, then gliding to them
function openFriendsMap(uid){
  ui.mapFriends = true; ui.essOpen = true; ui.mapMode = "map"; ui.mapSel = null; ui.mapSurf = false; ui.mapSaved = false;
  ui.mapCats = new Set(); ui.essKinds.clear(); if (typeof mapRun !== "undefined") mapRun.stash = null;
  go("#map");
  const run = () => {
    const me = frMeHere();
    if (me) map.jumpTo({center:[me.lng, me.lat], zoom:Math.max(map.getZoom(), 15)});
    drawFriends();
    setTimeout(() => { if (uid) frFlyTo(uid); else frFitAll(); }, 450);
  };
  const wait = (n = 0) => { if (!map) return n < 60 && setTimeout(() => wait(n + 1), 100); if (mapLoaded || map.loaded()) run(); else map.once("load", run); };
  wait();
  frPoll().catch(() => {});
}

/* ---------- the Friends page ----------
   Top: whether you're sharing (one big switch) and your friends (face, name, where, whether they see you).
   Then three ways in: Map (the normal map with friends on), Split costs and Play, each full screen.
   Your name, code, adding, renaming and the developer bits live behind the green Add friend button. */
function friendsSetupHTML(){
  return `<div class="callout">${icon("info")}<div><b>Friends needs switching on once.</b> It uses a free Firebase project (Google’s, no card needed) so phones can see each other.
    Dylan sets it up and adds its two settings to <code>config.js</code> on GitHub: about 10 minutes, step by step in <code>FIREBASE-SETUP.md</code>. Everyone gets it after that.</div></div>`;
}
function frLocText(uid){
  const v = frLocs[uid], me = frMeHere();
  return !v ? "Checking…" : v.hidden ? "Not sharing with you" : v.none ? "Not sharing right now (their switch is off, or their app is closed)" : v.err ? "Couldn’t check (no signal?)"
    : `Seen ${frAgo(v.t)}${me ? ` · ${distShort(dist(me, v))} away` : ""}`;
}
function paintFriendsLive(){
  if (typeof document === "undefined" || !document.querySelector) return;
  document.querySelectorAll("[data-frloc]").forEach(el => el.textContent = frLocText(el.dataset.frloc));
  document.querySelectorAll("[data-frav]").forEach(el => el.innerHTML = frAvatar(el.dataset.frav, +el.dataset.size || 40));
  const s = frSendStatus();
  document.querySelectorAll(".fr-status").forEach(st => { st.textContent = s.t; st.classList.toggle("good", s.ok); });
  document.querySelectorAll("[data-fron]").forEach(b => b.setAttribute("aria-pressed", frState().on));
  const al = $("#fr-alerts"); if (al) paintFrAlerts(al);
}
function paintFrAlerts(el){
  const inv = Object.entries(frInvites).filter(([uid, v]) => v && v.p && frState().list[uid] && typeof GAMES !== "undefined" && GAMES[v.g]);
  el.innerHTML = inv.map(([uid, v]) => `<div class="callout fr-alert">${frAvatar(uid, 32)}<div><b>${esc(frNameOf(uid))}</b> wants to play ${esc(GAMES[v.g].n)}</div><button class="btn small primary" type="button" data-frplay="${esc(v.p)}">Play</button></div>`).join("")
    + (frReqs || []).map(r => `<div class="callout fr-alert">${frAvatar(r.uid, 32, r.n)}<div><b>${esc(r.n)}</b> added you</div><button class="btn small primary" type="button" data-frback="${esc(r.c || "")}">Add back</button><button class="icon-btn" type="button" data-frign="${esc(r.uid)}" aria-label="Ignore ${esc(r.n)}">${icon("x","i s")}</button></div>`).join("");
  el.querySelectorAll("[data-frplay]").forEach(b => b.onclick = () => openParty(b.dataset.frplay));
  el.querySelectorAll("[data-frback]").forEach(b => b.onclick = () => frAdd(b.dataset.frback).then(n => { toast(`Added ${n}`); frReqs = frReqs.filter(r => r.c !== b.dataset.frback); frLoop(); renderFriendsPage(); }, frFail));
  el.querySelectorAll("[data-frign]").forEach(b => b.onclick = () => frIgnore(b.dataset.frign).then(() => { frReqs = frReqs.filter(r => r.uid !== b.dataset.frign); paintFriendsLive(); }, frFail));
}
let frReqs = [];
const frFail = e => toast(e && e.message === "permission" ? "Firebase said no. Re-publish its rules (FIREBASE-SETUP.md)." : (e && e.message) || "No signal? Try again.");
// the big "Share my location" switch (on the page and in the sheet)
function frToggleOn(){
  const f = frState();
  if (!f.on && !f.name){ toast("Add your name first, so friends know it’s you"); openFriendSheet(); setTimeout(() => { const n = $("#sheetRoot #fr-name"); if (n) n.focus(); }, 300); return; }
  if (!f.on && !Object.values(f.list).some(x => x.share)) toast("Sharing is on. Friends marked “Sees you” will see you.");
  frSetOn(!f.on).then(() => { paintFriendsLive(); }, frFail);
}
const frShareHTML = () => `<button class="switch fr-bigswitch" type="button" data-fron aria-pressed="${frState().on}"><i></i>Share my location</button><p class="note fr-st fr-status"></p>`;
TOOL_PAGES.friends = root => renderFriendsPage(root);
function renderFriendsPage(root = $("#pageview")){
  if (!root || !(ui.view === "tools" && ui.sub === "friends")) return;
  const f = frState(), cfg = frCfg();
  const add = cfg && f.name ? `<button class="crumb fr-addbtn" type="button" id="fr-open">${icon("plus","i s")}Add friend</button>` : "";
  let html = hero({title:"Friends", sub:"See your mates on the map and choose who sees you", back:["#tools", "Tools"], action:add}) + `<div class="page friends">`;
  if (!cfg){ root.innerHTML = html + friendsSetupHTML() + `</div>`; return; }
  if (!f.name){
    root.innerHTML = html + `<div class="block fr-namefirst"><h2>First, your name</h2><p class="note">This is what your mates see. You only do this once (you can rename people on your own phone later).</p>
      <input class="sp-in fr-bigin" id="fr-firstname" type="text" maxlength="30" autocomplete="nickname" placeholder="Your name" aria-label="Your name">
      <button class="btn primary wide" type="button" id="fr-firstgo" style="margin-top:12px">Continue</button></div></div>`;
    const go = () => {
      const n = $("#fr-firstname").value.trim().replace(/\s+/g, " ").slice(0, 30);
      if (!n){ toast("Type your name first"); $("#fr-firstname").focus(); return; }
      f.name = n; persist(); frMe().catch(frFail); renderFriendsPage(root);
    };
    $("#fr-firstgo").onclick = go;
    $("#fr-firstname").onkeydown = e => { if (e.key === "Enter"){ e.preventDefault(); go(); } };
    return;
  }
  const list = Object.entries(f.list).sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
  html += `<div id="fr-alerts"></div>
    <div class="block">${frShareHTML()}</div>
    ${frSosHTML()}
    <div class="block"><h2>Your friends</h2>${list.length ? list.map(([uid, x]) => `<div class="fr-row" data-frgo="${esc(uid)}" role="button" tabindex="0">
      <span data-frav="${esc(uid)}" data-size="40">${frAvatar(uid, 40)}</span>
      <div><b>${esc(x.n)}</b><div class="note" data-frloc="${esc(uid)}">${esc(frLocText(uid))}</div>
        <button class="linkish fr-msgbtn" type="button" data-frmsg="${esc(uid)}">${icon("spark","i xs")}Send a message</button></div>
      <button class="icon-btn fr-edit" type="button" data-fredit="${esc(uid)}" aria-label="Edit ${esc(x.n)}’s name and photo">${icon("edit","i s")}</button>
      <button class="icon-btn fr-edit" type="button" data-frrmrow="${esc(uid)}" aria-label="Remove ${esc(x.n)}">${icon("trash","i s")}</button>
      <button class="pill" type="button" data-frshare="${esc(uid)}" aria-pressed="${x.share}" aria-label="${x.share ? `${esc(x.n)} can see you. Tap to hide` : `${esc(x.n)} can’t see you. Tap to share`}">${x.share ? "Sees you" : "Hidden"}</button></div>`).join("")
      : `<p class="note">No friends yet. Tap <b>Add friend</b> at the top, send your code to your mates, or type theirs.</p>`}</div>
    <div class="tgrid fr-tiles">
      <a class="tool" href="#map" id="fr-go-map"><span class="ti">${icon("map")}</span><span><b>Map</b><small>See everyone on the map</small></span></a>
      <a class="tool alt" href="#tools/friends-split"><span class="ti">${icon("cash")}</span><span><b>Split costs</b><small>Who owes who</small></span></a>
      <a class="tool" href="#tools/friends-play"><span class="ti">${icon("spark")}</span><span><b>Play</b><small>Five games and the Trip tally</small></span></a>
    </div></div>`;
  root.innerHTML = html;
  paintFriendsLive();
  $("#fr-open").onclick = openFriendSheet;
  frSosBind(root);
  root.querySelectorAll("[data-fron]").forEach(b => b.onclick = frToggleOn);
  $("#fr-go-map").onclick = e => { e.preventDefault(); openFriendsMap(); };
  root.querySelectorAll("[data-frmsg]").forEach(b => b.onclick = e => { e.stopPropagation(); openStickerPicker(b.dataset.frmsg); });
  root.querySelectorAll("[data-fredit]").forEach(b => b.onclick = e => { e.stopPropagation(); openFriendEdit(b.dataset.fredit); });
  root.querySelectorAll("[data-frrmrow]").forEach(b => b.onclick = async e => {
    e.stopPropagation(); const uid = b.dataset.frrmrow, x = frState().list[uid]; if (!x) return;
    if (!(await askConfirm(`Remove ${x.n}? They stop seeing you and leave your list. They can only come back if one of you adds the other again.`, "Remove", true))) return;
    frRemove(uid).then(() => { toast(`Removed ${x.n}`); renderFriendsPage(); }, frFail);
  });
  root.querySelectorAll("[data-frgo]").forEach(r => { const go = () => openFriendsMap(r.dataset.frgo); r.onclick = e => { if (!e.target.closest("[data-frshare], [data-frmsg], [data-fredit]")) go(); }; r.onkeydown = e => { if (e.key === "Enter") go(); }; });
  root.querySelectorAll("[data-frshare]").forEach(b => b.onclick = e => { e.stopPropagation(); const uid = b.dataset.frshare; frSetShare(uid, !f.list[uid].share).then(() => renderFriendsPage(root), frFail); });
  frMe().then(() => frRequests()).then(rs => { frReqs = rs; paintFriendsLive(); }).catch(() => {});
  frLoadPhotos(true).then(paintFriendsLive).catch(() => {});
  frLoop();
}
// Friends › Split costs, full screen
TOOL_PAGES["friends-split"] = root => {
  if (!frCfg()){ root.innerHTML = hero({title:"Split costs", back:["#tools/friends", "Friends"]}) + `<div class="page">${friendsSetupHTML()}</div>`; return; }
  root.innerHTML = hero({title:"Split costs", sub:"What you owe your mates, and what they owe you", back:["#tools/friends", "Friends"]}) + `<div class="page"><div id="fr-split" class="split"><p class="note">Loading…</p></div></div>`;
  frSplitPaint(); frLoop();
};
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
      ${frShareHTML()}
      <p class="note">Your position goes only to friends marked “Sees you”, only while the app is open, through Google’s Firebase. Turning this off deletes your last position.</p></div>
    <div class="block"><h2>Add a friend</h2><div class="row"><input class="sp-in" id="fr-add" type="text" maxlength="8" autocapitalize="characters" autocomplete="off" placeholder="Their 6-letter code" aria-label="Friend code"><button class="btn small primary" type="button" id="fr-addb">Add</button></div></div>
    ${list.length ? `<div class="block"><h2>On your list</h2>${list.map(([uid, x]) => `<div class="fr-row"><span data-frav="${esc(uid)}" data-size="36">${frAvatar(uid, 36)}</span><div><b>${esc(x.n)}</b></div>
      <button class="icon-btn" type="button" data-fredit="${esc(uid)}" aria-label="Edit ${esc(x.n)}’s name and photo">${icon("edit","i s")}</button>
      <button class="icon-btn" type="button" data-frrm="${esc(uid)}" aria-label="Remove ${esc(x.n)}">${icon("x","i s")}</button></div>`).join("")}</div>` : ""}
    ${dev ? `<p class="note">Developer tools (stickers, developers, Design Lab) are at the bottom of Tools.</p>` : ""}
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
  sheet.querySelectorAll("[data-fron]").forEach(b => b.onclick = frToggleOn);
  sheet.querySelectorAll("[data-fredit]").forEach(b => b.onclick = () => openFriendEdit(b.dataset.fredit));
  const add = () => { const v = $("#fr-add").value; if (!v.trim()) return; frAdd(v).then(n => { toast(`Added ${n}`); frLoop(); renderFriendsPage(); openFriendSheet(); }, frFail); };
  $("#fr-addb").onclick = add;
  $("#fr-add").onkeydown = e => { if (e.key === "Enter"){ e.preventDefault(); add(); } };
  sheet.querySelectorAll("[data-frrm]").forEach(b => b.onclick = async () => { const uid = b.dataset.frrm; if (!(await askConfirm(`Remove ${f.list[uid].n}? You stop seeing each other unless you add them again.`, "Remove", true))) return; frRemove(uid).then(() => { renderFriendsPage(); openFriendSheet(); }, frFail); });
}
/* ---------- editing a friend: the name and photo you see for them (only on your phone) ---------- */
function openFriendEdit(uid){
  const f = frState(), x = f.list[uid]; if (!x) return;
  openSheet(`<div class="sheet-head"><div><h2 id="fre-t">Edit ${esc(x.n)}</h2><div class="note">Only changes what you see, on your phone</div></div>
      <button class="icon-btn" data-close aria-label="Close">${icon("x")}</button></div>
    <div class="friends"><div class="block fr-editbox">
      <div class="fr-editav"><span id="fre-av">${frAvatar(uid, 88)}</span>
        <div class="fr-editpics"><label class="btn small fr-photo">${icon("camera","i s")}<span id="fre-picl">${x.pic ? "Change photo" : "Choose a photo"}</span><input type="file" accept="image/*" id="fre-pic" hidden></label>
          <button class="btn small" type="button" id="fre-unpic" ${x.pic ? "" : "hidden"}>Remove photo</button></div></div>
      <label class="field">Name<input id="fre-name" type="text" maxlength="30" autocomplete="off" value="${esc(x.n)}" aria-label="Name for this friend"></label>
      <button class="btn primary wide" type="button" id="fre-save" style="margin-top:12px">Save</button>
      <button class="btn wide fr-rmbtn" type="button" id="fre-rm" style="margin-top:8px">${icon("x","i s")}Remove ${esc(x.n)}</button>
    </div></div>`, "fre-t");
  let pic = x.pic || "";
  const showAv = () => {
    const was = x.pic; if (pic) x.pic = pic; else delete x.pic;
    $("#fre-av").innerHTML = frAvatar(uid, 88);
    if (was) x.pic = was; else delete x.pic;
    $("#fre-unpic").hidden = !pic; $("#fre-picl").textContent = pic ? "Change photo" : "Choose a photo";
  };
  $("#fre-pic").onchange = async e => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    try { const c = await frCropPhoto(file); if (c){ pic = c; showAv(); } } catch(err){ toast("Couldn’t read that picture"); }
  };
  $("#fre-unpic").onclick = () => { pic = ""; showAv(); };
  const save = () => {
    const n = $("#fre-name").value.trim().replace(/\s+/g, " ").slice(0, 30);
    if (!n){ toast("Type a name"); $("#fre-name").focus(); return; }
    x.n = n; if (pic) x.pic = pic; else delete x.pic; persist();
    closeDetail(); toast("Saved on your phone"); renderFriendsPage(); drawFriends();
  };
  $("#fre-save").onclick = save;
  $("#fre-name").onkeydown = e => { if (e.key === "Enter"){ e.preventDefault(); save(); } };
  $("#fre-rm").onclick = async () => { if (!(await askConfirm(`Remove ${x.n}? You stop seeing each other unless you add them again.`, "Remove", true))) return; frRemove(uid).then(() => { closeDetail(); renderFriendsPage(); }, frFail); };
}

/* ---------- Tools › Developer (only on phones where ELITE POTATO was typed): Design Lab, stickers, developers, everyone's photos ---------- */
TOOL_PAGES.developer = root => {
  if (S.dev !== true){ go("#tools"); return; }
  const labOn = S.design && S.design.on === true;
  root.innerHTML = hero({title:"Developer", sub:"Only on this phone. Type ELITE POTATO in the map search again to hide it", back:["#tools", "Tools"]}) + `<div class="page friends dev">
    <div class="block"><h2>Design Lab</h2><p class="note">The floating panel for trying colours, fonts and sizes. Hidden for everyone else.</p>
      <div class="row" style="margin-top:8px;gap:8px;flex-wrap:wrap"><button class="switch" type="button" id="dev-lab" aria-pressed="${labOn}"><i></i>Show the Design Lab</button>
      ${labOn ? `<button class="btn small" type="button" id="dev-openlab">${icon("palette","i s")}Open it</button>` : ""}</div></div>
    ${frCfg() ? `<div id="fr-dev"><div class="block"><p class="note">Checking…</p></div></div>` : `<div class="block"><h2>Stickers and developers</h2>${friendsSetupHTML()}</div>`}
    ${expList().length ? `<div class="block" id="dev-exp"><h2>Experiments</h2><p class="note">Changes to try out on this phone only. All off for everyone else. Switch one on, look around, switch it off to compare.</p>
      ${expList().map(x => `<div class="fr-row exp-row"><div><b>${esc(x.n)}</b><div class="note">${esc(x.d)}</div></div><button class="switch" type="button" data-exp="${esc(x.id)}" aria-pressed="${exp(x.id)}" aria-label="${esc(x.n)}"><i></i></button></div>`).join("")}</div>` : ""}
    <div class="block"><button class="btn small" type="button" id="dev-off">Turn developer mode off on this phone</button></div></div>`;
  root.querySelectorAll("[data-exp]").forEach(b => b.onclick = () => { const on = !exp(b.dataset.exp); expSet(b.dataset.exp, on); b.setAttribute("aria-pressed", on); toast(on ? "On, on this phone only" : "Off"); });
  $("#dev-lab").onclick = () => { S.design.on = S.design.on !== true; persist(); if (!S.design.on) closeLab(); renderLabButton(); renderPage(); };
  const ol = $("#dev-openlab"); if (ol) ol.onclick = () => openLab();
  $("#dev-off").onclick = () => { S.dev = false; persist(); closeLab(); renderLabButton(); toast("Developer mode off"); go("#tools"); };
  if (frCfg()) paintDev();
};
async function paintDev(){
  const el = $("#fr-dev"); if (!el) return;
  try { await frCheckAdmin(); } catch(e){ el.innerHTML = `<div class="block"><p class="note">Couldn’t check (no signal?).</p></div>`; return; }
  if (!$("#fr-dev")) return;
  if (!frAdmin){
    el.innerHTML = `<div class="block"><h2>Make this phone a developer</h2><p class="note">Developers can add message stickers, choose other developers and set everyone’s photo. Only the first phone can claim it; after that a developer has to add you.</p>
      <button class="btn small primary" type="button" id="fr-claim">Make this phone the developer</button></div>`;
    $("#fr-claim").onclick = () => frClaimAdmin().then(() => { toast("This phone is a developer"); paintDev(); }, e => toast(e.message === "permission" ? "There’s already a developer: ask them to add you" : "No signal? Try again."));
    return;
  }
  await frLoadStickers(true).catch(() => {});
  await frLoadPhotos(true).catch(() => {});
  const fl = Object.entries(frState().list).sort((a, b) => (a[1].at || 0) - (b[1].at || 0)), me = frMyId();
  const devs = {}; await Promise.all(fl.map(async ([uid]) => { devs[uid] = (await frDb("GET", `admins/${uid}`).catch(() => null)) === true; }));
  if (!$("#fr-dev")) return;
  // the shared face (not your own photo of them)
  const sharedAv = uid => { const x = frState().list[uid], keep = x && x.pic; if (keep) delete x.pic; const h = frAvatar(uid, 40); if (keep) x.pic = keep; return h; };
  el.innerHTML = `<div id="fr-dev2"><div class="block"><p class="note">Loading Google sharing and usage…</p></div></div><div class="block"><h2>Message stickers</h2>
      <p class="note">Pictures your mates send each other. Tap a name to change it: it’s what people see when they open the message (“Sam sent you: Cooked”). Kept in Firebase, not on the public website.</p>
      <div class="fr-stickers">${Object.entries(frStickers).map(([id, st]) => `<div class="fr-stk" data-stk="${esc(id)}">${st.d ? `<img src="${esc(st.d)}" alt="">` : ""}<input class="sp-in fr-stkname" type="text" maxlength="30" value="${esc(st.n)}" data-stkname="${esc(id)}" aria-label="Name of this sticker" enterkeyhint="done">
        <div class="fr-stkact"><button class="icon-btn" type="button" data-stkdel="${esc(id)}" aria-label="Delete ${esc(st.n)}">${icon("trash","i s")}</button></div></div>`).join("") || `<p class="note">None yet.</p>`}</div>
      <label class="btn small fr-photo" style="margin-top:10px">${icon("plus","i s")}Add stickers<input type="file" accept="image/*" multiple id="stk-add" hidden></label></div>
    ${frOwner ? "" : `<div class="block"><h2>Owner</h2><p class="note">One phone, Dylan’s, is the owner: the only one that can delete a split-costs group or take someone out of one. It can only be claimed once.</p><button class="btn small" type="button" id="fr-owner">This is Dylan’s phone: make it the owner</button></div>`}
    <div class="block"><h2>Developers</h2><p class="note">Who else can do all this. Switch a friend on to make them a developer.${frIsOwner() ? " This phone is the owner." : ""}</p>
      <div class="fr-row"><span>${frAvatar(me, 36)}</span><div><b>This phone</b><div class="note">Developer</div></div></div>
      ${fl.map(([uid, x]) => `<div class="fr-row"><span>${frAvatar(uid, 36)}</span><div><b>${esc(x.n)}</b></div><button class="switch" type="button" data-mkdev="${esc(uid)}" aria-pressed="${devs[uid]}" aria-label="${esc(x.n)} is a developer"><i></i></button></div>`).join("") || `<p class="note">Add friends first.</p>`}</div>
    <div class="block"><h2>Everyone’s photos</h2><p class="note">The face everyone sees for a person. Anyone can still choose their own photo of a friend with the pencil on Friends.</p>
      ${[[me, {n:"You"}], ...fl].map(([uid, x]) => `<div class="fr-row"><span>${sharedAv(uid)}</span><div><b>${esc(x.n)}</b></div><label class="btn small fr-photo">${icon("camera","i s")}Photo<input type="file" accept="image/*" data-frphoto="${esc(uid)}" hidden></label></div>`).join("")}</div>`;
  paintDevExtras();
  const ow = $("#fr-owner"); if (ow) ow.onclick = async () => { if (!(await askConfirm("Make this phone the owner? Only it will be able to delete split groups. This can’t be moved to another phone later.", "Make owner"))) return; frClaimOwner().then(() => { toast("This phone is the owner"); paintDev(); }, frFail); };
  el.querySelectorAll("[data-frphoto]").forEach(inp => inp.onchange = async () => {
    const file = inp.files && inp.files[0]; if (!file) return;
    try { const c = await frCropPhoto(file); if (!c) return; await frSetPhoto(inp.dataset.frphoto, c); toast("Photo saved: everyone sees it"); paintDev(); drawFriends(); } catch(e){ frFail(e); }
  });
  const sa = $("#stk-add");
  sa.onchange = async () => {
    const files = [...(sa.files || [])]; if (!files.length) return;
    for (const file of files){
      try { const name = file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim().slice(0, 30) || "Sticker"; await frAddSticker(name, await frResizeSticker(file)); toast(`Added ${name}`); }
      catch(e){ frFail(e); }
    }
    paintDev();
  };
  el.querySelectorAll("[data-stkname]").forEach(inp => {
    const id = inp.dataset.stkname;
    const save = () => {
      const st = frStickers[id], n = inp.value.trim().replace(/\s+/g, " ").slice(0, 30);
      if (!st || n === st.n) return;
      if (!n){ inp.value = st.n; return; }
      frRenameSticker(id, n).then(() => toast(`Renamed to ${n}`), e => { inp.value = st.n; frFail(e); });
    };
    inp.onchange = save;
    inp.onkeydown = e => { if (e.key === "Enter"){ e.preventDefault(); inp.blur(); } };
  });
  el.querySelectorAll("[data-stkdel]").forEach(b => b.onclick = async () => { const st = frStickers[b.dataset.stkdel]; if (!(await askConfirm(`Delete the ${st ? st.n : ""} sticker for everyone?`, "Delete", true))) return; frDeleteSticker(b.dataset.stkdel).then(paintDev, frFail); });
  el.querySelectorAll("[data-mkdev]").forEach(b => b.onclick = async () => {
    const uid = b.dataset.mkdev, on = b.getAttribute("aria-pressed") !== "true";
    if (on && !(await askConfirm(`Make ${frNameOf(uid)} a developer? They’ll be able to add stickers, set photos and choose developers.`, "Make developer"))) return;
    (on ? frDb("PUT", `admins/${uid}`, true) : frDb("DELETE", `admins/${uid}`)).then(() => { b.setAttribute("aria-pressed", on); toast(on ? `${frNameOf(uid)} is a developer` : `${frNameOf(uid)} isn’t a developer any more`); }, frFail);
  });
}
/* A developer made this phone a developer (admins/{uid}): Tools › Developer appears by itself, without typing ELITE POTATO.
   Taken off again: it goes. Only changes developer mode once each way (S.devGranted), so ELITE POTATO still turns it off and on. */
async function frDevSync(){
  if (!frCfg() || !frMyId()) return;
  const v = await frDb("GET", `admins/${frMyId()}`).catch(e => e && e.status ? false : undefined);
  if (v === undefined) return;                                     // no signal: leave things as they are
  const admin = v === true; frAdmin = admin;
  if (admin && !S.devGranted){
    S.devGranted = true; const was = S.dev === true; S.dev = true; persist();
    if (!was){ toast("You’re a developer now: Tools › Developer, at the bottom"); if (ui.view === "tools" && !ui.sub) renderPage(); }
  } else if (!admin && S.devGranted){
    S.devGranted = false; S.dev = false; persist();
    if (typeof closeLab === "function") closeLab(); if (typeof renderLabButton === "function") renderLabButton();
    toast("You’re not a developer any more"); if (ui.view === "tools" && (!ui.sub || ui.sub === "developer")) go("#tools");
  }
}
// developer mode: type ELITE POTATO in the map search (only changes this phone; typing it again turns it off)
function frDevCode(text){
  if (String(text || "").trim().replace(/\s+/g, " ") !== "ELITE POTATO") return false;
  S.dev = !(S.dev === true); persist();
  toast(S.dev ? "Developer mode on: Tools › Developer, at the bottom" : "Developer mode off");
  if (!S.dev && typeof closeLab === "function") closeLab();
  if (typeof renderLabButton === "function") renderLabButton();
  return true;
}

/* ---------- messages: send a friend one of the stickers. On their phone, whatever screen they're on, a popup says
   "Sam sent you a message" (not what it is); Open shows the sticker and its name, then it's gone. ----------
   stickerIndex/{id} name (small, checked often)   stickers/{id} {n, d: small PNG}   msgs/{toUid}/{id} {f: from, s: sticker, t}
   Stickers are added by a developer phone (rules); only signed-in app users can load them, they're not on the public site. */
const FR_STK_KEY = "fr-stickers-v1";
let frStickers = lsGet(FR_STK_KEY, {}) || {}, frStkAt = 0, frMsgs = {};
const frWhen = t => t ? new Date(t).toLocaleString("en-GB", {day:"numeric", month:"short", hour:"2-digit", minute:"2-digit"}) : "";
async function frLoadStickers(force){
  if (!force && frNow() - frStkAt < 5 * 60e3) return frStickers;
  frStkAt = frNow();
  const idx = await frDb("GET", "stickerIndex") || {};
  const next = {};
  for (const [id, n] of Object.entries(idx)){
    if (frStickers[id] && frStickers[id].d){ next[id] = {n:String(n), d:frStickers[id].d}; continue; }
    const st = await frDb("GET", `stickers/${id}`).catch(() => null);
    if (st && st.d) next[id] = {n:String(st.n || n), d:st.d};
  }
  frStickers = next; lsSet(FR_STK_KEY, next);
  return next;
}
// a sticker: at most 320 px, PNG (keeps see-through edges), under about 200 KB
async function frResizeSticker(file){
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    for (const max of [320, 256, 200]){
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const d = c.toDataURL("image/png");
      if (d.length < 280000) return d;
    }
    throw new Error("That picture is too detailed to use as a sticker");
  } finally { URL.revokeObjectURL(url); }
}
async function frAddSticker(name, dataUrl){
  const id = "k" + frNow().toString(36) + Math.random().toString(36).slice(2, 5);
  await frDb("PUT", `stickers/${id}`, {n:name, d:dataUrl});
  await frDb("PUT", `stickerIndex/${id}`, name);
  frStickers[id] = {n:name, d:dataUrl}; lsSet(FR_STK_KEY, frStickers);
  return id;
}
async function frRenameSticker(id, name){
  const st = await frDb("GET", `stickers/${id}`);              // the whole sticker is rewritten (the rules check name and picture together)
  if (st && st.d) await frDb("PUT", `stickers/${id}`, {n:name, d:st.d});
  await frDb("PUT", `stickerIndex/${id}`, name);
  if (frStickers[id]){ frStickers[id].n = name; lsSet(FR_STK_KEY, frStickers); }
}
async function frDeleteSticker(id){
  await frDb("DELETE", `stickerIndex/${id}`); await frDb("DELETE", `stickers/${id}`);
  delete frStickers[id]; lsSet(FR_STK_KEY, frStickers);
}
async function frSendSticker(to, id){
  const me = await frMe();
  const mid = "m" + frNow().toString(36) + Math.random().toString(36).slice(2, 6);
  await frDb("PUT", `msgs/${to}/${mid}`, {f:me.uid, s:id, t:{".sv":"timestamp"}});
  return mid;
}
let frMsgShown = new Set();
function frMsgPopup(){
  if (typeof document === "undefined" || $("#msgRoot")) return;
  if (typeof gmPlaying === "function" && gmPlaying()){                     // mid-game: the popup waits (js/games.js)
    if (!frMsgPopup.held && Object.entries(frMsgs || {}).some(([id, mm]) => mm && mm.f && !frMsgShown.has(id))){ frMsgPopup.held = 1; gmHold("New message", () => { frMsgPopup.held = 0; frMsgPopup(); }); }
    return;
  }
  const next = Object.entries(frMsgs || {}).filter(([id, mm]) => mm && mm.f && !frMsgShown.has(id)).sort((a, b) => (a[1].t || 0) - (b[1].t || 0))[0];
  if (!next) return;
  const [id, mm] = next; frMsgShown.add(id);
  const root = document.createElement("div"); root.id = "msgRoot"; document.body.appendChild(root);
  const close = () => { root.remove(); setTimeout(frMsgPopup, 400); };
  root.innerHTML = `<div class="cfm-wrap msg-wrap"><div class="cfm msg-pop" role="alertdialog" aria-modal="true" aria-labelledby="msg-t">
    <div class="msg-av">${frAvatar(mm.f, 56)}</div><p id="msg-t"><b>${esc(frNameOf(mm.f))}</b> sent you a message</p>
    <div class="row"><button class="btn" type="button" data-msg="later">Later</button><button class="btn primary" type="button" data-msg="open">Open</button></div></div></div>`;
  root.querySelector('[data-msg="later"]').onclick = close;
  root.querySelector('[data-msg="open"]').onclick = async () => {
    const box = root.querySelector(".msg-pop"); box.innerHTML = `<p class="note">Opening…</p>`;
    if (mm.m && typeof meetMsgHTML === "function"){          // a meet-up spot (js/road.js), not a sticker
      box.innerHTML = meetMsgHTML(mm);
      delete frMsgs[id]; frDb("DELETE", `msgs/${frMyId()}/${id}`).catch(() => {});
      box.querySelector('[data-msg="done"]').onclick = close;
      return;
    }
    await frLoadStickers().catch(() => {});
    if (!frStickers[mm.s]) await frLoadStickers(true).catch(() => {});
    const st = frStickers[mm.s];
    box.innerHTML = `<p id="msg-t"><b>${esc(frNameOf(mm.f))}</b> sent you${st ? ":" : " a sticker"}</p>
      ${st && st.d ? `<img class="msg-stk" src="${esc(st.d)}" alt="">` : ""}${st ? `<div class="msg-name">${esc(st.n)}</div>` : `<p class="note">It’s been deleted since.</p>`}
      <div class="note">${esc(frWhen(mm.t))}</div>
      <div class="row"><button class="btn" type="button" data-msg="reply">Send one back</button><button class="btn primary" type="button" data-msg="done">Close</button></div>`;
    delete frMsgs[id]; frDb("DELETE", `msgs/${frMyId()}/${id}`).catch(() => {});
    box.querySelector('[data-msg="done"]').onclick = close;
    box.querySelector('[data-msg="reply"]').onclick = () => { root.remove(); openStickerPicker(mm.f); };
  };
  root.querySelector('[data-msg="open"]').focus();
}
async function openStickerPicker(to){
  openSheet(`<div class="sheet-head"><div><h2 id="stk-t">Message ${esc(frNameOf(to))}</h2><div class="note">Pick one to send</div></div><button class="icon-btn" data-close aria-label="Close">${icon("x")}</button></div>
    <div class="fr-stkpick" id="stk-pick"><p class="note">Loading…</p></div>`, "stk-t");
  await frLoadStickers().catch(() => {});
  const box = $("#stk-pick"); if (!box) return;
  const all = Object.entries(frStickers);
  box.innerHTML = all.length ? all.map(([id, st]) => `<button type="button" class="fr-stkbtn" data-stksend="${esc(id)}"><img src="${esc(st.d)}" alt=""><span>Send ${esc(st.n)}</span></button>`).join("")
    : `<p class="note">No stickers yet. A developer adds them (Tools › Developer).</p>`;
  box.querySelectorAll("[data-stksend]").forEach(b => b.onclick = () => {
    b.disabled = true;
    frSendSticker(to, b.dataset.stksend).then(() => { toast(`Sent ${frStickers[b.dataset.stksend].n} to ${frNameOf(to)}`); $("#sheetRoot").querySelector(".sheet-head [data-close]").click(); }, e => { b.disabled = false; frFail(e); });
  });
}

/* ---------- live split costs on Friends › Split costs (the same groups as Tools › Split costs) ---------- */
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
  if (frAdmin === null) frCheckAdmin().then(a => { if (a && $("#fr-split")) frSplitPaint(); }, () => {});
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
// the developer takes someone out of a group: they lose it from their list, then their place in it
async function liveRemoveMember(id, uid){
  await frDb("DELETE", `mygroups/${uid}/${id}`).catch(() => {});
  await frDb("DELETE", `groups/${id}/members/${uid}`);
  await liveFetch(id).catch(() => {});
}
// delete a live group for everyone (the developer only): its payments, everyone's link to it, then its members (you last)
async function liveDeleteGroup(id){
  const me = await frMe(), g = await frDb("GET", `groups/${id}`) || {};
  await frDb("DELETE", `groups/${id}/n`);           // first, because only the developer may: anyone else stops here with nothing lost
  await Promise.all(Object.keys(g.items || {}).map(iid => frDb("DELETE", `groups/${id}/items/${iid}`)));
  const others = Object.keys(g.members || {}).filter(uid => uid !== me.uid);
  await Promise.all(others.map(uid => frDb("DELETE", `mygroups/${uid}/${id}`).catch(() => {})));
  await Promise.all(others.map(uid => frDb("DELETE", `groups/${id}/members/${uid}`)));
  await frDb("DELETE", `groups/${id}/members/${me.uid}`);
  await frDb("DELETE", `mygroups/${me.uid}/${id}`).catch(() => {});
  liveKeep(id, null);
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
  const names = Object.assign({}, g.members), fl = frState().list;
  Object.keys(names).forEach(uid => { if (fl[uid]) names[uid] = fl[uid].n; });
  if (me) names[me] = "You";
  const items = Object.entries(g.items || {}).map(([iid, x]) => ({id:iid, w:x.w, a:+x.a, c:x.c, by:x.by, to:Object.keys(x.to || {}), t:x.t, s:x.s ? 1 : 0, add:x.add, ...(x.sh ? {sh:x.sh} : {})}));
  const f = frState(), addable = Object.entries(f.list).filter(([uid]) => !names[uid]);
  const write = async x => { await frDb("PUT", `groups/${id}/items/${x.id}`, x); };
  return {live:true, id, title:g.n || "Group", me, people, name:p => names[p] || "Someone", items, addable, stale,
    add:async ({what, amount, cur, by, to, sh}) => {
      const a = parseFloat(String(amount).replace(/[, ]/g, ""));
      if (!isFinite(a) || a <= 0) return "Type how much it cost";
      if (a > 1e9) return "That amount looks wrong";
      if (!people.includes(by)) return "Pick who paid";
      const who = [...new Set([me].concat(to || []))].filter(p => people.includes(p));
      if (who.length < 2) return "Pick at least one person to split it with";
      let parts = null;
      if (sh){ const r = splitCustom(r2(a), who, sh); if (r.err) return r.err; parts = r.sh; }
      await write({id:splitId(), w:String(what || "").trim().slice(0, 60) || "Payment", a:r2(a), c:cur, by, to:Object.fromEntries(who.map(p => [p, true])), t:{".sv":"timestamp"}, add:me, ...(parts ? {sh:parts} : {})});
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

/* ---------- crop a photo: drag it and pinch or slide to zoom so the face fills the circle ----------
   Used for friends' faces (your own pencil, and the developer's shared photos). Resolves a 128 px JPEG, or null if cancelled. */
function frCropPhoto(file){
  return new Promise(async res => {
    const url = URL.createObjectURL(file), img = new Image();
    try { img.src = url; await img.decode(); } catch(e){ URL.revokeObjectURL(url); toast("Couldn’t read that picture"); res(null); return; }
    const B = 260, W = img.naturalWidth, H = img.naturalHeight, s0 = B / Math.min(W, H);
    let z = 1, k = s0, x = (B - W * k) / 2, y = (B - H * k) / 2;
    const root = document.createElement("div"); root.id = "cropRoot"; document.body.appendChild(root);
    root.innerHTML = `<div class="cfm-wrap"><div class="cfm crop" role="dialog" aria-modal="true" aria-labelledby="crop-t">
      <p id="crop-t"><b>Move and zoom</b> so the face fills the circle</p>
      <div class="crop-box" style="width:${B}px;height:${B}px"><img src="${url}" alt="" draggable="false"><div class="crop-ring" aria-hidden="true"></div></div>
      <label class="field" style="margin-top:10px">Zoom<input type="range" id="crop-z" min="1" max="5" step="0.01" value="1"></label>
      <div class="row"><button class="btn" type="button" data-crop="0">Cancel</button><button class="btn primary" type="button" data-crop="1">Use photo</button></div></div></div>`;
    const box = root.querySelector(".crop-box"), im = box.querySelector("img"), zr = root.querySelector("#crop-z");
    const clamp2 = () => { x = Math.min(0, Math.max(B - W * k, x)); y = Math.min(0, Math.max(B - H * k, y)); };
    const draw = () => { clamp2(); im.style.width = W * k + "px"; im.style.height = H * k + "px"; im.style.transform = `translate(${x}px,${y}px)`; };
    const zoomTo = (nz, cx = B / 2, cy = B / 2) => { nz = Math.min(5, Math.max(1, nz)); const ix = (cx - x) / k, iy = (cy - y) / k; z = nz; k = s0 * z; x = cx - ix * k; y = cy - iy * k; zr.value = z; draw(); };
    const pts = new Map(); let pinch = null;
    box.onpointerdown = e => { box.setPointerCapture(e.pointerId); pts.set(e.pointerId, {x:e.clientX, y:e.clientY}); if (pts.size === 2){ const [a, b] = [...pts.values()]; pinch = {d:Math.hypot(a.x - b.x, a.y - b.y), z}; } };
    box.onpointermove = e => {
      const p = pts.get(e.pointerId); if (!p) return;
      if (pts.size === 1){ x += e.clientX - p.x; y += e.clientY - p.y; draw(); }
      pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
      if (pts.size === 2 && pinch){ const [a, b] = [...pts.values()], r = box.getBoundingClientRect(); zoomTo(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); }
    };
    box.onpointerup = box.onpointercancel = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
    box.onwheel = e => { e.preventDefault(); const r = box.getBoundingClientRect(); zoomTo(z * (e.deltaY < 0 ? 1.1 : 0.9), e.clientX - r.left, e.clientY - r.top); };
    zr.oninput = () => zoomTo(+zr.value);
    draw();
    const done = v => { root.remove(); URL.revokeObjectURL(url); res(v); };
    root.querySelector('[data-crop="0"]').onclick = () => done(null);
    root.querySelector('[data-crop="1"]').onclick = () => {
      const c = document.createElement("canvas"); c.width = c.height = 128;
      c.getContext("2d").drawImage(img, -x / k, -y / k, B / k, B / k, 0, 0, 128, 128);
      done(c.toDataURL("image/jpeg", 0.82));
    };
  });
}

/* ---------- "I'm lost": one tap alerts every friend, with your position, your number and the group call link ----------
   phones/{uid} your number, readable only by the friends you allow (pallow/{uid}/{friend} true); sos/{to}/{from} {t,n,lat,lng,cl}.
   A web app can't ring several phones at once, so the alert pops up on every friend's phone (any screen, like messages) with
   Call (your number), Join the group call (a WhatsApp or FaceTime call link you saved) and Show on the map. */
const FR_SOS_SEEN = "fr-sos-seen";
const frCallLinkOk = s => /^https:\/\/(call\.whatsapp\.com|facetime\.apple\.com|meet\.google\.com|chat\.whatsapp\.com)\//.test(s || "");
const frPhoneClean = s => String(s || "").replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "").slice(0, 16);
async function frSavePhone(num, link){
  const f = frState(), me = await frMe();
  const n = frPhoneClean(num);
  if (num && !/^\+\d{7,15}$/.test(n)) throw new Error("Type your number with the country code, like +44 7700 900123");
  if (link && !frCallLinkOk(link)) throw new Error("That isn’t a WhatsApp, FaceTime or Google Meet call link");
  f.phone = n; f.callLink = link || ""; persist();
  if (n) await frDb("PUT", `phones/${me.uid}`, n); else await frDb("DELETE", `phones/${me.uid}`).catch(() => {});
  await frAllowPhone();
}
// every friend may read your number (and only them)
async function frAllowPhone(){
  const f = frState(), me = await frMe();
  await Promise.all(Object.keys(f.list).map(uid => frDb("PUT", `pallow/${me.uid}/${uid}`, true).catch(() => {})));
}
async function frPhoneOf(uid){ try { return await frDb("GET", `phones/${uid}`); } catch(e){ return null; } }
// sends the alert to every friend; resolves how many it reached
/* Experiment lost-share: the alert only pops up on phones with the app open, so after sending, the phone's share sheet opens
   too, with "I'm lost, I'm here: <Google Maps link>" ready for WhatsApp (a WhatsApp button as well, if the share sheet can't open). */
EXPERIMENTS.push({id:"lost-share", n:"I’m lost: also share to WhatsApp", d:"After the alert, the share sheet opens with “I’m lost, I’m here: <map link>”; the note no longer promises a pop-up on closed apps."});
let frSosHere = null;
const frSosText = here => `I’m lost, I’m here: ${here ? `https://www.google.com/maps/search/?api=1&query=${here.lat.toFixed(5)},${here.lng.toFixed(5)}` : "(no location yet)"}`;
async function frSosShare(here){
  const text = frSosText(here);
  try { if (navigator.share){ await navigator.share({text}); return true; } } catch(e){ if (e && e.name === "AbortError") return true; }
  return false;
}
async function frSosSend(){
  const f = frState(), me = await frMe(), ids = Object.keys(f.list);
  if (!ids.length) throw new Error("Add your mates in Friends first");
  await frAllowPhone().catch(() => {});
  let here = frMeHere();
  if (!here && typeof geoFresh === "function" && geoFresh()) here = geoFresh();
  if (!here && typeof navigator !== "undefined" && navigator.geolocation) here = await new Promise(r => navigator.geolocation.getCurrentPosition(p => r({lat:p.coords.latitude, lng:p.coords.longitude}), () => r(null), {enableHighAccuracy:true, timeout:8000, maximumAge:60e3}));
  const body = {t:{".sv":"timestamp"}, n:f.name || "A friend", ...(here ? {lat:+here.lat.toFixed(5), lng:+here.lng.toFixed(5)} : {}), ...(f.callLink ? {cl:f.callLink} : {})};
  frSosHere = here || null;
  const r = await Promise.allSettled(ids.map(uid => frDb("PUT", `sos/${uid}/${me.uid}`, body)));
  return r.filter(x => x.status === "fulfilled").length;
}
const frSosShown = new Set();
async function frSosCheck(){
  const me = frMyId(); if (!me || typeof document === "undefined") return;
  const got = await frDb("GET", `sos/${me}`).catch(() => null) || {}, seen = lsGet(FR_SOS_SEEN, {}) || {};
  const fresh = Object.entries(got).filter(([uid, x]) => x && x.t && x.t > (seen[uid] || 0) && frNow() - x.t < 6 * 3600e3 && !frSosShown.has(uid + x.t));
  for (const [uid, x] of fresh){ frSosShown.add(uid + x.t); frSosPopup(uid, x); }
}
async function frSosPopup(uid, x){
  const num = await frPhoneOf(uid), root = document.createElement("div"); root.className = "sosRoot"; document.body.appendChild(root);
  const who = frState().list[uid] ? frNameOf(uid) : x.n;
  const close = () => { root.remove(); const seen = lsGet(FR_SOS_SEEN, {}) || {}; seen[uid] = x.t; lsSet(FR_SOS_SEEN, seen); frDb("DELETE", `sos/${frMyId()}/${uid}`).catch(() => {}); };
  root.innerHTML = `<div class="cfm-wrap msg-wrap"><div class="cfm msg-pop sos-pop" role="alertdialog" aria-modal="true" aria-labelledby="sos-t">
    <div class="msg-av">${frAvatar(uid, 56)}</div><p id="sos-t"><b>${esc(who)} is lost</b> and wants a call</p>
    <div class="note">${esc(frWhen(x.t))}</div>
    <div class="sos-acts">
      ${x.cl ? `<a class="btn primary" href="${esc(x.cl)}" target="_blank" rel="noopener">${icon("users","i s")}Join the group call</a>` : ""}
      ${num ? `<a class="btn ${x.cl ? "" : "primary"}" href="tel:${esc(num)}">${icon("phone","i s")}Call ${esc(who)}</a>` : `<p class="note">They haven’t saved their number in Friends.</p>`}
      ${isFinite(x.lat) ? `<button class="btn" type="button" data-sos="map">${icon("map","i s")}Show on the map</button>` : ""}
      <button class="btn" type="button" data-sos="ok">Close</button></div></div></div>`;
  root.querySelector('[data-sos="ok"]').onclick = close;
  const m = root.querySelector('[data-sos="map"]');
  if (m) m.onclick = () => { close(); frLocs[uid] = {lat:x.lat, lng:x.lng, t:x.t}; openFriendsMap(uid); };
}
// the "I'm lost" block on Friends: your number, the group call link, and the big button
function frSosHTML(){
  const f = frState();
  return `<div class="block sos-block"><h2>${icon("alert","i s")}I’m lost</h2>
    <p class="note">One tap sends an alert to all your mates with where you are, a button to call you and your group call link. It pops up straight away on phones with the app open; others see it when they next open it, so a WhatsApp message with your location goes too.</p>
    <button class="btn danger wide" type="button" id="fr-sos">${icon("alert","i s")}I’m lost: alert everyone</button>
    <details class="more" style="margin-top:10px"><summary>${f.phone ? "Your number and group call" : "Set up: your number and a group call link"}</summary>
      <label class="field" style="margin-top:8px">Your phone number (with country code)<input id="fr-phone" type="tel" autocomplete="tel" placeholder="+44 7700 900123" value="${esc(f.phone || "")}"></label>
      <label class="field">Group call link (optional)<input id="fr-clink" type="url" placeholder="https://call.whatsapp.com/…" value="${esc(f.callLink || "")}"></label>
      <p class="note">To call everyone at once: in WhatsApp, open Calls › Create call link, copy it and paste it here (one of you does it, then everyone pastes the same link). Everyone taps <b>Join the group call</b> on the alert. Only your friends can see your number.</p>
      <button class="btn small" type="button" id="fr-phonesave">Save</button></details>
    <div id="fr-calls"></div></div>`;
}
function frSosBind(root){
  const s = root.querySelector("#fr-sos"); if (!s) return;
  root.querySelector("#fr-phonesave").onclick = () => frSavePhone(root.querySelector("#fr-phone").value, root.querySelector("#fr-clink").value.trim())
    .then(() => toast("Saved: your friends can call you from an alert"), e => toast(e.message === "permission" ? "Firebase refused it: re-publish the rules (FIREBASE-SETUP.md)" : e.message || "No signal? Try again"));
  s.onclick = async () => {
    if (!(await askConfirm("Send an “I’m lost” alert to all your friends, with where you are?", "Send alert", true))) return;
    s.disabled = true;
    try {
      const n = await frSosSend(); toast(`Alert sent to ${n} ${n === 1 ? "friend" : "friends"}`);
      frSosShare(frSosHere);        // the share sheet; the WhatsApp button below is there if it can't open
      // and your own quick-dial list, in case they don't see it
      const f = frState(), rows = await Promise.all(Object.keys(f.list).map(async uid => [uid, await frPhoneOf(uid)]));
      const box = root.querySelector("#fr-calls");
      if (box) box.innerHTML = `<a class="btn wide" style="margin-top:12px" href="https://wa.me/?text=${enc(frSosText(frSosHere))}" target="_blank" rel="noopener" id="fr-soswa">${icon("send","i s")}Send my location on WhatsApp</a>` + `<h3 style="margin-top:12px">Call them</h3>${f.callLink ? `<a class="btn primary wide" href="${esc(f.callLink)}" target="_blank" rel="noopener">${icon("users","i s")}Start the group call</a>` : ""}
        ${rows.map(([uid, num]) => `<div class="fr-row"><span>${frAvatar(uid, 32)}</span><div><b>${esc(frNameOf(uid))}</b></div>${num ? `<a class="btn small" href="tel:${esc(num)}">${icon("phone","i s")}Call</a>` : `<span class="note">no number saved</span>`}</div>`).join("")}`;
    } catch(e){ toast(e.message === "permission" ? "Firebase refused it: re-publish the rules (FIREBASE-SETUP.md)" : e.message || "No signal? Try again"); }
    s.disabled = false;
  };
}

/* ---------- the Google key, shared by the developer with the friends they pick ----------
   gkey: the key (only approved phones and developers can read it)   gkeyok/{uid} true (set by a developer)
   gkeyask/{uid} {n,t}: "can I have Google photos?"   The key is kept on the phone (gkey-shared) and used by googleKey()
   when the phone has none of its own. A phone that's taken off the list drops it at the next check. */
const GK_SHARED = "gkey-shared";
let gkShareAt = 0;
async function gkSync(force){
  if (!frCfg() || (!force && frNow() - gkShareAt < 10 * 60e3)) return;
  gkShareAt = frNow();
  try {
    const k = await frDb("GET", "gkey");
    const had = lsGet(GK_SHARED, "");
    if (typeof k === "string" && k) { if (k !== had){ lsSet(GK_SHARED, k); if (typeof gReady !== "undefined") gReady = null; } }
    else if (had) lsSet(GK_SHARED, "");
  } catch(e){ if (e.status === 401 || e.status === 403){ if (lsGet(GK_SHARED, "")) lsSet(GK_SHARED, ""); } }
}
async function gkAsk(){
  const me = await frMe();
  await frDb("PUT", `gkeyask/${me.uid}`, {n:frState().name || "A friend", t:{".sv":"timestamp"}});
}
async function gkShareKey(key){ await frDb("PUT", "gkey", String(key).trim()); }
async function gkApprove(uid, on){
  if (on){ await frDb("PUT", `gkeyok/${uid}`, true); await frDb("DELETE", `gkeyask/${uid}`).catch(() => {}); }
  else await frDb("DELETE", `gkeyok/${uid}`);
}

/* ---------- what's used, and by whom (for the developer: will Google need paying for?) ----------
   stats/{uid} {n, d:{YYYY-MM-DD:{photo,details,vision,"v-map":3,…}}}: each phone writes its own; only developers read them.
   Counted on the phone and sent with the friends check, at most every 2 minutes. Nothing personal: counts only. */
const ST_KEY = "usage-stats";
function statBump(k){
  if (typeof lsGet !== "function") return;
  k = String(k).replace(/[.#$/\[\]]/g, "-").slice(0, 40);
  const st = lsGet(ST_KEY, {}) || {}, d = todayISO();
  st[d] = st[d] || {}; st[d][k] = (st[d][k] || 0) + 1; st._dirty = 1;
  Object.keys(st).filter(x => /^\d{4}-/.test(x)).sort().slice(0, -14).forEach(x => delete st[x]);      // two weeks kept on the phone
  lsSet(ST_KEY, st);
}
let statAt = 0;
async function statFlush(){
  const st = lsGet(ST_KEY, {}) || {};
  if (!st._dirty || !frCfg() || frNow() - statAt < 120e3) return;
  statAt = frNow();
  const me = await frMe(), days = Object.keys(st).filter(x => /^\d{4}-/.test(x)).sort().slice(-3);
  await frDb("PUT", `stats/${me.uid}/n`, frState().name || "Someone");
  for (const d of days) await frDb("PUT", `stats/${me.uid}/d/${d}`, st[d]);
  delete st._dirty; lsSet(ST_KEY, st);
}
// totals per person over the last n days: {uid:{n, photo, details, vision, views:{feature:count}}}
function statSum(all, n = 7){
  const from = isFinite(n) ? new Date(Date.now() - (n - 1) * 864e5).toISOString().slice(0, 10) : "", out = {};
  for (const [uid, x] of Object.entries(all || {})){
    const o = out[uid] = {n:x.n || "Someone", photo:0, details:0, vision:0, views:{}};
    for (const [d, c] of Object.entries(x.d || {})) if (d >= from) for (const [k, v] of Object.entries(c || {})){
      if (k in o && k !== "n" && k !== "views") o[k] += v; else if (/^v-/.test(k)) o.views[k.slice(2)] = (o.views[k.slice(2)] || 0) + v;
    }
  }
  return out;
}
// the period the developer page shows: today, the last 7 days, the last month or all time
const STAT_PERIODS = [["1", "Today", 1], ["7", "Last 7 days", 7], ["30", "Last month", 30], ["all", "All time", Infinity]];
let statPeriod = "7";
const STAT_NAMES = {map:"Map", gaffs:"Gaffs", munch:"Munch", activities:"Activities", tools:"Tools", saved:"Saved", discover:"Discover"};
const statName = k => STAT_NAMES[k] || k.replace(/^tools-/, "").replace(/-/g, " ").replace(/^./, c => c.toUpperCase());
async function paintDevExtras(){
  const el = $("#fr-dev2"); if (!el) return;
  let all = null, asks = {}, oks = {}, keyOn = false;
  try {
    [all, asks, oks] = await Promise.all([frDb("GET", "stats"), frDb("GET", "gkeyask"), frDb("GET", "gkeyok")]);
    keyOn = !!(await frDb("GET", "gkey"));
  } catch(e){ el.innerHTML = `<div class="block"><p class="note">${e.message === "permission" ? "Firebase refused: re-publish the rules (FIREBASE-SETUP.md)." : "Couldn’t load (no signal?)."}</p></div>`; return; }
  if (!$("#fr-dev2")) return;
  asks = asks || {}; oks = oks || {};
  const fl = Object.entries(frState().list), mine = googleKey() && realKey(S.gkey || window.SEA_GOOGLE_KEY || "");
  const per = STAT_PERIODS.find(p => p[0] === statPeriod) || STAT_PERIODS[1];
  const sum = statSum(all, per[2]), rows = Object.entries(sum).sort((a, b) => (b[1].photo + b[1].details + b[1].vision) - (a[1].photo + a[1].details + a[1].vision));
  const tot = k => Object.values(sum).reduce((s, x) => s + x[k], 0);
  el.innerHTML = `<div class="block"><h2>Google photos for friends</h2>
      <p class="note">Share this phone’s Google key with the friends you switch on, so they get Google photos without adding a key themselves. The key stays in Firebase (never on the website), and each phone still has its own daily limit (${G_DAILY.photo} photos, ${G_DAILY.details} lookups, ${G_DAILY.vision} camera photos).</p>
      <p class="note" style="color:var(--ink)">${keyOn ? "A key is shared." : "No key shared yet."}</p>
      ${mine ? `<button class="btn small primary" type="button" id="gk-share">${keyOn ? "Share this phone’s key again" : "Share this phone’s key"}</button>` : `<p class="note">Add your key in Settings › Photos from Google on this phone first.</p>`}
      ${keyOn ? `<button class="btn small" type="button" id="gk-unshare">Stop sharing</button>` : ""}
      ${Object.keys(asks).length ? `<h3 style="margin-top:12px">Asking for it</h3>${Object.entries(asks).map(([uid, a]) => `<div class="fr-row"><span>${frAvatar(uid, 32)}</span><div><b>${esc(frState().list[uid] ? frNameOf(uid) : (a && a.n) || "Someone")}</b><div class="note">${esc(frWhen(a && a.t))}</div></div><button class="btn small primary" type="button" data-gkok="${esc(uid)}">Let them</button></div>`).join("")}` : ""}
      <h3 style="margin-top:12px">Who can use it</h3>
      ${fl.map(([uid, x]) => `<div class="fr-row"><span>${frAvatar(uid, 32)}</span><div><b>${esc(x.n)}</b></div><button class="switch" type="button" data-gkon="${esc(uid)}" aria-pressed="${oks[uid] === true}" aria-label="${esc(x.n)} can use the Google key"><i></i></button></div>`).join("") || `<p class="note">Add friends first.</p>`}</div>
    <div class="block"><h2>What’s being used</h2>
      <p class="note">From each phone that has Friends on. Google charges for photos, place lookups and camera photos; the rest is free.</p>
      <div class="flags stat-per" role="group" aria-label="Which days to count">${STAT_PERIODS.map(([k, l]) => `<button class="chip" type="button" data-statper="${k}" aria-pressed="${k === per[0]}">${l}</button>`).join("")}</div>
      <p class="note" style="color:var(--ink)">${per[1]}, everyone: <b>${tot("photo")}</b> Google photos, <b>${tot("details")}</b> place lookups, <b>${tot("vision")}</b> camera photos.</p>
      ${rows.length ? `<div class="stat-tab">${rows.map(([uid, x]) => {
        const top = Object.entries(x.views).sort((a, b) => b[1] - a[1]).slice(0, 5);
        return `<div class="stat-row"><div class="who">${frAvatar(uid, 30)}<b>${esc(uid === frMyId() ? "You" : frState().list[uid] ? frNameOf(uid) : x.n)}</b></div>
          <div class="stat-g"><span>${x.photo} photos</span><span>${x.details} lookups</span><span>${x.vision} camera</span></div>
          ${top.length ? `<div class="note">Most used: ${top.map(([k, v]) => `${esc(statName(k))} (${v})`).join(", ")}</div>` : ""}</div>`;
      }).join("")}</div>` : `<p class="note">Nothing yet: counts arrive from each phone within a few minutes of using the app.</p>`}</div>`;
  const sh = $("#gk-share"); if (sh) sh.onclick = async () => { if (!(await askConfirm("Share this phone’s Google key with the friends you switch on?", "Share key"))) return; gkShareKey(googleKey()).then(() => { toast("Key shared"); paintDevExtras(); }, frFail); };
  const un = $("#gk-unshare"); if (un) un.onclick = () => frDb("DELETE", "gkey").then(() => { toast("Key no longer shared"); paintDevExtras(); }, frFail);
  el.querySelectorAll("[data-statper]").forEach(b => b.onclick = () => { statPeriod = b.dataset.statper; paintDevExtras(); });
  el.querySelectorAll("[data-gkok]").forEach(b => b.onclick = () => gkApprove(b.dataset.gkok, true).then(() => { toast("They can use it now"); paintDevExtras(); }, frFail));
  el.querySelectorAll("[data-gkon]").forEach(b => b.onclick = () => { const on = b.getAttribute("aria-pressed") !== "true"; gkApprove(b.dataset.gkon, on).then(() => b.setAttribute("aria-pressed", on), frFail); });
}
