// SEA Trip push relay: a Cloudflare Worker (free plan) that sends "I'm lost" alerts to friends' phones when their app is closed.
// Set up once by Dylan (PUSH-SETUP.md): paste this whole file into a new Worker, add the secret VAPID_JWK (made on the
// developer phone in Tools › Developer › Alerts when closed), then paste the Worker's address into the same place.
//
// A phone posts {subs:[{e, p, a}], title, body, url, tag}; each sub is a friend's push subscription (endpoint, p256dh, auth).
// The relay signs a VAPID token (RFC 8292) and encrypts the message (RFC 8291, aes128gcm) for each, then hands it to that
// phone's push service (Apple, Google or Mozilla). It keeps nothing.

const PUSH_HOSTS = /(^|\.)(push\.apple\.com|fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/;
const SITE = "https://elitepotato57-lgtm.github.io/SEA-Trip-Claude-Code/";
const enc = new TextEncoder();

export const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64u = s => { const b = atob(String(s).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(s).length + 3) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)); };
const cat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts){ out.set(p, o); o += p.length; } return out; };
const hkdf = async (salt, ikm, info, bytes) => new Uint8Array(await crypto.subtle.deriveBits({name:"HKDF", hash:"SHA-256", salt, info},
  await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), bytes * 8));

// the VAPID public key the phones subscribed with (65 bytes, uncompressed), from the private JWK's x and y
export const vapidPublic = jwk => cat(new Uint8Array([4]), unb64u(jwk.x), unb64u(jwk.y));

// RFC 8292: a signed token saying who is sending, for this push service, valid 12 hours
export async function vapidAuth(endpoint, jwk, sub = SITE){
  const key = await crypto.subtle.importKey("jwk", {kty:"EC", crv:"P-256", x:jwk.x, y:jwk.y, d:jwk.d, ext:true}, {name:"ECDSA", namedCurve:"P-256"}, false, ["sign"]);
  const head = b64u(enc.encode(JSON.stringify({typ:"JWT", alg:"ES256"})));
  const body = b64u(enc.encode(JSON.stringify({aud:new URL(endpoint).origin, exp:Math.floor(Date.now() / 1000) + 12 * 3600, sub})));
  const sig = await crypto.subtle.sign({name:"ECDSA", hash:"SHA-256"}, key, enc.encode(head + "." + body));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${b64u(vapidPublic(jwk))}`;
}

// RFC 8291 + RFC 8188 (aes128gcm): the message encrypted so only that phone can read it
export async function encryptFor(sub, text){
  const uaPub = unb64u(sub.p), auth = unb64u(sub.a);
  const uaKey = await crypto.subtle.importKey("raw", uaPub, {name:"ECDH", namedCurve:"P-256"}, false, []);
  const as = await crypto.subtle.generateKey({name:"ECDH", namedCurve:"P-256"}, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const secret = new Uint8Array(await crypto.subtle.deriveBits({name:"ECDH", public:uaKey}, as.privateKey, 256));
  const ikm = await hkdf(auth, secret, cat(enc.encode("WebPush: info\0"), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const plain = cat(enc.encode(text), new Uint8Array([2]));                      // one record: the text, then the last-record mark
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM", iv:nonce}, key, plain));
  const rs = new Uint8Array([0, 0, 16, 0]);                                       // record size 4096
  return cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

export function checkSub(s){
  if (!s || typeof s.e !== "string" || typeof s.p !== "string" || typeof s.a !== "string") return false;
  try { const u = new URL(s.e); return u.protocol === "https:" && PUSH_HOSTS.test(u.hostname) && unb64u(s.p).length === 65 && unb64u(s.a).length === 16; } catch(e){ return false; }
}

export async function sendOne(sub, payload, jwk, env = {}, fetchFn = fetch){
  const body = await encryptFor(sub, payload);
  const r = await fetchFn(sub.e, {method:"POST", body, headers:{
    "Authorization":await vapidAuth(sub.e, jwk, env.VAPID_SUB || SITE), "Content-Encoding":"aes128gcm", "Content-Type":"application/octet-stream",
    "TTL":"86400", "Urgency":"high"}});
  return {ok:r.ok, status:r.status, gone:r.status === 404 || r.status === 410};
}

const CORS = {"Access-Control-Allow-Origin":"*", "Access-Control-Allow-Methods":"POST, OPTIONS", "Access-Control-Allow-Headers":"Content-Type", "Access-Control-Max-Age":"86400"};
const reply = (status, obj) => new Response(JSON.stringify(obj), {status, headers:{...CORS, "Content-Type":"application/json"}});

export async function handle(req, env = {}, fetchFn = fetch){
  if (req.method === "OPTIONS") return new Response(null, {status:204, headers:CORS});
  if (req.method === "GET") return reply(200, {ok:true, ready:!!env.VAPID_JWK, what:"SEA Trip push relay"});
  if (req.method !== "POST") return reply(405, {error:"POST only"});
  let jwk; try { jwk = JSON.parse(env.VAPID_JWK); if (!jwk.d || !jwk.x || !jwk.y) throw 0; } catch(e){ return reply(500, {error:"The secret VAPID_JWK is missing or wrong (PUSH-SETUP.md step 3)"}); }
  let m; try { m = await req.json(); } catch(e){ return reply(400, {error:"not JSON"}); }
  const subs = Array.isArray(m && m.subs) ? m.subs.filter(checkSub).slice(0, 25) : [];
  if (!subs.length) return reply(400, {error:"no subscriptions"});
  const payload = JSON.stringify({title:String(m.title || "SEA Trip").slice(0, 80), body:String(m.body || "").slice(0, 240),
    url:/^\.?\/?#?[\w\/?=&.-]*$/.test(String(m.url || "")) ? String(m.url || "./") : "./", tag:String(m.tag || "sea").slice(0, 40)});
  const out = await Promise.all(subs.map(s => sendOne(s, payload, jwk, env, fetchFn).catch(e => ({ok:false, status:0, error:String(e && e.message || e)}))));
  return reply(200, {sent:out.filter(x => x.ok).length, results:out.map(x => ({status:x.status, gone:!!x.gone}))});
}

export default { fetch:(req, env) => handle(req, env) };
