/* ============================================================
   67-friends: see your mates on the map, and choose who sees you.
   Uses a free Firebase project (Realtime Database + anonymous sign-in, Spark plan, no card), talked to over its plain web
   address (REST), so there is no extra library to download. Dylan puts the project's settings in config.js:
     window.SEA_FIREBASE = {apiKey:"…", databaseURL:"https://….firebasedatabase.app"};
   Without them the page explains how to switch it on (FIREBASE-SETUP.md). Who can read what is enforced by the database's
   own rules (firebase/database.rules.json): a phone's location can only be read by the people it shares with.
   Data:  users/{uid} {n}   codes/{CODE} uid   requests/{uid}/{fromUid} name   share/{uid}/{friendUid} true   loc/{uid} {lat,lng,acc,t}
   Phones only send their position while the app is open (iPhones don't let web apps run in the background).
   ============================================================ */
const FB_AUTH_KEY = "fb-auth-v1";
const FR_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";       // no 0/O or 1/I to mix up
const FR_SEND_MS = 60e3, FR_POLL_MS = 30e3, FR_MOVE_M = 40;
const frCfg = () => { const c = window.SEA_FIREBASE; return c && c.apiKey && /^https:\/\/[\w.-]+\.(firebaseio\.com|firebasedatabase\.app)\/?$/.test(c.databaseURL || "") ? c : null; };
function frState(){
  const f = S.friends && typeof S.friends === "object" ? S.friends : (S.friends = {});
  if (typeof f.on !== "boolean") f.on = false;                    // share my location at all (off until you turn it on)
  if (typeof f.name !== "string") f.name = "";
  if (!f.list || typeof f.list !== "object") f.list = {};         // uid -> {n, share}
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
// read or write one path of the database
async function frDb(method, path, data){
  const cfg = frCfg(), a = await frAuth();
  const url = `${cfg.databaseURL.replace(/\/$/, "")}/${path}.json?auth=${enc(a.tok)}`;
  const r = await fetch(url, {method, headers:data !== undefined ? {"Content-Type":"application/json"} : {}, body:data !== undefined ? JSON.stringify(data) : undefined});
  if (r.status === 401 || r.status === 403){ const e = new Error("permission"); e.status = r.status; throw e; }
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.status === 204 ? null : r.json();
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
  if (share && f.on) frSendNow(true);
  return f.list[uid].n;
}
async function frSetShare(uid, on){
  const f = frState(), me = await frMe(); if (!f.list[uid]) return;
  f.list[uid].share = !!on; persist();
  if (on) await frDb("PUT", `share/${me.uid}/${uid}`, true); else await frDb("DELETE", `share/${me.uid}/${uid}`);
}
async function frRemove(uid){
  const f = frState(), me = await frMe();
  delete f.list[uid]; delete frLocs[uid]; persist();
  await frDb("DELETE", `share/${me.uid}/${uid}`).catch(() => {});
  drawFriends();
}
async function frSetOn(on){
  const f = frState(); f.on = !!on; persist();
  if (on){ await frMe(); frSendNow(true); frLoop(); }
  else { const a = frAuthSaved(); if (a) await frDb("DELETE", `loc/${a.uid}`).catch(() => {}); }       // stop: your last position is removed
}
async function frRequests(){
  const me = await frMe(), r = await frDb("GET", `requests/${me.uid}`) || {}, f = frState();
  return Object.entries(r).filter(([uid]) => !f.list[uid]).map(([uid, v]) => ({uid, n:(v && v.n) || "A friend", c:v && v.c}));
}
async function frIgnore(uid){ const me = await frMe(); await frDb("DELETE", `requests/${me.uid}/${uid}`); }

/* ---------- sending my position, reading theirs ---------- */
let frLast = null, frTimer = null;
const frLocs = {};                                    // uid -> {lat,lng,acc,t} or {err}
// sends only a real GPS position (never the pretend test location), at most once a minute unless you've moved 40 m
async function frSendNow(force, here = userLoc, status = locStatus){
  const f = frState();
  if (!frCfg() || !f.on || !here || status === "test" || !Object.values(f.list).some(x => x.share)) return false;
  if (!force && frLast && frNow() - frLast.at < FR_SEND_MS && dist(frLast, here) * 1000 < FR_MOVE_M) return false;
  const a = await frAuth();
  await frDb("PUT", `loc/${a.uid}`, {lat:+here.lat.toFixed(5), lng:+here.lng.toFixed(5), acc:Math.round(here.acc || 0), t:{".sv":"timestamp"}});
  frLast = {lat:here.lat, lng:here.lng, at:frNow()};
  return true;
}
async function frPoll(){
  const f = frState(), ids = Object.keys(f.list);
  await Promise.all(ids.map(async uid => {
    try { const v = await frDb("GET", `loc/${uid}`); frLocs[uid] = v && isFinite(v.lat) ? v : {none:true}; }
    catch(e){ frLocs[uid] = {hidden:e.status === 401 || e.status === 403}; }          // they aren't sharing with you
  }));
  drawFriends();
  if (ui.view === "tools" && ui.sub === "friends") paintFriendLocs();
}
function frLoop(){
  clearTimeout(frTimer);
  if (!frCfg() || document.hidden) return;
  const f = frState();
  if (!Object.keys(f.list).length && !f.on) return;
  Promise.allSettled([frSendNow(false), frPoll()]).finally(() => { frTimer = setTimeout(frLoop, FR_POLL_MS); });
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) frLoop(); else clearTimeout(frTimer); });

