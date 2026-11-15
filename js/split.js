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
function splitBalances(sp = splitData()){
  const bal = {}; sp.people.forEach(p => bal[p] = 0);
  for (const it of sp.items){
    const to = (it.to || []).filter(Boolean); if (!to.length || !(it.a > 0)) continue;
    const gbp = toGBP(it.a, it.c), share = gbp / to.length;
    bal[it.by] = (bal[it.by] || 0) + gbp;
    to.forEach(p => bal[p] = (bal[p] || 0) - share);
  }
  Object.keys(bal).forEach(k => bal[k] = r2(bal[k]));
  return bal;
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
function splitAdd({what, amount, cur, by, to}){
  const sp = splitData(), a = parseFloat(String(amount).replace(/[, ]/g, ""));
  if (!isFinite(a) || a <= 0) return "Type how much it cost";
  if (a > 1e9) return "That amount looks wrong";
  if (!by || !sp.people.includes(by)) return "Pick who paid";
  const who = (to || []).filter(p => sp.people.includes(p));
  if (!who.length) return "Pick who it was for";
  sp.items.push({id:splitId(), w:String(what || "").trim().slice(0, 60) || "Payment", a:r2(a), c:cur, by, to:who, t:Date.now()});
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
  const raw = new TextEncoder().encode(JSON.stringify({v:1, p:sp.people, i:sp.items.map(x => [x.id, x.w, x.a, x.c, x.by, x.to, x.t, x.s ? 1 : 0]), d:sp.del}));
  if (typeof CompressionStream !== "undefined"){ try { return "z" + b64u(await pipeThrough(raw, new CompressionStream("deflate-raw"))); } catch(e){} }
  return "j" + b64u(raw);
}
async function splitDecode(code){
  let bytes = unb64u(code.slice(1));
  if (code[0] === "z") bytes = await pipeThrough(bytes, new DecompressionStream("deflate-raw"));
  const o = JSON.parse(new TextDecoder().decode(bytes));
  return {people:o.p || [], items:(o.i || []).map(([id, w, a, c, by, to, t, s]) => ({id, w, a, c, by, to, t, ...(s ? {s:1} : {})})), del:o.d || []};
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

/* ---------- the page ---------- */
const splitUi = {to:null, by:"", cur:"", what:"", amt:""};
const showAmt = gbp => { const lc = splitLocal(); return lc === "GBP" ? `£${Math.abs(gbp).toFixed(2)}` : `${money(niceRound(Math.abs(gbp) * rate(lc), lc), lc)} <small>£${Math.abs(gbp).toFixed(2)}</small>`; };
TOOL_PAGES.split = async (root, arg) => {
  if (arg && arg.startsWith("g=")){
    try {
      const other = await splitDecode(arg.slice(2)), n = splitMerge(other);
      toast(n ? `Added ${n} payment${n === 1 ? "" : "s"} from the link` : "Nothing new in that link: you’re up to date");
    } catch(e){ toast("That link didn’t work. Ask for it to be sent again."); }
    history.replaceState(null, "", "#tools/split"); ui.sub = "split";
  }
  const sp = splitData(), lc = splitLocal();
  if (!splitUi.cur) splitUi.cur = lc;
  if (!splitUi.to) splitUi.to = new Set(sp.people);
  if (!sp.people.includes(splitUi.by)) splitUi.by = sp.people[0] || "";
  const bal = splitBalances(sp), plan = splitSettle(bal);
  const curs = [...new Set([lc, "GBP", ...Object.keys(D.rates)])].filter(k => k === "GBP" || D.rates[k]);
  const items = sp.items.slice().sort((a, b) => b.t - a.t);
  let html = hero({title:"Split costs", sub:"Who paid, who owes, and how to settle up", back:["#tools", "Tools"]}) + `<div class="page split">`;
  html += `<div class="block"><h2>Who’s splitting</h2>
    <div class="flags" id="sp-people">${sp.people.map(p => `<span class="chip soft">${esc(p)}<button type="button" class="x" data-rm="${esc(p)}" aria-label="Remove ${esc(p)}">${icon("x","i xs")}</button></span>`).join("")}</div>
    <div class="row" style="margin-top:8px"><input class="sp-in" id="sp-name" type="text" maxlength="30" autocomplete="off" placeholder="Add a name" aria-label="Name to add"><button class="btn small" type="button" id="sp-addp">Add</button></div>
    ${sp.people.length < 2 ? `<p class="note">Add everyone in the group (you too). Names are saved for next time.</p>` : ""}</div>`;
  if (sp.people.length >= 2){
    html += `<div class="block"><h2>Add a payment</h2>
      <label class="field">What for<input id="sp-what" type="text" maxlength="60" placeholder="Taxi to the airport" value="${esc(splitUi.what)}"></label>
      <div class="pair2"><label class="field">How much<input id="sp-amt" type="text" inputmode="decimal" placeholder="0" value="${esc(splitUi.amt)}"></label>
        <label class="field">Money<select id="sp-cur">${curs.map(k => `<option value="${k}" ${k === splitUi.cur ? "selected" : ""}>${k}</option>`).join("")}</select></label></div>
      <label class="field">Paid by<select id="sp-by">${sp.people.map(p => `<option ${p === splitUi.by ? "selected" : ""}>${esc(p)}</option>`).join("")}</select></label>
      <div class="note" style="margin:8px 0 4px">Split equally between</div>
      <div class="flags">${sp.people.map(p => `<button class="chip soft" type="button" data-to="${esc(p)}" aria-pressed="${splitUi.to.has(p)}">${esc(p)}</button>`).join("")}</div>
      <button class="btn primary wide" type="button" id="sp-add" style="margin-top:12px">Add payment</button></div>`;
    html += `<div class="block"><h2>Running tally</h2><div class="sp-bal">${sp.people.map(p => {
      const v = bal[p] || 0;
      return `<div class="sp-row"><b>${esc(p)}</b><span class="${v > 0.005 ? "good" : v < -0.005 ? "bad" : ""}">${v > 0.005 ? `gets back ${showAmt(v)}` : v < -0.005 ? `owes ${showAmt(v)}` : "all square"}</span></div>`;
    }).join("")}</div>
      ${plan.length ? `<h3 style="margin-top:12px">To settle up</h3>${plan.map((t, k) => `<div class="sp-row"><span>${esc(t.from)} pays ${esc(t.to)} <b>${showAmt(t.gbp)}</b></span><button class="btn small" type="button" data-paid="${k}">Paid</button></div>`).join("")}` : sp.items.length ? `<p class="note">Everyone is square.</p>` : ""}
      <div class="row" style="margin-top:12px"><button class="btn small" type="button" id="sp-share">${icon("share","i s")}Send to the group</button></div>
      <p class="note">The tally is kept on this phone. Send it to the group and anyone who opens the link gets the same payments added to their app. Totals are worked out in pounds at today’s rates, shown in ${esc(CUR_NAME[lc] || lc)} too.</p></div>`;
    if (items.length) html += `<div class="block"><h2>Payments</h2>${items.map(x => `<div class="sp-item"><div><b>${esc(x.w)}</b> <span class="price">${esc(money(x.a, x.c))}</span>
      <div class="note">${x.s ? `${esc(x.by)} paid back ${esc(x.to[0])}` : `${esc(x.by)} paid, for ${x.to.length === sp.people.length ? "everyone" : x.to.map(esc).join(", ")}`} · ${esc(new Date(x.t).toLocaleDateString("en-GB", {day:"numeric", month:"short"}))}</div></div>
      <button class="icon-btn" type="button" data-del="${esc(x.id)}" aria-label="Delete ${esc(x.w)}">${icon("x","i s")}</button></div>`).join("")}</div>`;
  }
  html += `</div>`;
  root.innerHTML = html;
  const again = () => TOOL_PAGES.split(root, "");
  const addP = () => {
    const n = $("#sp-name").value.trim().replace(/\s+/g, " ").slice(0, 30);
    if (!n) return;
    if (sp.people.some(p => p.toLowerCase() === n.toLowerCase())){ toast(`${n} is already in the group`); return; }
    sp.people.push(n); splitUi.to.add(n); persist(); again(); const i = $("#sp-name"); if (i) i.focus();
  };
  $("#sp-addp").onclick = addP;
  $("#sp-name").onkeydown = e => { if (e.key === "Enter"){ e.preventDefault(); addP(); } };
  root.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => {
    const p = b.dataset.rm;
    if (sp.items.some(x => x.by === p || x.to.includes(p))){ toast(`${p} is in some payments. Delete those first.`); return; }
    sp.people = sp.people.filter(x => x !== p); splitUi.to.delete(p); persist(); again();
  });
  if (sp.people.length < 2) return;
  const keep = () => { splitUi.what = $("#sp-what").value; splitUi.amt = $("#sp-amt").value; splitUi.cur = $("#sp-cur").value; splitUi.by = $("#sp-by").value; };
  ["#sp-what", "#sp-amt", "#sp-cur", "#sp-by"].forEach(s => $(s).onchange = keep);
  root.querySelectorAll("[data-to]").forEach(b => b.onclick = () => { const p = b.dataset.to; splitUi.to.has(p) ? splitUi.to.delete(p) : splitUi.to.add(p); b.setAttribute("aria-pressed", splitUi.to.has(p)); });
  $("#sp-add").onclick = () => {
    keep();
    const msg = splitAdd({what:splitUi.what, amount:splitUi.amt, cur:splitUi.cur, by:splitUi.by, to:[...splitUi.to]});
    if (msg){ toast(msg); return; }
    splitUi.what = ""; splitUi.amt = ""; splitUi.to = new Set(sp.people); toast("Added"); again();
  };
  root.querySelectorAll("[data-paid]").forEach(b => b.onclick = () => { const t = plan[+b.dataset.paid]; splitPaid(t.from, t.to, t.gbp); toast(`${t.from} paid ${t.to} back`); again(); });
  root.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
    const x = sp.items.find(i => i.id === b.dataset.del); if (!x) return;
    if (!confirm(`Delete “${x.w}” (${money(x.a, x.c)})? It’s removed from the tally. Phones you send the tally to will drop it too.`)) return;
    splitDelete(x.id); again();
  });
  $("#sp-share").onclick = splitShare;
};
