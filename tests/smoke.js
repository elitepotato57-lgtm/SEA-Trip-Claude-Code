// Quick check of the whole app in a phone-sized headless browser.
// Run from the repo root:   python3 -m http.server 8765 &   then   node tests/smoke.js
// Needs Playwright (npx playwright, or the copy that comes with Claude Code's cloud machines).
// It fails (exit code 1) if any page throws a JavaScript error, a tab scrolls sideways at 393 px,
// the map or its clusters don't appear, a place won't open, the look switch breaks, or the app won't load offline.
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:8765/";
const IGNORE = /config\.js|ERR_TUNNEL|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_PROXY|Failed to load resource/;
let failed = 0;
const ok = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) failed++; };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({viewport:{width:393, height:852}});
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !IGNORE.test(m.text())) errors.push(m.text()); });
  const sumHits = {};
  page.on("request", r => { const m = r.url().match(/sum-\w+\.json/); if (m) sumHits[m[0]] = (sumHits[m[0]] || 0) + 1; });

  await page.goto(BASE + "#map"); await page.waitForTimeout(6000);
  ok(await page.evaluate(() => !!document.querySelector("#map canvas")), "map canvas is drawn");
  ok(Object.values(sumHits).every(n => n === 1) && Object.keys(sumHits).length === 3, "each place summary downloads once " + JSON.stringify(sumHits));
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

  // offline: the service worker should already have saved the app
  // (the app only registers its service worker on https, so register it by hand on localhost)
  await page.evaluate(() => Promise.race([navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready), new Promise(r => setTimeout(r, 15000))]));
  await page.reload(); await page.waitForTimeout(4000);
  await ctx.setOffline(true);
  await page.goto(BASE + "#gaffs", {timeout:15000}).catch(() => {}); await page.waitForTimeout(2500);
  ok(await page.evaluate(() => !!document.querySelector("#tabs a")), "app still opens offline");
  await ctx.setOffline(false);

  ok(errors.length === 0, "no JavaScript errors" + (errors.length ? ":\n  " + errors.join("\n  ") : ""));
  await browser.close();
  console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
})();
