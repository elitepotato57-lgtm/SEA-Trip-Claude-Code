/* ============================================================
   Tools › Trips (Dylan, 23 Nov 2026): start a trip, end it, and see the route you took on a map, with the photos you
   took along the way (a Photos switch shows or hides them).
   - The route is the phone's own GPS (never the pretend test location), recorded while the app is open: an iPhone stops
     web apps using GPS once they're closed or the screen locks, so a stretch with the app closed shows as a dashed
     straight line (we don't know the way you went).
   - Photos are picked from the phone's library (a web app can't look through it by itself). Each goes on the map where
     it was taken: the photo's own location if it still has one (iPhones often remove it when a photo is shared with a
     website), otherwise the route's position at the time it was taken, if the app was recording then. Anything else is
     listed under "Not on the map".
   - Everything stays on this phone (IndexedDB "sea-trip-trips"); nothing is uploaded.
   ============================================================ */
TOOLS.push({id:"trips", l:"Trips", d:"Start a trip: your route and photos on a map", ic:"route"});

const TRK_MIN_M = 40;              // a new point once you've moved this far…
const TRK_MIN_MS = 10 * 60e3;      // …or every 10 minutes even standing still (so photos can be matched by time)
const TRK_MAX_ACC = 120;           // fixes rougher than this (metres) are skipped
const TRK_GAP_MS = 30 * 60e3;      // points further apart than this: the app was closed in between (a dashed line)
const TRK_MATCH_MS = 30 * 60e3;    // a photo is placed by time only within this of a recorded point

