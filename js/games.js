/* ============================================================
   Games: Friends › Play. Five live games for long bus rides, plus the Trip tally.
   Four in a row and Sink the fleet (2 players), Liar's dice (2-6), Guess the price and Where in the world (1-8).
   Firebase (rules in firebase/database.rules.json):
     parties/{pid}  {g: game, h: host uid, m: {uid: name}, j: {uid: true} (opened it), k: game number, s: the game}
                    only the people in m can read or write it; the host puts everyone invited into m.
     invites/{uid}/{from} {g, n, t, p: pid}   the "Sam wants to play…" popup
     tally/{uid}    {game: {w: wins, p: played}}   each phone writes only its own
   Each game is a small object: init(players) makes a fresh game, paint() draws it, result() says who won.
   Turn games are written only by the player whose turn it is, so two phones never write the same thing at once.
   ============================================================ */
const GM_RECENT = "gm-recent-v1", GM_DONE = "gm-done-v1";
const gmRand = n => { const b = new Uint32Array(1); crypto.getRandomValues(b); return b[0] % n; };
const gmShuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--){ const j = gmRand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const gmArr = v => Array.isArray(v) ? v : v && typeof v === "object" ? Object.keys(v).sort((a, b) => a - b).map(k => v[k]) : [];
const gmWord = n => ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] || String(n);
const DIE = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

/* ---------- 1. Four in a row ---------- */
const C4_W = 7, C4_H = 6;
function c4Win(b){
  const at = (r, c) => r >= 0 && r < C4_H && c >= 0 && c < C4_W ? b[r * C4_W + c] : ".";
  for (let r = 0; r < C4_H; r++) for (let c = 0; c < C4_W; c++){
    const v = at(r, c); if (v === ".") continue;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]){
      const line = [0, 1, 2, 3].map(k => [r + dr * k, c + dc * k]);
      if (line.every(([y, x]) => at(y, x) === v)) return {v, cells:line.map(([y, x]) => y * C4_W + x)};
    }
  }
  return null;
}
function c4Drop(b, col){
  for (let r = C4_H - 1; r >= 0; r--) if (b[r * C4_W + col] === ".") return r * C4_W + col;
  return -1;
}
/* ---------- 2. Sink the fleet ---------- */
const SF_N = 8, SF_SHIPS = [4, 3, 3, 2];
function sfRandomFleet(){
  for (;;){
    const g = Array(SF_N * SF_N).fill("."); let ok = true;
    SF_SHIPS.forEach((len, si) => {
      if (!ok) return;
      for (let tries = 0; tries < 200; tries++){
        const across = gmRand(2) === 0, r = gmRand(across ? SF_N : SF_N - len + 1), c = gmRand(across ? SF_N - len + 1 : SF_N);
        const cells = Array.from({length:len}, (_, k) => across ? r * SF_N + c + k : (r + k) * SF_N + c);
        // boats never touch, even corner to corner (easier to read on a small screen)
        const clear = cells.every(i => { const y = Math.floor(i / SF_N), x = i % SF_N; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){ const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < SF_N && xx >= 0 && xx < SF_N && g[yy * SF_N + xx] !== ".") return false; } return true; });
        if (clear){ cells.forEach(i => g[i] = String(si)); return; }
      }
      ok = false;
    });
    if (ok) return g.join("");
  }
}
// the boats in a fleet: [{si, cells, across}]
const sfBoats = g => SF_SHIPS.map((len, si) => { const cells = [...g].map((v, i) => v === String(si) ? i : -1).filter(i => i >= 0); return {si, cells, across:cells.length < 2 || cells[1] - cells[0] === 1}; });
// boat si with its first cell at row r, column c, across or down: the new fleet, or null if it runs off the sea or touches another boat
function sfPlace(g, si, r, c, across){
  const len = SF_SHIPS[si];
  if (r < 0 || c < 0 || (across ? c + len > SF_N || r >= SF_N : r + len > SF_N || c >= SF_N)) return null;
  const a = [...g].map(v => v === String(si) ? "." : v);
  const cells = Array.from({length:len}, (_, k) => across ? r * SF_N + c + k : (r + k) * SF_N + c);
  for (const i of cells){
    const y = Math.floor(i / SF_N), x = i % SF_N;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){ const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < SF_N && xx >= 0 && xx < SF_N && a[yy * SF_N + xx] !== ".") return null; }
  }
  cells.forEach(i => a[i] = String(si));
  return a.join("");
}
// tap a boat: it turns round, keeping the tapped square in it where it fits (null if there's no room)
function sfRotate(g, si, tapped){
  const b = sfBoats(g)[si], len = SF_SHIPS[si], across = !b.across, at = b.cells.indexOf(tapped) >= 0 ? b.cells.indexOf(tapped) : 0;
  const r0 = Math.floor((b.cells[at] != null ? b.cells[at] : b.cells[0]) / SF_N), c0 = (b.cells[at] != null ? b.cells[at] : b.cells[0]) % SF_N;
  const order = [at].concat(Array.from({length:len}, (_, k) => k).filter(k => k !== at));
  for (const k of order){ const t = sfPlace(g, si, across ? r0 : r0 - k, across ? c0 - k : c0, across); if (t) return t; }
  return null;
}
// drag a boat: the square it was picked up by goes to the square under the finger
function sfMove(g, si, grabbed, to){
  const b = sfBoats(g)[si], k = Math.max(0, b.cells.indexOf(grabbed)), r = Math.floor(to / SF_N), c = to % SF_N;
  return sfPlace(g, si, b.across ? r : r - k, b.across ? c - k : c, b.across);
}
// how a square of a boat is drawn: across or down, the bow (first square) and the stern (last)
function sfPart(g, i){
  const v = g[i]; if (!v || v === ".") return "";
  const x = i % SF_N, L = x > 0 && g[i - 1] === v, R = x < SF_N - 1 && g[i + 1] === v, U = i >= SF_N && g[i - SF_N] === v, Dn = g[i + SF_N] === v, across = L || R;
  return `ship ${across ? "h" : "v"}${(across ? !L : !U) ? " bow" : ""}${(across ? !R : !Dn) ? " stern" : ""}`;
}
const sfShipsLeft = (fleet, shots) => SF_SHIPS.filter((len, si) => [...fleet].some((v, i) => v === String(si) && shots[i] !== "x")).length;
const sfAllSunk = (fleet, shots) => !!fleet && [...fleet].every((v, i) => v === "." || shots[i] === "x");
const sfSunkCells = (fleet, shots) => { const s = new Set(); SF_SHIPS.forEach((len, si) => { const cells = [...fleet].map((v, i) => v === String(si) ? i : -1).filter(i => i >= 0); if (cells.every(i => shots[i] === "x")) cells.forEach(i => s.add(i)); }); return s; };
/* ---------- 3. Liar's dice ---------- */
const ldRoll = n => Array.from({length:n}, () => 1 + gmRand(6)).join("");
const ldAlive = s => gmArr(s.p).filter(u => ((s.n || {})[u] || 0) > 0);
function ldNext(s, uid){ const a = gmArr(s.p), alive = ldAlive(s); if (!alive.length) return ""; let i = a.indexOf(uid); for (let k = 0; k < a.length; k++){ i = (i + 1) % a.length; if (alive.includes(a[i])) return a[i]; } return alive[0]; }
const ldTurn = s => s.bid ? ldNext(s, s.bid.by) : s.t;
const ldReady = s => ldAlive(s).every(u => (s.d || {})[u] && s.d[u].r === s.r);
const ldTotal = s => ldAlive(s).reduce((t, u) => t + s.n[u], 0);
const ldOk = (s, q, f) => q >= 1 && f >= 1 && f <= 6 && q <= ldTotal(s) && (!s.bid || q > s.bid.q || (q === s.bid.q && f > s.bid.f));
const ldBidText = b => `${gmWord(b.q)} ${b.f}${b.q === 1 ? "" : "s"}`;
/* ---------- 4 and 5: the quiz games (the same rounds: everyone answers, the closest wins) ---------- */
// Guess the price: only researched prices (places with a price, journeys with a fare), never estimates, and only ones with a
// photo (Dylan, 24 Nov 2026: "otherwise it's impossible"): a place's own photo (the photo rules apply: no temples, no Buddhas),
// and for a journey, the photo of where it goes, with the distance
function gpPhoto(p){
  if (p.pic) return {src:p.pic[0], by:"Photo: Wikimedia Commons"};
  const f = typeof photoIndexNow !== "undefined" && photoIndexNow ? photoIndexNow[p.id] : null;
  if (f && typeof photoFileOk === "function" && photoFileOk(p, f) && photoPlaceOk(p)) return {src:commonsThumb(f, 640) || indexedPhoto(f).src, by:"Photo: Wikimedia Commons"};
  return null;
}
const gpEdgeDest = e => { const h = Object.values(D.net.hubs).find(x => x[0] === e.b); return h ? (DEST_IMG[h[1]] ? h[1] : DEST_IMG[h[4]] ? h[4] : null) : null; };
function gpQuestions(){
  const pl = D.places.filter(p => p.p && p.p.length && p.p[0] > 0 && p.cur && p.cur !== "GBP" && !/budget|evening/.test(p.pu || "") && gpPhoto(p)).map(p => "p:" + p.id);
  const ed = D.net.edges.map((e, i) => e.p && e.p.length && e.cur && e.cur !== "GBP" && !e.from && gpEdgeDest(e) ? "e:" + i : "").filter(Boolean);
  const nPl = Math.min(pl.length, ed.length ? 3 : 5);
  return gmShuffle(gmShuffle(pl).slice(0, nPl).concat(gmShuffle(ed).slice(0, 5 - nPl))).slice(0, 5);
}
const gpHub = id => { const h = Object.values(D.net.hubs).find(x => x[0] === id); return h ? h[1] : id; };
function gpItem(key){
  const [t, id] = [key.slice(0, 1), key.slice(2)];
  if (t === "p"){
    const p = D.places.find(x => x.id === id); if (!p) return null;
    const what = p.c === "gaff" ? (p.pu || "per night").replace(/, from$/, "") : p.c === "cool" ? (p.pu || "entry") : (p.pu || "per dish");
    return {q:`${p.n}, ${p.city}`, sub:what, p:p.p, cur:p.cur, ic:p.c === "gaff" ? "bed" : p.c === "munch" ? "food" : "ticket", src:p.rs || (p.src && p.src[0] && p.src[0][0]) || "", img:gpPhoto(p)};
  }
  const e = D.net.edges[+id]; if (!e) return null;
  const ic = /flight|plane/i.test(e.mode) ? "plane" : /train/i.test(e.mode) ? "train" : /ferry|boat|speed/i.test(e.mode) ? "ship" : "bus";
  const ha = Object.values(D.net.hubs).find(x => x[0] === e.a), hb = Object.values(D.net.hubs).find(x => x[0] === e.b);
  const km = ha && hb ? Math.round(dist({lat:ha[2], lng:ha[3]}, {lat:hb[2], lng:hb[3]})) : null, dn = gpEdgeDest(e);
  return {q:`${e.mode} from ${gpHub(e.a)} to ${gpHub(e.b)}`, sub:`${km ? `About ${km} km as the crow flies${e.dur ? `, ${fRange(e.dur[0], e.dur[1])}` : ""}. ` : ""}${e.op ? `${e.op}, one way` : "One way"}`, p:e.p, cur:e.cur, ic, src:(e.src && e.src[0] && e.src[0][0]) || "",
    img:dn ? {src:DEST_IMG[dn], by:`Photo: ${dn}, where it goes`} : null};
}
// how far off a guess is: 0 inside the real range, else the gap as a share of the price
function gpOff(item, g){ const lo = Math.min(...item.p), hi = Math.max(...item.p); return g >= lo && g <= hi ? 0 : g < lo ? (lo - g) / lo : (g - hi) / hi; }
// Where in the world: the destination photos already in the app
function wwQuestions(){ return gmShuffle(Object.keys(DEST_IMG).filter(n => D.cities.some(c => c[0] === n))).slice(0, 5); }
const wwCity = n => { const c = D.cities.find(x => x[0] === n); return c ? {n, lat:c[1], lng:c[2]} : null; };

