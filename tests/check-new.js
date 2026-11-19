// One-off checks for the Nov 2026 batch (Map button, Activities sections and Boozer, typical photos, funny mode pop-ups).
//   PORT=8766 node tests/check-new.js
const path = require("path");
const { start } = require("./serve");
let chromium, launchOpts = {};
try { ({ chromium } = require("playwright")); }
catch (e) { ({ chromium } = require("playwright-core")); launchOpts = {channel: process.env.BROWSER || (process.platform === "win32" ? "msedge" : "chrome")}; }
const PORT = +process.env.PORT || 8765, BASE = `http://localhost:${PORT}/`;
let bad = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
(async () => {
  const server = await start(PORT), browser = await chromium.launch(launchOpts);
  const ctx = await browser.newContext({viewport:{width:393, height:852}});
  await ctx.route(/\/config\.js(\?|$)/, r => r.fulfill({status:200, contentType:"text/javascript", body:""}));
  const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(BASE + "#map"); await page.waitForTimeout(3000);
  // the Map tab brings the map back from the list
  await page.evaluate(() => { ui.mapMode = "list"; renderMapUI(); }); await page.waitForTimeout(500);
  await page.click('#tabs a[href="#map"]'); await page.waitForTimeout(600);
  ok(await page.evaluate(() => ui.mapMode === "map" && document.querySelector("#mapList").hidden), "Map tab switches the list back to the map");
  // Activities: the section row, with Boozer
  await page.evaluate(() => { ui.mapCats = new Set(["cool"]); ui.essKinds.clear(); renderMapUI(); }); await page.waitForTimeout(400);
  const row = await page.evaluate(() => { const r = document.querySelector("#mapDo"); return r && !r.hidden ? [...r.querySelectorAll("[data-dok]")].map(b => b.textContent.trim()) : null; });
  ok(row && row.includes("Boozas") && row.includes("Beaches"), "Activities shows its sections (Boozas included) like Essentials: " + JSON.stringify(row));
  await page.evaluate(() => { map.jumpTo({center:[100.4975, 13.7590], zoom:15.5}); }); await page.waitForTimeout(500);
  await page.click('#mapDo [data-dok="boozer"]'); await page.waitForTimeout(3500);
  const boo = await page.evaluate(() => ({n:mapRun.items.length, kinds:[...new Set(mapRun.items.map(p => p.k))]}));
  ok(boo.n > 0 && boo.kinds.every(k => ["bar", "club", "liquor"].includes(k) || k === undefined), "Boozer shows only bars, clubs and bottle shops around Khao San: " + JSON.stringify(boo));
  const liquor = await page.evaluate(async () => { const r = await Places.near("do", {lat:13.7563, lng:100.5018}, {maxKm:8, want:40, test:p => p.k === "liquor"}); return r.items.length; });
  ok(liquor > 0, "bottle shops are in the places data: " + liquor + " near central Bangkok");
  // a toilet with no photo of its own gets none (typical photos are switched off: a real photo or nothing)
  const typ = await page.evaluate(async () => { const r = await Places.near("ess", {lat:13.7563, lng:100.5018}, {maxKm:5, want:5, test:p => p.k === "toilet"}); const it = r.items[0]; if (!it) return null; const ph = await freePhoto(it); return ph && {src:ph.src, typical:ph.typical, credit:ph.credit}; });
  ok(!typ || !/img\/kind\//.test(typ.src || ""), "a toilet with no photo of its own shows none, never a typical one: " + JSON.stringify(typ));
  // funny mode: Munch and Nightlife
  await page.evaluate(() => { S.funny = true; persist(); }); await page.evaluate(() => go("#munch")); await page.waitForTimeout(600);
  ok(await page.evaluate(() => /munchies/.test((document.querySelector("#funnyPop") || {}).textContent || "")), "funny mode: Tommy's got the munchies on Munch");
  await page.evaluate(() => go("#activities")); await page.waitForTimeout(800);
  await page.click('[data-chip="nightlife"]'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => /drug dealers/.test((document.querySelector("#funnyPop") || {}).textContent || "")), "funny mode: the warning pops up on Nightlife");
  await page.evaluate(() => { S.funny = false; persist(); });
  // no sideways scroll on the transport page with a journey open
  await page.evaluate(() => { ui.tp.from = hubNode("pai"); ui.tp.to = hubNode("hoian"); ui.tp.go = true; go("#tools/transport"); }); await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector(".trip.compact").click()); await page.waitForTimeout(2500);
  const tr = await page.evaluate(() => ({legs:document.querySelectorAll("#sheetRoot .leg").length, stops:document.querySelectorAll("#legMap .leg-stop").length, icons:document.querySelectorAll("#legMap .leg-ic").length, w:document.documentElement.scrollWidth}));
  ok(tr.legs >= 3 && tr.stops === tr.legs + 1 && tr.icons === tr.legs && tr.w <= 393, "Pai to Hoi An: every leg listed, a numbered stop and a mode icon per leg on the map " + JSON.stringify(tr));
  await page.screenshot({path:path.join(require("os").tmpdir(), "sea-journey.png")});
  ok(!errors.length, "no JavaScript errors " + errors.join(" | "));
  await browser.close(); server.close();
  console.log(bad ? `${bad} failed` : "All new checks passed");
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
