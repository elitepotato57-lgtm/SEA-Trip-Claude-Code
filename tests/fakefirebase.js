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
    if (top === "groups") return p.length >= 2 && !!get(["groups", a, "members", uid]);
    if (top === "mygroups") return a === uid;
    if (top === "admins") return p.length === 2;
    if (top === "owner") return p.length === 1;
    if (top === "stickerIndex") return true;
    if (top === "stickers") return p.length >= 2;
    if (top === "msgs") return a === uid;
    if (top === "phones") return p.length === 2 && (a === uid || get(["pallow", a, uid]) === true);
    if (top === "pallow" || top === "sos") return a === uid;
    if (top === "push") return p.length === 2 && (a === uid || get(["pushok", a, uid]) === true);
    if (top === "pushok" || top === "tripok") return a === uid;
    if (top === "tripl") return p.length >= 2 && (a === uid || get(["tripok", a, uid]) === true);
    if (top === "gkey") return get(["gkeyok", uid]) === true || get(["admins", uid]) === true;
    if (top === "gkeyok") return get(["admins", uid]) === true || (p.length === 2 && a === uid);
    if (top === "gkeyask" || top === "stats") return get(["admins", uid]) === true;
    if (top === "photos") return true;
    if (top === "invites") return a === uid;
    if (top === "parties") return p.length >= 2 && get(["parties", a, "m", uid]) !== undefined;
    if (top === "tally") return p.length >= 2;
    return false;
  }
  function canWrite(uid, p, val){
    if (!uid) return false;
    const [top, a, b] = p;
    if (top === "users" || top === "share" || top === "loc") return a === uid && (top !== "loc" || p.length === 2);
    if (top === "codes") { if (!/^[A-Z2-9]{6}$/.test(a)) return false; const cur = get(p); return (cur === undefined && val === uid) || (cur === uid && val == null); }
    if (top === "requests") return p.length === 3 && (uid === b || uid === a);
    if (top === "groups"){
      const isMember = !!get(["groups", a, "members", uid]);
      // members add people; only the owner (owner/, Dylan's phone) takes people out or deletes the group's name
      const isAdmin = get(["owner"]) === uid;
      if (p[2] === "members" && p.length === 4) return (isMember && isAdmin) || (isMember && get(p) === undefined && val != null) || (get(["groups", a]) === undefined && p[3] === uid);
      if (p[2] === "n" && p.length === 3) return isMember && (val != null || isAdmin);
      if (p[2] === "items" && p.length === 4) return isMember;
      if (p[2] === "ff" && p.length === 3) return isMember && (val == null || (typeof val === "string" && val.length <= 80));      // the Trip tally's shared forfeit
      return false;
    }
    if (top === "mygroups") return p.length === 3 && (a === uid || !!get(["groups", b, "members", uid]));
    if (top === "owner") return p.length === 1 && get(["owner"]) === undefined && val === uid && get(["admins", uid]) === true;
    if (top === "admins") return p.length === 2 && (get(["admins", uid]) === true || (a === uid && get(["admins"]) === undefined));
    if (top === "stickerIndex" || top === "stickers") return p.length === 2 && get(["admins", uid]) === true && (val == null || top === "stickerIndex" || (val.d && val.d.length < 300000 && val.d.startsWith("data:image/")));
    if (top === "msgs") return p.length === 3 && (uid === a || (get(p) === undefined && val && val.f === uid));
    if (top === "phones") return p.length === 2 && a === uid && (val == null || (typeof val === "string" && /^\+[0-9]{7,15}$/.test(val)));
    if (top === "pallow") return a === uid;
    if (top === "push") return p.length === 2 && a === uid && (val == null || (typeof val.endpoint === "string" && val.endpoint.startsWith("https://") && val.endpoint.length < 600 && typeof val.p256dh === "string" && typeof val.auth === "string"));
    if (top === "pushok") return a === uid && p.length <= 3;
    if (top === "tripok") return a === uid && p.length <= 3;
    if (top === "tripl") return p.length === 2 && a === uid && (val == null || (typeof val.n === "string" && val.n.length <= 60 && val.s != null && val.p != null && typeof val.p === "object"));
    if (top === "gkey" || top === "gkeyok") return get(["admins", uid]) === true && (top === "gkey" ? p.length === 1 : p.length === 2);
    if (top === "gkeyask") return p.length === 2 && (a === uid || get(["admins", uid]) === true);
    if (top === "stats") return p.length >= 2 && a === uid;
    if (top === "sos") return p.length === 3 && (uid === b || uid === a) && (val == null || (val.t <= now && !!val.n && (!val.cl || String(val.cl).startsWith("https://"))));
    if (top === "photos") return p.length === 2 && get(["admins", uid]) === true && (val == null || (typeof val === "string" && val.length < 40000 && val.startsWith("data:image/jpeg;base64,")));
    if (top === "invites") return p.length === 3 && (uid === b || uid === a);
    if (top === "parties"){
      // a member of the game (in m) can change any of it; anyone can start a new one with themselves in m
      if (p.length < 2) return false;
      if (get(["parties", a, "m", uid]) !== undefined) return true;
      return p.length === 2 && get(["parties", a]) === undefined && !!val && !!val.m && val.m[uid] !== undefined && !!val.g && !!val.h;
    }
    if (top === "tally") return a === uid && p.length >= 2 && (p.length !== 3 || val == null || (typeof val.w === "number" && typeof val.p === "number"));
    return false;
  }
  const json = (status, body) => ({ok:status >= 200 && status < 300, status, json:async () => body, text:async () => JSON.stringify(body)});
  async function fetchFake(url, opts = {}){
    const u = new URL(url), method = (opts.method || "GET").toUpperCase();
    if (u.hostname === "identitytoolkit.googleapis.com"){
      if (u.searchParams.get("key") !== API_KEY) return json(400, {error:{message:"API key not valid"}});
      // tokens look like Firebase's (three dot-separated parts, the middle one saying who), so the push worker can read them
      const uid = "u" + (++n), tok = "h." + Buffer.from(JSON.stringify({user_id:uid})).toString("base64url") + ".s" + n, ref = "r" + uid; tokens[tok] = uid; refresh[ref] = uid;
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
