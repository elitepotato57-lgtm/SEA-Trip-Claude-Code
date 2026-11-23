// Audit (not part of npm test): first load on slow 4G (time to the map), then save Bangkok, go offline and visit every tab
// and Tools page: no JavaScript errors, nothing blank, and what needs signal says so.     node tests/audit-offline.js
const { start } = require("./serve");
let chromium; try { ({ chromium } = require("playwright")); } catch(e){ ({ chromium } = require("playwright-core")); }
const PORT = +process.env.PORT || 8792, BASE = `http://localhost:${PORT}/`;
const PAGES = ["map", "gaffs", "munch", "activities", "saved", "discover", "tools", "tools/settings", "tools/transport", "tools/currency", "tools/translate",
  "tools/docs", "tools/friends", "tools/weather", "tools/guide", "tools/emergency", "tools/offline", "tools/split"];
(async () => {
  const server = await start(PORT), browser = await chromium.launch();
  const c = await browser.newContext({viewport:{width:393, height:852}, geolocation:{latitude:13.7466, longitude:100.5393}, permissions:["geolocation"]});
  await c.route(/\/config\.js(\?|$)/, r => r.fulfill({status:200, contentType:"text/javascript", body:""}));
  const pg = await c.newPage(), errs = [];
  pg.on("pageerror", e => errs.push(e.message));
  // slow 4G: about 1.6 Mbit/s down, 150 ms
  const cdp = await c.newCDPSession(pg);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {offline:false, latency:150, downloadThroughput:1.6e6 / 8, uploadThroughput:750e3 / 8});
  const t0 = Date.now();
  await pg.goto(BASE + "#map");
  await pg.waitForFunction(() => window.map && map.loaded && map.loaded() && document.querySelector("#map canvas"), null, {timeout:120000}).catch(() => {});
  const tMap = Date.now() - t0;
  await pg.waitForFunction(() => map.queryRenderedFeatures().some(f => /^cl-|^pt-/.test(f.layer.id)), null, {timeout:120000}).catch(() => {});
  const tPins = Date.now() - t0;
  const bytes = await pg.evaluate(() => performance.getEntriesByType("resource").reduce((s, r) => s + (r.transferSize || 0), 0) + (performance.getEntriesByType("navigation")[0] || {}).transferSize);
  console.log(`slow 4G: map ready ${tMap} ms, first pins ${tPins} ms, ${Math.round(bytes / 1024)} KB downloaded`);
  await cdp.send("Network.emulateNetworkConditions", {offline:false, latency:0, downloadThroughput:-1, uploadThroughput:-1});
  // memory with lots loaded: Bangkok at zoom 15 and the Munch list scrolled
  await pg.evaluate(() => map.jumpTo({center:[100.5018, 13.7563], zoom:15})); await pg.waitForTimeout(4000);
  const mem = await pg.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null);
  console.log(`JS memory with central Bangkok loaded: ${mem} MB; places cached: ${await pg.evaluate(() => Places.cache.size)} tiles`);
  // long list scrolling: time to render Munch and to scroll to the bottom
  await pg.goto(BASE + "#munch"); await pg.waitForTimeout(2500);
  const scroll = await pg.evaluate(async () => { const v = document.querySelector("#pageview"), t = performance.now(); for (let i = 0; i < 20; i++){ v.scrollTop += 800; await new Promise(r => requestAnimationFrame(r)); } return {ms:Math.round(performance.now() - t), cards:document.querySelectorAll("#pageview .card").length}; });
  console.log(`Munch: 20 scroll steps in ${scroll.ms} ms, ${scroll.cards} cards`);
  // save Bangkok, then offline
  await pg.evaluate(() => Promise.race([navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready), new Promise(r => setTimeout(r, 15000))]));
  await pg.reload(); await pg.waitForTimeout(4000);
  const pack = await pg.evaluate(async () => { try { const p = await savePack(THAI_DESTS.find(c => c[0] === "Bangkok")); return p.files; } catch(e){ return e.message; } });
  console.log("saved Bangkok:", pack, "files");
  await c.setOffline(true);
  for (const h of PAGES){
    errs.length = 0;
    await pg.goto(BASE + "#" + h, {timeout:15000}).catch(() => {}); await pg.waitForTimeout(h === "map" ? 4000 : 1500);
    const r = await pg.evaluate(() => { const root = document.querySelector(ui.view === "map" ? "#mapview" : "#pageview"), t = (root.innerText || "").replace(/\s+/g, " ");
      return {chars:t.length, signal:/signal|offline|no connection|internet|saved/i.test(t), cards:document.querySelectorAll("#pageview .card").length}; }).catch(e => ({fail:e.message}));
    console.log(`offline ${h.padEnd(18)} ${JSON.stringify(r)} ${errs.length ? "ERR " + errs.join(" | ").slice(0, 160) : ""}`);
  }
  await browser.close(); server.close();
})();
