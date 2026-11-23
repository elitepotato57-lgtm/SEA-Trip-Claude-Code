// Audit (not part of npm test): a 393 x 852 phone visits every tab and Tools page, with the pretend location in Bangkok,
// Koh Phangan and Siem Reap, and reports JavaScript errors, anything wider than the screen, small tap targets, icon buttons
// with no label, empty links and broken images.     node tests/audit.js [Bangkok,Koh Phangan,Siem Reap]
const { start } = require("./serve");
let chromium; try { ({ chromium } = require("playwright")); } catch(e){ ({ chromium } = require("playwright-core")); }
const PORT = +process.env.PORT || 8790, BASE = `http://localhost:${PORT}/`;
const PLACES = (process.argv[2] || "Bangkok,Koh Phangan,Siem Reap").split(",");
const PAGES = ["map", "gaffs", "munch", "activities", "saved", "discover", "tools", "tools/settings", "tools/transport", "tools/currency", "tools/translate",
  "tools/docs", "tools/friends", "tools/friends-play", "tools/friends-split", "tools/weather", "tools/wifiList", "tools/guide", "tools/emergency",
  "tools/assistant", "tools/deals", "tools/offline", "tools/split", "tools/budget"];
(async () => {
  const server = await start(PORT), browser = await chromium.launch(), report = {};
  for (const place of PLACES){
    const c = await browser.newContext({viewport:{width:393, height:852}});
    await c.route(/\/config\.js(\?|$)/, r => r.fulfill({status:200, contentType:"text/javascript", body:""}));
    await c.addInitScript(p => { if (!localStorage.getItem("sea-trip-app-v1")) localStorage.setItem("sea-trip-app-v1", JSON.stringify({v:2, testLoc:p, countryMode:"auto", saved:{}})); }, place);
    const pg = await c.newPage(), errs = [];
    pg.on("pageerror", e => errs.push(e.message));
    pg.on("console", m => { if (m.type() === "error" && !/Failed to load resource|ERR_TUNNEL|ERR_PROXY|config\.js/.test(m.text())) errs.push(m.text()); });
    const out = report[place] = {};
    for (const h of PAGES){
      errs.length = 0;
      await pg.goto(BASE + "#" + h); await pg.waitForTimeout(h === "map" ? 6000 : 1800);
      const r = await pg.evaluate(() => {
        const vis = el => { const s = getComputedStyle(el), b = el.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && b.width > 0 && b.height > 0 && !el.closest("[hidden]"); };
        const wide = [], small = [], nolabel = [], emptyLink = [], brokenImg = [];
        const root = document.querySelector(ui.view === "map" ? "#mapview" : "#pageview");
        root.querySelectorAll("*").forEach(el => {
          if (!vis(el)) return;
          const b = el.getBoundingClientRect();
          // a row that scrolls sideways on purpose (chips) is fine; anything else poking past the screen isn't
          if (b.right > 394 && !el.closest(".map-chips, .chips, .flags, .hscroll, .scroller, [data-hscroll], .maplibregl-canvas-container, #map, .lchain, .pf-row, .cgrid")) wide.push((el.id ? "#" + el.id : el.tagName.toLowerCase() + "." + [...el.classList].join(".")) + " " + Math.round(b.right));
          if (el.matches("button, a[href], input, select, [role=button]") && !el.closest("#map .maplibregl-ctrl, .maplibregl-marker")){
            // links inside a sentence (sources) are exempt from the size rule, as in the accessibility guidelines
            if ((b.height < 32 || b.width < 32) && !el.matches("input[type=range]") && !el.closest("p, li, .note, .srcs")) small.push(`${(el.getAttribute("aria-label") || el.textContent || el.id || el.className).trim().slice(0, 30)} ${Math.round(b.width)}x${Math.round(b.height)}`);
            if (el.matches("button, a, [role=button]") && !(el.textContent || "").trim() && !el.getAttribute("aria-label") && !el.getAttribute("title")) nolabel.push(el.id || el.className || el.tagName);
            if (el.matches("a") && (el.getAttribute("href") === "#" || el.getAttribute("href") === "")) emptyLink.push((el.textContent || "").trim().slice(0, 30));
          }
          if (el.tagName === "IMG" && el.complete && el.naturalWidth === 0 && !/wikimedia|google|googleusercontent/.test(el.src)) brokenImg.push(el.getAttribute("src").slice(0, 60));
        });
        return {sw:document.documentElement.scrollWidth, wide:[...new Set(wide)].slice(0, 6), small:[...new Set(small)].slice(0, 8), nSmall:new Set(small).size,
          nolabel:[...new Set(nolabel)].slice(0, 6), emptyLink:[...new Set(emptyLink)], brokenImg:[...new Set(brokenImg)].slice(0, 4), empty:!root.textContent.trim()};
      });
      r.errs = errs.slice(0, 4);
      out[h] = r;
    }
    await c.close();
  }
  console.log(JSON.stringify(report, null, 1));
  await browser.close(); server.close();
})();
