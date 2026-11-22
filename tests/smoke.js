// Quick check of the whole app in a phone-sized headless browser.
// Run from the repo root:   npm test   (or node tests/smoke.js). It starts its own little web server.
// Uses Playwright if it is installed (Claude Code's cloud machines have it), otherwise playwright-core
// (npm install) driving the Edge or Chrome already on the computer.
// It fails (exit code 1) if any page throws a JavaScript error, a tab scrolls sideways at 393 px,
// the map or its clusters don't appear, a place won't open, the look switch breaks, or the app won't load offline.
const { start } = require("./serve");
const fs = require("fs"), os = require("os"), path = require("path");

// a small real PDF (a pretend boarding pass) for the Documents check
function makePdf(lines){
  const NL = "\n";
  const esc = t => t.replace(/[\\()]/g, m => "\\" + m);
  const content = "BT /F1 16 Tf 50 790 Td " + lines.map((l, i) => (i ? "0 -26 Td " : "") + "(" + esc(l) + ") Tj").join(" ") + " ET";
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    ["<< /Length " + content.length + " >>", "stream", content, "endstream"].join(NL), "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let out = "%PDF-1.4" + NL;
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += [`${i + 1} 0 obj`, o, "endobj", ""].join(NL); });
  const x = out.length;
  out += ["xref", `0 ${objs.length + 1}`, "0000000000 65535 f "].join(NL) + NL
    + offs.map(n => String(n).padStart(10, "0") + " 00000 n " + NL).join("")
    + ["trailer", `<< /Size ${objs.length + 1} /Root 1 0 R >>`, "startxref", String(x), "%%EOF", ""].join(NL);
  const f = path.join(os.tmpdir(), "sea-trip-boarding-pass.pdf"); fs.writeFileSync(f, out, "latin1"); return f;
}
let chromium, launchOpts = {};
try { ({ chromium } = require("playwright")); }
catch (e) { ({ chromium } = require("playwright-core")); launchOpts = {channel: process.env.BROWSER || (process.platform === "win32" ? "msedge" : "chrome")}; }
const PORT = +process.env.PORT || 8765;
const BASE = process.env.BASE || `http://localhost:${PORT}/`;
const IGNORE = /config\.js|ERR_TUNNEL|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_PROXY|Failed to load resource/;
let failed = 0;
// SEA_EXP=all: every experiment switched on (npm test runs the whole check both ways); a few checks of the old layout skip then
const EXPON = process.env.SEA_EXP === "all";
if (EXPON) console.log("Experiments: ALL ON");
const ok = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) failed++; };

