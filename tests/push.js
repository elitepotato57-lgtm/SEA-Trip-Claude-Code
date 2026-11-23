// Tests for push/worker.js (notifications when the app is closed), run in Node with its built-in WebCrypto:
// a pretend phone subscription decrypts what the worker sends (RFC 8291), the signature checks out with the public key
// (RFC 8292), and the worker only notifies friends the pretend Firebase allows. Used by tests/unit.js.
const fs = require("fs"), path = require("path"), vm = require("vm");
const {makeFake, DB_URL} = require("./fakefirebase");
const subtle = globalThis.crypto.subtle;
const b64u = buf => Buffer.from(buf).toString("base64url"), unb64u = s => new Uint8Array(Buffer.from(s, "base64url"));

function loadWorker(fetchImpl){
  const code = fs.readFileSync(path.join(__dirname, "..", "push", "worker.js"), "utf8").replace(/export default\s*\{fetch:handle\};?/, "globalThis.__w = {handle, encryptPush, vapidHeader, tokenUid};");
  const ctx = {crypto:globalThis.crypto, TextEncoder, TextDecoder, URL, Response, Request, Headers, atob, btoa, Uint8Array, DataView, JSON, Math, Date, String, Object, encodeURIComponent, fetch:fetchImpl};
  ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(code, ctx);
  return ctx.__w;
}
// the phone's side: its own key pair and auth secret, and RFC 8291 decryption
async function makePhone(){
  const kp = await subtle.generateKey({name:"ECDH", namedCurve:"P-256"}, true, ["deriveBits"]);
  const pub = new Uint8Array(await subtle.exportKey("raw", kp.publicKey)), auth = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return {kp, sub:{endpoint:"https://web.push.apple.com/QPhone123", p256dh:b64u(pub), auth:b64u(auth)}, pub, auth};
}
const hmac = async (k, d) => new Uint8Array(await subtle.sign("HMAC", await subtle.importKey("raw", k, {name:"HMAC", hash:"SHA-256"}, false, ["sign"]), d));
const cat = (...a) => Buffer.concat(a.map(x => Buffer.from(x)));
async function decrypt(phone, body){
  const salt = body.slice(0, 16), idlen = body[20], asPub = body.slice(21, 21 + idlen), sealed = body.slice(21 + idlen);
  const as = await subtle.importKey("raw", asPub, {name:"ECDH", namedCurve:"P-256"}, false, []);
  const ecdh = new Uint8Array(await subtle.deriveBits({name:"ECDH", public:as}, phone.kp.privateKey, 256));
  const ikm = (await hmac(await hmac(phone.auth, ecdh), cat(Buffer.from("WebPush: info\0"), phone.pub, asPub, [1]))).slice(0, 32);
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(Buffer.from("Content-Encoding: aes128gcm\0"), [1]))).slice(0, 16);
  const nonce = (await hmac(prk, cat(Buffer.from("Content-Encoding: nonce\0"), [1]))).slice(0, 12);
  const plain = new Uint8Array(await subtle.decrypt({name:"AES-GCM", iv:nonce}, await subtle.importKey("raw", cek, {name:"AES-GCM"}, false, ["decrypt"]), sealed));
  if (plain[plain.length - 1] !== 2) throw new Error("no end-of-message marker");
  return new TextDecoder().decode(plain.slice(0, -1));
}
async function vapidKeys(){
  const kp = await subtle.generateKey({name:"ECDSA", namedCurve:"P-256"}, true, ["sign", "verify"]);
  return {kp, pub:b64u(await subtle.exportKey("raw", kp.publicKey)), priv:JSON.stringify(await subtle.exportKey("jwk", kp.privateKey))};
}
async function run(test, ok, eq){
  const phone = await makePhone(), vk = await vapidKeys();
  // 1. encryption round trip and the signature
  const w0 = loadWorker(() => { throw new Error("no fetch"); });
  const body = await w0.encryptPush(phone.sub, JSON.stringify({title:"Sam is lost"}));
  const text = await decrypt(phone, body);
  const env = {VAPID_PUBLIC:vk.pub, VAPID_PRIVATE:vk.priv, VAPID_SUBJECT:"https://example.org/app/", DB_URL, ALLOW_ORIGIN:"https://example.org"};
  const hdr = await w0.vapidHeader(phone.sub.endpoint, env, 1_800_000_000);
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(hdr);
  const claims = JSON.parse(Buffer.from(m[2], "base64url").toString());
  const valid = await subtle.verify({name:"ECDSA", hash:"SHA-256"}, await subtle.importKey("raw", unb64u(m[4]), {name:"ECDSA", namedCurve:"P-256"}, false, ["verify"]), unb64u(m[3]), Buffer.from(m[1] + "." + m[2]));
  test("push worker: the phone decrypts the notification (RFC 8291) and the sender's signature checks out (RFC 8292)", () => {
    eq(text, JSON.stringify({title:"Sam is lost"})); ok(valid, "signature");
    eq([claims.aud, claims.sub, claims.exp], ["https://web.push.apple.com", "https://example.org/app/", 1_800_000_000 + 12 * 3600]); eq(m[4], vk.pub);
  });
  // 2. the whole worker against a pretend Firebase: only friends the receiver allowed get through, with fixed words
  const fb = makeFake(), sent = [];
  const fetchImpl = async (u, o = {}) => { const url = String(u); if (url.startsWith(DB_URL)) return fb.fetch(url, o); sent.push({url, o}); return new Response(null, {status:201}); };
  const w = loadWorker(fetchImpl);
  const sign = async () => { const r = await fb.fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=test-key`, {method:"POST", body:"{}"}); return r.json(); };
  const sam = await sign(), dyl = await sign(), stranger = await sign();
  const put = (who, p, v) => fb.fetch(`${DB_URL}/${p}.json?auth=${who.idToken}`, {method:"PUT", body:JSON.stringify(v)});
  await put(sam, `users/${sam.localId}`, {n:"Sam", c:"SAMSAM"});
  await put(dyl, `push/${dyl.localId}`, phone.sub);
  await put(dyl, `pushok/${dyl.localId}/${sam.localId}`, true);
  const call = (who, q) => w.handle(new Request("https://w.example/send", {method:"POST", headers:{Authorization:"Bearer " + who.idToken, "Content-Type":"application/json"}, body:JSON.stringify(q)}), env);
  const okRes = await call(sam, {to:dyl.localId, kind:"sos"});
  const got = sent.length ? JSON.parse(await decrypt(phone, new Uint8Array(sent[0].o.body))) : null;
  const denied = await call(stranger, {to:dyl.localId, kind:"msg"});
  const badKind = await call(sam, {to:dyl.localId, kind:"anything"});
  let foreign = 0; try { await put(stranger, `push/${dyl.localId}`, {endpoint:"https://evil.example/x", p256dh:"a", auth:"b"}); } catch(e){ foreign = 1; }
  const forged = await fb.fetch(`${DB_URL}/push/${dyl.localId}.json?auth=${stranger.idToken}`);
  test("push worker: a friend the receiver allowed can notify them, with fixed words; a stranger can't, and can't change the address", () => {
    eq(okRes.status, 200); eq(sent.length, 1); eq(sent[0].url, phone.sub.endpoint);
    eq(got, {title:"Sam is lost", body:"Open the app to see where they are and call them", tag:"sos", url:"./"});
    eq(sent[0].o.headers["Content-Encoding"], "aes128gcm"); ok(/^vapid t=/.test(sent[0].o.headers.Authorization));
    eq([denied.status, badKind.status], [403, 400]); eq(forged.status, 401);
    ok(fb.root.push[dyl.localId].endpoint === phone.sub.endpoint, "the stranger's write was refused");
  });
}
module.exports = {run};