// every photo of the game, asked for at the start so each round's shows at once
function gmPreload(srcs){
  const want = srcs.filter(Boolean).join("|"); if (!want || gmCache.pre === want) return;
  gmCache.pre = want; gmCache.preImgs = srcs.filter(Boolean).map(s => { const im = new Image(); im.decoding = "async"; im.src = s; return im; });
}
// the same scoring for both quiz games: per round, the closest answer(s) win a point
function quizScores(game, s){
  const q = gmArr(s.q), sc = {}; gmArr(s.p).forEach(u => sc[u] = 0);
  q.forEach((key, i) => {
    const g = (s.g || {})[i] || {}; if (!gmArr(s.p).every(u => g[u] != null) && i >= (s.i || 0)) return;
    const offs = Object.entries(g).map(([u, v]) => [u, game.off(key, v)]).filter(([, o]) => isFinite(o));
    if (!offs.length) return;
    const best = Math.min(...offs.map(([, o]) => o));
    offs.filter(([, o]) => o === best).forEach(([u]) => { if (u in sc) sc[u]++; });
  });
  return sc;
}

const GAMES = {
  c4: {n:"Four in a row", ic:"🔴🟡", min:2, max:2, d:"Drop counters, get four in a line",
    rules:["Take turns dropping a counter into a column.", "Get four of yours in a line (across, up or diagonal) to win."],
    init:p => ({p:gmShuffle(p), b:".".repeat(C4_W * C4_H), t:0, last:-1}),
    result(s){ const w = c4Win(s.b); if (w) return {w:[gmArr(s.p)[w.v === "a" ? 0 : 1]]}; if (!s.b.includes(".")) return {w:[]}; return null; }},
  fleet: {n:"Sink the fleet", ic:"🚢💥", min:2, max:2, d:"Find and sink their boats",
    rules:["Hide your 4 boats: drag them where you want and tap one to turn it round (or Shuffle), then Ready.", "Take turns tapping their sea to fire: a burst of fire is a hit, a splash is a miss.", "Sink all their boats first to win."],
    init:p => ({p:gmShuffle(p), t:0, f:{}, h:{}}),
    result(s){ const p = gmArr(s.p); for (let k = 0; k < 2; k++){ const them = p[1 - k]; if (sfAllSunk((s.f || {})[them], ((s.h || {})[them]) || "")) return {w:[p[k]]}; } return null; }},
  dice: {n:"Liar’s dice", ic:"🎲🤥", min:2, max:6, d:"Bluff about everyone’s dice",
    rules:["Everyone rolls 5 dice in secret.", "Take turns guessing how many of one number are on the table, counting everyone’s dice. For example “four 5s”.",
      "Each guess must go higher: more dice, or the same number of dice with a higher number.", "Think the last guess is wrong? Call Liar! Whoever was wrong loses a die.", "Lose all your dice and you’re out. Last one with dice wins."],
    init:p => { const pp = gmShuffle(p), n = {}; pp.forEach(u => n[u] = 5); return {p:pp, n, r:1, d:{}, t:pp[0]}; },
    result(s){ const a = ldAlive(s); return a.length === 1 && gmArr(s.p).length > 1 ? {w:a} : null; }},
  price: {n:"Guess the price", ic:"💸🤔", min:1, max:8, d:"How much is it really?",
    rules:["5 rounds. You see something from the trip: a hostel bed, a dish, a ferry…", "Everyone guesses the price. The closest guess wins the round (spot on if it’s inside the real price range).", "Most rounds won wins. The prices are the researched ones in the app."],
    init:p => ({p, q:gpQuestions(), i:0, g:{}}),
    off(key, v){ const it = gpItem(key); return it ? gpOff(it, +v) : Infinity; },
    result(s){ if ((s.i || 0) < gmArr(s.q).length) return null; const sc = quizScores(this, s), top = Math.max(...Object.values(sc)); return {w:top > 0 ? Object.keys(sc).filter(u => sc[u] === top) : []}; }},
  where: {n:"Where in SEA", ic:"📸🗺️", min:1, max:8, d:"Guess the place from a photo",
    rules:["5 rounds. You see a photo of a trip destination.", "Tap the map where you think it is, then Lock in.", "The closest pin wins the round. Most rounds won wins."],
    init:p => ({p, q:wwQuestions(), i:0, g:{}}),
    off(key, v){ const c = wwCity(key), a = String(v).split(","); return c && a.length === 2 ? dist(c, {lat:+a[0], lng:+a[1]}) : Infinity; },
    result(s){ if ((s.i || 0) < gmArr(s.q).length) return null; const sc = quizScores(this, s), top = Math.max(...Object.values(sc)); return {w:top > 0 ? Object.keys(sc).filter(u => sc[u] === top) : []}; }},
};
const GAME_ORDER = ["c4", "fleet", "dice", "price", "where"];