(async () => {
  const server = process.env.BASE ? null : await start(PORT);
  const browser = await chromium.launch(launchOpts);
  // the real config.js holds Dylan's keys: tests never use it (no real Google or Firebase calls)
  const newCtx = browser.newContext.bind(browser);
  browser.newContext = async (...args) => { const c = await newCtx(...args); if (EXPON) await c.addInitScript(() => { try { localStorage.setItem("sea-exp-v1", JSON.stringify({"*":true})); } catch(e){} }); await c.route(/\/config\.js(\?|$)/, r => r.fulfill({status:200, contentType:"text/javascript", body:"/* config.js is blocked in tests */"})); return c; };
  // a phone in central Bangkok that allows location (the app no longer pretends: it uses the real position)
  const ctx = await browser.newContext({viewport:{width:393, height:852}, geolocation:{latitude:13.7466, longitude:100.5393}, permissions:["geolocation"]});
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !IGNORE.test(m.text())) errors.push(m.text()); });
  const sumHits = {};
  page.on("request", r => { const m = r.url().match(/places\/\w+\/sum-\w+\.json/); if (m) sumHits[m[0]] = (sumHits[m[0]] || 0) + 1; });

  await page.goto(BASE + "#map"); await page.waitForTimeout(6000);
  ok(await page.evaluate(() => !!document.querySelector("#map canvas")), "map canvas is drawn");
  const dbs = await page.evaluate(() => PLACE_DBS.length);
  ok(Object.values(sumHits).every(n => n === 1) && Object.keys(sumHits).length === 3 * dbs, `each place summary downloads once, for all ${dbs} countries ` + JSON.stringify(sumHits));
  const cl = await page.evaluate(() => ["stay","food","do","ess","move"].filter(g => map.getLayer("cl-circle-" + g)).length);
  ok(cl === 5, "a cluster layer for each of the 5 categories");
  ok(await page.evaluate(() => map.queryRenderedFeatures().some(f => /^cl-circle-/.test(f.layer.id))), "clusters are visible on screen");
  ok(await page.evaluate(() => S.funny === false && !document.querySelector("#funnyIntro") && ui.mapFriends === false), "a new phone: funny mode is off (no intro) and friends aren't on the map");
  ok(await page.evaluate(() => { const c = doChip("boozer"); return c.l === "Boozas" && !c.note; }), "the Activities section is spelt Boozas, with no explainer when you pick it");

  for (const tab of ["gaffs", "munch", "activities", "tools", "tools/settings", "tools/transport", "tools/translate", "tools/emergency", "tools/split", "tools/friends", "tools/friends-play", "saved"]){
    await page.goto(BASE + "#" + tab); await page.waitForTimeout(1500);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    ok(w <= 393, `${tab}: no sideways scroll (width ${w})`);
    if (tab === "tools/friends") ok(await page.evaluate(() => !document.querySelector("#funnyBen")), "funny mode off: nobody waves on Friends");
    if (tab === "tools/transport"){
      await page.waitForTimeout(1500);
      // (the names themselves need the map's font server, which some test machines can't reach, so this checks the layer and its data)
      const tm = await page.evaluate(() => { const d = tmap && tmap.getSource("cities") ? tmap.getSource("cities").serialize().data.features.map(f => f.properties.n) : [];
        return {layer:!!(tmap && tmap.getLayer("city-name")), hubMin:tmap && tmap.getLayer("hub-name").minzoom, n:d.length, hubsLeftOut:!d.some(n => Object.values(HUB).some(h => h.n === n)), some:d.slice(0, 4)}; });
      ok(tm.layer && tm.hubMin < 5 && tm.n > 10 && tm.hubsLeftOut, "the Transport map names the trip's towns and islands (stops keep their own names) " + JSON.stringify(tm));
    }
  }

  // a card whose photo won't load (a broken link remembered on the phone) tries the free photo, then keeps the drawing: never a typical photo
  await page.goto(BASE + "#gaffs"); await page.waitForTimeout(2500);
  const brokeId = await page.evaluate(() => { const sl = document.querySelector('#pageview [data-ph^="g-"]'); cph[sl.dataset.ph] = {src:"https://lh3.googleusercontent.com/broken-photo-for-test", at:Date.now(), g:true, gTried:true}; lsSet("card-photos-v3", cph); return sl.dataset.ph; });
  await page.reload(); await page.waitForTimeout(3000);
  await page.evaluate(id => document.querySelector(`#pageview [data-ph="${id}"]`).scrollIntoView(), brokeId); await page.waitForTimeout(3000);
  const broke = await page.evaluate(id => { const sl = document.querySelector(`#pageview [data-ph="${id}"]`), im = sl && sl.querySelector("img"); return {src:im ? im.getAttribute("src") : null, typ:!!(sl && sl.querySelector(".typ"))}; }, brokeId);
  ok(!broke.src && !broke.typ, "a card photo that won't load leaves the drawing, never a typical photo " + JSON.stringify(broke));
  ok(await page.evaluate(() => ![...document.querySelectorAll("#pageview .card img")].some(i => /img\/kind\//.test(i.getAttribute("src") || "")) && !document.querySelector("#pageview .card .typ")), "no typical photos on any card: a real photo or the drawing");
  await page.goto(BASE + "#munch"); await page.waitForTimeout(2000);
  await page.click(".card[data-open]");
  await page.waitForTimeout(1000);
  ok(await page.evaluate(() => !!document.querySelector("#sheetRoot .sheet")), "tapping a place opens its details");
  await page.click("#sheetRoot button[data-close]"); await page.waitForTimeout(600);

  // Design Lab: hidden on a new phone; Settings has no look controls; switching the Lab on brings it back, with the look inside it
  await page.goto(BASE + "#tools/settings"); await page.waitForTimeout(1000);
  ok(await page.evaluate(() => !document.querySelector("#labBtn") && !document.querySelector('#pageview [data-look]') && !document.querySelector('#pageview [data-labtoggle]') && S.design.on === false), "Design Lab is hidden by default and only a developer can switch it on");
  ok(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim().toUpperCase() === "#121417" && getComputedStyle(document.documentElement).getPropertyValue("--stay").trim().toUpperCase() === "#FF7A59"), "Dylan's look is the default (dark #121417, tropical section colours)");
  await page.goto(BASE + "#tools"); await page.waitForTimeout(600);
  ok(await page.evaluate(() => !document.querySelector('#pageview a[href="#tools/developer"]')), "no Developer tool until ELITE POTATO is typed");
  await page.evaluate(() => { S.dev = true; persist(); renderPage(); }); await page.waitForTimeout(600);
  ok(await page.evaluate(() => { const t = [...document.querySelector("#pageview .tgrid").querySelectorAll("a.tool")]; return t.length && t[t.length - 1].getAttribute("href") === "#tools/developer"; }), "a developer phone gets Developer as the last tool");
  await page.goto(BASE + "#tools/developer"); await page.waitForTimeout(800);
  // Experiments: every switch is listed with its description; all off on a normal phone (all on in the experiments test run)
  const ex = await page.evaluate(() => ({n:EXPERIMENTS.length, rows:document.querySelectorAll("#dev-exp [data-exp]").length, on:[...document.querySelectorAll("#dev-exp [data-exp]")].map(b => b.getAttribute("aria-pressed")), w:document.documentElement.scrollWidth}));
  ok(ex.n >= 10 && ex.rows === ex.n && ex.on.every(v => v === String(EXPON)) && ex.w <= 393, `Tools › Developer lists all ${ex.n} experiments, ${EXPON ? "all on" : "all off"} ` + JSON.stringify(ex));
  if (!EXPON){
    await page.click('#dev-exp [data-exp="statusfade"]'); await page.waitForTimeout(300);
    ok(await page.evaluate(() => exp("statusfade") && document.documentElement.classList.contains("x-statusfade") && JSON.parse(localStorage.getItem("sea-exp-v1")).statusfade === true), "a switch turns its experiment on, on this phone");
    await page.click('#dev-exp [data-exp="statusfade"]'); await page.waitForTimeout(300);
    ok(await page.evaluate(() => !exp("statusfade") && !document.documentElement.classList.contains("x-statusfade")), "and off again");
  }
  await page.click("#dev-lab"); await page.waitForTimeout(500);
  ok(await page.evaluate(() => !!document.querySelector("#labBtn") && S.design.on === true), "the Design Lab switches on from Tools › Developer");
  await page.click("#labBtn"); await page.waitForTimeout(400);
  await page.click('#lab [data-labtab="look"]'); await page.waitForTimeout(300);
  await page.click('#lab [data-look="paper"]'); await page.waitForTimeout(2500);
  ok(await page.evaluate(() => document.documentElement.dataset.look === "paper"), "Paper Atlas look switches on from the Design Lab");
  await page.goto(BASE + "#map"); await page.waitForTimeout(3000);
  ok(await page.evaluate(() => map.getStyle().name.includes("Paper")), "map uses the Paper Atlas style");
  await page.click("#labBtn"); await page.waitForTimeout(400);
  await page.click('#lab [data-labtab="look"]'); await page.waitForTimeout(300);
  await page.click('#lab [data-look="night"]'); await page.waitForTimeout(2500);
  ok(await page.evaluate(() => !document.documentElement.dataset.look), "back to the night look");

  // Currency: local money on the left, pounds on the right, and it works both ways
  await page.goto(BASE + "#tools/currency"); await page.waitForTimeout(800);
  const conv = await page.evaluate(() => { const ins = [...document.querySelectorAll(".conv input")]; return {left:ins[0] && ins[0].id, right:ins[1] && ins[1].id, leftCur:document.querySelector(".conv select").value}; });
  ok(conv.left === "cv-loc" && conv.right === "cv-gbp" && conv.leftCur === "THB", "the converter shows baht on the left and pounds on the right " + JSON.stringify(conv));
  await page.fill("#cv-loc", "1000"); await page.waitForTimeout(200);
  ok(await page.evaluate(() => Math.abs(parseFloat(document.querySelector("#cv-gbp").value) - 1000 / rate("THB")) < 0.02), "typing baht gives pounds");
  await page.fill("#cv-gbp", "10"); await page.waitForTimeout(200);
  ok(await page.evaluate(() => Math.abs(parseFloat(document.querySelector("#cv-loc").value) - 10 * rate("THB")) < 0.02), "typing pounds gives baht");

  // Budget is hidden (no tile, no Discover card) but its saved data is kept
  await page.evaluate(() => { S.budget.items.push({amt:100, cur:"THB", what:"test", at:Date.now()}); persist(); });
  await page.goto(BASE + "#tools"); await page.waitForTimeout(800);
  ok(await page.evaluate(() => !document.querySelector('#pageview a[href="#tools/budget"]')), "Budget has no tile in Tools");
  await page.goto(BASE + "#discover"); await page.waitForTimeout(800);
  ok(await page.evaluate(() => !document.querySelector('#pageview a[href="#tools/budget"]') && S.budget.items.some(x => x.what === "test")), "Discover shows no Budget card, and the spending is still saved");
  await page.evaluate(() => { S.budget.items = S.budget.items.filter(x => x.what !== "test"); persist(); });

  // Wi-Fi finder: straight to the main map with only Wi-Fi showing
  await page.goto(BASE + "#tools"); await page.waitForTimeout(800);
  await page.click('#pageview a[href="#tools/wifi"]'); await page.waitForTimeout(5000);
  const wf = await page.evaluate(() => ({view:ui.view, ess:[...ui.essKinds], cats:ui.mapCats.size, n:mapRun.items.length, onlyWifi:mapRun.items.every(p => p.k === "wifi")}));
  ok(wf.view === "map" && wf.ess.join() === "wifi" && wf.cats === 0 && wf.onlyWifi, "Wi-Fi finder opens the map with only Wi-Fi places " + JSON.stringify(wf));
  await page.evaluate(() => { ui.essKinds.clear(); ui.essOpen = false; ui.mapCats = new Set(["gaff", "munch", "cool"]); mapRun.stash = null; renderMapUI(); });

  // map filters: picking Munch (from All) shows only food, with a price row; tapping Munch again clears the map
  await page.goto(BASE + "#map"); await page.waitForTimeout(2500);
  await page.evaluate(() => map.jumpTo({center:[100.5018, 13.7563], zoom:14.5})); await page.waitForTimeout(3500);
  await page.click('#mapChips [data-cat="munch"]'); await page.waitForTimeout(2500);
  ok(await page.evaluate(() => [...ui.mapCats].join() === "munch" && !document.querySelector("#mapFilt").hidden), "tapping Munch shows only food, with the filter row");
  const before = await page.evaluate(() => mapRun.items.length);
  // price presets: every place left has a known or estimated price at or under the maximum, none with an unknown price
  await page.click('#mapFilt [data-pfp="2"]'); await page.waitForTimeout(1500);
  const cheap = await page.evaluate(() => ({n:mapRun.items.length, ok:mapRun.items.every(p => { const pr = pfPrice(p, "munch"); return pr && pr.gbp <= 2; })}));
  ok(cheap.ok && cheap.n > 0 && cheap.n < before, `£2 a dish keeps only places at or under £2 (${cheap.n} of ${before})`);
  // the same filter, the same answer in the Munch list
  await page.goto(BASE + "#munch"); await page.waitForTimeout(3000);
  const lst = await page.evaluate(() => ({max:ui.pf.munch.max, all:listItems("munch").every(p => passPF(p, "munch")), note:!!document.querySelector(".pf-note")}));
  ok(lst.max === 2 && lst.all && !lst.note, "the Munch list keeps the £2 maximum from the map and applies the same rule, with no explanation taking up room " + JSON.stringify(lst));
  // list polish: the distance slider (1 to 50 km, then 50+), a photo card first, stars under the name, no long price note
  await page.goto(BASE + "#activities"); await page.waitForTimeout(3500);
  await page.click("#l-filters"); await page.waitForTimeout(400);
  const sl = await page.evaluate(() => { const d = document.querySelector("#l-dist"); return {min:d.min, max:d.max, val:d.value, lab:document.querySelector("#l-distlab").textContent, chips:document.querySelectorAll("[data-radius]").length, note:/A maximum price uses/.test(document.querySelector("#fpanel").textContent)}; });
  ok(sl.min === "1" && sl.max === "51" && sl.val === "51" && /50\+/.test(sl.lab) && !sl.chips && !sl.note, "Filters has a distance slider up to 50+ km and no long price note " + JSON.stringify(sl));
  await page.evaluate(() => { const d = document.querySelector("#l-dist"); d.value = "7"; d.dispatchEvent(new Event("input", {bubbles:true})); d.dispatchEvent(new Event("change", {bubbles:true})); }); await page.waitForTimeout(2500);
  const sl2 = await page.evaluate(() => { const pt = focusPt(); return {r:ui.lists.cool.radius, lab:document.querySelector("#l-distlab").textContent, far:listItems("cool").filter(p => dist(pt, p) > 7).length}; });
  ok(sl2.r === 7 && /Within 7 km/.test(sl2.lab) && sl2.far === 0, "sliding to 7 km keeps only places within 7 km " + JSON.stringify(sl2));
  await page.evaluate(() => { ui.lists.cool.radius = 0; ui.lists.cool.filters = false; renderPage(); }); await page.waitForTimeout(2500);
  const top = await page.evaluate(() => { const it = listItems("cool"); const c = document.querySelector("#pageview .card"); const r = c.querySelector(".rate"), h = c.querySelector("h3");
    return {first:likelyPhoto(it[0]), anyRate:!!document.querySelector("#pageview .card .rate"), under:!r || h.nextElementSibling === r}; });
  ok(top.first && top.under, "the first Activities card is one with a photo, and stars sit right under the name " + JSON.stringify(top));
  await page.goto(BASE + "#gaffs"); await page.waitForTimeout(3000);
  ok(await page.evaluate(() => { const r = document.querySelector("#pageview .card .rate"); return !!r && r.previousElementSibling.tagName === "H3" && !!r.querySelector(".stars"); }), "researched hostels show their stars directly under the name");
  ok(await page.evaluate(() => /user-scalable=no/.test(document.querySelector('meta[name="viewport"]').content) && getComputedStyle(document.documentElement).touchAction === "manipulation"), "the page can't be double-tapped or pinched to zoom like a website");
  await page.goto(BASE + "#map"); await page.waitForTimeout(1500);
  // your own amount: one box the size of the preset buttons, in pounds; a nonsense amount is refused
  const box = await page.evaluate(() => { const b = document.querySelector("#mapFilt .pf-in"), c = document.querySelector('#mapFilt [data-pfp="2"]'); return {h:b.offsetHeight, ch:c.offsetHeight, w:b.offsetWidth, old:!!document.querySelector("#mapFilt [data-pfset], #mapFilt [data-pfcur]")}; });
  ok(box.h === box.ch && box.w < 80 && !box.old, "the own-amount box is the size of a price button, with no Set button or currency menu " + JSON.stringify(box));
  await page.fill('#mapFilt [data-pfamt]', "3.5"); await page.press('#mapFilt [data-pfamt]', "Enter"); await page.waitForTimeout(1200);
  ok(await page.evaluate(() => ui.pf.munch.max === 3.5 && ui.pf.munch.cur === "GBP" && document.querySelector("#mapFilt .pf-in").classList.contains("on") && mapRun.items.every(p => passPF(p, "munch"))), "typing 3.5 sets a £3.50 maximum");
  await page.fill('#mapFilt [data-pfamt]', "-3"); await page.press('#mapFilt [data-pfamt]', "Enter"); await page.waitForTimeout(500);
  ok(await page.evaluate(() => ui.pf.munch.max > 0 && document.querySelector('#mapFilt [data-pfamt]').getAttribute("aria-invalid") === "true"), "a negative custom amount is refused");
  ok(await page.evaluate(() => !document.querySelector("#mapFilt [data-mr]")), "no star filter (places have no ratings to filter on)");
  await page.click('#mapFilt [data-pfp=""]'); await page.waitForTimeout(600);
  ok(await page.evaluate(() => ui.pf.munch.max === null), "Any clears the maximum");
  await page.click('#mapChips [data-cat="munch"]'); await page.waitForTimeout(1500);
  ok(await page.evaluate(() => ui.mapCats.size === 0 && mapRun.items.length === 0), "tapping the only section again switches everything off");
  await page.click('#mapChips [data-all]'); await page.waitForTimeout(800);
  ok(await page.evaluate(() => document.querySelector("#mapFilt").hidden && ui.mapCats.size === 3), "All brings everything back, without the filter row");
  await page.click('#mapChips [data-all]'); await page.waitForTimeout(800);
  ok(await page.evaluate(() => ui.mapCats.size === 0 && !ui.essKinds.size && document.querySelector('#mapChips [data-all]').getAttribute("aria-pressed") === "false"), "tapping All when everything shows clears it (just the map)");
  await page.click('#mapChips [data-all]'); await page.waitForTimeout(800);
  // the bottom bar has Transport, and it opens the journey planner
  ok(await page.evaluate(() => [...document.querySelectorAll("#tabs a")].map(a => a.textContent.trim()).join(",") === "Map,Gaffs,Munch,Activities,Transport,Tools"), "six tabs: Map, Gaffs, Munch, Activities, Transport, Tools");
  await page.click('#tabs a[href="#tools/transport"]'); await page.waitForTimeout(1000);
  ok(await page.evaluate(() => ui.sub === "transport" && document.querySelector('#tabs a[aria-current="page"]').textContent.trim() === "Transport"), "the Transport tab opens the journey planner and lights up");
  // new questions in the map search: what a tuk-tuk should cost, and "I'm hungover"
  await page.goto(BASE + "#map"); await page.waitForTimeout(1500);
  await page.evaluate(() => map.jumpTo({center:[100.5300, 13.7445], zoom:14}));
  await page.fill("#m-q", "how much should a tuk-tuk cost to Siam Paragon?"); await page.waitForTimeout(600);
  await page.click("#mapSugs [data-ask]"); await page.waitForTimeout(4000);
  const fare = await page.evaluate(() => [...document.querySelectorAll("#askBody .fare")].map(f => f.innerText.replace(/\s+/g, " ")));
  ok(fare.length >= 3 && /Tuk-tuk/.test(fare[0]) && /est\./.test(fare[0]), "tuk-tuk question: estimated fares, the tuk-tuk first, marked est. " + JSON.stringify(fare));
  await page.evaluate(() => closeDetail()); await page.waitForTimeout(500);
  await page.fill("#m-q", "I'm hungover, what would cure me?"); await page.waitForTimeout(600);
  await page.click("#mapSugs [data-ask]"); await page.waitForTimeout(1200);
  const rx = await page.evaluate(() => [...document.querySelectorAll("#askBody .rx b")].map(b => b.textContent));
  ok(rx.length >= 3 && /ORS/.test(rx[0]) && await page.evaluate(() => !!document.querySelector("#askBody [data-rxnear]")), "hangover question: what to buy, ORS first, and the nearest pharmacy button " + JSON.stringify(rx));
  await page.evaluate(() => closeDetail()); await page.waitForTimeout(500);
  await page.goto(BASE + "#tools/guide"); await page.waitForTimeout(800);
  ok(await page.evaluate(() => /Hangover and the shits/.test(document.querySelector("#g-rx h2").textContent) && document.querySelectorAll("#g-rx .rx").length >= 5), "the guide has a Hangover and the shits section");
  // Munch: gluten-free; Essentials: luggage lockers
  await page.goto(BASE + "#munch"); await page.waitForTimeout(1500);
  ok(await page.evaluate(() => [...document.querySelectorAll("#pageview .chip")].some(c => /Gluten-free/.test(c.textContent))), "Munch has a Gluten-free button");
  ok(await page.evaluate(() => ESS.some(e => e.id === "luggage")), "Essentials has luggage lockers");

  // Indonesia: the map, lists, search and Tools work in Sumatra, Bali and Lombok too
  await page.evaluate(() => { setFocus({n:"Palembang", lat:-2.9888, lng:104.7569}); setCountry("ID", true); });
  await page.goto(BASE + "#map"); await page.waitForTimeout(1500);
  await page.evaluate(() => { ui.mapCats = new Set(["munch"]); renderMapUI(); map.jumpTo({center:[104.7569, -2.9888], zoom:14.5}); }); await page.waitForTimeout(4000);
  const idMap = await page.evaluate(() => ({n:mapRun.items.length, id:mapRun.items.filter(p => p.cc === "ID").length, box:!!document.querySelector('#mapFilt [data-pfamt]')}));
  ok(idMap.id > 20 && idMap.box, "Palembang food shows on the map, with the price filter " + JSON.stringify(idMap));
  // Surf: the Activities chip goes straight to the map with only researched surf spots; a spot shows its photo, waves and Surfline
  await page.evaluate(() => { setFocus({n:"Kuta Lombok", lat:-8.8853, lng:116.2757}); });
  await page.goto(BASE + "#activities"); await page.waitForTimeout(2500);
  await page.click('[data-chip="surf"]'); await page.waitForTimeout(5000);
  const surf = await page.evaluate(() => ({view:ui.view, surf:ui.mapSurf, n:mapRun.items.length, all:mapRun.items.every(p => p.k === "surf"), chip:document.querySelector("#mapChips [data-surf]").getAttribute("aria-pressed")}));
  ok(surf.view === "map" && surf.surf && surf.n >= 5 && surf.all && surf.chip === "true", "Surf in Activities opens the map with only surf spots " + JSON.stringify(surf));
  await page.evaluate(() => selectPlace("s-gerupukinside", true)); await page.waitForTimeout(4000);
  const pv = await page.evaluate(() => ({img:(document.querySelector("#preview .ph img") || {}).src || "", wave:(document.querySelector("#preview [data-surf]") || {}).textContent || ""}));
  ok(/img\/surf\/gerupuk\.jpg$/.test(pv.img), "a surf spot's preview shows its photo, straight from the app " + JSON.stringify(pv));
  ok(/ft/.test(pv.wave) || pv.wave === "", "and the wave height when the forecast answers " + JSON.stringify(pv.wave));
  await page.click('#preview [data-open]'); await page.waitForTimeout(3000);
  const sb = await page.evaluate(() => ({box:!!document.querySelector("#surfBox"), link:(document.querySelector('#surfBox a[href*="surfline.com"]') || {}).href || "", src:/Wikivoyage/.test(document.querySelector(".srcs").textContent)}));
  ok(sb.box && /surfline\.com\/search\//.test(sb.link) && sb.src, "its details show Surf now, Open on Surfline and the sources " + JSON.stringify(sb));
  await page.click("#sheetRoot button[data-close]"); await page.waitForTimeout(500);
  await page.click("#mapChips [data-cat=\"cool\"]"); await page.waitForTimeout(2500);
  ok(await page.evaluate(() => !ui.mapSurf && !mapRun.items.some(p => p.k === "surf")), "tapping Activities on the map leaves surf mode");
  ok(await page.evaluate(() => !document.querySelector("#near, .near-title") && !document.querySelector("#mapChips [data-filters]")), "no Closest to you strip at the bottom of the map");
  await page.evaluate(() => { ui.mapCats = new Set(["munch"]); renderMapUI(); });
  const pem = await page.evaluate(async () => (await Places.search("pempek", {lat:-2.9888, lng:104.7569})).map(s => s.n));
  ok(pem.length > 0 && pem.every(n => /pempek|empek/i.test(n)), "search finds pempek places in Palembang " + JSON.stringify(pem.slice(0, 3)));
  await page.evaluate(() => { setFocus({n:"Ubud", lat:-8.5069, lng:115.2625}); });
  await page.goto(BASE + "#gaffs"); await page.waitForTimeout(4000);
  const ubud = await page.evaluate(() => ({cards:document.querySelectorAll("#pageview .card[data-open]").length, rp:/Rp/.test(document.querySelector("#pageview .cards") ? document.querySelector("#pageview .cards").textContent : "")}));
  ok(ubud.cards > 5 && ubud.rp, "Ubud stays list with rupiah estimates " + JSON.stringify(ubud));
  await page.goto(BASE + "#tools/guide"); await page.waitForTimeout(800);
  ok(await page.evaluate(() => /Indonesia guide/.test(document.querySelector("#pageview h1").textContent) && /500,000 rupiah/.test(document.querySelector("#pageview").textContent)), "the guide switches to Indonesia");
  await page.goto(BASE + "#tools/emergency"); await page.waitForTimeout(800);
  ok(await page.evaluate(() => !!document.querySelector('#pageview a[href="tel:118"]') && /Jakarta/.test(document.querySelector("#pageview").textContent)), "Indonesia's emergency numbers and the embassy in Jakarta");
  await page.goto(BASE + "#tools/translate"); await page.waitForTimeout(800);
  ok(await page.evaluate(() => /Indonesian phrasebook/.test(document.querySelector("#h-pb").textContent) && /Terima kasih/.test(document.querySelector("#pageview").textContent)), "the phrasebook switches to Indonesian");
  const w3 = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(w3 <= 393, `no sideways scroll on the Indonesian pages (width ${w3})`);
  await page.evaluate(() => { setFocus(null); setCountry("TH", true); });
  await page.goto(BASE + "#map"); await page.waitForTimeout(1500);
  await page.evaluate(() => { ui.mapCats = new Set(["gaff", "munch", "cool"]); renderMapUI(); map.jumpTo({center:[100.5018, 13.7563], zoom:14.5}); }); await page.waitForTimeout(2500);

  // Transport on the map: Airports counts only airports, zoomed out and in, and a selected airport stays selected through zooming
  await page.evaluate(() => { ui.mapCats = new Set(["move"]); ui.mf.move.t = "airport"; renderMapUI(); map.jumpTo({center:[100.6, 13.8], zoom:8}); }); await page.waitForTimeout(3500);
  const air = await page.evaluate(() => ({mode:mapRun.mode, total:mapRun.total, status:document.querySelector("#mapStatusTxt").textContent}));
  ok(air.total > 0 && air.total < 20 && !/\d/.test(air.status), "zoomed out, Transport › Airports counts only airports, and no place count is shown beside Map / List " + JSON.stringify(air));
  await page.evaluate(() => map.jumpTo({center:[100.65, 13.8], zoom:10})); await page.waitForTimeout(3500);
  const airIn = await page.evaluate(() => ({mode:mapRun.mode, n:mapRun.items.length, kinds:[...new Set(mapRun.items.map(p => p.k))]}));
  ok(airIn.mode === "detail" && airIn.n >= 2 && airIn.kinds.every(k => k === "airport"), "zoomed in, only airport pins " + JSON.stringify(airIn));
  const pick = await page.evaluate(() => { const p = mapRun.items.find(x => x.k === "airport"); selectPlace(p.id); return {id:p.id, c:[p.lng, p.lat]}; });
  await page.evaluate(c => map.jumpTo({center:c, zoom:7}), pick.c); await page.waitForTimeout(2500);
  const outSel = await page.evaluate(id => ({sel:ui.mapSel === id, hl:mapRun.hl === id, prev:!!document.querySelector("#preview"), mode:mapRun.mode}), pick.id);
  await page.evaluate(c => map.jumpTo({center:c, zoom:11}), pick.c); await page.waitForTimeout(3000);
  const inSel = await page.evaluate(id => ({sel:ui.mapSel === id, hl:mapRun.hl === id, prev:!!document.querySelector("#preview"), pin:mapRun.items.some(p => p.id === id)}), pick.id);
  ok(outSel.sel && outSel.hl && outSel.prev && inSel.sel && inSel.hl && inSel.prev && inSel.pin, "the selected airport stays selected after zooming out and back in " + JSON.stringify({outSel, inSel}));
  await page.evaluate(() => { selectPlace(null); ui.mf.move.t = "all"; ui.mapCats = new Set(["gaff", "munch", "cool"]); renderMapUI(); map.jumpTo({center:[100.5018, 13.7563], zoom:14.5}); }); await page.waitForTimeout(2500);

  // Journey planner: every leg's 12Go button matches that leg (mode and direction), with the date and group
  await page.goto(BASE + "#tools/transport"); await page.waitForTimeout(1200);
  await page.evaluate(() => { ui.tp.from = hubNode("bkk"); ui.tp.to = hubNode("gilit"); ui.tp.date = addDays(todayISO(), 20); ui.tp.people = 2; ui.tp.go = false; renderPage(); }); await page.waitForTimeout(800);
  const tripsBefore = await page.evaluate(() => document.querySelectorAll(".trip").length);
  await page.click("#tp-go"); await page.waitForTimeout(1500);
  const tripsAfter = await page.evaluate(() => document.querySelectorAll(".trip.compact").length);
  ok(tripsBefore === 0 && tripsAfter > 0, `journeys show only after Search is pressed (${tripsBefore} before, ${tripsAfter} after)`);
  // tapping a 3-leg journey opens every leg, with its own map
  await page.evaluate(() => { const i = ui._trips.findIndex(t => t.legs.length === 3); document.querySelector(`[data-trip="${i}"]`).click(); }); await page.waitForTimeout(1500);
  const book = await page.evaluate(() => { const legs = [...document.querySelectorAll("#sheetRoot .leg")]; return legs.length === 3 ? legs.map(l => { const a = l.querySelector("a[data-book]"); return a ? a.getAttribute("href") : ""; }) : null; });
  ok(await page.evaluate(() => !!document.querySelector("#sheetRoot #legMap")), "the journey sheet has its own map");
  const d20 = await page.evaluate(() => addDays(todayISO(), 20));
  ok(book && /\/flights\/bangkok\/denpasar-airport\?date=/.test(book[0]) && /\/padang-bai\?/.test(book[1]) && /\/ferry\/padang-bai\/gili-trawangan\?/.test(book[2]) && book.every(h => h.includes("date=" + d20) && h.includes("people=2")), "Bangkok to Gili T: flight, transfer and ferry each link to their own 12Go page " + JSON.stringify(book));
  ok(await page.evaluate(() => /12Go shows the real departures/.test(document.querySelector("#sheetRoot").textContent)), "the planner says 12Go confirms the service, price and seats");
  ok(await page.evaluate(() => /google\.com\/travel\/flights/.test(document.querySelector("#sheetRoot").innerHTML)), "a flight leg links to Google Flights for the date");
  await page.evaluate(() => closeDetail());
  await page.evaluate(() => { ui.tp.from = null; ui.tp.to = null; ui.tp.date = ""; ui.tp.people = 1; });
  await page.goto(BASE + "#map"); await page.waitForTimeout(1500);

  // questions in the search box: typed questions get an answer row; answers list nearby places
  await page.fill("#m-q", "toilets near me"); await page.waitForTimeout(600);
  ok(await page.evaluate(() => { const b = document.querySelector("#mapSugs button"); return !!b && b.hasAttribute("data-ask"); }), "a typed question offers an answer first");
  await page.click("#mapSugs [data-ask]"); await page.waitForTimeout(4000);
  const toil = await page.evaluate(() => ({rows:document.querySelectorAll("#sheetRoot .ask-row").length, title:(document.querySelector("#askBody h3") || {}).textContent}));
  ok(toil.rows > 0 && /Toilets/.test(toil.title), "nearest toilets are listed " + JSON.stringify(toil));
  await page.click("#sheetRoot button[data-close]"); await page.waitForTimeout(300);
  const ans = await page.evaluate(async () => { const r = await answerAsk("best cheap restaurant near me"); return r.items.map(x => ({c:x.p.c, band:priceBand(x.p), km:x.km})); });
  ok(ans.length > 0 && ans.every(x => x.c === "munch" && x.band === 1 && x.km <= 5), "best cheap restaurant near me: cheap food within 5 km " + ans.length);
  await page.fill("#m-q", ""); await page.waitForTimeout(300);

  // "take me to the nearest ATM", typed: the map moves to the single nearest ATM, selects its pin and opens the preview with directions
  const pagesBefore = ctx.pages().length;
  await page.fill("#m-q", "Take me to the nearest ATM"); await page.waitForTimeout(700);
  ok(await page.evaluate(() => /nearest ATM/.test((document.querySelector("#mapSugs [data-ask]") || {}).textContent || "")), "a nearest-place request offers to go there");
  await page.press("#m-q", "Enter"); await page.waitForTimeout(5000);
  const near = await page.evaluate(() => { const p = ui.mapSel && findPlace(ui.mapSel); return p && {k:p.k, km:dist(userLoc, p), ess:[...ui.essKinds], prev:!!document.querySelector("#preview"), dir:!!document.querySelector('#preview a[href*="maps/dir"]'), ring:mapRun.hl === ui.mapSel ? 1 : 0, z:map.getZoom()}; });
  ok(near && ["atm", "bank"].includes(near.k) && near.km < 2 && near.prev && near.dir && near.ring === 1 && near.z > 14 && near.ess.join() === "atm", "the nearest ATM is selected on the map with its preview and directions " + JSON.stringify(near));
  // check it really is the nearest: nothing loaded nearby is closer
  ok(await page.evaluate(async () => { const p = findPlace(ui.mapSel), d = dist(userLoc, p); const all = await Places.near("ess", userLoc, {maxKm:d + 0.05, want:400, test:x => ["atm", "bank"].includes(x.k)}); return all.items.every(x => dist(userLoc, x) >= d - 1e-6); }), "no ATM in the data is closer than the one chosen");
  ok(ctx.pages().length === pagesBefore, "directions are offered, not launched");
  await page.evaluate(() => selectPlace(null));
  // with location blocked it says so and uses the middle of the map, rather than pretending
  await page.evaluate(() => { window.__toasts = []; const t = window.toast; window.toast = (m, u) => { __toasts.push(m); return t(m, u); }; S.testLoc = "off"; userLoc = null; locStatus = "idle"; navigator.geolocation.getCurrentPosition = (ok, err) => setTimeout(() => err({code:1}), 50); });
  await page.evaluate(() => goNearest("where's the closest pharmacy")); await page.waitForTimeout(4000);
  const den = await page.evaluate(() => { const p = ui.mapSel && findPlace(ui.mapSel); return {k:p && p.k, status:locStatus, toast:__toasts.join(" | ")}; });
  ok(den.k === "pharmacy" && den.status === "denied" && /location is off/.test(den.toast), "with location blocked, the nearest pharmacy to the map is shown and labelled honestly " + JSON.stringify(den));
  await page.evaluate(() => { selectPlace(null); delete navigator.geolocation.getCurrentPosition; ui.essKinds.clear(); ui.mapCats = new Set(["gaff", "munch", "cool"]); renderMapUI(); });
  await page.evaluate(() => new Promise(r => locate(false, r)));

  // Documents: a PDF boarding pass and a picture of a TDAC are read on the phone, named and sorted
  await page.goto(BASE + "#tools/docs"); await page.waitForTimeout(1200);
  await page.setInputFiles("#docAdd", makePdf(["AirAsia BOARDING PASS", "Passenger MR SMITH/JOHN", "Flight FD 3436   Gate 12   Seat 14A",
    "DMK Bangkok Don Mueang to CNX Chiang Mai", "Departure 02 Dec 2026 07:15"]));
  await page.waitForFunction(() => document.querySelector('#docList [data-doc]'), null, {timeout:30000}).catch(() => {});
  ok(await page.evaluate(() => /Flight DMK → CNX, 2 Dec/.test(document.querySelector("#docList").textContent)), "a PDF boarding pass is read and filed under Flights");
  const ocr = await page.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 1100; c.height = 420; const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.fillStyle = "#111"; g.font = "bold 44px Arial";
    ["THAILAND DIGITAL ARRIVAL CARD", "TDAC No. A12345678", "Arrival date 27/11/2026"].forEach((t, i) => g.fillText(t, 40, 90 + i * 110));
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    try { const d = await addDocFile(new File([blob], "IMG_2041.png", {type:"image/png"})); return {section:d.section, name:d.name}; } catch(e){ return {err:String(e)}; }
  });
  ok(ocr.section === "entry" && /TDAC/.test(ocr.name), "a picture of a TDAC is read on the phone and filed under TDAC and visas " + JSON.stringify(ocr));
  const bk = await page.evaluate(async () => (await makeBackup()).docs.length);
  ok(bk >= 2, `documents go into the backup file (${bk})`);
  await page.goto(BASE + "#tools/docs"); await page.waitForTimeout(1200);
  await page.click("#docList [data-doc]"); await page.waitForTimeout(2500);
  ok(await page.evaluate(() => !!document.querySelector("#docView canvas.doc-page, #docView img")), "a document opens to view");
  await page.click("#sheetRoot button[data-close]"); await page.waitForTimeout(400);

  // Camera translator: switched off (it needed a paid Google service); Tools has no tile, an old link asks for nothing and explains the free phone apps
  await page.goto(BASE + "#tools"); await page.waitForTimeout(600);
  ok(await page.evaluate(() => !document.querySelector('#pageview a[href="#tools/camera"]')), "no camera translator tile in Tools");
  await page.goto(BASE + "#tools/camera"); await page.waitForTimeout(600);
  ok(await page.evaluate(() => !document.querySelector('#pageview input[type="file"]') && /Google Translate/.test(document.querySelector("#pageview").textContent)), "the old camera link shows the free phone apps and no camera input");
  await page.goto(BASE + "#tools/translate"); await page.waitForTimeout(600);
  ok(await page.evaluate(() => /Live Text|text icon/.test(document.querySelector("#pageview").textContent) && !document.querySelector('#pageview a[href="#tools/camera"]')), "the translator explains camera translation on the phone instead");

  // Design Lab: a colour preset recolours the chips and the map circles; text size and reset work
  await page.goto(BASE + "#map"); await page.waitForTimeout(2500);
  await page.click("#labBtn"); await page.waitForTimeout(400);
  ok(await page.evaluate(() => !!document.querySelector("#lab .lab-body")), "Design Lab opens");
  await page.click('#lab [data-labpreset="cols"][data-name="Bold"]'); await page.waitForTimeout(900);
  ok(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--stay").trim().toUpperCase() === "#FF6B57"), "colour preset changes the Gaffs colour");
  ok(await page.evaluate(() => String(map.getPaintProperty("cl-circle-stay", "circle-color")).toUpperCase() === "#FF6B57"), "map circles follow the new colour");
  await page.click('#lab [data-labtab="text"]'); await page.waitForTimeout(300);
  await page.evaluate(() => { const r = document.querySelector('#lab [data-labnum="ts"]'); r.value = "1.2"; r.dispatchEvent(new Event("input", {bubbles:true})); });
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.documentElement.style.getPropertyValue("--ts") === "1.2"), "text size knob works");
  await page.click('#lab [data-labtab="save"]'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => /^SEALOOK:\{/.test(document.querySelector("#labCode").value)), "look code is shown for copying");
  await page.click("#lab [data-labreset]"); await page.waitForTimeout(900);
  ok(await page.evaluate(() => !document.documentElement.style.getPropertyValue("--stay") && !document.documentElement.style.getPropertyValue("--ts")), "reset goes back to standard");
  await page.click("#lab [data-labclose]"); await page.waitForTimeout(300);
  const w2 = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(w2 <= 393, `no sideways scroll after the Lab (width ${w2})`);

  // Split costs: a group of three, one taxi, the tally and a settle-up; the shared link adds the payments on another phone
  await page.goto(BASE + "#tools/split"); await page.waitForTimeout(800);
  for (const n of ["Dylan", "Sam", "Jo"]){ await page.fill("#sp-name", n); await page.click("#sp-addp"); await page.waitForTimeout(200); }
  ok(await page.evaluate(() => !document.querySelector("#sp-what") && !!document.querySelector("#sp-open")), "the payment form waits behind Add a payment, so the tally is near the top");
  await page.click("#sp-open"); await page.waitForTimeout(300);
  await page.fill("#sp-what", "Taxi"); await page.fill("#sp-amt", "300"); await page.selectOption("#sp-cur", "THB"); await page.selectOption("#sp-by", "Dylan");
  await page.click("#sp-add"); await page.waitForTimeout(500);
  const sp = await page.evaluate(() => ({rows:[...document.querySelectorAll(".sp-bal .sp-row")].map(r => r.textContent.replace(/\s+/g, " ").trim()), plan:document.querySelectorAll("[data-paid]").length, w:document.documentElement.scrollWidth}));
  ok(sp.rows.length === 3 && /Dylans*gets back ฿200/.test(sp.rows[0]) && /Sams*owes ฿100/.test(sp.rows[1]) && sp.plan === 2 && sp.w <= 393, "Split costs: a ฿300 taxi for three leaves Dylan owed ฿200 " + JSON.stringify(sp));
  const link = await page.evaluate(async () => `#tools/split?g=${await splitEncode()}`);
  {
    const c2 = await browser.newContext({viewport:{width:393, height:852}}); const p2 = await c2.newPage(); p2.on("pageerror", e => errors.push(e.message));
    await p2.goto(BASE + link); await p2.waitForTimeout(2000);
    ok(await p2.evaluate(() => S.split.items.length === 1 && S.split.people.length === 3 && location.hash === "#tools/split" && /Sam\s*owes/.test(document.querySelector("#pageview").innerText)), "opening the shared link on another phone adds the payment");
    await c2.close();
  }
  await page.evaluate(() => { S.split = {people:[], items:[], del:[]}; persist(); });

  // Friends: not set up, the page explains; with a (pretend) Firebase, two phones add each other and one appears on the other's map
  await page.goto(BASE + "#tools/friends"); await page.waitForTimeout(800);
  ok(await page.evaluate(() => /needs switching on once/.test(document.querySelector("#pageview").textContent)), "Friends explains how to switch it on when Firebase isn't set up");
  {
    const {makeFake, DB_URL, API_KEY} = require("./fakefirebase"), fb = makeFake();
    const phone = async (geo, saved) => {
      const c = await browser.newContext({viewport:{width:393, height:852}, geolocation:geo, permissions:["geolocation"]});
      if (saved) await c.addInitScript(st => { if (!localStorage.getItem("sea-trip-app-v1")) localStorage.setItem("sea-trip-app-v1", JSON.stringify(st)); }, saved);
      await c.addInitScript(([k, u]) => { window.SEA_FIREBASE = {apiKey:k, databaseURL:u}; }, [API_KEY, DB_URL]);
      await c.route(/identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|firebasedatabase\.app/, async route => {
        const r = route.request(), res = await fb.fetch(r.url(), {method:r.method(), body:r.postData()});
        await route.fulfill({status:res.status, contentType:"application/json", body:await res.text(), headers:{"access-control-allow-origin":"*"}});
      });
      const pg = await c.newPage(); pg.on("pageerror", e => errors.push(e.message));
      return {c, pg};
    };
    // Dylan's phone has the pretend Bangkok test location switched on: sharing must still send his real GPS (Ubud)
    const A = await phone({latitude:-8.5069, longitude:115.2625}, {v:2, testLoc:"Bangkok", countryMode:"auto", country:"TH", saved:{}});
    const B = await phone({latitude:-8.52, longitude:115.27});
    const sheetName = async (P, n) => { await P.pg.fill("#fr-firstname", n); await P.pg.click("#fr-firstgo"); await P.pg.waitForTimeout(1500); await P.pg.click("#fr-open"); await P.pg.waitForTimeout(1200); };
    await B.pg.goto(BASE + "#tools/friends"); await B.pg.waitForTimeout(1500);
    const gate = await B.pg.evaluate(() => ({name:!!document.querySelector("#fr-firstname"), add:!!document.querySelector("#fr-open"), list:/Your friends/.test(document.querySelector("#pageview").textContent)}));
    ok(gate.name && !gate.add && !gate.list, "Friends asks for your name first, before codes or friends " + JSON.stringify(gate));
    await B.pg.fill("#fr-firstname", "Sam"); await B.pg.click("#fr-firstgo"); await B.pg.waitForTimeout(1500);
    const top = await B.pg.evaluate(() => { const b = document.querySelector("#fr-open"), c = document.querySelector(".hero .crumb:not(#fr-open)"); return {h1:document.querySelector("#pageview h1").textContent, sub:document.querySelector("#pageview .sub").textContent, add:b ? b.textContent.trim() : "", same:b && c ? b.offsetHeight === c.offsetHeight : false, green:b ? getComputedStyle(b).backgroundColor : "", youOnPage:!!document.querySelector("#pageview #fr-name")}; });
    ok(top.h1 === "Friends" && /See your mates on the map and choose who sees you/.test(top.sub) && /Add friend/.test(top.add) && top.same && !top.youOnPage, "Friends page: title, a green Add friend button the size of Tools, and You / adding kept off the main page " + JSON.stringify(top));
    await B.pg.click("#fr-open"); await B.pg.waitForTimeout(1200);
    ok(await B.pg.evaluate(() => S.friends.name === "Sam" && /^[A-Z2-9]{6}$/.test(document.querySelector("#sheetRoot #fr-code").textContent)), "after the name, the friend code is there (and the name is never asked again)");
    const codeB = await B.pg.evaluate(() => document.querySelector("#sheetRoot #fr-code").textContent);
    await A.pg.goto(BASE + "#map"); await A.pg.waitForTimeout(2500);
    await A.pg.goto(BASE + "#tools/friends"); await A.pg.waitForTimeout(1500);
    await sheetName(A, "Dylan");
    await A.pg.fill("#sheetRoot #fr-add", codeB); await A.pg.click("#sheetRoot #fr-addb"); await A.pg.waitForTimeout(2200);
    await A.pg.click("#sheetRoot .sheet-head [data-close]"); await A.pg.waitForTimeout(300);
    ok(await A.pg.evaluate(() => !!document.querySelector('#pageview [data-fron][aria-pressed="false"]')), "the Friends page itself has the Share my location switch (off to start)");
    await A.pg.click("#pageview [data-fron]"); await A.pg.waitForTimeout(3000);
    const a = await A.pg.evaluate(() => ({list:Object.values(S.friends.list).map(x => [x.n, x.share]), on:S.friends.on, test:locStatus, st:frSendStatus(), w:document.documentElement.scrollWidth}));
    const sentLoc = fb.root.loc && Object.values(fb.root.loc)[0];
    ok(JSON.stringify(a.list) === '[["Sam",true]]' && a.on && a.st.ok && a.w <= 393, "Friends: Dylan adds Sam by code, shares, and the page says it's working " + JSON.stringify(a));
    const testSpot = await A.pg.evaluate(() => userLoc);
    ok(a.test === "test" && sentLoc && Math.abs(sentLoc.lat - testSpot.lat) < 0.001 && Math.abs(sentLoc.lng - testSpot.lng) < 0.001 && /pretend test location/.test(a.st.t), "while testing, friends see the pretend location (Settings › Testing) " + JSON.stringify(sentLoc));
    await B.pg.click("#sheetRoot .sheet-head [data-close]"); await B.pg.reload(); await B.pg.waitForTimeout(2500);
    ok(await B.pg.evaluate(() => /Dylan/.test(document.querySelector("#fr-alerts").textContent) && /added you/.test(document.querySelector("#fr-alerts").textContent)), "Sam sees that Dylan added him, at the top of Friends");
    await B.pg.click("#fr-alerts [data-frback]"); await B.pg.waitForTimeout(2500);
    await B.pg.evaluate(() => frPoll()); await B.pg.waitForTimeout(1500);
    const uidA = await A.pg.evaluate(() => frMyId()), uidB = await B.pg.evaluate(() => frMyId());
    const fb1 = await B.pg.evaluate(uid => ({row:(document.querySelector(`[data-frloc="${uid}"]`) || {}).textContent || "", col:getComputedStyle(document.querySelector(`[data-frav="${uid}"] .fr-av`)).getPropertyValue("--c").trim(), tiles:[...document.querySelectorAll(".fr-tiles .tool b")].map(b => b.textContent)}), uidA);
    ok(/Seen just now/.test(fb1.row) && /^#/.test(fb1.col) && fb1.tiles.join() === "Map,Split costs,Play", "Sam's Friends page: Dylan in the list in his own colour, and Map / Split costs / Play as separate screens " + JSON.stringify(fb1));
    await B.pg.click(`[data-frgo="${uidA}"]`); await B.pg.waitForTimeout(4500);
    const mp = await B.pg.evaluate(uid => { const b = map.getBounds(), d = frLocs[uid], me = frMeHere(); const chips = [...document.querySelectorAll("#mapEss .chip")].map(c => c.textContent.trim());
      return {view:ui.view, both:b.contains([d.lng, d.lat]) && b.contains([me.lng, me.lat]), pin:[...document.querySelectorAll("#map .fr-pin")].some(p => /Dylan/.test(p.getAttribute("aria-label")) && p.offsetWidth <= 32), first:chips[0], pressed:document.querySelector("#mapEss [data-essfr]").getAttribute("aria-pressed")}; }, uidA);
    ok(mp.view === "map" && mp.both && mp.pin && mp.first === "Friends" && mp.pressed === "true", "tapping Dylan opens the normal map with Friends (first Essential) on, gliding to show both of them " + JSON.stringify(mp));
    await B.pg.click("#mapEss [data-essfr]"); await B.pg.waitForTimeout(500);
    ok(await B.pg.evaluate(() => !document.querySelector("#map .fr-pin")), "switching the Friends essential off hides them");
    await B.pg.click("#mapEss [data-essfr]"); await B.pg.waitForTimeout(800);
    await B.pg.reload(); await B.pg.waitForTimeout(3000);
    const fresh = await B.pg.evaluate(() => ({on:ui.mapFriends, chip:(document.querySelector("#mapEss [data-essfr]") || {getAttribute:() => null}).getAttribute("aria-pressed"), pins:document.querySelectorAll("#map .fr-pin").length}));
    ok(fresh.on === false && fresh.chip === "false" && fresh.pins === 0, "opening the map again: friends are hidden until the Friends chip is switched on " + JSON.stringify(fresh));
    // renaming: Dylan's friend "Sam" becomes "PC", only on Dylan's phone
    await A.pg.click(`#pageview [data-fredit="${uidB}"]`); await A.pg.waitForTimeout(500);
    await A.pg.setInputFiles("#sheetRoot #fre-pic", path.join(__dirname, "..", "img", "surf", "kata.jpg")); await A.pg.waitForTimeout(1200);
    // the cropper: zoom in a little, then use it
    ok(await A.pg.evaluate(() => !!document.querySelector("#cropRoot .crop-box img")), "choosing a photo opens the cropper");
    await A.pg.evaluate(() => { const z = document.querySelector("#crop-z"); z.value = "2"; z.dispatchEvent(new Event("input")); });
    await A.pg.click('#cropRoot [data-crop="1"]'); await A.pg.waitForTimeout(600);
    await A.pg.fill("#sheetRoot #fre-name", "PC"); await A.pg.click("#sheetRoot #fre-save"); await A.pg.waitForTimeout(1200);
    ok(await A.pg.evaluate(uid => S.friends.list[uid].n === "PC" && /^data:image\/jpeg/.test(S.friends.list[uid].pic) && /PC/.test(document.querySelector("#pageview").textContent) && !!document.querySelector(`[data-frav="${uid}"] img`), uidB), "the pencil: Dylan renames Sam to PC and gives him a photo, on his phone only");
    // developer mode: type ELITE POTATO in the map search (only Dylan's phone), and only a developer phone can set faces
    await A.pg.goto(BASE + "#map"); await A.pg.waitForTimeout(1500);
    await A.pg.fill("#m-q", "ELITE POTATO"); await A.pg.waitForTimeout(500);
    ok(await A.pg.evaluate(() => S.dev === true && document.querySelector("#m-q").value === ""), "typing ELITE POTATO in the map search switches developer mode on");
    await A.pg.goto(BASE + "#tools/developer"); await A.pg.waitForTimeout(1500);
    await A.pg.click("#fr-dev #fr-claim"); await A.pg.waitForTimeout(2500);
    await A.pg.setInputFiles(`#fr-dev [data-frphoto="${uidB}"]`, path.join(__dirname, "..", "img", "surf", "kata.jpg")); await A.pg.waitForTimeout(1200);
    await A.pg.click('#cropRoot [data-crop="1"]'); await A.pg.waitForTimeout(2000);
    ok(typeof (fb.root.photos || {})[uidB] === "string" && fb.root.photos[uidB].startsWith("data:image/jpeg") && fb.root.photos[uidB].length < 40000, "the developer phone sets Sam's photo (a small square JPEG)");
    await A.pg.setInputFiles("#fr-dev #stk-add", path.join(__dirname, "..", "img", "surf", "kata.jpg")); await A.pg.waitForTimeout(3000);
    const stk = await A.pg.evaluate(() => Object.values(frStickers).map(x => x.n));
    ok(stk.includes("kata") && Object.keys(fb.root.stickerIndex || {}).length === 1, "the developer adds a message sticker, named after its file " + JSON.stringify(stk));
    await A.pg.goto(BASE + "#map"); await A.pg.waitForTimeout(1500);                // Dylan is on the map, not on Friends
    await B.pg.goto(BASE + "#tools/friends"); await B.pg.waitForTimeout(1500);
    await B.pg.click(`[data-frmsg="${uidA}"]`); await B.pg.waitForTimeout(2500);
    const pick = await B.pg.evaluate(() => [...document.querySelectorAll("#stk-pick [data-stksend] span")].map(x => x.textContent));
    ok(pick.includes("Send kata"), "Send a message under a friend shows the stickers, each saying Send and its name " + JSON.stringify(pick));
    await B.pg.click("#stk-pick [data-stksend]"); await B.pg.waitForTimeout(1500);
    await A.pg.evaluate(() => frPoll()); await A.pg.waitForTimeout(1500);
    const got = await A.pg.evaluate(() => { const m = document.querySelector("#msgRoot .msg-pop"); return m ? {t:m.innerText.replace(/\s+/g, " "), img:!!m.querySelector(".msg-stk"), face:!!m.querySelector(".msg-av .fr-av"), view:ui.view, w:Math.round(m.getBoundingClientRect().right)} : null; });
    ok(got && /PC sent you a message/.test(got.t) && !got.img && got.face && got.view === "map" && got.w <= 393, "a message pops up on whatever screen Dylan is on (here the map), without giving away what it is " + JSON.stringify(got));
    await A.pg.click('#msgRoot [data-msg="open"]'); await A.pg.waitForTimeout(1500);
    const opened = await A.pg.evaluate(() => { const m = document.querySelector("#msgRoot .msg-pop"); return m ? {name:(m.querySelector(".msg-name") || {}).textContent, img:!!(m.querySelector("img.msg-stk") || {}).src} : null; });
    ok(opened && opened.name === "kata" && opened.img && !Object.keys((fb.root.msgs || {})[uidA] || {}).length, "Open shows the sticker and its name, and the message is deleted " + JSON.stringify(opened));
    await A.pg.click('#msgRoot [data-msg="done"]'); await A.pg.waitForTimeout(600);
    ok(!(await A.pg.$("#msgRoot")), "Close puts the popup away");
    await A.pg.goto(BASE + "#tools/developer"); await A.pg.waitForTimeout(2500);
    await A.pg.fill("#fr-dev [data-stkname]", "Cooked"); await A.pg.press("#fr-dev [data-stkname]", "Enter"); await A.pg.waitForTimeout(2000);
    ok(Object.values(fb.root.stickerIndex || {}).includes("Cooked"), "a developer renames a sticker by typing over its name in Tools › Developer");
    await A.pg.goto(BASE + "#tools/friends"); await A.pg.waitForTimeout(1200);
    await A.pg.click("#fr-open"); await A.pg.waitForTimeout(800);
    await B.pg.evaluate(() => { S.dev = true; }); await B.pg.goto(BASE + "#tools/friends"); await B.pg.waitForTimeout(1200);
    const bClaim = await B.pg.evaluate(async () => { try { await frClaimAdmin(); return "claimed"; } catch(e){ return e.message; } });
    await B.pg.evaluate(() => frLoadPhotos(true).then(paintFriendsLive)); await B.pg.waitForTimeout(800);
    ok(bClaim === "permission" && await B.pg.evaluate(uid => !!document.querySelector(`[data-frav="${uid}"] img`) || !!frPhotos[uid], uidB), "no other phone can become the developer, and everyone sees the photo " + bClaim);
    // live split inside Friends: Dylan starts a group and adds a taxi; Sam's Friends page shows it straight away, with history
    await A.pg.click("#sheetRoot .sheet-head [data-close]"); await A.pg.waitForTimeout(300);
    // Dylan (the developer) switches Sam on as a developer: Sam's phone gets Tools › Developer by itself, no ELITE POTATO
    await B.pg.evaluate(() => { S.dev = false; S.devGranted = false; persist(); });
    await A.pg.goto(BASE + "#tools/developer"); await A.pg.waitForTimeout(3000);
    await A.pg.click(`#fr-dev [data-mkdev="${uidB}"]`); await A.pg.waitForTimeout(400);
    await A.pg.click('#confirmRoot [data-cfm="1"]'); await A.pg.waitForTimeout(1500);
    await B.pg.goto(BASE + "#tools"); await B.pg.evaluate(() => frPoll()); await B.pg.waitForTimeout(1500);
    const bDev = await B.pg.evaluate(() => ({dev:S.dev, tile:!!document.querySelector('#pageview a[href="#tools/developer"]'), toast:(document.querySelector("#toastRoot") || {}).textContent || ""}));
    ok(fb.root.admins[uidB] === true && bDev.dev === true && bDev.tile && /developer now/.test(bDev.toast), "making Sam a developer works: his phone shows Tools › Developer by itself " + JSON.stringify(bDev));
    await B.pg.goto(BASE + "#tools/developer"); await B.pg.waitForTimeout(3000);
    ok(await B.pg.evaluate(() => !!document.querySelector("#fr-dev [data-mkdev], #fr-dev [data-stkname], #fr-dev .fr-stickers")), "and Sam's Developer page has the developer tools, not “Make this phone the developer”");
    await A.pg.click(`#fr-dev [data-mkdev="${uidB}"]`); await A.pg.waitForTimeout(1500);
    await B.pg.goto(BASE + "#tools"); await B.pg.evaluate(() => frPoll()); await B.pg.waitForTimeout(1500);
    ok(await B.pg.evaluate(() => S.dev === false && !document.querySelector('#pageview a[href="#tools/developer"]')), "switching him off again takes the Developer tool away");
    await A.pg.goto(BASE + "#tools/friends-split"); await A.pg.waitForTimeout(1500);
    await B.pg.goto(BASE + "#tools/friends-split"); await B.pg.waitForTimeout(1500);
    await A.pg.click("#fr-split #sp-newg"); await A.pg.waitForTimeout(500);
    await A.pg.fill("#fr-split #sp-gname", "Bali crew"); await A.pg.click("#fr-split #sp-gcreate"); await A.pg.waitForTimeout(2500);
    await A.pg.click("#fr-split #sp-open"); await A.pg.waitForTimeout(400);
    const meChip = await A.pg.evaluate(() => { const b = document.querySelector("#fr-split .chip.locked"); return b ? {text:b.textContent.trim(), pressed:b.getAttribute("aria-pressed"), disabled:b.disabled} : null; });
    ok(meChip && meChip.text === "You" && meChip.pressed === "true" && meChip.disabled, "Split between: You is always ticked and can't be taken off " + JSON.stringify(meChip));
    await A.pg.click(`#fr-split [data-to="${uidB}"]`); await A.pg.waitForTimeout(200);
    await A.pg.fill("#fr-split #sp-what", "Nothing"); await A.pg.fill("#fr-split #sp-amt", "5"); await A.pg.click("#fr-split #sp-add"); await A.pg.waitForTimeout(600);
    ok(await A.pg.evaluate(() => !/Nothing/.test(document.querySelector("#fr-split").textContent) && /at least one person/.test(document.querySelector("#toastRoot").textContent)), "a split with only yourself is refused");
    await A.pg.click(`#fr-split [data-to="${uidB}"]`); await A.pg.waitForTimeout(200);
    await A.pg.fill("#fr-split #sp-what", "Taxi"); await A.pg.fill("#fr-split #sp-amt", "300"); await A.pg.selectOption("#fr-split #sp-cur", "THB");
    await A.pg.click("#fr-split #sp-add");
    await A.pg.waitForTimeout(2000);
    const la = await A.pg.evaluate(() => ({rows:[...document.querySelectorAll("#fr-split .sp-bal .sp-row")].map(r => r.innerText.replace(/\s+/g, " ")), cls:(document.querySelector("#fr-split .sp-v") || {}).className, sum:document.querySelector("#fr-split .sp-sum").innerText, w:document.documentElement.scrollWidth}));
    ok(la.rows.length === 1 && /PC owes you ฿150 £3\.3\d/.test(la.rows[0]) && /good/.test(la.cls) && /You’re owed ฿150/.test(la.sum) && la.w <= 393, "Dylan's tally: just PC, who owes him ฿150 (in green) " + JSON.stringify(la));
    await B.pg.evaluate(() => frPoll()); await B.pg.waitForTimeout(2500);         // what the page does every 20 seconds
    const lb = await B.pg.evaluate(() => ({rows:[...document.querySelectorAll("#fr-split .sp-bal .sp-row")].map(r => r.innerText.replace(/\s+/g, " ")), cls:(document.querySelector("#fr-split .sp-v") || {}).className}));
    ok(lb.rows.length === 1 && /Dylan you owe Rp [\d,]+ £3\.3\d/.test(lb.rows[0]) && /bad/.test(lb.cls), "Sam's tally: he owes Dylan, in red " + JSON.stringify(lb));
    await B.pg.click('#fr-split [data-sptab="history"]'); await B.pg.waitForTimeout(600);
    const hist = await B.pg.evaluate(() => [...document.querySelectorAll("#fr-split .sp-hist")].map(r => ({who:r.querySelector(".who b").textContent, face:!!r.querySelector(".who .fr-av"), amt:r.querySelector(".amt b").textContent, detail:r.innerText.replace(/\s+/g, " ")})));
    ok(hist.length === 1 && hist[0].who === "Dylan" && hist[0].face && hist[0].amt === "฿300" && /Total ฿300 · ฿150 each for everyone/.test(hist[0].detail), "History: who paid (face and name) on the left, the amount on the right, and how it was split " + JSON.stringify(hist));
    ok(/\d{2}:\d{2}/.test(hist[0].detail), "History shows the time as well as the date " + hist[0].detail);
    await A.pg.click("#fr-split #sp-open"); await A.pg.waitForTimeout(400);
    await A.pg.click('#fr-split [data-spmode="custom"]'); await A.pg.waitForTimeout(400);
    const modeW = await A.pg.evaluate(() => { const s = document.querySelector("#fr-split .sp-mode"), box = document.querySelector("#fr-split .sp-add"); return Math.round(100 * s.offsetWidth / box.offsetWidth); });
    ok(modeW >= 80 && modeW <= 90, "Equal split / Custom split sit side by side across about 85% of the width " + modeW + "%");
    await A.pg.fill("#fr-split #sp-what", "Beers"); await A.pg.fill("#fr-split #sp-amt", "200");
    await A.pg.fill(`#fr-split [data-cust="${uidA}"]`, "50"); await A.pg.fill(`#fr-split [data-cust="${uidB}"]`, "100"); await A.pg.waitForTimeout(200);
    ok(await A.pg.evaluate(() => /50 still to share out/.test(document.querySelector("#sp-left").textContent)), "custom split says what's still to share out");
    await A.pg.click("#fr-split #sp-add"); await A.pg.waitForTimeout(800);
    ok(await A.pg.evaluate(() => /add up to 150/.test(document.querySelector("#toastRoot").textContent)), "a custom split that doesn't add up is refused");
    await A.pg.fill(`#fr-split [data-cust="${uidB}"]`, "150"); await A.pg.click("#fr-split #sp-add"); await A.pg.waitForTimeout(3500);
    ok(await A.pg.evaluate(() => /PC owes you ฿300/.test(document.querySelector("#fr-split .sp-bal").innerText.replace(/\s+/g, " "))), "a ฿200 custom split (you ฿50, PC ฿150) on top of the taxi: PC owes you ฿300");
    ok(await B.pg.evaluate(() => /Beers/.test(document.querySelector("#fr-split").textContent)), "a payment Dylan adds appears on Sam's open page by itself");
    await A.pg.click('#fr-split [data-sptab="tally"]').catch(() => {}); await A.pg.waitForTimeout(400);
    await A.pg.click(`#fr-split [data-pair="${uidB}"]`); await A.pg.waitForTimeout(400);
    await A.pg.click('#confirmRoot [data-cfm="1"]'); await A.pg.waitForTimeout(1500);
    ok(await A.pg.evaluate(() => /all square/.test(document.querySelector("#fr-split .sp-bal").textContent)), "They paid me settles it");
    // Games (Friends › Play): Dylan starts Four in a row with Sam; Sam gets the invite on whatever screen he's on; both phones agree
    await A.pg.goto(BASE + "#tools/friends-play"); await A.pg.waitForTimeout(1500);
    const pl = await A.pg.evaluate(() => ({games:[...document.querySelectorAll(".gm-tile b")].map(b => b.textContent), tally:!!document.querySelector("#gm-tally"), w:document.documentElement.scrollWidth}));
    ok(pl.games.join() === "Four in a row,Sink the fleet,Liar’s dice,Guess the price,Where in the world" && pl.tally && pl.w <= 393, "Friends › Play: five games and the Trip tally " + JSON.stringify(pl));
    // start a game with Sam from Dylan's phone; Sam says yes to the popup; both get past the rules card
    const startWith = async (id, title) => {
      fb.tick(1000);                                                         // a new invite is newer than the last
      await A.pg.click(`#pageview [data-game="${id}"]`); await A.pg.waitForTimeout(600);
      const rules = await A.pg.$("#gmRules"); if (rules) await A.pg.click("#gmRulesOk");
      await A.pg.click(`[data-gmpick="${uidB}"]`); await A.pg.click("#gmGo"); await A.pg.waitForTimeout(1000);
      await B.pg.waitForSelector('#confirmRoot [data-cfm="1"]', {timeout:10000}).catch(() => {});
      const ask = await B.pg.evaluate(() => (document.querySelector("#cfm-t") || {}).textContent || "");
      await B.pg.click('#confirmRoot [data-cfm="1"]').catch(() => {}); await B.pg.waitForTimeout(1200);
      const r2 = await B.pg.$("#gmRules"); if (r2) await B.pg.click("#gmRulesOk");
      await A.pg.waitForTimeout(3000);
      return ask;
    };
    await B.pg.goto(BASE + "#gaffs"); await B.pg.waitForTimeout(1200);
    await A.pg.click('#pageview [data-game="c4"]'); await A.pg.waitForTimeout(600);
    ok(await A.pg.evaluate(() => !!document.querySelector("#gmRules") && /Four in a row/.test(document.querySelector("#gmRules").textContent)), "the first time you open a game, its rules come up");
    await A.pg.click("#gmRulesOk"); await A.pg.click("#sheetRoot .sheet-head [data-close]"); await A.pg.waitForTimeout(300);
    const ask = await startWith("c4");
    ok(/Dylan wants to play Four in a row/.test(ask), "Sam, on the Gaffs page, gets “Dylan wants to play Four in a row” " + ask);
    const myTurn = P => P.pg.evaluate(() => !!document.querySelector("#gmBox .c4.go"));
    const [X, Y] = (await myTurn(A)) ? [A, B] : [B, A];
    ok((await myTurn(X)) && !(await myTurn(Y)), "the game starts by itself once Sam opens it, and it's one player's turn");
    const drop = async (P, col, next) => { await P.pg.click(`#gmBox .c4.go [data-col="${col}"]`); await next.pg.waitForSelector(next === P ? "#gmBox .gm-end" : "#gmBox .c4.go", {timeout:10000}).catch(() => {}); };
    for (let k = 0; k < 3; k++){ await drop(X, 0, Y); await drop(Y, 1, X); }
    await X.pg.click('#gmBox .c4.go [data-col="0"]'); await Y.pg.waitForSelector("#gmBox .gm-end", {timeout:10000}).catch(() => {}); await X.pg.waitForTimeout(1500);
    const endX = await X.pg.evaluate(() => (document.querySelector("#gmBox .gm-end b") || {}).textContent || "");
    const endY = await Y.pg.evaluate(() => (document.querySelector("#gmBox .gm-end b") || {}).textContent || "");
    const fit = await A.pg.evaluate(() => { const b = document.querySelector("#gmBox .c4").getBoundingClientRect(); return {right:Math.round(b.right), w:document.documentElement.scrollWidth}; });
    ok(/You win/.test(endX) && /(Dylan|PC) wins/.test(endY) && fit.right <= 393 && fit.w <= 393, "four in a column wins, on both phones, and the board fits the screen " + JSON.stringify({endX, endY, fit}));
    const uidX = X === A ? uidA : uidB, uidY = X === A ? uidB : uidA;
    const t1 = JSON.stringify([fb.root.tally && fb.root.tally[uidX], fb.root.tally && fb.root.tally[uidY]]);
    ok(t1 === JSON.stringify([{c4:{w:1, p:1}}, {c4:{w:0, p:1}}]), "the Trip tally: a win for the winner, a game played for both " + t1);
    await Y.pg.click("#gmAgain"); await Y.pg.waitForTimeout(3500);
    const again = await X.pg.evaluate(() => ({end:!!document.querySelector("#gmBox .gm-end"), counters:document.querySelectorAll("#gmBox .c4-c.a, #gmBox .c4-c.b").length}));
    ok(!again.end && again.counters === 0 && JSON.stringify([fb.root.tally[uidX], fb.root.tally[uidY]]) === t1, "Play again: a fresh board on both phones, and the last game isn't counted twice " + JSON.stringify(again));
    await A.pg.click("#sheetRoot .sheet-head [data-close]"); await B.pg.click("#sheetRoot .sheet-head [data-close]"); await A.pg.waitForTimeout(500);
    // Liar's dice: a guess, then Liar!, and both phones show the same reveal and dice left
    await startWith("dice");
    const turnP = async () => (await A.pg.$("#ldBid")) ? A : (await B.pg.$("#ldBid")) ? B : null;
    const bidder = await turnP();
    ok(!!bidder && await A.pg.evaluate(() => document.querySelectorAll("#gmBox .ld-mine span").length === 5), "everyone rolls five dice and sees only their own; one player's turn to guess");
    if (bidder){
      const other = bidder === A ? B : A;
      await bidder.pg.click("#ldBid"); await other.pg.waitForSelector("#ldLiar", {timeout:10000}).catch(() => {});
      await other.pg.click("#ldLiar"); await bidder.pg.waitForTimeout(3000);
      const rd = P => P.pg.evaluate(() => ({reveal:((document.querySelector("#gmBox .gm-reveal") || {}).textContent || "").replace(/\s+/g, " ").replace(/^(\S+) called Liar/, "X called Liar"), dice:[...document.querySelectorAll("#gmBox .gm-pl small")].map(s => [...s.textContent].length).reduce((a, b) => a + b, 0)}));
      const ra = await rd(A), rb = await rd(B);
      ok(/called Liar/.test(ra.reveal) && /loses? a die/.test(ra.reveal) && /called Liar/.test(rb.reveal) && Object.values(fb.root.parties).some(p => p.g === "dice" && p.s && Object.values(p.s.n).reduce((a, b) => a + b, 0) === 9), "Liar! reveals everyone's dice on both phones and the loser drops to four " + JSON.stringify({ra, rb}));
    }
    await A.pg.click("#sheetRoot .sheet-head [data-close]"); await B.pg.click("#sheetRoot .sheet-head [data-close]"); await A.pg.waitForTimeout(500);
    // Sink the fleet: both hide their boats, then the first shot
    await startWith("fleet");
    const sea = await A.pg.evaluate(() => { const g = document.querySelector("#gmBox .sf-grid.big"); return g ? {right:Math.round(g.getBoundingClientRect().right), cells:g.children.length, ships:g.querySelectorAll(".ship").length} : null; });
    ok(sea && sea.cells === 64 && sea.ships === 12 && sea.right <= 393, "Sink the fleet: an 8×8 sea with your 4 boats, fitting the screen " + JSON.stringify(sea));
    await A.pg.click("#sfShuffle"); await A.pg.click("#sfReady"); await B.pg.click("#sfReady"); await A.pg.waitForTimeout(3000);
    const shooter = (await A.pg.$("#gmBox .sf-grid.go")) ? A : B, target = shooter === A ? B : A;
    await shooter.pg.click("#gmBox .sf-grid.go button.sf-c:not([disabled])"); await target.pg.waitForTimeout(3000);
    const shot = await target.pg.evaluate(() => ({mine:document.querySelectorAll("#gmBox .sf-grid.small .hit, #gmBox .sf-grid.small .miss").length, myTurn:!!document.querySelector("#gmBox .sf-grid.go")}));
    ok(shot.mine === 1 && shot.myTurn, "the shot lands on the other phone's fleet, and it's their turn " + JSON.stringify(shot));
    await A.pg.click("#sheetRoot .sheet-head [data-close]"); await B.pg.click("#sheetRoot .sheet-head [data-close]"); await A.pg.waitForTimeout(500);
    // Guess the price, on your own: a researched price, your guess, the real one
    await A.pg.click('#pageview [data-game="price"]'); await A.pg.waitForTimeout(500);
    if (await A.pg.$("#gmRules")) await A.pg.click("#gmRulesOk");
    ok(await A.pg.evaluate(() => /Play on my own/.test(document.querySelector("#gmGo").textContent)), "the quiz games can be played on your own");
    await A.pg.click("#gmGo"); await A.pg.waitForTimeout(2000);
    await A.pg.fill("#gpG", "100"); await A.pg.click("#gpGo"); await A.pg.waitForTimeout(800);
    const gp = await A.pg.evaluate(() => ({real:((document.querySelector("#gmBox .gm-reveal b") || {}).textContent || ""), right:Math.round(document.querySelector("#gmBox .gp-card").getBoundingClientRect().right)}));
    ok(/Real price: \S/.test(gp.real) && gp.right <= 393, "Guess the price: lock in a guess and the real price shows " + JSON.stringify(gp));
    await A.pg.click("#sheetRoot .sheet-head [data-close]"); await A.pg.waitForTimeout(300);
    // Where in the world: a destination photo and a map to drop a pin on
    await A.pg.click('#pageview [data-game="where"]'); await A.pg.waitForTimeout(500);
    if (await A.pg.$("#gmRules")) await A.pg.click("#gmRulesOk");
    await A.pg.click("#gmGo"); await A.pg.waitForTimeout(3500);
    const wm = await A.pg.$("#wwMap canvas");
    if (wm){ const bb = await wm.boundingBox(); await A.pg.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await A.pg.waitForTimeout(400); }
    await A.pg.click("#wwGo").catch(() => {}); await A.pg.waitForTimeout(1500);
    const ww = await A.pg.evaluate(() => ({photo:(document.querySelector("#gmBox .ww-photo") || {}).naturalWidth || 0, it:((document.querySelector("#gmBox .gm-reveal b") || {}).textContent || ""), right:Math.round(document.querySelector("#wwMap").getBoundingClientRect().right)}));
    ok(!!wm && ww.photo > 0 && /^It’s \S/.test(ww.it) && ww.right <= 393, "Where in the world: a photo, a map to tap, and the answer " + JSON.stringify(ww));
    await A.pg.click("#sheetRoot .sheet-head [data-close]"); await A.pg.waitForTimeout(300);
    await A.pg.goto(BASE + "#tools"); await A.pg.goto(BASE + "#tools/friends-play"); await A.pg.waitForTimeout(2500);
    const tl = await A.pg.evaluate(() => ({rows:[...document.querySelectorAll("#gm-tally .gm-tr")].map(r => r.innerText.replace(/\s+/g, " ")), recent:document.querySelectorAll("#gm-recent [data-party]").length, w:document.documentElement.scrollWidth}));
    ok(tl.rows.length === 2 && tl.rows.some(r => /👑/.test(r)) && tl.recent >= 3 && tl.w <= 393, "Friends › Play: the Trip tally with a crown for the leader, and games to carry on " + JSON.stringify(tl));
    await B.pg.goto(BASE + "#tools/settings"); await B.pg.waitForTimeout(800);
    ok(await B.pg.evaluate(() => /Friends and location sharing/.test(document.querySelector("#pageview").textContent) && !!document.querySelector('#pageview a[href="#tools/friends"]')), "Settings has Friends and location sharing");
    await A.c.close(); await B.c.close();
  }

  // Location on a new phone, anywhere the app covers: here, a friend in Ubud (Bali)
  const ubudGeo = {latitude:-8.5069, longitude:115.2625};
  const phoneIn = async (geo, opts = {}) => {
    const c = await browser.newContext({viewport:{width:393, height:852}, geolocation:geo, permissions:opts.deny ? [] : ["geolocation"]});
    if (opts.saved) await c.addInitScript(st => { if (!sessionStorage.getItem("seeded")){ localStorage.setItem("sea-trip-app-v1", JSON.stringify(st)); sessionStorage.setItem("seeded", "1"); } }, opts.saved);
    const pg = await c.newPage(); pg.on("pageerror", e => errors.push(e.message));
    await pg.goto(BASE + "#map"); await pg.waitForTimeout(7000);
    return {c, pg};
  };
  const where = pg => pg.evaluate(() => ({cc:S.country, mode:S.countryMode, st:locStatus, test:S.testLoc, km:map ? dist({lat:map.getCenter().lat, lng:map.getCenter().lng}, {lat:-8.5069, lng:115.2625}) : null, near:(document.querySelector(".near-title") || {}).textContent || ""}));
  {
    const {c, pg} = await phoneIn(ubudGeo);
    const w = await where(pg);
    ok(w.cc === "ID" && w.st === "ok" && w.test === "off" && w.km < 3, "a fresh install in Ubud uses the real location: Indonesia, map on Ubud " + JSON.stringify(w));
    await pg.goto(BASE + "#tools/currency"); await pg.waitForTimeout(800);
    ok(await pg.evaluate(() => document.querySelector("#cv-cur").value === "IDR"), "the money converter starts on rupiah in Indonesia");
    await c.close();
  }
  {
    // someone who used an older version: the pretend Bangkok default and a map left on Bangkok
    const {c, pg} = await phoneIn(ubudGeo, {saved:{countryMode:"auto", country:"TH", testLoc:"Bangkok", mapView:{c:[100.5393, 13.7466], z:13}, saved:{}}});
    const w = await where(pg);
    ok(w.cc === "ID" && w.st === "ok" && w.test === "off" && w.km < 3, "a returning user's old Bangkok test default no longer overrides the real GPS " + JSON.stringify(w));
    await c.close();
  }
  {
    // a country picked by hand stays picked; the dot still shows; Automatic follows the phone again
    const {c, pg} = await phoneIn(ubudGeo, {saved:{v:2, countryMode:"manual", country:"TH", testLoc:"off", saved:{}}});
    const w = await where(pg);
    ok(w.cc === "TH" && w.mode === "manual" && w.st === "ok", "a manual country choice is respected " + JSON.stringify(w));
    await pg.goto(BASE + "#tools/settings"); await pg.waitForTimeout(800);
    ok(await pg.evaluate(() => /Picked by you: Thailand/.test(document.querySelector("#pageview").textContent)), "Settings says the country was picked by hand");
    await pg.click('#pageview [data-cmode="auto"]'); await pg.waitForTimeout(2500);
    ok(await pg.evaluate(() => S.country === "ID" && S.countryMode === "auto"), "choosing Automatic follows the phone to Indonesia");
    await c.close();
  }
  {
    // location refused: the map stays on the country, and nothing claims to be "closest to you"
    const {c, pg} = await phoneIn(ubudGeo, {deny:true});
    const w = await where(pg);
    ok(w.st === "denied" && !/Closest to you/.test(w.near), "with location refused the app says so and doesn't pretend " + JSON.stringify(w));
    await c.close();
  }

  // Cambodia: a new phone in Phnom Penh follows the real location; the map, lists, guide, emergency numbers and phrasebook switch
  {
    const {c, pg} = await phoneIn({latitude:11.5683, longitude:104.9224});
    const k = await pg.evaluate(() => ({cc:S.country, st:locStatus, km:map ? dist({lat:map.getCenter().lat, lng:map.getCenter().lng}, {lat:11.5683, lng:104.9224}) : null}));
    ok(k.cc === "KH" && k.st === "ok" && k.km < 3, "a fresh install in Phnom Penh picks Cambodia and centres on it " + JSON.stringify(k));
    await pg.evaluate(() => { ui.mapCats = new Set(["munch"]); renderMapUI(); map.jumpTo({center:[104.9224, 11.5683], zoom:14.5}); }); await pg.waitForTimeout(4000);
    const km = await pg.evaluate(() => ({n:mapRun.items.length, kh:mapRun.items.filter(p => p.cc === "KH").length, box:!!document.querySelector("#mapFilt [data-pfamt]")}));
    ok(km.kh > 20 && km.box, "Phnom Penh food shows on the map, with the price filter " + JSON.stringify(km));
    await pg.goto(BASE + "#munch"); await pg.waitForTimeout(3500);
    const ml = await pg.evaluate(() => { const t = (document.querySelector("#pageview .cards") || {}).textContent || ""; return {cards:document.querySelectorAll("#pageview .card[data-open]").length, usd:/\$\d/.test(t), baht:/฿/.test(t)}; });
    ok(ml.cards > 5 && ml.usd && !ml.baht, "the Munch list in Phnom Penh shows dollar estimates, never baht " + JSON.stringify(ml));
    await pg.goto(BASE + "#tools/guide"); await pg.waitForTimeout(800);
    ok(await pg.evaluate(() => /Cambodia guide/.test(document.querySelector("#pageview h1").textContent) && /landmine/i.test(document.querySelector("#pageview").textContent)), "the guide switches to Cambodia");
    await pg.goto(BASE + "#tools/emergency"); await pg.waitForTimeout(800);
    ok(await pg.evaluate(() => ["117", "118", "119"].every(n => document.querySelector(`#pageview a[href="tel:${n}"]`)) && /Phnom Penh/.test(document.querySelector("#pageview").textContent)), "Cambodia's emergency numbers (117, 118, 119) and the embassy in Phnom Penh");
    await pg.goto(BASE + "#tools/translate"); await pg.waitForTimeout(800);
    ok(await pg.evaluate(() => /Khmer phrasebook/.test(document.querySelector("#h-pb").textContent) && /អរគុណ/.test(document.querySelector("#pageview").textContent)), "the phrasebook switches to Khmer");
    const w4 = await pg.evaluate(() => document.documentElement.scrollWidth);
    ok(w4 <= 393, `no sideways scroll on the Cambodian pages (width ${w4})`);
    // somewhere to stay, eat and visit near each destination the brief names, islands included
    const near = await pg.evaluate(async () => {
      const out = {};
      for (const name of ["Phnom Penh", "Siem Reap", "Kampot", "Kep", "Battambang", "Sihanoukville", "Koh Rong", "Koh Rong Sanloem"]){
        const d = KH_DESTS.find(x => x[0] === name), pt = {lat:d[1], lng:d[2]}, r = {};
        for (const g of ["stay", "food", "do"]){ const f = await Places.nearest(g, pt, {maxKm:10}); r[g] = f && f.p ? +f.km.toFixed(1) : null; }
        out[name] = r;
      }
      return out;
    });
    ok(Object.values(near).every(r => r.stay != null && r.food != null && r.do != null), "a stay, food and something to do within 10 km of all 8 Cambodian destinations " + JSON.stringify(near));
    await c.close();
  }

  // Funny mode (Settings): Tommy's intro when the app opens, China talks back on the map, Ben waves on Friends
  {
    const c = await browser.newContext({viewport:{width:393, height:852}, geolocation:{latitude:13.7466, longitude:100.5393}, permissions:["geolocation"]});
    await c.addInitScript(st => { if (!localStorage.getItem("sea-trip-app-v1")) localStorage.setItem("sea-trip-app-v1", JSON.stringify(st)); }, {v:2, funny:true, testLoc:"off", countryMode:"auto", country:"TH", saved:{}});
    await c.addInitScript(() => {
      const f = window.__fun = {played:[]}, t0 = Date.now();
      const look = () => {
        const i = document.getElementById("funnyIntro");
        if (i && f.seen == null){ f.seen = Date.now() - t0; f.fit = getComputedStyle(i.querySelector("video")).objectFit; f.inline = i.querySelector("video").playsInline; const r = i.getBoundingClientRect(); f.size = [Math.round(r.width), Math.round(r.height)]; }
        const v = document.querySelector("#funnyIntro video"); if (v && v.src) f.src = v.src;
        if (f.seen != null && !i && f.gone == null) f.gone = Date.now() - t0;
      };
      new MutationObserver(look).observe(document, {childList:true, subtree:true, attributes:true, attributeFilter:["src"]});
      setInterval(look, 25);
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function(){ f.played.push({src:this.currentSrc || this.src, tag:this.tagName, muted:this.muted}); return play.call(this); };
    });
    const pg = await c.newPage(); pg.on("pageerror", e => errors.push(e.message));
    await pg.goto(BASE + "#map"); await pg.waitForTimeout(8000);
    const f = await pg.evaluate(() => Object.assign({}, window.__fun, {map:!document.querySelector("#mapview").hidden && !!document.querySelector("#map canvas")}));
    ok(f.seen != null && f.fit === "cover" && f.inline && f.size[0] === 393 && f.size[1] === 852 && /^blob:/.test(f.src || "") && f.gone > 0 && f.map, "funny mode: Tommy's intro fills the screen (from a blob, inline), then fades into the map " + JSON.stringify(f));
    const tap = async (lng, lat) => { const p = await pg.evaluate(([x, y]) => { const q = map.project([x, y]), r = map.getContainer().getBoundingClientRect(); return {x:r.left + q.x, y:r.top + q.y}; }, [lng, lat]); await pg.mouse.click(p.x, p.y); await pg.waitForTimeout(700); };
    // (the main map stops at 33°N, so this is southern China)
    await pg.evaluate(() => map.jumpTo({center:[107.5, 24.5], zoom:5})); await pg.waitForTimeout(1500);
    const n0 = await pg.evaluate(() => window.__fun.played.length);
    await tap(106.63, 26.65);                            // Guiyang, China
    const china = await pg.evaluate(n => window.__fun.played.slice(n).map(x => x.src), n0);
    await tap(105.85, 21.03); await tap(107.6, 20.2);    // Hanoi, and the Gulf of Tonkin
    const notChina = await pg.evaluate(n => window.__fun.played.length - n, n0 + china.length);
    ok(china.length === 1 && (china[0] === await pg.evaluate(() => funnyAudioUrl) || /chinese\.mp3/.test(china[0])) && notChina === 0, "funny mode: tapping China plays the sound; Vietnam and the sea don't " + JSON.stringify({china, notChina}));
    await pg.goto(BASE + "#tools/friends"); await pg.waitForTimeout(600);
    const ben = await pg.evaluate(() => { const b = document.querySelector("#funnyBen .funny-ben"); if (!b) return null; const cs = getComputedStyle(b), r = b.getBoundingClientRect(); return {w:r.width, h:r.height, right:Math.round(r.right), bg:/ben-wave\.png/.test(cs.backgroundImage), anim:cs.animationName}; });
    ok(ben && ben.w === 112 && ben.h === 100 && ben.right <= 393 && ben.bg && /benWave/.test(ben.anim), "funny mode: opening Friends, Ben pops up and waves " + JSON.stringify(ben));
    ok(await pg.evaluate(() => new Promise(r => { const i = new Image(); i.onload = () => r(i.naturalWidth === 16 * 224 && i.naturalHeight === 200); i.onerror = () => r(false); i.src = "img/ben-wave.png"; })), "Ben's cut-out strip loads: 16 frames, see-through round him");
    await pg.waitForTimeout(3000);
    ok(await pg.evaluate(() => !document.querySelector("#funnyBen")), "and he goes again after waving");
    // Nightlife: a short alarm, flashing yellow exclamation marks, and the right wording
    await pg.evaluate(() => { window.__osc = 0; const AC = window.AudioContext; window.AudioContext = function(){ const c = new AC(); const mk = c.createOscillator.bind(c); c.createOscillator = () => { window.__osc++; return mk(); }; return c; }; funnyAlarm.ctx = null; funnyNightlife(); });
    await pg.waitForTimeout(400);
    const night = await pg.evaluate(() => { const el = document.querySelector("#funnyPop"); return el ? {t:el.textContent, bangs:el.querySelectorAll(".fp-bang").length, alarm:el.classList.contains("alarm"), osc:window.__osc, right:Math.round(el.getBoundingClientRect().right)} : null; });
    ok(night && /bumholes/.test(night.t) && !/arseholes/.test(night.t) && night.bangs === 6 && night.alarm && night.osc === 1 && night.right <= 393, "funny mode Nightlife: a short alarm, six yellow exclamation marks, and “bumholes” " + JSON.stringify(night));
    await pg.goto(BASE + "#tools/settings"); await pg.waitForTimeout(800);
    ok(await pg.evaluate(() => document.querySelector("#funnyOn").getAttribute("aria-pressed") === "true"), "Settings shows Funny mode on");
    await pg.click("#funnyOn"); await pg.waitForTimeout(500);
    ok(await pg.evaluate(() => S.funny === false && JSON.parse(localStorage.getItem("sea-trip-app-v1")).funny === false && document.querySelector("#funnyOn").getAttribute("aria-pressed") === "false"), "switching Funny mode off in Settings is saved");
    await pg.goto(BASE + "#tools/friends"); await pg.waitForTimeout(500);
    const offBen = await pg.evaluate(() => !document.querySelector("#funnyBen"));
    await pg.reload(); await pg.waitForTimeout(2500);
    ok(offBen && await pg.evaluate(() => window.__fun.seen == null && !document.querySelector("#funnyIntro")), "with it off: no Ben, and no intro when the app opens");
    await c.close();
  }

  // the experiments themselves, when they're all on
  if (EXPON){
    await page.goto(BASE + "#map"); await page.waitForTimeout(2500);
    const mx = await page.evaluate(() => ({list:!!document.querySelector("#mapListBtn"), zoom:!!document.querySelector("#zinBtn"), seg:!!document.querySelector('#mapModeRow [data-mode]'), help:!!document.querySelector("#mapSide [data-help]")}));
    ok(mx.list && !mx.zoom && !mx.seg && mx.help, "map-onerow / help-btn: a floating List button, no zoom buttons, a help button " + JSON.stringify(mx));
    await page.click("#mapListBtn"); await page.waitForTimeout(800);
    ok(await page.evaluate(() => ui.mapMode === "list" && document.querySelector("#mapListBtn").dataset.mode === "map"), "the List button opens the list, then says Map");
    await page.click("#mapListBtn"); await page.waitForTimeout(500);
    await page.click("#mapSide [data-help]"); await page.waitForTimeout(500);
    ok(await page.evaluate(() => !!document.querySelector("#sheetRoot .help-sheet a[href^='tel:']")), "the help button opens the emergency numbers");
    await page.evaluate(() => closeDetail());
    await page.goto(BASE + "#tools"); await page.waitForTimeout(800);
    const tg = await page.evaluate(() => ({h:[...document.querySelectorAll("#pageview .sect h2")].map(h => h.textContent), wifi:!!document.querySelector('#pageview a[href="#tools/wifi"]'), w:document.documentElement.scrollWidth}));
    ok(tg.h.join() === "Right now,Our trip,Read up" && !tg.wifi && tg.w <= 393, "tools-groups: Right now, Our trip, Read up; no repeated tiles " + JSON.stringify(tg));
    await page.evaluate(() => openDetail(D.places.find(x => x.nt === "โรงแรมเฮีย").id)); await page.waitForTimeout(800);
    const dt = await page.evaluate(() => ({main:document.querySelectorAll("#sheetRoot .actions .btn.primary").length, share:!!document.querySelector("#dtShare"), driver:!!document.querySelector("#dtDriver"), sub:document.querySelector("#sheetRoot .sheet-head .note").textContent}));
    ok(dt.main === 1 && dt.share && dt.driver && /away/.test(dt.sub), "detail-buttons / driver-card: one main button, Share, the driver card, distance in the subtitle " + JSON.stringify(dt));
    await page.click("#dtDriver"); await page.waitForTimeout(300);
    ok(await page.evaluate(() => /โรงแรมเฮีย/.test(document.querySelector(".driver-card").textContent)), "the driver card shows the Thai name in big script");
    await page.click(".driver-card"); await page.evaluate(() => closeDetail());
  }

  // offline: the service worker should already have saved the app
  // (the app only registers its service worker on https, so register it by hand on localhost)
  await page.evaluate(() => Promise.race([navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready), new Promise(r => setTimeout(r, 15000))]));
  await page.reload(); await page.waitForTimeout(4000);
  // save Bangkok for offline, then check its places still list with no signal
  await page.goto(BASE + "#tools/offline"); await page.waitForTimeout(1500);
  const pack = await page.evaluate(async () => { try { const p = await savePack(THAI_DESTS.find(c => c[0] === "Bangkok")); return {files:p.files, photos:p.photos, mb:+(p.bytes / 1e6).toFixed(1)}; } catch(e){ return {err:e.message}; } });
  ok(pack.files > 20, "saving Bangkok for offline " + JSON.stringify(pack));
  if (!pack.photos) console.log("SKIP landmark photos: Wikimedia isn't reachable from this machine");
  await ctx.setOffline(true);
  await page.goto(BASE + "#gaffs", {timeout:15000}).catch(() => {}); await page.waitForTimeout(2500);
  ok(await page.evaluate(() => !!document.querySelector("#tabs a")), "app still opens offline");
  await page.evaluate(() => { Places.cache.clear(); Places.byId.clear(); });     // forget what's in memory, so the lists must come from the saved city
  await page.goto(BASE + "#munch", {timeout:15000}).catch(() => {}); await page.waitForTimeout(4000);
  ok(await page.evaluate(() => document.querySelectorAll("#pageview .card[data-open]").length > 5), "Bangkok food places list offline from the saved city");
  if (pack.photos){
    await page.evaluate(() => { try { localStorage.removeItem("card-photos-v1"); } catch(e){} });
    await page.goto(BASE + "#activities", {timeout:15000}).catch(() => {}); await page.waitForTimeout(4000);
    ok(await page.evaluate(() => [...document.querySelectorAll("#pageview .card .ph img")].some(i => i.complete && i.naturalWidth > 0 && /wikimedia/.test(i.src))), `landmark photos show offline (${pack.photos} saved)`);
  }
  await ctx.setOffline(false);

  ok(errors.length === 0, "no JavaScript errors" + (errors.length ? ":\n  " + errors.join("\n  ") : ""));
  await browser.close();
  if (server) server.close();
  console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
})();
