// Measures how photos load in a real browser, from a cold start (nothing cached), at phone size.
// Run:  node tests/photos-perf.js            (PORT=8767 by default; needs signal, as the photos come from Wikimedia)
// SHOW_REQUESTS=1 lists each photo request; ONLY=1 runs just Bangkok activities. Prints, for a few lists: time to the first photo, photos showing after 8 s, image requests, failures and bytes.
const { start } = require("./serve");
let chromium, launchOpts = {};
try { ({ chromium } = require("playwright")); }
catch (e) { ({ chromium } = require("playwright-core")); launchOpts = {channel: process.env.BROWSER || (process.platform === "win32" ? "msedge" : "chrome")}; }
const PORT = +process.env.PORT || 8767;
const BASE = `http://localhost:${PORT}/`;
const RUNS = process.env.ONLY ? [["Bangkok activities", 13.7466, 100.5393, "#activities"]] : [
  ["Bangkok activities", 13.7466, 100.5393, "#activities"],
  ["Ubud activities", -8.5069, 115.2625, "#activities"],
  ["Bangkok munch", 13.7466, 100.5393, "#munch"],
  ["Palembang gaffs", -2.9888, 104.7569, "#gaffs"],
];
(async () => {
  const server = await start(PORT);
  const browser = await chromium.launch(launchOpts);
  const out = [];
  for (const [name, lat, lng, hash] of RUNS){
    const ctx = await browser.newContext({viewport:{width:393, height:852}, geolocation:{latitude:lat, longitude:lng}, permissions:["geolocation"]});
    const page = await ctx.newPage();
    const reqs = []; const t0 = Date.now(); let bytes = 0;
    page.on("requestfinished", async r => { if (/wikipedia|wikidata|wikimedia|googleusercontent|googleapis/.test(r.url())){ const s = await r.sizes().catch(() => null); if (s) bytes += s.responseBodySize; reqs.push({u:r.url(), ok:true}); } });
    page.on("requestfailed", r => { if (/wikipedia|wikidata|wikimedia/.test(r.url())) reqs.push({u:r.url(), ok:false}); });
    await page.goto(BASE + hash);
    let first = null;
    for (let i = 0; i < 40; i++){
      await page.waitForTimeout(200);
      const n = await page.evaluate(() => [...document.querySelectorAll("#pageview .card .ph img")].filter(i => i.complete && i.naturalWidth > 0).length);
      if (n && first == null) first = Date.now() - t0;
    }
    const st = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("#pageview .card")];
      const firstScreen = cards.filter(c => c.getBoundingClientRect().top < innerHeight);
      const imgs = [...document.querySelectorAll("#pageview .card .ph img")];
      return {cards:cards.length, shown:imgs.filter(i => i.complete && i.naturalWidth > 0).length, firstScreen:firstScreen.length,
        firstScreenPhotos:firstScreen.filter(c => { const i = c.querySelector(".ph img"); return i && i.complete && i.naturalWidth > 0; }).length,
        widest:Math.max(0, ...imgs.map(i => i.naturalWidth))};
    });
    if (process.env.SHOW_REQUESTS) reqs.forEach(r => console.log("  " + name + (r.ok ? "  " : " x") + " " + r.u.slice(0, 160)));
    out.push({name, firstPhotoMs:first, ...st, photoRequests:reqs.length, failed:reqs.filter(r => !r.ok).length, kB:Math.round(bytes / 1024)});
    await ctx.close();
  }
  console.table(out);
  await browser.close(); server.close();
})();
