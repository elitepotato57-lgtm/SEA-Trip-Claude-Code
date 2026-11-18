// A long click-through, for hunting bugs by hand (not part of npm test): opens destinations in every country, scrolls the
// Gaffs, Munch and Activities lists, taps every card it sees and checks the details sheet that opens.
//   node tests/sweep.js            (PORT=8766 if 8765 is busy; SWEEP_CARDS=12 cards per list, default 10)
// It reports: sheets that don't open or open the wrong place, JavaScript errors, a card with a photo whose sheet has none,
// researched places whose sheet shows almost nothing, and map pins that don't open. Uses free photos only (no Google key).
const { start } = require("./serve");
let chromium, launchOpts = {};
try { ({ chromium } = require("playwright")); }
catch (e) { ({ chromium } = require("playwright-core")); launchOpts = {channel: process.env.BROWSER || (process.platform === "win32" ? "msedge" : "chrome")}; }
const PORT = +process.env.PORT || 8765, BASE = `http://localhost:${PORT}/`, PER = +process.env.SWEEP_CARDS || 10;
const DESTS = (process.env.SWEEP_DESTS || "Bangkok,Chiang Mai,Pai,Koh Phangan,Phuket,Ubud,Canggu,Gili Trawangan,Palembang,Siem Reap,Phnom Penh,Kampot,Hanoi,Hoi An,Ho Chi Minh City,Sapa,Da Lat,Luang Prabang,Vang Vieng,Vientiane,Don Det,Singapore").split(",");
const IGNORE = /config\.js|ERR_|Failed to load resource|net::/;

(async () => {
  const server = await start(PORT);
  const browser = await chromium.launch(launchOpts);
  const ctx = await browser.newContext({viewport:{width:393, height:852}});
  await ctx.route(/\/config\.js(\?|$)/, r => r.fulfill({status:200, contentType:"text/javascript", body:""}));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !IGNORE.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE + "#map"); await page.waitForTimeout(2500);
  const rows = [];
  for (const dest of DESTS){
    for (const tab of ["gaffs", "munch", "activities"]){
      const ok = await page.evaluate(([d, t]) => { const c = D.cities.find(x => x[0] === d); if (!c) return false; setFocus({n:c[0], lat:c[1], lng:c[2]}); go("#" + t); return true; }, [dest, tab]);
      if (!ok){ rows.push({dest, tab, problem:"destination missing"}); continue; }
      await page.waitForTimeout(2500);
      // scroll the cards into view so their photos load
      const ids = await page.evaluate(n => [...document.querySelectorAll("article.card[data-open]")].slice(0, n).map(c => c.dataset.open), PER);
      if (!ids.length) rows.push({dest, tab, problem:"no cards"});
      for (const id of ids){ await page.evaluate(i => { const c = document.querySelector(`article.card[data-open="${CSS.escape(i)}"]`); if (c) c.scrollIntoView({block:"center"}); }, id); await page.waitForTimeout(120); }
      await page.waitForTimeout(3000);
      for (const id of ids){
        const card = page.locator(`article.card[data-open="${id}"]`).first();
        if (!(await card.count())){ rows.push({dest, tab, id, problem:"card vanished"}); continue; }
        const cardImg = await card.locator(".ph img").count() > 0;
        const e0 = errors.length;
        await card.scrollIntoViewIfNeeded(); await card.click();
        await page.waitForTimeout(2200);
        const r = await page.evaluate(i => {
          const it = findPlace(i), sh = document.querySelector("#sheet-title"), box = document.querySelector("#photoBox");
          const facts = [...document.querySelectorAll(".sheet .fact:not([hidden]) .l")].map(x => x.textContent);
          return {n: it && it.n, kind: it && it.cur_ ? (it.verified ? "researched" : "unchecked") : "map", opened: !!sh, title: sh && sh.textContent,
            sheetImg: !!(box && box.querySelector("img")), facts, hasRef: !!(it && (it.wp || it.wd || it.pic)), cc: it && it.cc,
            known: !!document.querySelector(".sheet ul.known"), srcs: (document.querySelector(".sheet .srcs") || {}).textContent || ""};
        }, id);
        const problems = [];
        if (!r.opened) problems.push("sheet did not open");
        else if (r.title !== r.n) problems.push(`title "${r.title}" is not "${r.n}"`);
        if (errors.length > e0) problems.push("JS error: " + errors.slice(e0).join(" | "));
        if (cardImg && !r.sheetImg) problems.push("card has a photo, sheet has none");
        if (r.kind !== "map" && !r.known) problems.push("researched but no 'known for' list");
        if (r.kind !== "map" && r.facts.length < 1) problems.push("researched but no facts");
        rows.push({dest, tab, id, n:r.n, kind:r.kind, cardImg, sheetImg:r.sheetImg, facts:r.facts.length, problems});
        await page.evaluate(() => { try { closeDetail(); } catch(e){} });
        await page.waitForTimeout(150);
      }
    }
    process.stdout.write(dest + " ");
  }
  console.log("");
  const taps = rows.filter(r => r.id).length, bad = rows.filter(r => r.problem || (r.problems && r.problems.length));
  console.log(`${taps} cards tapped in ${DESTS.length} destinations; ${bad.length} with problems`);
  bad.forEach(r => console.log(`- ${r.dest} / ${r.tab}: ${r.n || r.id || ""} (${r.kind || ""}) ${r.problem || r.problems.join("; ")}`));
  const s = k => rows.filter(r => r.kind === k);
  for (const k of ["researched", "unchecked", "map"]) console.log(`${k}: ${s(k).length} tapped, ${s(k).filter(r => r.cardImg).length} card photos, ${s(k).filter(r => r.sheetImg).length} sheet photos`);
  require("fs").writeFileSync(require("path").join(require("os").tmpdir(), "sea-sweep.json"), JSON.stringify(rows, null, 1));
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
