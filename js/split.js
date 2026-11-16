/* ============================================================
   66-split: Split costs. Whoever pays adds what it cost and who it was for; the app keeps a running tally of who owes whom
   and the fewest payments that settle everyone up. Kept on this phone (S.split). There is no server: the group shares the
   tally by sending a link (it carries the payments themselves), and opening it on another phone merges them in.
   ============================================================ */
const newSplit = () => ({people:[], items:[], del:[]});
function splitData(){
  const s = S.split && typeof S.split === "object" ? S.split : (S.split = newSplit());
  if (!Array.isArray(s.people)) s.people = []; if (!Array.isArray(s.items)) s.items = []; if (!Array.isArray(s.del)) s.del = [];
  return s;
}
const splitId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const r2 = v => Math.round(v * 100) / 100;
const splitLocal = () => (D.countries[S.country] || {}).cur || "THB";

// everyone's balance in pounds: positive = they get money back, negative = they owe
// a payment's part for one person, in pounds: their custom amount if it has one, otherwise an equal share
function splitShareGBP(x, p, to){
  if (x.sh && typeof x.sh === "object") return toGBP(+x.sh[p] || 0, x.c);
  return toGBP(x.a, x.c) / to.length;
}
// custom amounts typed for the people in a split: the parts (in the payment's money) or an error message
function splitCustom(total, to, typed){
  const sh = {}; let sum = 0;
  for (const p of to){
    const v = parseFloat(String((typed || {})[p] == null ? "" : typed[p]).replace(/[, ]/g, ""));
    if (!isFinite(v) || v < 0) return {err:"Type an amount for everyone in the split (0 is fine)"};
    sh[p] = r2(v); sum += v;
  }
  if (Math.abs(sum - total) > 0.01) return {err:`The amounts add up to ${fmtNum(r2(sum))}, not ${fmtNum(total)}`};
  return {sh};
}
function splitBalances(sp = splitData()){
  const bal = {}; sp.people.forEach(p => bal[p] = 0);
  for (const it of sp.items){
    const to = (it.to || []).filter(Boolean); if (!to.length || !(it.a > 0)) continue;
    const gbp = toGBP(it.a, it.c);
    bal[it.by] = (bal[it.by] || 0) + gbp;
    to.forEach(p => bal[p] = (bal[p] || 0) - splitShareGBP(it, p, to));
  }
  Object.keys(bal).forEach(k => bal[k] = r2(bal[k]));
  return bal;
}
// your own view of a live group: for each other person, positive = they owe you, negative = you owe them (in pounds).
// Only payments between the two of you count: one you paid that they were in, or one they paid that you were in.
function splitPairs(m){
  const me = m.me, out = {};
  m.people.forEach(p => { if (p !== me) out[p] = 0; });
  for (const x of m.items){
    const to = (x.to || []).filter(Boolean); if (!to.length || !(x.a > 0)) continue;
    if (x.by === me) to.forEach(p => { if (p in out) out[p] += splitShareGBP(x, p, to); });
    else if (to.includes(me) && x.by in out) out[x.by] -= splitShareGBP(x, me, to);
  }
  Object.keys(out).forEach(k => out[k] = r2(out[k]));
  return out;
}
// the fewest payments that settle everyone: the biggest debtor pays the biggest creditor, and so on
function splitSettle(bal){
  const owe = Object.entries(bal).filter(([, v]) => v < -0.005).map(([p, v]) => [p, -v]).sort((a, b) => b[1] - a[1]);
  const get = Object.entries(bal).filter(([, v]) => v > 0.005).sort((a, b) => b[1] - a[1]);
  const out = [];
  let i = 0, j = 0;
  while (i < owe.length && j < get.length){
    const amt = r2(Math.min(owe[i][1], get[j][1]));
    if (amt >= 0.01) out.push({from:owe[i][0], to:get[j][0], gbp:amt});
    owe[i][1] = r2(owe[i][1] - amt); get[j][1] = r2(get[j][1] - amt);
    if (owe[i][1] < 0.01) i++;
    if (get[j][1] < 0.01) j++;
  }
  return out;
}
// add a payment; returns an error message or ""
function splitAdd({what, amount, cur, by, to, sh}){
  const sp = splitData(), a = parseFloat(String(amount).replace(/[, ]/g, ""));
  if (!isFinite(a) || a <= 0) return "Type how much it cost";
  if (a > 1e9) return "That amount looks wrong";
  if (!by || !sp.people.includes(by)) return "Pick who paid";
  const who = (to || []).filter(p => sp.people.includes(p));
  if (!who.length) return "Pick who it was for";
  sp.items.push({id:splitId(), w:String(what || "").trim().slice(0, 60) || "Payment", a:r2(a), c:cur, by, to:who, t:Date.now(), ...(sh ? {sh} : {})});
  persist(); return "";
}
// a settle-up payment: "from" paid "to" back
function splitPaid(from, to, gbp){
  const sp = splitData(), c = splitLocal(), a = r2(gbp * rate(c));
  sp.items.push({id:splitId(), w:"Paid back", a, c, by:from, to:[to], t:Date.now(), s:1});
  persist();
}
function splitDelete(id){ const sp = splitData(); sp.items = sp.items.filter(x => x.id !== id); if (!sp.del.includes(id)) sp.del.push(id); persist(); }