/* ---------- storage on the phone ---------- */
const Trk = {
  _db:null,
  db(){
    if (this._db) return this._db;
    this._db = new Promise((res, rej) => {
      const r = indexedDB.open("sea-trip-trips", 1);
      r.onupgradeneeded = () => { const db = r.result; db.createObjectStore("trips", {keyPath:"id"}); db.createObjectStore("photos", {keyPath:"id"}).createIndex("trip", "trip"); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return this._db;
  },
  async run(store, mode, fn){
    const db = await this.db();
    return new Promise((res, rej) => { const t = db.transaction(store, mode), req = fn(t.objectStore(store)); t.oncomplete = () => res(req && "result" in req ? req.result : undefined); t.onerror = () => rej(t.error); });
  },
  trips(){ return this.run("trips", "readonly", st => st.getAll()).then(r => (r || []).sort((a, b) => b.start - a.start)); },
  trip(id){ return this.run("trips", "readonly", st => st.get(id)); },
  putTrip(t){ return this.run("trips", "readwrite", st => st.put(t)); },
  photos(trip){ return this.run("photos", "readonly", st => st.index("trip").getAll(trip)).then(r => (r || []).sort((a, b) => (a.t || 0) - (b.t || 0))); },
  putPhoto(p){ return this.run("photos", "readwrite", st => st.put(p)); },
  async delTrip(id){
    const ph = await this.photos(id);
    await this.run("photos", "readwrite", st => { ph.forEach(p => st.delete(p.id)); return null; });
    return this.run("trips", "readwrite", st => st.delete(id));
  }
};

/* ---------- the route: which GPS fixes to keep ---------- */
// pts are [lat, lng, time]; keep a fix if it's accurate enough and you've moved, or it's been a while
function trkKeep(last, fix){
  if (!fix || !isFinite(fix.lat) || !isFinite(fix.lng) || (fix.acc != null && fix.acc > TRK_MAX_ACC)) return false;
  if (!last) return true;
  return dist({lat:last[0], lng:last[1]}, fix) * 1000 >= TRK_MIN_M || fix.at - last[2] >= TRK_MIN_MS;
}
// the route as lines: "walk" where the points are close in time, "gap" (dashed) across a stretch with the app closed
function trkSegments(pts){
  const out = []; let cur = null;
  for (let i = 0; i < pts.length; i++){
    const p = pts[i], q = pts[i - 1];
    if (q && p[2] - q[2] > TRK_GAP_MS){ out.push({gap:true, c:[[q[1], q[0]], [p[1], p[0]]]}); cur = null; }
    if (!cur){ cur = {gap:false, c:[]}; out.push(cur); }
    cur.c.push([p[1], p[0]]);
  }
  return out.filter(s => s.c.length > 1);
}
function trkStats(t){
  const pts = t.pts || []; let km = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i][2] - pts[i - 1][2] <= TRK_GAP_MS) km += dist({lat:pts[i - 1][0], lng:pts[i - 1][1]}, {lat:pts[i][0], lng:pts[i][1]});
  return {km, ms:(t.end || Date.now()) - t.start, n:pts.length};
}
// where a photo goes: its own location, else the route at the time it was taken (between two points close in time,
// part way along; or the nearest point within half an hour), else nowhere
function trkPlace(ph, pts){
  if (isFinite(ph.glat) && isFinite(ph.glng)) return {lat:ph.glat, lng:ph.glng, how:"gps"};
  if (!ph.t || !pts || !pts.length) return null;
  let i = pts.findIndex(p => p[2] >= ph.t);
  if (i === 0) return ph.t - 0 >= pts[0][2] - TRK_MATCH_MS ? {lat:pts[0][0], lng:pts[0][1], how:"time"} : null;
  if (i < 0){ const z = pts[pts.length - 1]; return ph.t - z[2] <= TRK_MATCH_MS ? {lat:z[0], lng:z[1], how:"time"} : null; }
  const a = pts[i - 1], b = pts[i];
  if (b[2] - a[2] <= TRK_GAP_MS){ const f = b[2] === a[2] ? 0 : (ph.t - a[2]) / (b[2] - a[2]); return {lat:a[0] + (b[0] - a[0]) * f, lng:a[1] + (b[1] - a[1]) * f, how:"time"}; }
  const near = ph.t - a[2] <= b[2] - ph.t ? a : b;
  return Math.abs(ph.t - near[2]) <= TRK_MATCH_MS ? {lat:near[0], lng:near[1], how:"time"} : null;
}

/* ---------- reading when and where a photo was taken (its EXIF) ---------- */
// JPEG only (iPhones turn HEIC photos into JPEG when they're picked on a website). Returns {t, lat, lng} (any may be missing).
function exifRead(buf){
  const out = {}; let v;
  try { v = new DataView(buf); } catch(e){ return out; }
  if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return out;
  let o = 2;
  while (o + 4 <= v.byteLength){
    if (v.getUint8(o) !== 0xFF) break;
    const mk = v.getUint8(o + 1), len = v.getUint16(o + 2);
    if (mk === 0xE1 && o + 10 <= v.byteLength && v.getUint32(o + 4) === 0x45786966){ readTiff(v, o + 10, out); break; }   // "Exif"
    if (mk === 0xDA) break;                                                                                       // the picture starts: no EXIF
    o += 2 + len;
  }
  return out;
}
function readTiff(v, t, out){
  const le = v.getUint16(t) === 0x4949, u16 = p => v.getUint16(p, le), u32 = p => v.getUint32(p, le);
  const SIZE = {1:1, 2:1, 3:2, 4:4, 5:8, 7:1, 9:4, 10:8};
  const ifd = off => {
    const tags = {}, at = t + off; if (at + 2 > v.byteLength) return tags;
    const n = u16(at);
    for (let k = 0; k < n; k++){
      const e = at + 2 + k * 12; if (e + 12 > v.byteLength) break;
      const tag = u16(e), type = u16(e + 2), cnt = u32(e + 4), sz = (SIZE[type] || 1) * cnt;
      const p = sz > 4 ? t + u32(e + 8) : e + 8; if (p + sz > v.byteLength) continue;
      if (type === 2){ let s = ""; for (let i = 0; i < cnt; i++){ const c = v.getUint8(p + i); if (!c) break; s += String.fromCharCode(c); } tags[tag] = s; }
      else if (type === 5) tags[tag] = Array.from({length:cnt}, (_, i) => { const d = u32(p + i * 8 + 4); return d ? u32(p + i * 8) / d : 0; });
      else if (type === 3) tags[tag] = u16(p);
      else if (type === 4) tags[tag] = u32(p);
    }
    return tags;
  };
  const t0 = ifd(u32(t + 4)), ex = t0[0x8769] ? ifd(t0[0x8769]) : {}, gps = t0[0x8825] ? ifd(t0[0x8825]) : {};
  const when = ex[0x9003] || ex[0x9004] || t0[0x0132];
  const m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(when || "");
  if (m){
    const off = /^([+-])(\d\d):(\d\d)$/.exec(ex[0x9011] || ex[0x9010] || "");
    out.t = off ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - (off[1] === "-" ? -1 : 1) * (off[2] * 60 + +off[3]) * 60e3
      : new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();      // no time zone saved: the phone's own
  }
  const deg = a => Array.isArray(a) && a.length === 3 ? a[0] + a[1] / 60 + a[2] / 3600 : NaN;
  const lat = deg(gps[2]), lng = deg(gps[4]);
  if (isFinite(lat) && isFinite(lng) && (lat || lng)){ out.lat = gps[1] === "S" ? -lat : lat; out.lng = gps[3] === "W" ? -lng : lng; }
}

/* ---------- sharing a trip live with friends (Dylan, 25 Nov 2026) ----------
   tripl/{uid}: the trip being shared {n name, s start, e end (0 while recording), p [[lat, lng, seconds]], t}, readable only by the
   friends in tripok/{uid} (the same private Friends system as location sharing). Sent while the app is open, at most every 45 s.
   A WhatsApp link opens it in the app (#tools/trips?f=<uid>), for friends it's shared with only. */
const trkShareList = () => (S.tripShare || []).filter(u => frState().list[u]);
let trkSentAt = 0;
async function trkSendLive(t, force){
  if (!t || !trkShareList().length || typeof frCfg !== "function" || !frCfg()) return;
  if (!force && Date.now() - trkSentAt < 45e3)return;
  trkSentAt = Date.now();
  const k = Math.ceil(t.pts.length / 1500) || 1, pts = t.pts.filter((p, i) => i % k === 0 || i === t.pts.length - 1);
  try { const me = await frMe(); await frDb("PUT", `tripl/${me.uid}`, {n:String(t.name).slice(0, 60), s:t.start, e:t.end || 0, p:pts.map(p => [+(+p[0]).toFixed(5), +(+p[1]).toFixed(5), Math.round(p[2] / 1000)]), t:{".sv":"timestamp"}}); } catch(e){}
}
async function trkSetShare(uids){
  const me = await frMe(), before = new Set(S.tripShare || []), after = new Set(uids);
  await Promise.all([...after].filter(u => !before.has(u)).map(u => frDb("PUT", `tripok/${me.uid}/${u}`, true)).concat([...before].filter(u => !after.has(u)).map(u => frDb("DELETE", `tripok/${me.uid}/${u}`))));
  S.tripShare = [...after]; persist();
  if (!after.size) await frDb("DELETE", `tripl/${me.uid}`).catch(() => {});
  else await trkSendLive(await trkLoadCur(), true);
}
const trkLink = uid => `${location.origin}${location.pathname}#tools/trips?f=${encodeURIComponent(uid)}`;
function trkShareSheet(){
  const fl = Object.keys(frState().list || {}), on = new Set(trkShareList());
  const sh = openSheet(`<div class="sheet-head"><h2 id="trk-sh-t">Share this trip live</h2><button class="icon-btn" type="button" data-close aria-label="Close">${icon("x")}</button></div>
    ${!frCfg() ? `<p class="note">Set up Friends first (Tools › Friends).</p>` : !fl.length ? `<p class="note">Add your mates in Tools › Friends first.</p>` : `
    <p class="note">They see your route and where you are now, in Trips › Friends’ trips. It updates while your app is open.</p>
    ${fl.map(u => `<div class="fr-row"><span>${frAvatar(u, 32)}</span><div><b>${esc(frNameOf(u))}</b></div><button class="switch" type="button" data-tsh="${esc(u)}" aria-pressed="${on.has(u)}"><i></i></button></div>`).join("")}
    <div class="row" style="margin-top:12px"><button class="btn primary" type="button" id="trkShSave">Save</button>
      <a class="btn" id="trkWa" target="_blank" rel="noopener" href="#">${icon("send","i s")}Send on WhatsApp</a></div>
    <p class="note">The WhatsApp link opens your trip in their app; it works only for the friends switched on here.</p>`}`, "trk-sh-t");
  sh.querySelectorAll("[data-tsh]").forEach(b => b.onclick = () => b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true")));
  const pick = () => [...sh.querySelectorAll('[data-tsh][aria-pressed="true"]')].map(b => b.dataset.tsh);
  const sv = sh.querySelector("#trkShSave"); if (sv) sv.onclick = async () => { sv.disabled = true; try { await trkSetShare(pick()); toast(pick().length ? `Shared live with ${pick().length} friend${pick().length === 1 ? "" : "s"}` : "Not shared"); closeDetail(); renderPage(); } catch(e){ toast(e.message === "permission" ? "Firebase refused it: re-publish the rules (FIREBASE-SETUP.md)" : "No signal? Try again"); sv.disabled = false; } };
  const wa = sh.querySelector("#trkWa");
  if (wa) wa.onclick = async e => { e.preventDefault(); const me = await frMe(); const t = await trkLoadCur(); window.open(`https://wa.me/?text=${encodeURIComponent(`Follow my trip${t ? ` “${t.name}”` : ""} live in our SEA Trip app: ${trkLink(me.uid)}`)}`, "_blank", "noopener"); };
}
// a friend's shared trip, or null if they haven't shared one with you
async function trkFriendTrip(uid){ try { const v = await frDb("GET", `tripl/${uid}`); return v && v.p ? {id:"f-" + uid, name:v.n, start:v.s, end:v.e || null, pts:Object.values(v.p || {}).map(p => [p[0], p[1], p[2] * 1000]), at:v.t, uid} : null; } catch(e){ return null; } }

/* ---------- recording ---------- */
let trkCur = null, trkWatchId = null, trkSaveT = 0, trkFixErr = "";
const trkOn = () => !!S.tripOn;
async function trkLoadCur(){ if (!S.tripOn) return null; if (!trkCur || trkCur.id !== S.tripOn) trkCur = await Trk.trip(S.tripOn).catch(() => null); return trkCur; }
function trkWatch(){
  if (trkWatchId != null || !trkOn() || typeof navigator === "undefined" || !navigator.geolocation) return;
  trkWatchId = navigator.geolocation.watchPosition(async p => {
    if (typeof geoKeep === "function") geoKeep(p.coords);
    trkFixErr = "";
    const t = await trkLoadCur(); if (!t || t.end) return;
    const fix = {lat:p.coords.latitude, lng:p.coords.longitude, acc:p.coords.accuracy, at:p.timestamp || Date.now()};
    if (!trkKeep(t.pts[t.pts.length - 1], fix)) return;
    t.pts.push([+fix.lat.toFixed(6), +fix.lng.toFixed(6), fix.at]);
    clearTimeout(trkSaveT); trkSaveT = setTimeout(() => Trk.putTrip(t).catch(() => {}), 1500);
    trkSendLive(t);
    trkPaintLive(t);
  }, e => { trkFixErr = e && e.code === 1 ? "denied" : "unavailable"; trkPaintLive(trkCur); }, {enableHighAccuracy:true, maximumAge:15e3, timeout:30e3});
}
function trkUnwatch(){ if (trkWatchId != null && navigator.geolocation) navigator.geolocation.clearWatch(trkWatchId); trkWatchId = null; }
// js/boot.js: carry on recording when the app opens; an iPhone may drop the watch while the app is away, so start it again on return
function trkResume(){
  if (trkOn()) trkWatch();
  if (typeof document !== "undefined" && document.addEventListener && !trkResume.bound){
    trkResume.bound = true;
    document.addEventListener("visibilitychange", () => { if (!document.hidden && trkOn()){ trkUnwatch(); trkWatch(); } });
  }
}
async function trkStart(name){
  const now = Date.now(), t = {id:"t" + now.toString(36), name:(name || "").trim().slice(0, 60) || "Trip from " + new Date(now).toLocaleDateString("en-GB", {day:"numeric", month:"short"}), start:now, end:null, pts:[]};
  if (typeof geoFresh === "function"){ const g = geoFresh(); if (g && trkKeep(null, g)) t.pts.push([+g.lat.toFixed(6), +g.lng.toFixed(6), g.at]); }
  await Trk.putTrip(t); trkCur = t;
  S.tripOn = t.id; persist(); trkWatch();
  return t;
}
async function trkEnd(){
  const t = await trkLoadCur(); trkUnwatch(); clearTimeout(trkSaveT);
  if (t){ t.end = Date.now(); await Trk.putTrip(t); await trkSendLive(t, true); }
  S.tripOn = ""; persist(); trkCur = null;
  return t;
}

/* ---------- photos: picked from the library, made smaller, placed ---------- */
async function trkShrink(file, max){
  const bmp = await createImageBitmap(file, {imageOrientation:"from-image"});
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  return new Promise(res => c.toBlob(b => res(b), "image/jpeg", .82));
}
async function trkAddPhotos(trip, files){
  const pts = trip.pts || []; let placed = 0, n = 0;
  for (const f of files){
    if (!/^image\//.test(f.type || "") && !/\.(jpe?g|png|heic|webp)$/i.test(f.name || "")) continue;
    let ex = {};
    try { ex = exifRead(await f.slice(0, 256 * 1024).arrayBuffer()); } catch(e){}
    let big = null, small = null;
    try { big = await trkShrink(f, 1400); small = await blobToDataURL(await trkShrink(f, 140)); } catch(e){ continue; }   // a picture this phone can't read
    const ph = {id:trip.id + "-" + Date.now().toString(36) + n, trip:trip.id, name:(f.name || "Photo").slice(0, 80), t:ex.t || f.lastModified || null, tFrom:ex.t ? "photo" : "file",
      glat:ex.lat, glng:ex.lng, blob:big, thumb:small};
    if (trkPlace(ph, pts)) placed++;
    await Trk.putPhoto(ph); n++;
  }
  return {n, placed};
}

/* ---------- the page ---------- */
let trkMap = null, trkMarkers = [], trkUrls = [];
const trkKmText = km => km < 1 ? Math.round(km * 1000) + " m" : (km < 10 ? km.toFixed(1) : Math.round(km)) + " km";
const trkDurText = ms => { const h = Math.floor(ms / 36e5), m = Math.round(ms % 36e5 / 6e4); return h >= 48 ? Math.round(h / 24) + " days" : h ? `${h} h ${m} min` : `${m} min`; };
const trkWhen = t => new Date(t).toLocaleString("en-GB", {day:"numeric", month:"short", hour:"2-digit", minute:"2-digit"});
function trkCleanup(){
  trkMarkers.forEach(m => m.remove()); trkMarkers = [];
  trkUrls.forEach(u => URL.revokeObjectURL(u)); trkUrls = [];
  if (trkMap){ try { trkMap.remove(); } catch(e){} trkMap = null; }
}
TOOL_PAGES.trips = async (root, arg) => {
  trkCleanup();
  if (!("indexedDB" in window)){ root.innerHTML = toolHero("Trips", "Your route and photos") + `<div class="page">${emptyBlock("Not on this phone", "<p>This browser can’t keep trips. Open the app from your home screen.</p>")}</div>`; return; }
  if (/^f=/.test(arg)) return trkFriendPage(root, decodeURIComponent(arg.slice(2)));
  if (arg) return trkTripPage(root, decodeURIComponent(arg));
  const [list, cur] = await Promise.all([Trk.trips().catch(() => []), trkLoadCur()]);
  if (ui.view !== "tools" || !/^trips/.test(ui.sub || "")) return;
  const past = list.filter(t => t.end);
  root.innerHTML = toolHero("Trips", "Your route and photos, on a map") + `<div class="page trk">
    ${cur ? `<div class="trk-now"><span class="trk-dot" aria-hidden="true"></span><div><b>Recording: ${esc(cur.name)}</b><small id="trkLive">${trkLiveText(cur)}</small></div></div>
      <div class="row" style="margin-top:10px"><a class="btn" href="#tools/trips?${enc(cur.id)}">${icon("map","i s")}See the route</a><button class="btn" type="button" id="trkShare">${icon("users","i s")}${trkShareList().length ? `Shared with ${trkShareList().length}` : "Share live"}</button><button class="btn danger" type="button" id="trkEnd">${icon("check","i s")}End trip</button></div>`
    : `<label class="field">Name (optional)<input id="trkName" type="text" maxlength="60" autocomplete="off" placeholder="e.g. Chiang Mai to Pai"></label>
      <button class="btn primary wide" type="button" id="trkStart" style="margin-top:8px">${icon("route","i s")}Start a trip</button>`}
    ${explain("trk-how", `<p class="note" style="margin-top:10px">Your route is recorded from your phone’s GPS while the app is open. An iPhone doesn’t let web apps use GPS once they’re closed or the screen is locked, so a stretch with the app closed shows as a dashed straight line. After the trip, add your photos: each goes where it was taken. Everything stays on this phone.</p>`)}
    <div id="trkFriends"></div>
    <div class="sect"><h2>Your trips</h2></div>
    ${past.length ? `<div class="trk-list">${past.map(t => { const s = trkStats(t); return `<a class="trk-row" href="#tools/trips?${enc(t.id)}"><span class="ti">${icon("route")}</span><span><b>${esc(t.name)}</b><small>${esc(trkWhen(t.start))} · ${trkKmText(s.km)} · ${trkDurText(s.ms)}</small></span>${icon("chevr","i s")}</a>`; }).join("")}</div>`
      : `<p class="note">No finished trips yet.</p>`}
  </div>`;
  const st = $("#trkStart"); if (st) st.onclick = async () => { st.disabled = true; const t = await trkStart($("#trkName").value); toast(`Recording “${t.name}”. Keep the app open on the way for the best route.`); renderPage(); };
  const en = $("#trkEnd"); if (en) en.onclick = async () => {
    if (!await askConfirm("End this trip? The route stops recording.", "End trip")) return;
    const t = await trkEnd(); if (t) go("#tools/trips?" + enc(t.id)); else renderPage();
  };
  const shb = $("#trkShare"); if (shb) shb.onclick = trkShareSheet;
  trkPaintFriends();
};
// Friends' trips: the friends who are sharing a trip with you
async function trkPaintFriends(){
  const box = $("#trkFriends"); if (!box || typeof frCfg !== "function" || !frCfg()) return;
  const ids = Object.keys(frState().list || {}); if (!ids.length) return;
  const got = (await Promise.all(ids.map(trkFriendTrip))).filter(Boolean);
  if (!box.isConnected || !got.length) return;
  box.innerHTML = `<div class="sect"><h2>Friends’ trips</h2></div><div class="trk-list">${got.map(t => `<a class="trk-row" href="#tools/trips?f=${enc(t.uid)}"><span class="ti">${frAvatar(t.uid, 32)}</span><span><b>${esc(frNameOf(t.uid))}: ${esc(t.name)}</b><small>${t.end ? "Ended" : `<span class="trk-dot sm"></span> Live`} · ${trkKmText(trkStats(t).km)}${t.at ? ` · updated ${esc(agoText(t.at))}` : ""}</small></span>${icon("chevr","i s")}</a>`).join("")}</div>`;
}
// a friend's trip on a map, refreshed every 30 s while you look at it
async function trkFriendPage(root, uid){
  const t = await trkFriendTrip(uid);
  if (ui.view !== "tools" || !/^trips/.test(ui.sub || "")) return;
  if (!t){ root.innerHTML = toolHero("Trips", "") + `<div class="page">${emptyBlock("Not shared with you", "<p>Ask them to switch you on in Trips › Share live (you need to be friends in the app).</p>")}</div>`; return; }
  root.innerHTML = hero({title:`${frNameOf(uid)}: ${t.name}`, sub:`${trkWhen(t.start)}${t.end ? " to " + trkWhen(t.end) : ", live now"}`, back:["#tools/trips", "Trips"]}) + `<div class="page trk">
    <p class="trk-stats"><b>${trkKmText(trkStats(t).km)}</b> · ${trkDurText(trkStats(t).ms)}${t.at ? ` · updated ${esc(agoText(t.at))}` : ""}</p>
    ${t.pts.length ? `<div id="trkMap" class="tmap trk-map" role="application" aria-label="Map of their route"></div>` : `<p class="note">No route yet.</p>`}</div>`;
  if (t.pts.length) trkDrawMap(t, []);
  if (!t.end){ const k = ui.sub; setTimeout(() => { if (ui.view === "tools" && ui.sub === k) renderPage(); }, 30000); }
}
function trkLiveText(t){
  if (!t) return "";
  const s = trkStats(t);
  if (trkFixErr === "denied") return "Location is blocked for this app: allow it in Settings › Privacy › Location Services › Safari Websites.";
  return `Since ${trkWhen(t.start)} · ${trkKmText(s.km)} · ${s.n} point${s.n === 1 ? "" : "s"}${trkFixErr ? " · waiting for GPS" : ""}`;
}
function trkPaintLive(t){
  const el = $("#trkLive"); if (el && t) el.textContent = trkLiveText(t);
  if (trkMap && t && trkMap.getSource && trkMap.getSource("trk") && trkMap.__trip === t.id) trkMap.getSource("trk").setData(trkRouteFC(t.pts));
}
const trkRouteFC = pts => fc(trkSegments(pts).map(s => ({type:"Feature", properties:{gap:s.gap}, geometry:{type:"LineString", coordinates:s.c}})));
async function trkTripPage(root, id){
  const t = id === S.tripOn ? await trkLoadCur() : await Trk.trip(id).catch(() => null);
  if (!t){ root.innerHTML = toolHero("Trips", "") + `<div class="page">${emptyBlock("Trip not found", "<p>It may have been deleted.</p>")}</div>`; return; }
  const photos = await Trk.photos(t.id).catch(() => []);
  if (ui.view !== "tools" || !/^trips/.test(ui.sub || "")) return;
  const pts = t.pts || [], s = trkStats(t);
  const placed = photos.map(p => ({p, at:trkPlace(p, pts)})), onMap = placed.filter(x => x.at), off = placed.filter(x => !x.at);
  const showPh = S.tripPhotos !== false;
  root.innerHTML = hero({title:t.name, sub:`${trkWhen(t.start)}${t.end ? " to " + trkWhen(t.end) : ", recording now"}`, back:["#tools/trips", "Trips"]}) + `<div class="page trk">
    <p class="trk-stats"><b>${trkKmText(s.km)}</b> · ${trkDurText(s.ms)} · ${photos.length} photo${photos.length === 1 ? "" : "s"}</p>
    ${pts.length ? `<div id="trkMap" class="tmap trk-map" role="application" aria-label="Map of the route"></div>` : `<p class="note">No route recorded${t.end ? "" : " yet: keep the app open with location allowed"}.</p>`}
    <div class="row" style="margin-top:10px;align-items:center">
      <button class="switch" type="button" id="trkPh" aria-pressed="${showPh}"><i></i>Photos</button><span class="sp"></span>
      <label class="btn primary" style="cursor:pointer">${icon("image","i s")}Add photos<input type="file" id="trkFiles" accept="image/*" multiple hidden></label>
    </div>
    <p class="note" id="trkAddNote">${photos.length ? `${onMap.length} on the map${off.length ? `, ${off.length} not` : ""}.` : "Pick the photos you took on this trip: each goes on the map where it was taken."}</p>
    ${off.length ? `<div class="sect"><h2>Not on the map</h2></div><p class="note">These have no location saved, and the app wasn’t recording when they were taken.</p>
      <div class="trk-grid">${off.map(x => `<button type="button" class="trk-thumb" data-ph="${esc(x.p.id)}"><img src="${x.p.thumb}" alt="${esc(x.p.name)}"></button>`).join("")}</div>` : ""}
    <div class="row" style="margin-top:16px">
      <button class="btn" type="button" id="trkRename">${icon("edit","i s")}Rename</button>
      ${t.end ? `<button class="btn danger" type="button" id="trkDel">${icon("trash","i s")}Delete trip</button>` : `<button class="btn danger" type="button" id="trkEnd2">${icon("check","i s")}End trip</button>`}
    </div>
  </div>`;
  $("#trkPh").onclick = () => {
    S.tripPhotos = S.tripPhotos === false; persist();
    $("#trkPh").setAttribute("aria-pressed", String(S.tripPhotos));
    trkMarkers.forEach(m => { const el = m.getElement(); if (el.classList.contains("trk-pin")) el.hidden = !S.tripPhotos; });
  };
  $("#trkFiles").onchange = async e => {
    const files = [...e.target.files]; if (!files.length) return;
    $("#trkAddNote").textContent = `Adding ${files.length} photo${files.length === 1 ? "" : "s"}…`;
    const r = await trkAddPhotos(t, files);
    toast(`${r.n} photo${r.n === 1 ? "" : "s"} added, ${r.placed} on the map.`);
    if (!S.tripPhotos && r.placed){ S.tripPhotos = true; persist(); }
    renderPage();
  };
  $("#trkRename").onclick = async () => {
    const n = prompt("Trip name", t.name); if (n == null || !n.trim()) return;
    t.name = n.trim().slice(0, 60); await Trk.putTrip(t); if (trkCur && trkCur.id === t.id) trkCur.name = t.name; renderPage();
  };
  const del = $("#trkDel"); if (del) del.onclick = async () => { if (!await askConfirm(`Delete “${t.name}”, its route and its ${photos.length} photo${photos.length === 1 ? "" : "s"} from this app? The photos stay in your phone’s library.`, "Delete", true)) return; await Trk.delTrip(t.id); go("#tools/trips"); };
  const en = $("#trkEnd2"); if (en) en.onclick = async () => { if (!await askConfirm("End this trip? The route stops recording.", "End trip")) return; await trkEnd(); renderPage(); };
  root.querySelectorAll("[data-ph]").forEach(b => b.onclick = () => trkOpenPhoto(photos.find(p => p.id === b.dataset.ph)));
  if (pts.length) trkDrawMap(t, onMap);
}
function trkDrawMap(t, onMap){
  const el = $("#trkMap"); if (!el || typeof maplibregl === "undefined"){ if (el) el.remove(); return; }
  const all = t.pts.map(p => [p[1], p[0]]).concat(onMap.map(x => [x.at.lng, x.at.lat]));
  const w = Math.min(...all.map(c => c[0])), e = Math.max(...all.map(c => c[0])), s = Math.min(...all.map(c => c[1])), n = Math.max(...all.map(c => c[1]));
  try {
    trkMap = new maplibregl.Map({container:el, style:mapStyle(), bounds:[[w - .002, s - .002], [e + .002, n + .002]], fitBoundsOptions:{padding:36, maxZoom:16},
      attributionControl:false, dragRotate:false, pitchWithRotate:false, touchPitch:false});
  } catch(err){ el.remove(); return; }
  trkMap.__trip = t.id;
  if (/^f-/.test(t.id)) t.end = t.end || null;
  // no signal for the street map: the route and photos still show on a plain background (no error)
  trkMap.on("error", () => {});
  trkMap.addControl(new maplibregl.AttributionControl({compact:true, customAttribution:"© OpenStreetMap"}));
  trkMap.on("load", () => {
    trkMap.addSource("trk", {type:"geojson", data:trkRouteFC(t.pts)});
    trkMap.addLayer({id:"trk-case", type:"line", source:"trk", filter:["!", ["get", "gap"]], layout:{"line-cap":"round", "line-join":"round"}, paint:{"line-color":cssv("--bg"), "line-width":8}});
    trkMap.addLayer({id:"trk-line", type:"line", source:"trk", filter:["!", ["get", "gap"]], layout:{"line-cap":"round", "line-join":"round"}, paint:{"line-color":cssv("--move"), "line-width":4.5}});
    trkMap.addLayer({id:"trk-gap", type:"line", source:"trk", filter:["get", "gap"], paint:{"line-color":cssv("--move"), "line-width":3, "line-opacity":.7, "line-dasharray":[1.2, 1.8]}});
    const ends = [[t.pts[0], "A", "first"]].concat(t.end && t.pts.length > 1 ? [[t.pts[t.pts.length - 1], "B", "last"]] : []);
    ends.forEach(([p, l, c]) => { const m = document.createElement("div"); m.className = "leg-stop " + c; m.innerHTML = `<b>${l}</b>`; trkMarkers.push(new maplibregl.Marker({element:m}).setLngLat([p[1], p[0]]).addTo(trkMap)); });
    if (!t.end && t.pts.length){ const z = t.pts[t.pts.length - 1], m = document.createElement("div"); m.className = "trk-here"; trkMarkers.push(new maplibregl.Marker({element:m}).setLngLat([z[1], z[0]]).addTo(trkMap)); }
    onMap.forEach(({p, at}) => {
      const m = document.createElement("button"); m.type = "button"; m.className = "trk-pin"; m.setAttribute("aria-label", "Photo: " + p.name);
      m.innerHTML = `<img src="${p.thumb}" alt="">`; m.hidden = S.tripPhotos === false;
      m.onclick = ev => { ev.stopPropagation(); trkOpenPhoto(p, at); };
      trkMarkers.push(new maplibregl.Marker({element:m, anchor:"bottom"}).setLngLat([at.lng, at.lat]).addTo(trkMap));
    });
  });
}
function trkOpenPhoto(p, at){
  if (!p) return;
  const u = p.blob ? URL.createObjectURL(p.blob) : p.thumb; if (p.blob) trkUrls.push(u);
  at = at || null;
  openSheet(`<div class="sheet-head"><h2 id="trk-ph-t">${esc(p.name)}</h2><button class="icon-btn" type="button" data-close aria-label="Close">${icon("x")}</button></div>
    <img class="trk-big" src="${u}" alt="${esc(p.name)}">
    <p class="note">${p.t ? `Taken ${esc(trkWhen(p.t))}${p.tFrom === "file" ? " (from the file’s date)" : ""}. ` : ""}${at ? (at.how === "gps" ? "Placed by the photo’s own location." : "Placed by where your route was at that time.") : "Not on the map."}</p>`, "trk-ph-t");
}
