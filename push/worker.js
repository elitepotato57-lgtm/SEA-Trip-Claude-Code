/* SE Asia Trip: notifications when the app is closed (a free Cloudflare Worker). PUSH-SETUP.md says how to put it online.

   The app on one phone asks this worker to notify a friend:
     POST /send   {"to": "<friend's id>", "kind": "sos" | "msg" | "meet"}   header  Authorization: Bearer <the sender's Firebase token>
   The worker reads the friend's notification address (push/<id> in the Firebase database) using the sender's own token, so the
   database rules decide who may notify whom: only friends the receiver allowed (pushok/<id>/<friend>). The words are fixed here
   ("Sam is lost", "Sam sent you a message"), so nobody can send anything else through it. It keeps nothing.

   Settings (Cloudflare › the worker › Settings › Variables and Secrets):
     DB_URL         the Firebase database address, as in config.js
     VAPID_PUBLIC   the public key the app made (Tools › Friends › Notifications › Make keys, on the developer phone)
     VAPID_PRIVATE  the private key from the same place (add it as a Secret)
     VAPID_SUBJECT  the app's address, https://elitepotato57-lgtm.github.io/SEA-Trip-Claude-Code/
     ALLOW_ORIGIN   https://elitepotato57-lgtm.github.io
   Web Push encryption: RFC 8291 (aes128gcm); the sender's signature: RFC 8292 (VAPID). Only WebCrypto, no packages. */

const PUSH_HOSTS = [/^web\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];
const TEXT = {
  sos:n => ({title:`${n} is lost`, body:"Open the app to see where they are and call them", tag:"sos"}),
  msg:n => ({title:`${n} sent you a message`, body:"Open the app to see it", tag:"msg"}),
  meet:n => ({title:`${n}: meet up`, body:"Open the app for the time and the spot", tag:"meet"})
};
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const cat = (...a) => { const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of a){ out.set(x, o); o += x.length; } return out; };
async function hmac(key, data){
  const k = await crypto.subtle.importKey("raw", key, {name:"HMAC", hash:"SHA-256"}, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

// RFC 8291: encrypt the message for one phone's subscription ({endpoint, p256dh, auth}, both keys base64url)
async function encryptPush(sub, text){
  const uaPublic = unb64u(sub.p256dh), authSecret = unb64u(sub.auth);
  const as = await crypto.subtle.generateKey({name:"ECDH", namedCurve:"P-256"}, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const ua = await crypto.subtle.importKey("raw", uaPublic, {name:"ECDH", namedCurve:"P-256"}, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({name:"ECDH", public:ua}, as.privateKey, 256));
  const prkKey = await hmac(authSecret, ecdh);
  const ikm = (await hmac(prkKey, cat(enc.encode("WebPush: info\0"), uaPublic, asPublic, new Uint8Array([1])))).slice(0, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey("raw", cek, {name:"AES-GCM"}, false, ["encrypt"]);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM", iv:nonce}, key, cat(enc.encode(text), new Uint8Array([2]))));
  const head = new Uint8Array(21); head.set(salt, 0); new DataView(head.buffer).setUint32(16, 4096); head[20] = asPublic.length;
  return cat(head, asPublic, sealed);
}
// RFC 8292: the "who's sending" signature for the push service
async function vapidHeader(endpoint, env, now = Math.floor(Date.now() / 1000)){
  const jwk = JSON.parse(env.VAPID_PRIVATE);
  const key = await crypto.subtle.importKey("jwk", jwk, {name:"ECDSA", namedCurve:"P-256"}, false, ["sign"]);
  const body = b64u(enc.encode(JSON.stringify({typ:"JWT", alg:"ES256"}))) + "." + b64u(enc.encode(JSON.stringify({aud:new URL(endpoint).origin, exp:now + 12 * 3600, sub:env.VAPID_SUBJECT})));
  const sig = await crypto.subtle.sign({name:"ECDSA", hash:"SHA-256"}, key, enc.encode(body));
  return `vapid t=${body}.${b64u(sig)}, k=${env.VAPID_PUBLIC}`;
}
// the sender's id, from their Firebase token (Firebase itself checks the token when the worker reads with it)
function tokenUid(tok){
  try { return JSON.parse(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).user_id || null; } catch(e){ return null; }
}
async function handle(req, env){
  const cors = {"Access-Control-Allow-Origin":env.ALLOW_ORIGIN || "*", "Access-Control-Allow-Methods":"POST, OPTIONS", "Access-Control-Allow-Headers":"Authorization, Content-Type"};
  const reply = (status, msg) => new Response(JSON.stringify({ok:status < 300, msg}), {status, headers:{...cors, "Content-Type":"application/json"}});
  if (req.method === "OPTIONS") return new Response(null, {status:204, headers:cors});
  if (req.method !== "POST" || new URL(req.url).pathname !== "/send") return reply(404, "POST /send");
  const tok = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""), from = tokenUid(tok);
  let q; try { q = await req.json(); } catch(e){ return reply(400, "bad JSON"); }
  if (!tok || !from || !q || !/^[\w-]{1,128}$/.test(q.to || "") || !TEXT[q.kind]) return reply(400, "to, kind and a token are needed");
  const db = env.DB_URL.replace(/\/$/, ""), auth = encodeURIComponent(tok);
  const r = await fetch(`${db}/push/${q.to}.json?auth=${auth}`);
  if (r.status === 401 || r.status === 403) return reply(403, "not allowed to notify this friend");
  const sub = r.ok ? await r.json() : null;
  if (!sub || !sub.endpoint) return reply(404, "notifications aren't on for this friend");
  let host; try { host = new URL(sub.endpoint).hostname; } catch(e){ return reply(400, "bad address"); }
  if (!PUSH_HOSTS.some(h => h.test(host))) return reply(400, "not a push service");
  const n = await fetch(`${db}/users/${from}/n.json?auth=${auth}`).then(x => x.ok ? x.json() : null).catch(() => null);
  const name = String(n || "A friend").replace(/[<>]/g, "").slice(0, 30);
  const msg = Object.assign(TEXT[q.kind](name), {url:"./"});
  const body = await encryptPush(sub, JSON.stringify(msg));
  const pr = await fetch(sub.endpoint, {method:"POST", body, headers:{"Content-Encoding":"aes128gcm", "Content-Type":"application/octet-stream", TTL:"86400", Urgency:q.kind === "sos" ? "high" : "normal", Authorization:await vapidHeader(sub.endpoint, env)}});
  if (pr.status === 404 || pr.status === 410) return reply(410, "that phone's notification address has expired");
  return reply(pr.ok ? 200 : 502, pr.ok ? "sent" : "push service said " + pr.status);
}
export default {fetch:handle};