/* ---------- the rules card (the first time you open a game, and the ? in the corner) ---------- */
function gmRulesHTML(id){
  const g = GAMES[id];
  return `<div class="gm-rules" id="gmRules"><div class="gm-rcard"><div class="gm-ric">${g.ic}</div><h3>${esc(g.n)}</h3>
    <ol>${g.rules.map(r => `<li>${esc(r)}</li>`).join("")}</ol><button class="btn primary wide" type="button" id="gmRulesOk">Got it</button></div></div>`;
}
function gmShowRules(id, box){
  const old = $("#gmRules"); if (old) old.remove();
  box.insertAdjacentHTML("beforeend", gmRulesHTML(id));
  $("#gmRulesOk").onclick = () => { $("#gmRules").remove(); const seen = lsGet("gm-seen", {}) || {}; seen[id] = 1; lsSet("gm-seen", seen); };
}
const gmSeen = id => !!(lsGet("gm-seen", {}) || {})[id];

/* ---------- starting a game: pick friends, make the party, invite them ---------- */
function openGameStart(id){
  const g = GAMES[id], f = frState(), list = Object.entries(f.list).sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
  const pick = new Set();
  openSheet(`<div class="sheet-head"><div><h2 id="gms-t">${g.ic} ${esc(g.n)}</h2><div class="note">${g.max === 2 ? "Pick who to play" : `Pick who to play (up to ${g.max - 1}${g.min === 1 ? ", or just you" : ""})`}</div></div>
      <div class="row gm-headbtns"><button class="icon-btn gm-help" type="button" id="gmHelp" aria-label="How to play">?</button><button class="icon-btn" data-close aria-label="Close">${icon("x")}</button></div></div>
    <div class="gm" id="gmStart">${list.length ? `<div class="flags gm-pick">${list.map(([uid, x]) => `<button class="chip" type="button" data-gmpick="${esc(uid)}" aria-pressed="false">${frAvatar(uid, 20)} ${esc(x.n)}</button>`).join("")}</div>`
      : `<p class="note">Add a friend first (Friends › Add friend).${g.min === 1 ? " Or play on your own:" : ""}</p>`}
      <button class="btn primary wide" type="button" id="gmGo" style="margin-top:14px">Start</button></div>`, "gms-t");
  const box = $("#gmStart"), btn = $("#gmGo");
  const upd = () => { btn.disabled = pick.size + 1 < g.min; btn.textContent = pick.size ? `Invite and start` : g.min === 1 ? "Play on my own" : "Start"; };
  box.querySelectorAll("[data-gmpick]").forEach(b => b.onclick = () => {
    const u = b.dataset.gmpick;
    if (pick.has(u)) pick.delete(u); else { if (pick.size >= g.max - 1){ if (g.max === 2){ pick.clear(); box.querySelectorAll("[data-gmpick]").forEach(x => x.setAttribute("aria-pressed", "false")); } else { toast(`Up to ${g.max} players`); return; } } pick.add(u); }
    b.setAttribute("aria-pressed", pick.has(u)); upd();
  });
  upd();
  $("#gmHelp").onclick = () => gmShowRules(id, $("#sheetRoot .sheet"));
  if (!gmSeen(id)) gmShowRules(id, $("#sheetRoot .sheet"));
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      const me = await frMe(), pid = "p" + frNow().toString(36) + Math.random().toString(36).slice(2, 6);
      const m = {[me.uid]:f.name || "Me"}; pick.forEach(u => m[u] = (f.list[u] || {}).n || "Friend");
      await frDb("PUT", `parties/${pid}`, {g:id, h:me.uid, m, j:{[me.uid]:true}, k:1, at:{".sv":"timestamp"}});
      await Promise.all([...pick].map(u => frDb("PUT", `invites/${u}/${me.uid}`, {g:id, n:f.name || "A friend", t:{".sv":"timestamp"}, p:pid}).catch(() => {})));
      gmRemember(pid, id, [...pick]);
      openParty(pid);
    } catch(e){ btn.disabled = false; frFail(e); }
  };
}
function gmRemember(pid, g, others){
  const r = (lsGet(GM_RECENT, []) || []).filter(x => x.pid !== pid);
  r.unshift({pid, g, with:others, at:frNow()}); lsSet(GM_RECENT, r.slice(0, 8));
}

