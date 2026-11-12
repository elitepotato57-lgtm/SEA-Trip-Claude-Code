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
const ok = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) failed++; };

(async () => {
  const server = process.env.BASE ? null : await start(PORT);
  const browser = await chromium.launch(launchOpts);
  const ctx = await browser.newContext({viewport:{width:393, height:852}});
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !IGNORE.test(m.text())) errors.push(m.text()); });
  const sumHits = {};
  page.on("request", r => { const m = r.url().match(/places\/\w+\/sum-\w+\.json/); if (m) sumHits[m[0]] = (sumHits[m[0]] || 0) + 1; });

  await page.goto(BASE + "#map"); await page.waitForTimeout(6000);
  ok(await page.evaluate(() => !!document.querySelector("#map canvas")), "map canvas is drawn");
  ok(Object.values(sumHits).every(n => n === 1) && Object.keys(sumHits).length === 6, "each place summary downloads once, for Thailand and Indonesia " + JSON.stringify(sumHits));
  const cl = await page.evaluate(() => ["stay","food","do","ess","move"].filter(g => map.getLayer("cl-circle-" + g)).length);
  ok(cl === 5, "a cluster layer for each of the 5 categories");
  ok(await page.evaluate(() => map.queryRenderedFeatures().some(f => /^cl-circle-/.test(f.layer.id))), "clusters are visible on screen");

  for (const tab of ["gaffs", "munch", "activities", "tools", "tools/settings", "tools/transport", "tools/translate", "tools/emergency", "saved"]){
    await page.goto(BASE + "#" + tab); await page.waitForTimeout(1500);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    ok(w <= 393, `${tab}: no sideways scroll (width ${w})`);
  }

  await page.goto(BASE + "#munch"); await page.waitForTimeout(2000);
  await page.click(".card[data-open]");
  await page.waitForTimeout(1000);
  ok(await page.evaluate(() => !!document.querySelector("#sheetRoot .sheet")), "tapping a place opens its details");
  await page.click("#sheetRoot button[data-close]"); await page.waitForTimeout(600);

  await page.goto(BASE + "#tools/settings"); await page.waitForTimeout(1000);
  await page.click('#pageview [data-look="paper"]'); await page.waitForTimeout(2500);
  ok(await page.evaluate(() => document.documentElement.dataset.look === "paper"), "Paper Atlas look switches on");
  await page.goto(BASE + "#map"); await page.waitForTimeout(3000);
  ok(await page.evaluate(() => map.getStyle().name.includes("Paper")), "map uses the Paper Atlas style");
  await page.goto(BASE + "#tools/settings"); await page.waitForTimeout(1000);
  await page.click('#pageview [data-look="night"]'); await page.waitForTimeout(2500);
  ok(await page.evaluate(() => !document.documentElement.dataset.look), "back to the night look");

  // map filters: picking Munch (from All) shows only food, with a price row; tapping Munch again clears the map
  await page.goto(BASE + "#map"); await page.waitForTimeout(2500);
  await page.evaluate(() => map.jumpTo({center:[100.5018, 13.7563], zoom:14.5})); await page.waitForTimeout(3500);
  await page.click('#mapChips [data-cat="munch"]'); await page.waitForTimeout(2500);
  ok(await page.evaluate(() => [...ui.mapCats].join() === "munch" && !document.querySelector("#mapFilt").hidden), "tapping Munch shows only food, with the filter row");
  const before = await page.evaluate(() => mapRun.items.length);
  await page.click('#mapFilt [data-mb="1"]'); await page.waitForTimeout(1500);
  const cheap = await page.evaluate(() => ({n:mapRun.items.length, ok:mapRun.items.every(p => priceBand(p) === 1)}));
  ok(cheap.ok && cheap.n > 0 && cheap.n < before, `£ filter keeps only cheap places (${cheap.n} of ${before})`);
  ok(await page.evaluate(() => !document.querySelector("#mapFilt [data-mr]")), "no star filter (places have no ratings to filter on)");
  await page.click('#mapFilt [data-mb=""]'); await page.click('#mapChips [data-cat="munch"]'); await page.waitForTimeout(1500);
  ok(await page.evaluate(() => ui.mapCats.size === 0 && mapRun.items.length === 0), "tapping the only section again switches everything off");
  await page.click('#mapChips [data-all]'); await page.waitForTimeout(800);
  ok(await page.evaluate(() => document.querySelector("#mapFilt").hidden && ui.mapCats.size === 3), "All brings everything back, without the filter row");

  // Indonesia: the map, lists, search and Tools work in Sumatra, Bali and Lombok too
  await page.evaluate(() => { setFocus({n:"Palembang", lat:-2.9888, lng:104.7569}); setCountry("ID", true); });
  await page.goto(BASE + "#map"); await page.waitForTimeout(1500);
  await page.evaluate(() => { ui.mapCats = new Set(["munch"]); renderMapUI(); map.jumpTo({center:[104.7569, -2.9888], zoom:14.5}); }); await page.waitForTimeout(4000);
  const idMap = await page.evaluate(() => ({n:mapRun.items.length, id:mapRun.items.filter(p => p.cc === "ID").length, lab:(document.querySelector('#mapFilt [data-mb="1"]') || {}).textContent}));
  ok(idMap.id > 20 && /Rp/.test(idMap.lab || ""), "Palembang food shows on the map, with price filters in rupiah " + JSON.stringify(idMap));
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

  // questions in the search box: typed questions get an answer row; answers list nearby places
  await page.fill("#m-q", "where's the nearest toilet"); await page.waitForTimeout(600);
  ok(await page.evaluate(() => { const b = document.querySelector("#mapSugs button"); return !!b && b.hasAttribute("data-ask"); }), "a typed question offers an answer first");
  await page.click("#mapSugs [data-ask]"); await page.waitForTimeout(4000);
  const toil = await page.evaluate(() => ({rows:document.querySelectorAll("#sheetRoot .ask-row").length, title:(document.querySelector("#askBody h3") || {}).textContent}));
  ok(toil.rows > 0 && /Toilets/.test(toil.title), "nearest toilets are listed " + JSON.stringify(toil));
  await page.click("#sheetRoot button[data-close]"); await page.waitForTimeout(300);
  const ans = await page.evaluate(async () => { const r = await answerAsk("best cheap restaurant near me"); return r.items.map(x => ({c:x.p.c, band:priceBand(x.p), km:x.km})); });
  ok(ans.length > 0 && ans.every(x => x.c === "munch" && x.band === 1 && x.km <= 5), "best cheap restaurant near me: cheap food within 5 km " + ans.length);
  await page.fill("#m-q", ""); await page.waitForTimeout(300);

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

  // Camera translator: with Google's replies faked (no real key, no cost), a photo comes back as lines with English and pronunciation
  await page.route("**/vision.googleapis.com/**", r => r.fulfill({json:{responses:[{textAnnotations:[{description:"ข้าวผัดกุ้ง\nPad Thai\nน้ำเปล่า\n"}]}]}}));
  await page.route("**/translation.googleapis.com/**", r => r.fulfill({json:{data:{translations:[{translatedText:"Shrimp fried rice"}, {translatedText:"Water"}]}}}));
  await page.evaluate(() => { S.gkey = "AIzaTEST-fake"; });
  await page.goto(BASE + "#tools/camera"); await page.waitForTimeout(800);
  const png = path.join(os.tmpdir(), "sea-trip-menu.png");
  fs.writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
  await page.setInputFiles("#camPick", png); await page.waitForTimeout(2500);
  const cam = await page.evaluate(() => [...document.querySelectorAll(".cam-line")].map(x => x.textContent.replace(/\s+/g, " ").trim()));
  ok(cam.length === 3 && /Shrimp fried rice/.test(cam[0]) && /say: /.test(cam[0]) && /Not Thai/.test(cam[1]) && /Water/.test(cam[2]), "camera translator shows each line in English with how to say it " + JSON.stringify(cam));
  await page.evaluate(() => { S.gkey = ""; }); await page.unroute("**/vision.googleapis.com/**"); await page.unroute("**/translation.googleapis.com/**");

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
