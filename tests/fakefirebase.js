// A pretend Firebase for tests: anonymous sign-up, token refresh, and a Realtime Database over REST that keeps data in memory
// and applies the same rules as firebase/database.rules.json (who may read and write what), checked by hand below.
const DB_URL = "https://sea-trip-test-default-rtdb.asia-southeast1.firebasedatabase.app";
const API_KEY = "test-key";
function makeFake(){
  const root = {}, tokens = {}, refresh = {};
  let n = 0, now = 1_800_000_000_000;
  const get = parts => parts.reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), root);
  const put = (parts, v) => {
    let o = root; for (let i = 0; i < parts.length - 1; i++){ if (!o[parts[i]] || typeof o[parts[i]] !== "object") o[parts[i]] = {}; o = o[parts[i]]; }
    const k = parts[parts.length - 1];
    if (v === null || v === undefined) delete o[k]; else o[k] = v;
  };
  const resolve = v => v && typeof v === "object" && v[".sv"] === "timestamp" ? now : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x)])) : v;
  // the rules, as in firebase/database.rules.json
  function canRead(uid, p){
    if (!uid) return false;
    const [top, a] = p;
    if (top === "users" || top === "codes") return p.length >= 2;
    if (top === "requests" || top === "share") return a === uid;
    if (top === "loc") return a === uid || get(["share", a, uid]) === true;
    return false;
  }
  function canWrite(uid, p, val){
    if (!uid) return false;
    const [top, a, b] = p;
    if (top === "users" || top === "share" || top === "loc") return a === uid && (top !== "loc" || p.length === 2);
    if (top === "codes") { if (!/^[A-Z2-9]{6}$/.test(a)) return false; const cur = get(p); return (cur === undefined && val === uid) || (cur === uid && val == null); }
    if (top === "requests") return p.length === 3 && (uid === b || uid === a);
    return false;
  }
  const json = (status, body) => ({ok:status >= 200 && status < 300, status, json:async () => body, text:async () => JSON.stringify(body)});
  async function fetchFake(url, opts = {}){
    const u = new URL(url), method = (opts.method || "GET").toUpperCase();
    if (u.hostname === "identitytoolkit.googleapis.com"){
      if (u.searchParams.get("key") !== API_KEY) return json(400, {error:{message:"API key not valid"}});
      const uid = "u" + (++n), tok = "t" + uid + "-" + n, ref = "r" + uid; tokens[tok] = uid; refresh[ref] = uid;
      return json(200, {localId:uid, idToken:tok, refreshToken:ref, expiresIn:"3600"});
    }
    if (u.hostname === "securetoken.googleapis.com"){
      const ref = new URLSearchParams(opts.body).get("refresh_token"), uid = refresh[ref];
      if (!uid) return json(400, {error:{message:"INVALID_REFRESH_TOKEN"}});
      const tok = "t" + uid + "-" + (++n); tokens[tok] = uid;
      return json(200, {user_id:uid, id_token:tok, refresh_token:ref, expires_in:"3600"});
    }
    if (url.startsWith(DB_URL)){
      const uid = tokens[u.searchParams.get("auth")];
      const parts = decodeURIComponent(u.pathname.replace(/\.json$/, "")).split("/").filter(Boolean);
      if (method === "GET"){ if (!canRead(uid, parts)) return json(401, {error:"Permission denied"}); const v = get(parts); return json(200, v === undefined ? null : v); }
      const body = opts.body != null ? JSON.parse(opts.body) : null;
      if (method === "DELETE"){ if (!canWrite(uid, parts, null)) return json(401, {error:"Permission denied"}); put(parts, null); return json(200, null); }
      if (method === "PUT"){ const v = resolve(body); if (!canWrite(uid, parts, v)) return json(401, {error:"Permission denied"}); put(parts, v); return json(200, v); }
      if (method === "PATCH"){ if (!canWrite(uid, parts, body)) return json(401, {error:"Permission denied"}); for (const [k, v] of Object.entries(body)) put(parts.concat(k), resolve(v)); return json(200, body); }
    }
    return json(404, {error:"not handled: " + url});
  }
  return {fetch:fetchFake, root, tick:ms => { now += ms; }, get now(){ return now; }};
}
module.exports = {makeFake, DB_URL, API_KEY};