/* ---------- a live game: the sheet, listening to parties/{pid} ---------- */
let gmStop = null, gmPid = "", gmCache = {};
async function openParty(pid){
  const me = await frMe().catch(frFail); if (!me) return;
  let party = await frDb("GET", `parties/${pid}`).catch(() => null);
  if (!party || !GAMES[party.g]){ toast("That game has finished or was closed"); return; }
  const g = GAMES[party.g];
  gmEnd(); gmPid = pid; gmCache = {};
  openSheet(`<div class="sheet-head"><div><h2 id="gm-t">${g.ic} ${esc(g.n)}</h2><div class="note" id="gm-sub"></div></div>
      <div class="row gm-headbtns"><button class="icon-btn gm-help" type="button" id="gmHelp" aria-label="How to play">?</button><button class="icon-btn" data-close aria-label="Close">${icon("x")}</button></div></div>
    <div class="gm" id="gmBox" data-pid="${esc(pid)}"><p class="note">Loading…</p></div>`, "gm-t");
  gmLockSheet();
  $("#gmHelp").onclick = () => gmShowRules(party.g, $("#sheetRoot .sheet"));
  if (!gmSeen(party.g)) gmShowRules(party.g, $("#sheetRoot .sheet"));
  if (!(party.j || {})[me.uid]) frDb("PUT", `parties/${pid}/j/${me.uid}`, true).catch(() => {});
  frDb("DELETE", `invites/${me.uid}/${party.h}`).catch(() => {});
  if (!gmArr(lsGet(GM_RECENT, [])).some(x => x.pid === pid)) gmRemember(pid, party.g, Object.keys(party.m || {}).filter(u => u !== me.uid));
  const ctx = {pid, me:me.uid, get party(){ return party; },
    put:(path, v) => frDb("PUT", `parties/${pid}/${path}`, v).catch(frFail),
    // the write goes out before the redraw, so anything the redraw writes (your dice for a new round) lands after it
    set:(path, v) => { party = frSetIn(party, path, v); const w = ctx.put(path, v); paint(); return w; },
    patch:obj => { for (const [k, v] of Object.entries(obj)) party = frSetIn(party, k, v); const w = frDb("PATCH", `parties/${pid}`, obj).catch(frFail); paint(); return w; }};
  const gone = () => { const box = $("#gmBox"); return !box || box.dataset.pid !== pid; };
  const stop = () => { clearInterval(watch); if (gmStop && gmPid === pid){ gmStop(); gmStop = null; gmEnd(); } gmAfter(); };
  const paint = () => {
    if (gone()){ stop(); return; }
    try { gmPaint($("#gmBox"), ctx); } catch(e){ console.error(e); }
  };
  if (gmStop) gmStop();
  gmStop = frListen(`parties/${pid}`, v => { if (v) party = v; paint(); });
  const watch = setInterval(() => { if (gone()) stop(); }, 1500);       // closed the sheet: stop following the game
  paint();
}
/* A game holds the whole screen (Dylan, 24 Nov 2026: a notification stopped his game): tapping outside does nothing, the X
   asks first, and messages and invites wait until you leave (with a small note). "I'm lost" alerts still pop up at once. */
const gmPlaying = () => typeof document !== "undefined" && !!document.querySelector("#gmBox");
let gmWaiting = [];
function gmLockSheet(){
  const sh = $("#sheetRoot .sheet"), bd = $("#sheetRoot .backdrop"); if (!sh) return;
  sh.classList.add("gm-sheet");
  if (bd){ bd.removeAttribute("data-close"); bd.onclick = null; }
  const x = sh.querySelector(".sheet-head [data-close]"); if (x){ x.removeAttribute("data-close"); x.onclick = gmAskLeave; }
}
function gmAskLeave(){
  const sh = $("#sheetRoot .sheet"); if (!sh || sh.querySelector(".gm-leave")) return;
  sh.insertAdjacentHTML("beforeend", `<div class="gm-leave" role="alertdialog" aria-labelledby="gm-lv"><b id="gm-lv">Leave the game?</b>
    <p class="note">It carries on without you; come back to it from Friends › Play.</p>
    <div class="row"><button class="btn" type="button" id="gmStay">Keep playing</button><button class="btn danger" type="button" id="gmLeave">Leave</button></div></div>`);
  $("#gmStay").onclick = () => { const l = sh.querySelector(".gm-leave"); if (l) l.remove(); };
  $("#gmLeave").onclick = () => { closeDetail(); gmAfter(); };
  $("#gmStay").focus();
}
// something arrived mid-game: a small note now, the popup once the game is closed
function gmHold(what, run){ gmWaiting.push(run); toast(`${what}: it’ll pop up when you leave the game`); }
function gmAfter(){ if (gmPlaying() || !gmWaiting.length) return; const w = gmWaiting; gmWaiting = []; setTimeout(() => w.forEach(f => { try { f(); } catch(e){} }), 400); }
// when a game closes or a new one starts: the Where in the world map, and a dice roll still waiting to be sent
function gmEnd(){ clearTimeout(gmCache.rollT); if (gmCache.mapI){ try { gmCache.mapI.remove(); } catch(e){} gmCache.mapI = null; } }
const gmName = (ctx, u) => u === ctx.me ? "You" : esc(frState().list[u] ? frNameOf(u) : ((ctx.party.m || {})[u] || "Friend"));
function gmPaint(box, ctx){
  const party = ctx.party, g = GAMES[party.g], s = party.s, me = ctx.me;
  // a new game in the same party (Play again): forget this phone's bits of the last one (your boats, your dice, the map)
  if (gmCache.k !== (party.k || 1)){ gmEnd(); gmCache = {k:party.k || 1}; }
  const sub = $("#gm-sub"), others = Object.keys(party.m || {}).filter(u => u !== me);
  if (sub) sub.innerHTML = others.length ? `You vs ${others.map(u => gmName(ctx, u)).join(", ")}` : "Just you";
  // the lobby: waiting for the people invited to open it
  if (!s){
    const joined = Object.keys(party.j || {}).filter(u => party.m[u]), host = party.h === me;
    const enough = joined.length >= g.min, all = joined.length === Object.keys(party.m).length;
    // two-player games (and a game you play alone) start by themselves once everyone's in
    if (host && all && enough && !gmCache.starting){ gmCache.starting = 1; ctx.set("s", g.init(joined)); return; }
    box.innerHTML = `<div class="gm-lobby">${Object.keys(party.m).map(u => `<div class="fr-row">${frAvatar(u, 36, party.m[u])}<div><b>${gmName(ctx, u)}</b><div class="note">${joined.includes(u) ? "In" : "Invited, not opened it yet"}</div></div>${joined.includes(u) ? icon("check","i s") : ""}</div>`).join("")}
      <p class="note">${host ? (enough ? "Start now, or wait for everyone." : `Waiting for ${g.min === 2 ? "your friend" : "someone"} to open their invite (a popup when their app is open).`) : "Waiting for the game to start…"}</p>
      ${host && enough && g.max > 2 ? `<button class="btn primary wide" type="button" id="gmBegin">Start with ${joined.length === 1 ? "just you" : joined.length + " players"}</button>` : ""}</div>`;
    const b = $("#gmBegin"); if (b) b.onclick = () => ctx.set("s", g.init(joined));
    return;
  }
  const res = g.result.call(g, s);
  if (res) gmRecord(ctx, g, res);
  ({c4:paintC4, fleet:paintFleet, dice:paintDice, price:paintQuiz, where:paintQuiz})[party.g](box, ctx, s, res);
  if (res){
    const wn = res.w.length ? res.w.map(u => gmName(ctx, u)).join(" and ") : "";
    box.insertAdjacentHTML("beforeend", `<div class="gm-end ${res.w.includes(me) ? "good" : ""}"><b>${res.w.length ? (res.w.includes(me) && res.w.length === 1 ? "You win! 🎉" : `${wn} win${res.w.length === 1 && !res.w.includes(me) ? "s" : ""}!`) : "It’s a draw"}</b>
      <div class="row"><button class="btn primary" type="button" id="gmAgain">Play again</button><a class="btn" href="#tools/friends-play" id="gmTally">Trip tally</a></div></div>`);
    $("#gmAgain").onclick = () => { gmEnd(); gmCache = {}; ctx.patch({k:(party.k || 1) + 1, s:g.init(gmArr(s.p))}); };
    $("#gmTally").onclick = () => { closeDetail(); if (ui.view === "tools" && ui.sub === "friends-play") setTimeout(paintTally, 300); };
  }
}
// the Trip tally: each phone adds its own result once per game
async function gmRecord(ctx, g, res){
  const key = ctx.pid + ":" + (ctx.party.k || 1), done = lsGet(GM_DONE, {}) || {};
  if (done[key] || gmArr((ctx.party.s || {}).p).length < 2) return;
  done[key] = 1; const keys = Object.keys(done); if (keys.length > 200) keys.slice(0, keys.length - 200).forEach(k => delete done[k]); lsSet(GM_DONE, done);
  const id = ctx.party.g, me = ctx.me;
  try {
    const cur = await frDb("GET", `tally/${me}/${id}`) || {};
    await frDb("PUT", `tally/${me}/${id}`, {w:(cur.w || 0) + (res.w.includes(me) ? 1 : 0), p:(cur.p || 0) + 1});
  } catch(e){ delete done[key]; lsSet(GM_DONE, done); }
}