/* ---------- sharing: the whole tally in a link ---------- */
const b64u = bytes => { let s = ""; bytes.forEach(b => s += String.fromCharCode(b)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64u = str => { const s = atob(str.replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(s, c => c.charCodeAt(0)); };
async function pipeThrough(bytes, stream){ return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
async function splitEncode(sp = splitData()){
  const raw = new TextEncoder().encode(JSON.stringify({v:1, p:sp.people, i:sp.items.map(x => [x.id, x.w, x.a, x.c, x.by, x.to, x.t, x.s ? 1 : 0, x.sh || 0]), d:sp.del}));
  if (typeof CompressionStream !== "undefined"){ try { return "z" + b64u(await pipeThrough(raw, new CompressionStream("deflate-raw"))); } catch(e){} }
  return "j" + b64u(raw);
}
async function splitDecode(code){
  let bytes = unb64u(code.slice(1));
  if (code[0] === "z") bytes = await pipeThrough(bytes, new DecompressionStream("deflate-raw"));
  const o = JSON.parse(new TextDecoder().decode(bytes));
  return {people:o.p || [], items:(o.i || []).map(([id, w, a, c, by, to, t, s, sh]) => ({id, w, a, c, by, to, t, ...(s ? {s:1} : {}), ...(sh ? {sh} : {})})), del:o.d || []};
}
// add what another phone knows: new people and payments; a payment deleted on either phone stays deleted
function splitMerge(other){
  const sp = splitData(), del = new Set(sp.del.concat(other.del || [])), have = new Set(sp.items.map(x => x.id));
  let added = 0;
  (other.people || []).forEach(p => { if (p && !sp.people.includes(p)) sp.people.push(String(p).slice(0, 30)); });
  (other.items || []).forEach(x => { if (x && x.id && !have.has(x.id) && !del.has(x.id) && x.a > 0){ sp.items.push(x); added++; } });
  sp.items = sp.items.filter(x => !del.has(x.id)); sp.del = [...del];
  persist(); return added;
}
async function splitShare(){
  const url = `${location.origin}${location.pathname}#tools/split?g=${await splitEncode()}`;
  const text = splitSummary() + "\n\nOpen this link to add these payments to your app:";
  try { if (navigator.share){ await navigator.share({title:"Trip costs", text, url}); return; } } catch(e){ if (e && e.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(text + "\n" + url); toast("Copied. Paste it into your group chat."); } catch(e){ toast("Couldn’t share from this phone"); }
}
function splitSummary(){
  const bal = splitBalances(), lc = splitLocal();
  const lines = splitSettle(bal).map(t => `${t.from} pays ${t.to} ${money(niceRound(t.gbp * rate(lc), lc), lc)} (£${t.gbp.toFixed(2)})`);
  return "Trip costs: " + (lines.length ? lines.join("; ") : "everyone is square");
}

/* ---------- the page ----------
   One section for two kinds of tally: "On this phone" (S.split, shared by link) and live groups with friends (Firebase,
   js/friends.js: everyone in the group adds payments and sees the same tally). Both go through a small "model".
   It shows on Tools › Split costs (with its own header) and inside Tools › Friends (live groups only). */
const splitUi = {to:null, by:"", cur:"", what:"", amt:"", key:"", newGroup:false, tab:"tally", mode:"equal", cust:{}};
const splitWhen = t => t ? new Date(t).toLocaleString("en-GB", {day:"numeric", month:"short", hour:"2-digit", minute:"2-digit"}) : "";
const showAmt = gbp => { const lc = splitLocal(); return lc === "GBP" ? `£${Math.abs(gbp).toFixed(2)}` : `${money(niceRound(Math.abs(gbp) * rate(lc), lc), lc)} <small>£${Math.abs(gbp).toFixed(2)}</small>`; };
const SP_COLORS = ["#7FB2D2", "#F2C14E", "#7FD1AE", "#F28B82", "#A8B8FF", "#E39FF6", "#6FD0E6", "#FFB37A"];
function localSplitModel(){
  const sp = splitData();
  return {live:false, people:sp.people, name:p => p, items:sp.items,
    add:async o => splitAdd(o), paid:async (f, t, g) => splitPaid(f, t, g), del:async id => splitDelete(id),
    addPerson:async n => { sp.people.push(n); persist(); }, removePerson:async p => { sp.people = sp.people.filter(x => x !== p); persist(); }};
}
// a face (live groups, from Friends) or coloured initials
function splitAvatar(m, p, size = 28){
  if (m.live && typeof frAvatar === "function") return frAvatar(p, size, m.name(p));
  const n = m.name(p), i = Math.max(0, m.people.indexOf(p));
  return `<span class="fr-av" style="--c:${SP_COLORS[i % SP_COLORS.length]};--s:${size}px" aria-hidden="true">${esc(String(n).trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase())}</span>`;
}
TOOL_PAGES.split = async (root, arg) => {
  if (arg && arg.startsWith("g=")){
    try {
      const other = await splitDecode(arg.slice(2)), n = splitMerge(other);
      toast(n ? `Added ${n} payment${n === 1 ? "" : "s"} from the link` : "Nothing new in that link: you’re up to date");
    } catch(e){ toast("That link didn’t work. Ask for it to be sent again."); }
    history.replaceState(null, "", "#tools/split"); ui.sub = "split";
  }
  const sp = splitData();
  const live = typeof liveSplitReady === "function" && liveSplitReady();
  const groups = live ? liveGroupsCached() : [];
  if (sp.cur && !groups.some(g => g.id === sp.cur)) sp.cur = "";
  const model = sp.cur ? await liveSplitModel(sp.cur).catch(() => null) : null;
  renderSplit(root, model || localSplitModel(), groups, live);
  if (live) liveSplitRefresh(root);
};
function renderSplit(root, m, groups, live){
  root.innerHTML = hero({title:"Split costs", sub:"Who paid, who owes, and how to settle up", back:["#tools", "Tools"]}) + `<div class="page split">${splitSectionHTML(m, groups, live, {})}</div>`;
  bindSplit(root, m, () => TOOL_PAGES.split(root, ""));
}
function splitSectionHTML(m, groups, live, opt = {}){
  const lc = splitLocal(), embedded = !!opt.embedded;
  const key = (m.live ? m.id : "phone") + ":" + m.people.join(",");
  if (splitUi.key !== key){ splitUi.key = key; splitUi.to = new Set(m.people); splitUi.by = m.me && m.people.includes(m.me) ? m.me : m.people.includes(splitUi.by) ? splitUi.by : m.people[0] || ""; }
  const mine = !!(m.live && m.me && m.people.includes(m.me));
  if (mine) splitUi.to.add(m.me);
  if (!splitUi.cur) splitUi.cur = lc;
  const nm = p => esc(m.name(p)), bal = splitBalances({people:m.people, items:m.items}), plan = splitSettle(bal);
  const curs = [...new Set([lc, "GBP", ...Object.keys(D.rates)])].filter(k => k === "GBP" || D.rates[k]);
  const items = m.items.slice().sort((a, b) => b.t - a.t);
  let html = "";
  // which tally: this phone, or a live group shared with friends
  if (live || groups.length){
    html += `<div class="scroller" role="group" aria-label="Which tally" style="margin-bottom:10px">
      ${embedded ? "" : `<button class="chip" type="button" data-tally="" aria-pressed="${!m.live}">On this phone</button>`}
      ${groups.map(g => `<button class="chip" type="button" data-tally="${esc(g.id)}" aria-pressed="${!!m.live && m.id === g.id}">${icon("users","i xs")}${esc(g.n)}</button>`).join("")}
      <button class="chip" type="button" id="sp-newg" aria-pressed="${splitUi.newGroup}">+ Live group</button></div>`;
  }
  if (splitUi.newGroup) html += newGroupHTML();
  if (m.live){
    html += `<div class="sp-members">${m.people.map(p => `<span class="sp-mem">${splitAvatar(m, p, 26)}<small>${nm(p)}</small></span>`).join("")}
      ${embedded ? "" : `<small class="live-dot">live</small>`}</div>
      ${m.addable.length ? `<div class="flags" style="margin:6px 0">${m.addable.map(([uid, f]) => `<button class="chip soft" type="button" data-gadd="${esc(uid)}">+ ${esc(f.n)}</button>`).join("")}</div>` : ""}
      ${m.stale ? `<p class="note"><b>No signal: showing the tally as it was ${esc(m.stale)}.</b></p>` : ""}`;
  } else {
    html += `<div class="block"><h2>Who’s splitting</h2>
      <div class="flags" id="sp-people">${m.people.map(p => `<span class="chip soft">${nm(p)}<button type="button" class="x" data-rm="${esc(p)}" aria-label="Remove ${nm(p)}">${icon("x","i xs")}</button></span>`).join("")}</div>
      <div class="row" style="margin-top:8px"><input class="sp-in" id="sp-name" type="text" maxlength="30" autocomplete="off" placeholder="Add a name" aria-label="Name to add"><button class="btn small" type="button" id="sp-addp">Add</button></div>
      ${m.people.length < 2 ? `<p class="note">Add everyone in the group (you too). Names are saved for next time.</p>` : ""}
      ${live ? "" : `<p class="note">With Friends switched on (Tools › Friends), you can start a live tally your mates add to from their own phones.</p>`}</div>`;
  }
  if (m.people.length < 2) return html;
  html += `<div class="seg sp-tabs" role="tablist"><button type="button" role="tab" data-sptab="tally" aria-pressed="${splitUi.tab !== "history"}">Tally</button><button type="button" role="tab" data-sptab="history" aria-pressed="${splitUi.tab === "history"}">History${items.length ? ` (${items.length})` : ""}</button></div>`;
  if (splitUi.tab === "history"){
    html += items.length ? `<div class="sp-hist-list">${items.map(x => {
      const n = x.to.length, each = x.a / n;
      const detail = x.s ? `${nm(x.by)} paid ${nm(x.to[0])} back`
        : x.sh ? `Total ${esc(money(x.a, x.c))} · custom: ${x.to.map(p => `${nm(p)} ${esc(money(+x.sh[p] || 0, x.c))}`).join(", ")}`
        : `Total ${esc(money(x.a, x.c))} · ${n === 1 ? `all for ${nm(x.to[0])}` : `${esc(money(r2(each), x.c))} each for ${x.to.length === m.people.length ? "everyone" : x.to.map(nm).join(", ")}`}`;
      return `<div class="sp-hist"><div class="who">${splitAvatar(m, x.by, 32)}<div><b>${nm(x.by)}</b> <span class="note">${x.s ? "settled up" : "paid"}</span>
          <div class="note">${esc(x.w)} · ${esc(splitWhen(x.t))}${m.live && x.add && x.add !== x.by ? ` · added by ${nm(x.add)}` : ""}</div>
          <div class="note">${detail}</div></div></div>
        <div class="amt"><b>${esc(money(x.a, x.c))}</b><small>£${toGBP(x.a, x.c).toFixed(2)}</small>
          <button class="icon-btn" type="button" data-del="${esc(x.id)}" aria-label="Delete ${esc(x.w)}">${icon("x","i s")}</button></div></div>`;
    }).join("")}</div>` : `<p class="note">Nothing yet. Payments show here with who paid and how it was split.</p>`;
    return html;
  }
  html += `<div class="sp-add"><h3>Add a payment</h3>
      <label class="field">What for<input id="sp-what" type="text" maxlength="60" placeholder="Taxi to the airport" value="${esc(splitUi.what)}"></label>
      <div class="pair2"><label class="field">How much<input id="sp-amt" type="text" inputmode="decimal" placeholder="0" value="${esc(splitUi.amt)}"></label>
        <label class="field">Money<select id="sp-cur">${curs.map(k => `<option value="${k}" ${k === splitUi.cur ? "selected" : ""}>${k}</option>`).join("")}</select></label></div>
      <label class="field">Paid by<select id="sp-by">${m.people.map(p => `<option value="${esc(p)}" ${p === splitUi.by ? "selected" : ""}>${nm(p)}</option>`).join("")}</select></label>
      <div class="note" style="margin:8px 0 4px">Split between</div>
      <div class="flags">${m.people.map(p => mine && p === m.me ? `<button class="chip soft locked" type="button" aria-pressed="true" disabled title="You’re always in your own split">${icon("check","i xs")}You</button>`
        : `<button class="chip soft" type="button" data-to="${esc(p)}" aria-pressed="${splitUi.to.has(p)}">${nm(p)}</button>`).join("")}</div>
      <div class="seg sp-mode" role="group" aria-label="How to split it"><button type="button" data-spmode="equal" aria-pressed="${splitUi.mode !== "custom"}">Equal split</button><button type="button" data-spmode="custom" aria-pressed="${splitUi.mode === "custom"}">Custom split</button></div>
      ${splitUi.mode === "custom" ? `<div class="sp-cust">${m.people.filter(p => splitUi.to.has(p)).map(p => `<label class="sp-crow"><span class="who">${splitAvatar(m, p, 24)}<b>${nm(p)}</b></span><input class="sp-in" type="text" inputmode="decimal" placeholder="0" data-cust="${esc(p)}" value="${esc((splitUi.cust || {})[p] || "")}" aria-label="Amount for ${nm(p)}"></label>`).join("")}
        <p class="note" id="sp-left"></p></div>` : ""}
      <button class="btn primary wide" type="button" id="sp-add" style="margin-top:12px">Add payment</button></div>
    ${mine ? splitMineHTML(m) : `<h3 style="margin-top:14px">Running tally</h3><div class="sp-bal">${m.people.map(p => {
      const v = bal[p] || 0;
      return `<div class="sp-row"><span class="who">${splitAvatar(m, p, 26)}<b>${nm(p)}</b></span><span class="${v > 0.005 ? "good" : v < -0.005 ? "bad" : ""}">${v > 0.005 ? `gets back ${showAmt(v)}` : v < -0.005 ? `owes ${showAmt(v)}` : "all square"}</span></div>`;
    }).join("")}</div>
    ${plan.length ? `<h3 style="margin-top:12px">To settle up</h3>${plan.map((t, k) => `<div class="sp-row"><span>${nm(t.from)} pays ${nm(t.to)} <b>${showAmt(t.gbp)}</b></span><button class="btn small" type="button" data-paid="${k}">Paid</button></div>`).join("")}` : m.items.length ? `<p class="note">Everyone is square.</p>` : ""}`}
    ${m.live ? "" : `<div class="row" style="margin-top:12px"><button class="btn small" type="button" id="sp-share">${icon("share","i s")}Send to the group</button></div>`}
    <p class="note">${m.live ? "Everyone in the group can add payments, and the tally updates on all your phones (with signal). " : "The tally is kept on this phone. Send it to the group and anyone who opens the link gets the same payments added to their app. "}Totals are worked out in pounds at today’s rates, shown in ${esc(CUR_NAME[lc] || lc)} too.</p>`;
  return html;
}
// your tally in a live group: one line per person, "owes you" in green or "you owe" in red, with a button to mark it paid
function splitMineHTML(m){
  const pr = splitPairs(m), others = m.people.filter(p => p !== m.me), nm = p => esc(m.name(p));
  const owed = r2(Object.values(pr).filter(v => v > 0).reduce((s, v) => s + v, 0)), owe = r2(-Object.values(pr).filter(v => v < 0).reduce((s, v) => s + v, 0));
  return `<h3 style="margin-top:14px">Your tally</h3>
    <p class="note sp-sum">${owed || owe ? `${owed ? `<span class="good">You’re owed ${showAmt(owed)}</span>` : ""}${owed && owe ? " · " : ""}${owe ? `<span class="bad">you owe ${showAmt(owe)}</span>` : ""}` : "You’re all square with everyone."}</p>
    <div class="sp-bal">${others.map(p => {
      const v = pr[p] || 0;
      return `<div class="sp-row"><span class="who">${splitAvatar(m, p, 26)}<b>${nm(p)}</b></span>
        <span class="sp-v ${v > 0.005 ? "good" : v < -0.005 ? "bad" : ""}">${v > 0.005 ? `owes you ${showAmt(v)}` : v < -0.005 ? `you owe ${showAmt(v)}` : "all square"}</span>
        ${Math.abs(v) > 0.005 ? `<button class="btn small" type="button" data-pair="${esc(p)}">${v > 0 ? "They paid me" : "I paid"}</button>` : ""}</div>`;
    }).join("")}</div>`;
}
function newGroupHTML(){
  const fr = Object.entries(frState().list);
  return `<div class="block" id="sp-newbox"><h2>New live group</h2>
    ${fr.length ? `<label class="field">Group name<input id="sp-gname" type="text" maxlength="30" placeholder="Bali crew"></label>
    <div class="note" style="margin:8px 0 4px">Who’s in it (you’re in it too)</div>
    <div class="flags">${fr.map(([uid, f]) => `<button class="chip soft" type="button" data-gpick="${esc(uid)}" aria-pressed="true">${esc(f.n)}</button>`).join("")}</div>
    <button class="btn primary wide" type="button" id="sp-gcreate" style="margin-top:12px">Start the group</button>`
    : `<p class="note">Add your mates in <a href="#tools/friends">Tools › Friends</a> first, then start a group with them here.</p>`}</div>`;
}
function bindSplit(root, m, again){
  const q = s => root.querySelector(s);
  const fail = e => toast(e && e.message === "permission" ? "Firebase said no: are you still in this group?" : (e && e.message) || "No signal? Try again.");
  root.querySelectorAll("[data-tally]").forEach(b => b.onclick = () => { splitData().cur = b.dataset.tally; splitUi.newGroup = false; persist(); again(); });
  const ng = q("#sp-newg"); if (ng) ng.onclick = () => { splitUi.newGroup = !splitUi.newGroup; again(); };
  root.querySelectorAll("[data-sptab]").forEach(b => b.onclick = () => { splitUi.tab = b.dataset.sptab; again(); });
  root.querySelectorAll("[data-gpick]").forEach(b => b.onclick = () => b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") !== "true"));
  const gc = q("#sp-gcreate");
  if (gc) gc.onclick = () => {
    const name = q("#sp-gname").value.trim() || "Trip";
    const who = [...root.querySelectorAll('[data-gpick][aria-pressed="true"]')].map(b => b.dataset.gpick);
    if (!who.length){ toast("Pick at least one friend"); return; }
    gc.disabled = true;
    liveCreateGroup(name, who).then(id => { splitData().cur = id; splitUi.newGroup = false; persist(); toast(`Started ${name}`); again(); }, e => { gc.disabled = false; fail(e); });
  };
  root.querySelectorAll("[data-gadd]").forEach(b => b.onclick = () => liveAddMember(m.id, b.dataset.gadd).then(again, fail));
  const ap = q("#sp-addp");
  if (ap){
    const addP = () => {
      const n = q("#sp-name").value.trim().replace(/\s+/g, " ").slice(0, 30);
      if (!n) return;
      if (m.people.some(p => p.toLowerCase() === n.toLowerCase())){ toast(`${n} is already in the group`); return; }
      m.addPerson(n).then(() => { splitUi.key = ""; Promise.resolve(again()).then(() => { const i = root.querySelector("#sp-name"); if (i) i.focus(); }); });
    };
    ap.onclick = addP;
    q("#sp-name").onkeydown = e => { if (e.key === "Enter"){ e.preventDefault(); addP(); } };
  }
  root.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => {
    const p = b.dataset.rm;
    if (m.items.some(x => x.by === p || x.to.includes(p))){ toast(`${p} is in some payments. Delete those first.`); return; }
    m.removePerson(p).then(() => { splitUi.key = ""; again(); });
  });
  root.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
    const x = m.items.find(i => i.id === b.dataset.del); if (!x) return;
    if (!await askConfirm(`Delete “${x.w}” (${money(x.a, x.c)})? It’s removed from the tally${m.live ? " on everyone’s phone" : ". Phones you send the tally to will drop it too"}.`, "Delete", true)) return;
    m.del(x.id).then(again, fail);
  });
  if (m.people.length < 2 || !q("#sp-add")) return;
  const keep = () => { splitUi.what = q("#sp-what").value; splitUi.amt = q("#sp-amt").value; splitUi.cur = q("#sp-cur").value; splitUi.by = q("#sp-by").value; };
  ["#sp-what", "#sp-amt", "#sp-cur", "#sp-by"].forEach(s => q(s).onchange = keep);
  root.querySelectorAll("[data-to]").forEach(b => b.onclick = () => { keep(); const p = b.dataset.to; splitUi.to.has(p) ? splitUi.to.delete(p) : splitUi.to.add(p); b.setAttribute("aria-pressed", splitUi.to.has(p)); if (splitUi.mode === "custom") again(); });
  root.querySelectorAll("[data-spmode]").forEach(b => b.onclick = () => { keep(); splitUi.mode = b.dataset.spmode; again(); });
  const left = () => {
    const el = q("#sp-left"); if (!el) return;
    const total = parseFloat(String(q("#sp-amt").value).replace(/[, ]/g, "")) || 0;
    const sum = [...root.querySelectorAll("[data-cust]")].reduce((s, i) => s + (parseFloat(String(i.value).replace(/[, ]/g, "")) || 0), 0);
    const d = r2(total - sum);
    el.textContent = !total ? "Type the total above, then each person’s part." : Math.abs(d) < 0.01 ? "Adds up to the total ✓" : d > 0 ? `${fmtNum(d)} still to share out` : `${fmtNum(-d)} too much`;
    el.className = "note " + (Math.abs(d) < 0.01 && total ? "good" : "");
  };
  root.querySelectorAll("[data-cust]").forEach(i => i.oninput = () => { splitUi.cust[i.dataset.cust] = i.value; left(); });
  if (q("#sp-amt")) q("#sp-amt").addEventListener("input", left);
  left();
  q("#sp-add").onclick = async () => {
    keep();
    const btn = q("#sp-add"); btn.disabled = true;
    if (m.live && m.me && m.people.includes(m.me)){ splitUi.to.add(m.me); if (splitUi.to.size < 2){ btn.disabled = false; toast("Pick at least one person to split it with"); return; } }
    let sh = null;
    if (splitUi.mode === "custom"){
      const total = parseFloat(String(splitUi.amt).replace(/[, ]/g, ""));
      const r = splitCustom(total, m.people.filter(p => splitUi.to.has(p)), splitUi.cust);
      if (r.err && isFinite(total) && total > 0){ btn.disabled = false; toast(r.err); return; }
      sh = r.sh || null;
    }
    const msg = await m.add({what:splitUi.what, amount:splitUi.amt, cur:splitUi.cur, by:splitUi.by, to:[...splitUi.to], sh}).catch(e => (e && e.message === "permission" ? "Firebase said no: are you still in this group?" : "No signal? Try again."));
    btn.disabled = false;
    if (msg){ toast(msg); return; }
    splitUi.what = ""; splitUi.amt = ""; splitUi.cust = {}; splitUi.to = new Set(m.people); toast("Added"); again();
  };
  root.querySelectorAll("[data-pair]").forEach(b => b.onclick = async () => {
    const p = b.dataset.pair, v = splitPairs(m)[p] || 0; if (Math.abs(v) < 0.005) return;
    const from = v > 0 ? p : m.me, to = v > 0 ? m.me : p;
    if (!await askConfirm(v > 0 ? `Mark that ${m.name(p)} paid you back ${splitLocal() === "GBP" ? "£" + Math.abs(v).toFixed(2) : money(niceRound(Math.abs(v) * rate(splitLocal()), splitLocal()), splitLocal())}?` : `Mark that you paid ${m.name(p)} back?`, "Yes, settled")) return;
    m.paid(from, to, Math.abs(v)).then(() => { toast("Settled"); again(); }, fail);
  });
  const plan = splitSettle(splitBalances({people:m.people, items:m.items}));
  root.querySelectorAll("[data-paid]").forEach(b => b.onclick = () => { const t = plan[+b.dataset.paid]; m.paid(t.from, t.to, t.gbp).then(() => { toast(`${m.name(t.from)} paid ${m.name(t.to)} back`); again(); }, fail); });
  const sh = q("#sp-share"); if (sh) sh.onclick = splitShare;
}
