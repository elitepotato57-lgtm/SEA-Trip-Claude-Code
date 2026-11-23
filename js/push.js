/* ============================================================
   "I'm lost" alerts that reach a phone even when the app is closed (Web Push).
   - Each phone that taps "Get alerts when the app is closed" (Friends › I'm lost) allows notifications and subscribes;
     the subscription goes to pushsub/{uid}, readable only by the friends it lists in pushok/{uid}.
   - Sending: the lost phone reads its friends' subscriptions and posts them to the relay (push/worker.mjs, a free
     Cloudflare Worker Dylan sets up once: PUSH-SETUP.md), which signs and encrypts the alert for each phone.
   - The keys: the developer phone makes them (Tools › Developer); the public half goes to push/key in Firebase, the
     private half is pasted into the relay as a secret and never kept anywhere else.
   - iPhone: only works for the app added to the Home Screen (iOS 16.4 or later), and only after the person allows it.
   ============================================================ */
const pushB64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const pushUnb64u = s => { const b = atob(String(s).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(s).length + 3) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)); };
let pushCfgCache = null, pushAllowed = false;
async function pushCfg(fresh){
  if (pushCfgCache && !fresh) return pushCfgCache;
  const c = await frDb("GET", "push").catch(() => null);
  pushCfgCache = {key:c && c.key || "", url:c && c.url || ""};
  return pushCfgCache;
}
const pushIOS = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent || "");
const pushStandalone = () => typeof navigator !== "undefined" && (navigator.standalone === true || (typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches));
const pushCan = () => typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof window !== "undefined" && "PushManager" in window && "Notification" in window;
async function pushReg(){
  const r = await navigator.serviceWorker.getRegistration();
  if (!r) await navigator.serviceWorker.register("sw.js");
  return navigator.serviceWorker.ready;
}
// on | off | install (iPhone, not opened from the Home Screen) | blocked | notset (no keys or relay yet) | unsupported
async function pushStatus(){
  if (!pushCan()) return pushIOS() && !pushStandalone() ? "install" : "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const cfg = await pushCfg();
  if (!cfg.key || !cfg.url) return "notset";
  if (Notification.permission !== "granted") return "off";
  const sub = await (await pushReg()).pushManager.getSubscription().catch(() => null);
  return sub && S.pushKey === cfg.key ? "on" : "off";
}
// must start inside the tap: an iPhone only shows the "Allow notifications?" question from a tap
async function pushEnable(){
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error(perm === "denied" ? "blocked" : "not allowed");
  const cfg = await pushCfg(true);
  if (!cfg.key || !cfg.url) throw new Error("notset");
  const reg = await pushReg();
  let sub = await reg.pushManager.getSubscription();
  if (sub && S.pushKey !== cfg.key){ await sub.unsubscribe().catch(() => {}); sub = null; }      // new keys: subscribe again
  if (!sub) sub = await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:pushUnb64u(cfg.key)});
  const j = sub.toJSON(), me = await frMe();
  await frDb("PUT", `pushsub/${me.uid}`, {e:j.endpoint, p:j.keys.p256dh, a:j.keys.auth});
  S.pushKey = cfg.key; persist();
  pushAllowed = false; await pushAllow();
  return true;
}
// lets every friend read this phone's subscription (so they can alert it); again whenever the friends list changes
async function pushAllow(){
  if (pushAllowed) return;
  const ids = Object.keys(frState().list); if (!ids.length) return;
  const me = await frMe();
  await frDb("PATCH", `pushok/${me.uid}`, Object.fromEntries(ids.map(u => [u, true])));
  pushAllowed = true;
}
// sends a notification to these friends' phones; resolves how many the relay handed on
async function pushSend(uids, title, body, url = "./", tag = "sea"){
  const cfg = await pushCfg(!pushCfgCache || !pushCfgCache.url); if (!cfg.url) return 0;
  const subs = (await Promise.all(uids.map(u => frDb("GET", `pushsub/${u}`).catch(() => null)))).filter(s => s && s.e);
  if (!subs.length) return 0;
  const r = await fetch(cfg.url, {method:"POST", headers:{"Content-Type":"text/plain"}, body:JSON.stringify({subs, title, body, url, tag})});
  const j = await r.json().catch(() => ({}));
  return j.sent || 0;
}