/* ---------- drawing each game ---------- */
function paintC4(box, ctx, s, res){
  const p = gmArr(s.p), me = ctx.me, mine = p.indexOf(me) === 0 ? "a" : "b", turn = p[s.t || 0], win = c4Win(s.b);
  const myTurn = !res && turn === me;
  box.innerHTML = `<div class="gm-players">${p.map((u, k) => `<span class="gm-pl ${!res && turn === u ? "on" : ""}"><i class="c4-dot ${k ? "b" : "a"}"></i>${gmName(ctx, u)}</span>`).join("")}</div>
    <p class="gm-msg">${res ? "" : myTurn ? "Your turn: tap a column" : `${gmName(ctx, turn)}’s turn…`}</p>
    <div class="c4 ${myTurn ? "go" : ""}" role="grid" aria-label="Four in a row board">${[...s.b].map((v, i) => `<button type="button" class="c4-c ${v === "." ? "" : v} ${i === s.last ? "last" : ""} ${win && win.cells.includes(i) ? "win" : ""}" data-col="${i % C4_W}" aria-label="Column ${i % C4_W + 1}${v === "." ? "" : v === mine ? ", yours" : ", theirs"}" ${myTurn ? "" : "tabindex=-1"}></button>`).join("")}</div>`;
  if (!myTurn) return;
  box.querySelectorAll("[data-col]").forEach(b => b.onclick = () => {
    const i = c4Drop(s.b, +b.dataset.col); if (i < 0) return;
    const nb = s.b.slice(0, i) + mine + s.b.slice(i + 1);
    ctx.set("s", Object.assign({}, s, {b:nb, t:1 - (s.t || 0), last:i}));
  });
}
// placing boats by finger: press on a boat and drag it (a ghost shows where it would go, red if it can't), or tap it to turn it
function sfBindPlace(box, redraw){
  const grid = box.querySelector("#sfPlace"); if (!grid) return;
  let drag = null;
  const cellAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest && el.closest("#sfPlace [data-i]") ? +el.closest("[data-i]").dataset.i : null; };
  const show = g2 => grid.querySelectorAll("[data-i]").forEach(c => { const i = +c.dataset.i; c.className = "sf-c " + sfPart(g2 || gmCache.fleet, i) + (drag && g2 && g2[i] === String(drag.si) ? " ghost" : ""); });
  grid.addEventListener("pointerdown", e => {
    const i = cellAt(e.clientX, e.clientY); if (i == null || gmCache.fleet[i] === ".") return;
    drag = {si:+gmCache.fleet[i], from:i, at:i, moved:false, ok:null}; grid.setPointerCapture(e.pointerId); e.preventDefault();
  });
  grid.addEventListener("pointermove", e => {
    if (!drag) return;
    const i = cellAt(e.clientX, e.clientY); if (i == null || i === drag.at) return;
    drag.at = i; drag.moved = true;
    drag.ok = sfMove(gmCache.fleet, drag.si, drag.from, i);
    grid.classList.toggle("bad", !drag.ok); show(drag.ok);
  });
  const end = () => {
    if (!drag) return;
    const d = drag; drag = null; grid.classList.remove("bad");
    if (!d.moved){ const t = sfRotate(gmCache.fleet, d.si, d.from); if (t) gmCache.fleet = t; else toast("No room to turn it round there"); }
    else if (d.ok) gmCache.fleet = d.ok;
    redraw();
  };
  grid.addEventListener("pointerup", end); grid.addEventListener("pointercancel", end);
}
function paintFleet(box, ctx, s, res){
  const p = gmArr(s.p), me = ctx.me, them = p.find(u => u !== me), f = s.f || {}, h = s.h || {};
  const blank = ".".repeat(SF_N * SF_N);
  // placing your boats
  if (!f[me] || !f[them]){
    if (!gmCache.fleet) gmCache.fleet = sfRandomFleet();
    const placed = !!f[me];
    const fl = f[me] || gmCache.fleet;
    box.innerHTML = `<p class="gm-msg">${placed ? `Ready. Waiting for ${gmName(ctx, them)} to hide their boats…` : "Hide your boats"}</p>
      ${placed ? "" : `<p class="note gm-c">Drag a boat to move it, tap it to turn it round. Boats can’t touch.</p>`}
      <div class="sf-grid big mine ${placed ? "" : "edit"}" id="sfPlace">${[...fl].map((v, i) => `<span class="sf-c ${sfPart(fl, i)}" data-i="${i}"></span>`).join("")}</div>
      ${placed ? "" : `<div class="row gm-row"><button class="btn" type="button" id="sfShuffle">Shuffle</button><button class="btn primary" type="button" id="sfReady">Ready</button></div>`}`;
    if (!placed){
      $("#sfShuffle").onclick = () => { gmCache.fleet = sfRandomFleet(); paintFleet(box, ctx, s, res); };
      $("#sfReady").onclick = () => ctx.set(`s/f/${me}`, gmCache.fleet);
      sfBindPlace(box, () => paintFleet(box, ctx, s, res));
    }
    return;
  }
  const turn = p[s.t || 0], myTurn = !res && turn === me;
  const theirShots = h[them] || blank, myShots = h[me] || blank;           // h[x]: shots fired at x's sea
  const sunkThem = sfSunkCells(f[them], theirShots), sunkMe = sfSunkCells(f[me], myShots);
  const peek = S.dev && gmCache.peek;
  box.innerHTML = `<p class="gm-msg">${res ? "" : myTurn ? "Your turn: fire at their sea" : `${gmName(ctx, them)} is aiming…`}</p>
    <div class="sf-lbl">${S.dev ? `<button class="sf-peek" type="button" id="sfPeek" aria-pressed="${!!peek}" aria-label="Developer: show their boats">${icon("search","i xs")}</button>` : ""}${gmName(ctx, them)}’s sea <small>${sfShipsLeft(f[them], theirShots)} of ${SF_SHIPS.length} boats left</small></div>
    <div class="sf-grid big ${myTurn ? "go" : ""}">${[...theirShots].map((v, i) => `<button type="button" class="sf-c ${v === "x" ? "hit" : v === "o" ? "miss" : ""} ${sunkThem.has(i) ? "sunk " + sfPart(f[them], i) : ""} ${(res || peek) && v === "." && f[them][i] !== "." ? sfPart(f[them], i) + (peek && !res ? " peek" : "") : ""}" data-sf="${i}" ${myTurn && v === "." ? "" : "disabled"} aria-label="Row ${Math.floor(i / SF_N) + 1}, column ${i % SF_N + 1}${v === "x" ? ", hit" : v === "o" ? ", miss" : ""}">${v === "x" ? "🔥" : v === "o" ? "💦" : ""}</button>`).join("")}</div>
    <div class="sf-lbl">Your fleet <small>${sfShipsLeft(f[me], myShots)} of ${SF_SHIPS.length} left</small></div>
    <div class="sf-grid small">${[...f[me]].map((v, i) => `<span class="sf-c ${sfPart(f[me], i)} ${myShots[i] === "x" ? "hit" : myShots[i] === "o" ? "miss" : ""} ${sunkMe.has(i) ? "sunk" : ""}"></span>`).join("")}</div>`;
  const pk = $("#sfPeek"); if (pk) pk.onclick = () => { gmCache.peek = !gmCache.peek; paintFleet(box, ctx, s, res); };
  if (!myTurn) return;
  box.querySelectorAll("[data-sf]:not([disabled])").forEach(b => b.onclick = () => {
    const i = +b.dataset.sf, hit = f[them][i] !== ".";
    const shots = theirShots.slice(0, i) + (hit ? "x" : "o") + theirShots.slice(i + 1);
    toast(hit ? (sfSunkCells(f[them], shots).has(i) ? "Hit and sunk!" : "Hit!") : "Miss");
    ctx.set("s", Object.assign({}, s, {h:Object.assign({}, h, {[them]:shots}), t:1 - (s.t || 0)}));
  });
}
function paintDice(box, ctx, s, res){
  const me = ctx.me, p = gmArr(s.p), n = s.n || {}, d = s.d || {}, alive = ldAlive(s);
  // roll your own dice at the start of each round (only your phone shows them until someone calls Liar). The roll is made
  // once per round; if it hasn't reached the game yet (a write crossed with another), the same dice are sent again.
  if (!res && alive.includes(me) && !(d[me] && d[me].r === s.r)){
    if (!gmCache.roll || gmCache.roll.r !== s.r) gmCache.roll = {r:s.r, v:ldRoll(n[me])};
    const roll = gmCache.roll, wait = 2500 - (Date.now() - (gmCache.rollAt || 0));
    if (wait <= 0){ gmCache.rollAt = Date.now(); ctx.set(`s/d/${me}`, roll); return; }
    clearTimeout(gmCache.rollT);
    gmCache.rollT = setTimeout(() => { const s2 = ctx.party.s; if (s2 && s2.r === roll.r && !((s2.d || {})[me] && s2.d[me].r === roll.r)){ gmCache.rollAt = Date.now(); ctx.set(`s/d/${me}`, roll); } }, wait);
  }
  const ready = ldReady(s), turn = ldTurn(s), myTurn = !res && ready && turn === me, mineV = d[me] && d[me].r === s.r ? d[me].v : "";
  const last = s.last;
  let lastHTML = "";
  if (last && last.r === s.r - 1){
    lastHTML = `<div class="gm-reveal"><b>${gmName(ctx, last.by)} called Liar on ${last.bid.by === me ? "your" : gmName(ctx, last.bid.by) + "’s"} “${ldBidText(last.bid)}”.</b>
      <div>There ${last.count === 1 ? "was" : "were"} ${gmWord(last.count)}. ${gmName(ctx, last.loser)} ${last.loser === me ? "lose" : "loses"} a die.</div>
      <div class="ld-all">${Object.entries(last.dice || {}).map(([u, v]) => `<div><small>${gmName(ctx, u)}</small><span>${[...v].map(x => `<i class="${+x === last.bid.f ? "hl" : ""}">${DIE[+x]}</i>`).join("")}</span></div>`).join("")}</div></div>`;
  }
  if (!gmCache.q || gmCache.qr !== s.r + ":" + JSON.stringify(s.bid || null)){
    gmCache.qr = s.r + ":" + JSON.stringify(s.bid || null);
    gmCache.q = s.bid ? s.bid.q : 1; gmCache.f = s.bid ? s.bid.f : 2;
    if (s.bid && !ldOk(s, gmCache.q, gmCache.f)){ if (gmCache.f < 6) gmCache.f++; else { gmCache.q++; gmCache.f = 1; } }
  }
  box.innerHTML = `<div class="gm-players">${p.map(u => `<span class="gm-pl ${!res && ready && turn === u ? "on" : ""} ${n[u] ? "" : "out"}">${gmName(ctx, u)} <small>${n[u] ? "🎲".repeat(Math.min(n[u], 5)) : "out"}</small></span>`).join("")}</div>
    ${lastHTML}
    ${alive.includes(me) && !res ? `<div class="ld-mine" aria-label="Your dice">${[...mineV].map(x => `<span>${DIE[+x]}</span>`).join("") || "Rolling…"}</div><p class="note gm-c">Your dice. Only you can see them.</p>` : ""}
    ${res ? "" : `<p class="gm-msg">${!ready ? "Everyone’s rolling…" : s.bid ? `${gmName(ctx, s.bid.by)} says <b>${ldBidText(s.bid)}</b>` : `${gmName(ctx, turn)} starts`}</p>`}
    ${myTurn ? `<div class="ld-bid"><div class="ld-step"><button class="icon-btn" type="button" data-q="-1" aria-label="Fewer">${icon("minus","i s")}</button><b id="ldQ">${gmCache.q}</b><button class="icon-btn" type="button" data-q="1" aria-label="More">${icon("plus","i s")}</button></div><span>×</span>
        <div class="ld-faces">${[1, 2, 3, 4, 5, 6].map(x => `<button type="button" data-f="${x}" aria-pressed="${gmCache.f === x}">${DIE[x]}</button>`).join("")}</div></div>
      <div class="row gm-row"><button class="btn primary" type="button" id="ldBid">Say “${ldBidText({q:gmCache.q, f:gmCache.f})}”</button>${s.bid ? `<button class="btn danger" type="button" id="ldLiar">Liar!</button>` : ""}</div>`
      : !res && ready ? `<p class="note gm-c">${gmName(ctx, turn)}’s turn</p>` : ""}`;
  if (!myTurn) return;
  const upd = () => { const ok = ldOk(s, gmCache.q, gmCache.f), b = $("#ldBid"); b.disabled = !ok; b.textContent = `Say “${ldBidText({q:gmCache.q, f:gmCache.f})}”`; $("#ldQ").textContent = gmCache.q; box.querySelectorAll("[data-f]").forEach(x => x.setAttribute("aria-pressed", +x.dataset.f === gmCache.f)); };
  box.querySelectorAll("[data-q]").forEach(b => b.onclick = () => { gmCache.q = Math.max(1, Math.min(ldTotal(s), gmCache.q + +b.dataset.q)); upd(); });
  box.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { gmCache.f = +b.dataset.f; upd(); });
  upd();
  $("#ldBid").onclick = () => { if (ldOk(s, gmCache.q, gmCache.f)) ctx.set("s/bid", {q:gmCache.q, f:gmCache.f, by:me}); };
  const lb = $("#ldLiar"); if (lb) lb.onclick = () => {
    const dice = {}; alive.forEach(u => dice[u] = d[u].v);
    const count = Object.values(dice).join("").split("").filter(x => +x === s.bid.f).length;
    const loser = count >= s.bid.q ? me : s.bid.by, nn = Object.assign({}, n, {[loser]:n[loser] - 1});
    const ns = Object.assign({}, s, {n:nn, r:s.r + 1, bid:null, last:{r:s.r, by:me, bid:s.bid, count, loser, dice}});
    ns.t = nn[loser] > 0 ? loser : ldNext(Object.assign({}, ns), loser);
    delete ns.bid;
    ctx.set("s", ns);
  };
}
// Guess the price and Where in the world: one round on screen at a time
function paintQuiz(box, ctx, s, res){
  const party = ctx.party, g = GAMES[party.g], me = ctx.me, p = gmArr(s.p), q = gmArr(s.q), i = s.i || 0, ww = party.g === "where";
  const sc = quizScores(g, s);
  const scores = `<div class="gm-players">${p.map(u => `<span class="gm-pl">${gmName(ctx, u)} <b>${sc[u] || 0}</b></span>`).join("")}</div>`;
  if (res){ gmEnd(); box.innerHTML = scores + `<p class="gm-msg">Final score after ${q.length} rounds</p>`; return; }
  const key = q[i], gs = (s.g || {})[i] || {}, all = p.every(u => gs[u] != null), mine = gs[me];
  const item = ww ? wwCity(key) : gpItem(key);
  if (!item){ ctx.set("s/i", i + 1); return; }
  const head = `<div class="gm-round">Round ${i + 1} of ${q.length}</div>`;
  const fmtG = v => ww ? "" : money(+v, item.cur);
  // the answer once everyone has guessed
  const reveal = () => {
    const offs = p.map(u => [u, gs[u] != null ? g.off(key, gs[u]) : Infinity]).sort((a, b) => a[1] - b[1]);
    const best = offs[0][1];
    return `<div class="gm-reveal"><b>${ww ? `It’s ${esc(item.n)}` : `Real price: ${esc(rangeText(item.p, item.cur))}`}</b>${ww ? "" : `<div class="note">${esc(gbpRange(item.p, item.cur))}${item.src ? ` · ${esc(item.src)}` : ""}</div>`}
      <ol class="gm-ans">${offs.map(([u, o]) => `<li class="${o === best ? "win" : ""}">${gmName(ctx, u)}: ${ww ? `${Math.round(o)} km away` : `${esc(fmtG(gs[u]))}${o === 0 ? " · spot on!" : ""}`}${o === best ? " 🏆" : ""}</li>`).join("")}</ol>
      <button class="btn primary wide" type="button" id="gmNext">${i + 1 < q.length ? "Next round" : "See the winner"}</button></div>`;
  };
  gmPreload(q.map(k => ww ? DEST_IMG[k] : (gpItem(k) || {}).img).map(x => x && (x.src || x)));
  if (!ww){
    // what you'd typed stays when someone else's guess arrives and the screen redraws
    const typed = $("#gpG"); if (typed && typed.value) gmCache.draft = {i, v:typed.value, f:document.activeElement === typed};
    const ph = item.img ? `<figure class="gp-photo"><img src="${esc(item.img.src)}" alt="" decoding="async"><figcaption>${esc(item.img.by)}</figcaption></figure>` : "";
    box.innerHTML = scores + head + ph + `<div class="gp-card"><span class="gp-ic">${icon(item.ic)}</span><div><b>${esc(item.q)}</b><div class="note">${esc(item.sub)}</div></div></div>`
      + (all ? reveal() : mine != null ? `<p class="gm-msg">You said ${esc(fmtG(mine))}. Waiting for ${p.filter(u => gs[u] == null).map(u => gmName(ctx, u)).join(", ")}…</p>`
        : `<div class="gp-in"><span>${esc(SYM[item.cur] || item.cur)}</span><input id="gpG" type="number" inputmode="decimal" min="0" step="any" placeholder="Your guess" aria-label="Your guess in ${esc(item.cur)}"><button class="btn primary" type="button" id="gpGo">Lock in</button></div>`);
    const gIn = $("#gpG");
    if (gIn && gmCache.draft && gmCache.draft.i === i){ gIn.value = gmCache.draft.v; if (gmCache.draft.f){ gIn.focus(); try { gIn.setSelectionRange(gIn.value.length, gIn.value.length); } catch(e){} } }
    if (gIn) gIn.oninput = () => { gmCache.draft = {i, v:gIn.value, f:true}; };
    const go = $("#gpGo");
    if (go){ const send = () => { const v = parseFloat($("#gpG").value); if (!(v >= 0)){ toast("Type a price"); return; } ctx.set(`s/g/${i}/${me}`, v); }; go.onclick = send; $("#gpG").onkeydown = e => { if (e.key === "Enter") send(); }; }
  } else {
    // keep the photo and map while the round lasts (redrawing would reset the map)
    if (gmCache.wwRound !== i || !$("#wwMap")){
      gmEnd();
      gmCache.wwRound = i; gmCache.pin = null;
      box.innerHTML = `<div id="wwScores"></div>${head}<img class="ww-photo" src="${esc(DEST_IMG[key])}" alt="A trip destination: where is it?"><div class="ww-map" id="wwMap"></div><div id="wwBottom"></div>`;
      wwMakeMap(ctx);
    }
    $("#wwScores").innerHTML = scores;
    const bot = $("#wwBottom");
    bot.innerHTML = all ? reveal() : mine != null ? `<p class="gm-msg">Locked in. Waiting for ${p.filter(u => gs[u] == null).map(u => gmName(ctx, u)).join(", ")}…</p>`
      : `<p class="note gm-c">Tap the map where you think this is.</p><button class="btn primary wide" type="button" id="wwGo" ${gmCache.pin ? "" : "disabled"}>Lock in</button>`;
    const go = $("#wwGo"); if (go) go.onclick = () => { if (gmCache.pin) ctx.set(`s/g/${i}/${me}`, gmCache.pin.map(v => +v.toFixed(4)).join(",")); };
    wwPaintMap(ctx, all ? {item, gs, p} : null);
  }
  const nx = $("#gmNext"); if (nx) nx.onclick = () => ctx.set("s/i", i + 1);
}
function wwMakeMap(ctx){
  const el = $("#wwMap"); if (!el || typeof maplibregl === "undefined") return;
  let m;
  try {
    // land shapes only, no names (they'd give it away)
    m = new maplibregl.Map({container:el, style:{version:8, sources:{}, layers:[{id:"bg", type:"background", paint:{"background-color":cssv("--sea")}}]},
      center:[108, 2], zoom:3.3, minZoom:2.5, maxZoom:9, attributionControl:false, dragRotate:false, touchPitch:false, renderWorldCopies:false});
  } catch(e){ el.innerHTML = '<div class="map-msg">The map can’t run on this device.</div>'; return; }
  gmCache.mapI = m; gmCache.marks = [];
  m.on("load", () => {
    m.addSource("land", {type:"geojson", data:geoFC()});
    m.addLayer({id:"land", type:"fill", source:"land", paint:{"fill-color":cssv("--land"), "fill-outline-color":cssv("--border-land")}});
    m.addSource("ans", {type:"geojson", data:{type:"FeatureCollection", features:[]}});
    m.addLayer({id:"ans-line", type:"line", source:"ans", paint:{"line-color":cssv("--muted"), "line-width":1.5, "line-dasharray":[2, 2]}});
    wwPaintMap(ctx, gmCache.wwLast || null);
  });
  m.on("click", e => {
    const s = ctx.party.s, i = s.i || 0, gs = (s.g || {})[i] || {};
    if (gs[ctx.me] != null) return;
    gmCache.pin = [e.lngLat.lat, e.lngLat.lng];
    wwPaintMap(ctx, null);
    const go = $("#wwGo"); if (go) go.disabled = false;
  });
}
function wwPaintMap(ctx, ans){
  const m = gmCache.mapI; if (!m) return;
  gmCache.wwLast = ans;
  (gmCache.marks || []).forEach(x => x.remove()); gmCache.marks = [];
  const mk = (lat, lng, cls, label) => { const el = document.createElement("div"); el.className = "ww-pin " + cls; if (label) el.innerHTML = `<span>${label}</span>`; gmCache.marks.push(new maplibregl.Marker({element:el, anchor:"bottom"}).setLngLat([lng, lat]).addTo(m)); };
  const s = ctx.party.s, i = s.i || 0, gs = (s.g || {})[i] || {};
  if (!ans){
    const mine = gs[ctx.me] != null ? String(gs[ctx.me]).split(",").map(Number) : gmCache.pin;
    if (mine) mk(mine[0], mine[1], "me", "");
    if (m.getSource("ans")) m.getSource("ans").setData({type:"FeatureCollection", features:[]});
    return;
  }
  const {item, p} = ans, pts = [[item.lng, item.lat]], lines = [];
  mk(item.lat, item.lng, "ans", "📍 " + esc(item.n));
  p.forEach(u => { if (gs[u] == null) return; const [la, ln] = String(gs[u]).split(",").map(Number); mk(la, ln, u === ctx.me ? "me" : "them", u === ctx.me ? "" : esc(frInitials(gmName(ctx, u)))); pts.push([ln, la]); lines.push({type:"Feature", geometry:{type:"LineString", coordinates:[[ln, la], [item.lng, item.lat]]}}); });
  if (m.getSource("ans")) m.getSource("ans").setData({type:"FeatureCollection", features:lines});
  try { m.fitBounds([[Math.min(...pts.map(x => x[0])), Math.min(...pts.map(x => x[1]))], [Math.max(...pts.map(x => x[0])), Math.max(...pts.map(x => x[1]))]], {padding:40, maxZoom:7, duration:800}); } catch(e){}
}