/* ---------- friends on the map ---------- */
const frMarkers = {};
const frAgo = t => { const m = Math.round((frNow() - t) / 60e3); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
const frInitials = n => String(n || "?").trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
function drawFriends(){
  if (typeof map === "undefined" || !map || typeof maplibregl === "undefined") return;
  const f = frState();
  Object.keys(frMarkers).forEach(uid => { const v = frLocs[uid]; if (!f.list[uid] || !v || !isFinite(v.lat)){ frMarkers[uid].remove(); delete frMarkers[uid]; } });
  for (const [uid, fr] of Object.entries(f.list)){
    const v = frLocs[uid]; if (!v || !isFinite(v.lat)) continue;
    const old = frNow() - v.t > 3 * 3600e3;
    if (!frMarkers[uid]){
      const el = document.createElement("button"); el.type = "button"; el.className = "fr-pin";
      el.onclick = e => { e.stopPropagation(); const w = frLocs[uid]; toast(`${f.list[uid] ? f.list[uid].n : "Friend"}: seen ${frAgo(w.t)}${userLoc ? `, ${distShort(dist(userLoc, w))} away` : ""}`); };
      frMarkers[uid] = new maplibregl.Marker({element:el, anchor:"bottom"}).setLngLat([v.lng, v.lat]).addTo(map);
    }
    const el = frMarkers[uid].getElement();
    el.innerHTML = `<span class="fr-dot">${esc(frInitials(fr.n))}</span><span class="fr-name">${esc(fr.n)}</span>`;
    el.classList.toggle("old", old); el.setAttribute("aria-label", `${fr.n}, seen ${frAgo(v.t)}`);
    frMarkers[uid].setLngLat([v.lng, v.lat]);
  }
}

/* ---------- the page (Tools › Friends, also linked from Settings) ---------- */
function friendsSetupHTML(){
  return `<div class="callout">${icon("info")}<div><b>Friends needs switching on once.</b> It uses a free Firebase project (Google’s, no card needed) so phones can see each other.
    Dylan sets it up and adds its two settings to <code>config.js</code> on GitHub: about 10 minutes, step by step in <code>FIREBASE-SETUP.md</code>. Everyone gets it after that.</div></div>`;
}
function paintFriendLocs(){
  document.querySelectorAll("[data-frloc]").forEach(el => {
    const v = frLocs[el.dataset.frloc];
    el.textContent = !v ? "Checking…" : v.hidden ? "Not sharing with you yet" : v.none ? "Not sharing right now" : `Seen ${frAgo(v.t)}${userLoc ? ` · ${distShort(dist(userLoc, v))} away` : ""}`;
  });
}
TOOL_PAGES.friends = async root => {
  const f = frState(), cfg = frCfg();
  let html = hero({title:"Friends", sub:"See your mates on the map, and choose who sees you", back:["#tools", "Tools"]}) + `<div class="page friends">`;
  if (!cfg){ root.innerHTML = html + friendsSetupHTML() + `</div>`; return; }
  const list = Object.entries(f.list).sort((a, b) => a[1].n.localeCompare(b[1].n));
  html += `<div class="block"><h2>You</h2>
    <label class="field">Your name (what friends see)<input id="fr-name" type="text" maxlength="30" autocomplete="nickname" value="${esc(f.name)}" placeholder="Your name"></label>
    <div class="fr-code"><div><div class="note">Your friend code</div><b id="fr-code">${esc(f.code || "……")}</b></div><button class="btn small" type="button" id="fr-sharecode">${icon("share","i s")}Send it</button></div>
    <button class="switch" type="button" id="fr-on" aria-pressed="${f.on}"><i></i>Share my location</button>
    <p class="note">${f.on ? "Your position goes to the friends switched on below, only while this app is open." : "Off: nobody can see where you are."} Locations go through Google’s Firebase. Turning this off removes your last position.</p></div>
    <div class="block"><h2>Add a friend</h2><div class="row"><input class="sp-in" id="fr-add" type="text" maxlength="8" autocapitalize="characters" autocomplete="off" placeholder="Their 6-letter code" aria-label="Friend code"><button class="btn small primary" type="button" id="fr-addb">Add</button></div>
      <div id="fr-reqs"></div></div>
    <div class="block"><h2>Your friends</h2>${list.length ? list.map(([uid, x]) => `<div class="fr-row"><div><b>${esc(x.n)}</b><div class="note" data-frloc="${esc(uid)}">Checking…</div></div>
      <button class="switch" type="button" data-frshare="${esc(uid)}" aria-pressed="${x.share}" aria-label="Share my location with ${esc(x.n)}"><i></i>${x.share ? "Sees you" : "Hidden"}</button>
      <button class="icon-btn" type="button" data-frrm="${esc(uid)}" aria-label="Remove ${esc(x.n)}">${icon("x","i s")}</button></div>`).join("") : `<p class="note">No friends yet. Send your code to your mates, or add theirs above.</p>`}
      ${list.length ? `<a class="btn small" href="#map" style="margin-top:10px">${icon("map","i s")}See them on the map</a>` : ""}</div></div>`;
  root.innerHTML = html;
  paintFriendLocs();
  const again = () => TOOL_PAGES.friends(root);
  const fail = e => toast(e && e.message === "permission" ? "Firebase said no. Check its rules (FIREBASE-SETUP.md)." : (e && e.message) || "No signal? Try again.");
  frMe().then(me => { const c = $("#fr-code"); if (c) c.textContent = me.code; }).catch(fail);
  $("#fr-name").onchange = e => { f.name = e.target.value.trim().slice(0, 30); persist(); frMe().catch(fail); };
  $("#fr-sharecode").onclick = async () => {
    const me = await frMe().catch(fail); if (!me) return;
    const text = `Add me on the trip app: my friend code is ${me.code} (Tools › Friends).`;
    try { if (navigator.share){ await navigator.share({text}); return; } } catch(e){ return; }
    try { await navigator.clipboard.writeText(text); toast("Copied"); } catch(e){ toast(text); }
  };
  $("#fr-on").onclick = () => {
    if (!f.on && !f.name){ toast("Add your name first, so friends know it’s you"); $("#fr-name").focus(); return; }
    if (!f.on && locStatus !== "ok") locate(true);
    frSetOn(!f.on).then(again, fail);
  };
  const add = () => { const v = $("#fr-add").value; if (!v.trim()) return; frAdd(v).then(n => { toast(`Added ${n}`); frLoop(); again(); }, fail); };
  $("#fr-addb").onclick = add;
  $("#fr-add").onkeydown = e => { if (e.key === "Enter"){ e.preventDefault(); add(); } };
  root.querySelectorAll("[data-frshare]").forEach(b => b.onclick = () => { const uid = b.dataset.frshare; frSetShare(uid, !f.list[uid].share).then(again, fail); });
  root.querySelectorAll("[data-frrm]").forEach(b => b.onclick = () => { const uid = b.dataset.frrm; if (!confirm(`Remove ${f.list[uid].n}? You stop seeing each other unless you add them again.`)) return; frRemove(uid).then(again, fail); });
  frRequests().then(rs => {
    const el = $("#fr-reqs"); if (!el || !rs.length) return;
    el.innerHTML = `<h3 style="margin-top:12px">Added you</h3>` + rs.map(r => `<div class="fr-row"><b>${esc(r.n)}</b><button class="btn small primary" type="button" data-frback="${esc(r.c || "")}">Add back</button><button class="icon-btn" type="button" data-frign="${esc(r.uid)}" aria-label="Ignore ${esc(r.n)}">${icon("x","i s")}</button></div>`).join("");
    el.querySelectorAll("[data-frback]").forEach(b => b.onclick = () => frAdd(b.dataset.frback).then(n => { toast(`Added ${n}`); frLoop(); again(); }, fail));
    el.querySelectorAll("[data-frign]").forEach(b => b.onclick = () => frIgnore(b.dataset.frign).then(again, fail));
  }).catch(() => {});
  frLoop();
};
// start quietly: the map shows friends once it's ready
if (typeof window !== "undefined" && frCfg()) setTimeout(frLoop, 4000);