/* ---------- Friends › I'm lost: the line about alerts when the app is closed ---------- */
const PUSH_LINES = {
  on:() => `<p class="note push-on">${icon("check","i xs")} Alerts reach this phone even when the app is closed.</p>`,
  off:() => `<button class="btn small wide" type="button" id="push-on" style="margin-top:8px">${icon("siren","i s")}Get alerts when the app is closed</button>
    <p class="note">Your phone will ask to allow notifications: tap Allow, so a mate’s “I’m lost” reaches you even with the app shut.</p>`,
  install:() => `<p class="note">To get alerts when the app is closed, add it to your Home Screen (Share › Add to Home Screen), open it from there and come back here.</p>`,
  blocked:() => `<p class="note">Notifications are off for this app, so alerts only show while it’s open. Switch them on in the iPhone’s Settings › Notifications › SEA Trip.</p>`,
  notset:() => `<p class="note">Alerts to closed apps aren’t set up yet${S.dev ? " (Tools › Developer › Alerts when the app is closed)" : ""}: for now they show when your mates next open the app.</p>`,
  unsupported:() => ""
};
async function pushPaint(root){
  const el = root.querySelector("#fr-push"); if (!el) return;
  let st = "unsupported"; try { st = await pushStatus(); } catch(e){}
  if (!el.isConnected) return;
  // the keys were changed since this phone subscribed: subscribe again quietly (notifications are already allowed)
  if (st === "off" && S.pushKey && typeof Notification !== "undefined" && Notification.permission === "granted"){ try { await pushEnable(); st = "on"; } catch(e){} }
  if (st === "on") pushAllow().catch(() => {});
  el.innerHTML = PUSH_LINES[st]();
  const b = el.querySelector("#push-on");
  if (b) b.onclick = async () => {
    b.disabled = true;
    try { await pushEnable(); toast("Done: alerts will reach this phone even when the app is closed"); }
    catch(e){ toast(e.message === "blocked" ? "Notifications are blocked: allow them in Settings › Notifications" : e.message === "notset" ? "Not set up yet" : e.message === "permission" ? "Firebase refused it: re-publish the rules (FIREBASE-SETUP.md)" : "Not allowed, so alerts only show while the app is open"); }
    pushPaint(root);
  };
}

/* ---------- Tools › Developer: making the keys and saving the relay's address ---------- */
async function pushMakeKeys(){
  const k = await crypto.subtle.generateKey({name:"ECDSA", namedCurve:"P-256"}, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", k.privateKey), pub = pushB64u(await crypto.subtle.exportKey("raw", k.publicKey));
  return {secret:JSON.stringify({kty:"EC", crv:"P-256", x:jwk.x, y:jwk.y, d:jwk.d}), pub};
}
function pushDevHTML(){
  return `<div class="block" id="push-dev"><h2>Alerts when the app is closed</h2><p class="note">Loading…</p></div>`;
}
async function pushDevPaint(){
  const el = $("#push-dev"); if (!el) return;
  const cfg = await pushCfg(true).catch(() => ({key:"", url:""}));
  if (!el.isConnected) return;
  el.innerHTML = `<h2>Alerts when the app is closed</h2>
    <p class="note">So “I’m lost” reaches a mate’s phone even with the app shut. Needs a free Cloudflare relay: follow PUSH-SETUP.md (about 10 minutes, once).</p>
    <p class="note"><b>Keys:</b> ${cfg.key ? "made" : "not made yet"} · <b>Relay:</b> ${cfg.url ? esc(cfg.url) : "not saved yet"}</p>
    <button class="btn small" type="button" id="push-keys">${icon("shield","i s")}${cfg.key ? "Make new keys" : "Make the keys"}</button>
    <div id="push-secret"></div>
    <label class="field" style="margin-top:10px">Relay address<input id="push-url" type="url" placeholder="https://sea-trip-push.yourname.workers.dev" value="${esc(cfg.url)}"></label>
    <div class="row" style="margin-top:6px"><button class="btn small" type="button" id="push-save">Save the address</button><button class="btn small" type="button" id="push-test">Send this phone a test alert</button></div>`;
  $("#push-keys").onclick = async () => {
    if (cfg.key && !(await askConfirm("Make new keys? Everyone’s phone subscribes again by itself next time they open Friends, and you’ll need to paste the new secret into Cloudflare.", "Make new keys"))) return;
    try {
      const k = await pushMakeKeys();
      await frDb("PUT", "push/key", k.pub); pushCfgCache = null;
      $("#push-secret").innerHTML = `<p class="note" style="margin-top:8px"><b>Copy this secret into Cloudflare now</b> (PUSH-SETUP.md step 3, name it VAPID_JWK). It isn’t kept anywhere else: if it’s lost, make new keys.</p>
        <textarea id="push-jwk" readonly rows="4" style="width:100%;font-family:monospace;font-size:12px">${esc(k.secret)}</textarea>
        <button class="btn small" type="button" id="push-copy">${icon("check","i s")}Copy the secret</button>`;
      $("#push-copy").onclick = () => { const t = $("#push-jwk"); t.select(); (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject()).then(() => toast("Copied"), () => { document.execCommand && document.execCommand("copy"); toast("Copied"); }); };
      toast("Keys made: copy the secret into Cloudflare");
    } catch(e){ toast(e.message === "permission" ? "Firebase refused it: re-publish the rules" : "Couldn’t make keys: " + (e.message || e)); }
  };
  $("#push-save").onclick = async () => {
    const u = $("#push-url").value.trim();
    if (!/^https:\/\/[^\s]+$/.test(u)) return toast("That doesn’t look like the relay’s https:// address");
    try { await frDb("PUT", "push/url", u); pushCfgCache = null; toast("Saved: phones can now turn on alerts in Friends"); pushDevPaint(); }
    catch(e){ toast(e.message === "permission" ? "Firebase refused it: re-publish the rules" : "No signal? Try again"); }
  };
  $("#push-test").onclick = async () => {
    try {
      const me = await frMe(); const n = await pushSend([me.uid], "Test alert", "Alerts reach this phone with the app closed.", "./#tools/friends", "test");
      toast(n ? "Sent: it should pop up in a few seconds (close the app to see it as a notification)" : "Not sent: turn on alerts in Friends › I’m lost first, and check the relay");
    } catch(e){ toast("The relay didn’t answer: check its address and the secret (PUSH-SETUP.md)"); }
  };
}