/* ---------- invites: "Sam wants to play Four in a row" pops up on whatever screen you're on ---------- */
function gmInvited(uid, inv){
  if (!inv || !inv.p || !GAMES[inv.g]) return;
  if (gmPid === inv.p && $("#gmBox")) return;
  if (gmPlaying()){ gmHold(`${frNameOf(uid)} wants to play ${GAMES[inv.g].n}`, () => gmInvited(uid, inv)); return; }
  askConfirm(`${frNameOf(uid)} wants to play ${GAMES[inv.g].n}`, "Play").then(yes => { if (yes) openParty(inv.p); });
}

/* ---------- Friends › Play: the games, your recent games and the Trip tally ---------- */
TOOL_PAGES["friends-play"] = root => {
  root.innerHTML = hero({title:"Play", sub:"Games with your mates, for the long bus rides", back:["#tools/friends", "Friends"]}) + `<div class="page friends">${frCfg() ? `<div id="fr-alerts"></div>
    <div class="gm-list">${GAME_ORDER.map(id => { const g = GAMES[id]; return `<button class="gm-tile" type="button" data-game="${id}"><span class="gm-tic">${g.ic}</span><span><b>${esc(g.n)}</b><small>${esc(g.d)} · ${g.max === 2 ? "2 players" : g.min === 1 ? `1–${g.max} players` : `${g.min}–${g.max} players`}</small></span>${icon("chevr","i s")}</button>`; }).join("")}</div>
    <div id="gm-recent"></div>
    <div class="block" id="gm-tally"><h2>Trip tally</h2><p class="note">Loading…</p></div>` : friendsSetupHTML()}</div>`;
  if (!frCfg()) return;
  root.querySelectorAll("[data-game]").forEach(b => b.onclick = () => openGameStart(b.dataset.game));
  const rec = (lsGet(GM_RECENT, []) || []).filter(r => GAMES[r.g] && frNow() - r.at < 3 * 864e5);
  if (rec.length) $("#gm-recent").innerHTML = `<div class="block"><h2>Carry on</h2>${rec.map(r => `<button class="fr-row gm-rec" type="button" data-party="${esc(r.pid)}"><span class="gm-tic">${GAMES[r.g].ic}</span><div><b>${esc(GAMES[r.g].n)}</b><div class="note">${r.with.length ? "With " + r.with.map(u => esc(frNameOf(u))).join(", ") : "On your own"} · ${esc(frWhen(r.at))}</div></div>${icon("chevr","i s")}</button>`).join("")}</div>`;
  root.querySelectorAll("[data-party]").forEach(b => b.onclick = () => openParty(b.dataset.party));
  paintTally();
  paintFriendsLive(); frLoop();
};
/* The Trip tally is for the same people as a split-costs group (Dylan, 24 Nov 2026), with the group's shared forfeit;
   no group yet: you and your friends, and the forfeit kept on this phone. */
const GM_GROUP = "gm-group";
async function paintTally(){
  const el = $("#gm-tally"); if (!el) return;
  const me = frMyId() || (await frMe().catch(() => null) || {}).uid, f = frState();
  const groups = typeof liveGroupsCached === "function" ? liveGroupsCached() : [];
  const gid = groups.some(g => g.id === lsGet(GM_GROUP, "")) ? lsGet(GM_GROUP, "") : groups.length ? groups[0].id : "";
  let members = null, groupFf = null;
  if (gid){
    const g = await frDb("GET", `groups/${gid}`).catch(() => null);
    members = g && g.members ? Object.keys(g.members) : Object.keys((liveStore()[gid] || {}).members || {});
    groupFf = g && typeof g.ff === "string" ? g.ff : null;
  }
  const nameOf = u => frState().list[u] ? frNameOf(u) : gid && liveStore()[gid] && (liveStore()[gid].members || {})[u] || "Friend";
  const ids = (members && members.length ? [me, ...members.filter(u => u !== me)] : [me, ...Object.keys(f.list)]).filter(Boolean);
  const rows = await Promise.all(ids.map(async u => [u, await frDb("GET", `tally/${u}`).catch(() => null) || {}]));
  if (!$("#gm-tally")) return;
  const tot = t => GAME_ORDER.reduce((a, g) => [a[0] + ((t[g] || {}).w || 0), a[1] + ((t[g] || {}).p || 0)], [0, 0]);
  const list = rows.map(([u, t]) => ({u, t, w:tot(t)[0], p:tot(t)[1]})).sort((a, b) => b.w - a.w || a.p - b.p);
  const forfeit = (groupFf != null ? groupFf : (lsGet("gm-forfeit", "") || "")).trim() || "Bottom of the table buys the next round";
  el.innerHTML = `<h2>Trip tally</h2><p class="note">Wins across every game, all trip${gid ? ", for the people in your split-costs group" : ""}.</p>
    ${groups.length > 1 ? `<label class="field">Group<select id="gm-grp">${groups.map(g => `<option value="${esc(g.id)}" ${g.id === gid ? "selected" : ""}>${esc(g.n)}</option>`).join("")}</select></label>` : ""}
    <div class="gm-tally"><div class="gm-th"><span></span><span>Name</span>${GAME_ORDER.map(g => `<span title="${esc(GAMES[g].n)}">${GAMES[g].ic.slice(0, 2)}</span>`).join("")}<span>Wins</span></div>
    ${list.map((r, k) => `<div class="gm-tr ${r.u === me ? "me" : ""}"><span>${k === 0 && r.w ? "👑" : k + 1}</span><span>${r.u === me ? "You" : esc(nameOf(r.u))}</span>${GAME_ORDER.map(g => `<span>${((r.t[g] || {}).w) || 0}</span>`).join("")}<span><b>${r.w}</b><small>/${r.p}</small></span></div>`).join("")}</div>
    <label class="field gm-forfeit">Loser’s forfeit<input id="gm-ff" type="text" maxlength="80" value="${esc(forfeit)}" aria-label="Loser’s forfeit"></label>`;
  $("#gm-ff").onchange = async e => {
    const v = e.target.value.trim().slice(0, 80);
    if (gid){ try { await frDb("PUT", `groups/${gid}/ff`, v); toast("Forfeit saved for the whole group"); } catch(err){ toast(err.message === "permission" ? "Firebase refused it: re-publish the rules (FIREBASE-SETUP.md)" : "No signal? Try again"); } }
    else { lsSet("gm-forfeit", v); toast("Forfeit saved on your phone (start a split-costs group to share it)"); }
  };
  const gs = $("#gm-grp"); if (gs) gs.onchange = () => { lsSet(GM_GROUP, gs.value); paintTally(); };
}
