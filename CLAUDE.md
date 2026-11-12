# SE Asia Trip app: notes for Claude

A phone web app (PWA) for Dylan and his mates' Southeast Asia backpacking trip (landing Bangkok 27 Nov 2026).
Dylan is not a developer: write anything addressed to him in plain English. He may later put it on the App Store.

## Structure

The repo root **is** the live GitHub Pages site (https://elitepotato57-lgtm.github.io/SEA-Trip-Claude-Code/). No build step.

- `index.html`: just the page shell. It loads `css/app.css` and the files in `js/` **in order** as classic scripts.
  They share one global scope (top-level `const`/`function` in one file are visible in the next), so order matters:
  a file's top-level code may only use things from files loaded before it.
- `js/data.js`: `GEO`, `D` (~290 KB trip data, one line) and `MAP_STYLE`. Edit with a script, never by hand.
- `js/core.js`: helpers, icons (`IC`), saved state `S` (+ `S_DEFAULTS`: only keys listed there are saved), money, `VERSION`.
- `js/design.js`: the Design Lab (floating panel, palette tab on the left edge). Applies `S.design` as CSS custom
  properties on `<html>` and live map paint. Look codes start `SEALOOK:` (see below).
- `js/places.js`: the places model, OpenStreetMap tiles, opening hours, Thai romaniser (`thaiRom`), chips.
- `js/estimate.js`: food types and typical-price **estimates** (`foodType`, `estPrice`, `priceBand`), known ratings.
  OpenStreetMap has no ratings and only researched hostels do, so the map filters on price, not stars.
- `js/shell.js`: tabs, routing, sheets, location. `js/lists.js`: place cards and the Gaffs/Munch/Activities pages.
- `js/map.js`: the MapLibre map, per-category clusters, the filter row (price, or transport type).
- `js/ask.js`: questions in the map search, typed or spoken ("nearest toilet", "cheap noodles near me"): rule-based, no AI.
- `js/transport.js`: journey planner over `D.net` (Thailand, plus Bali, Lombok, the Gilis and southern Sumatra via Jakarta).
  Totals show in the money of the country a journey starts in. `js/tools.js`: Tools hub, currency, translator, Settings.
- `js/camera.js`: camera translator. `js/tools-more.js`: budget, weather, Wi-Fi, guide, emergency, assistant, deals.
- `js/offline.js`: Tools › Offline & backup (city packs, backup/restore). Packs can include up to 150 free Wikimedia Commons
  landmark photos per city (500 px, credits kept); cards and the details sheet use them first (`PACK_PHOTOS`). Never store Google photos.
- `js/docs.js`: Tools › Documents.
- `js/detail.js`: photos and the place details sheet, Google helpers (`googleKey`, daily allowance `G_DAILY`). `js/boot.js`: starts the app.
- `css/app.css`: tokens in `:root`, Paper Atlas overrides under `:root[data-look="paper"]`, Design Lab knobs
  (`--ts` text size, `--chip`, `--pad`, `--card-gap`, `--card-ar`, radii).
- `sw.js`: service worker. Bump `APP` when files change. The app's own `js/`, `css/` and `config.js` load
  network-first (so a phone never mixes versions); places and tiles are cached; `sea-trip-packs-v1` holds saved cities and is never trimmed.
- `places/th/` (all of Thailand) and `places/id/` (Indonesia: Lampung, South Sumatra, Bengkulu, Bali, Lombok): the places
  databases, listed in `PLACE_DBS` in `js/places.js`. Built from OpenStreetMap by `tools/osm/extract.py` (see `tools/osm/README.md`).
  Country-specific parts: price tables (`PRICE_TABLES` in `js/estimate.js`), phrasebooks (`js/tools.js`), guide and emergency
  numbers (`js/tools-more.js`), destinations (`D.cities`, `DEST_NOTE`). The app follows `S.country`.
- `vendor/`: MapLibre, pdf.js, Tesseract.js (see `vendor/README.md`).
- `tests/`: `unit.js` (logic, in Node), `smoke.js` (phone-size browser run), `load.js`, `serve.js`.

## Rules

- Keep the tab names: **Map, Gaffs, Munch, Activities, Tools** (Settings behind the cog).
- Dylan wants every country to work to the same extent as Thailand. When adding one, do all the steps in `tools/osm/README.md`.
- Prices: local currency first, GBP alongside. **Estimates** are allowed only from the rules in `js/estimate.js`,
  always shown as "est." and never instead of a researched price. Never invent researched prices, hours, ratings or places.
- **No Buddha imagery anywhere** (deliberate choice). No temple drawings in themes either.
- Must work offline after first load, and on a 393 px wide iPhone screen (no sideways scrolling).
- Colour rule: the accent is only for **selected** things and the **one** main button on a screen.
  Category colours (`--stay --food --do --ess --move`) must match between chips, pins and map clusters in every look.
- Google: never add, invent or commit an API key. Dylan adds `config.js` himself on GitHub
  (`window.SEA_GOOGLE_KEY = "…";`). **Never delete or overwrite `config.js`.** Every Google feature must work without a key.
  Spend cap GBP 2/month: cache results, only fetch for cards on screen, minimal fields, per-phone daily allowance
  (`G_DAILY`: photo 40, details 25, vision 15).
- Documents stay on the phone (IndexedDB) and are read on the phone. Never send them to a server.
- Work on a branch and open a PR. Don't push to `main` unless Dylan asks.

## Design Lab look codes

When Dylan pastes a `SEALOOK:{...}` code, make it the default look: put its colours into the `:root` tokens in
`css/app.css` (section colours, accent, app colours), its map colours into `MAP_STYLE` (via a script) and its sizes
into the CSS defaults, then check the night and Paper Atlas looks still read well. `labImport()` shows which keys exist.

## How to test

```bash
npm install          # once: playwright-core (drives the Edge/Chrome already installed)
npm test             # unit tests, then the phone-size browser run (starts its own server)
PORT=8766 npm run test:smoke   # if port 8765 is busy
```

The browser run checks every tab at 393 px, the map and clusters, filters, a place opening, both looks, the Design Lab,
Documents (a real PDF and a picture read on the device), the camera translator (Google replies faked),
saving Bangkok for offline and using it with no signal, and that there are no JavaScript errors.
Errors from blocked hosts and the missing `config.js` are ignored.

## How to publish

1. Merge the PR into `main` on GitHub. GitHub Pages redeploys by itself in a minute or two.
2. On the phone, **close the home-screen app fully and reopen it, twice**: the first open downloads the new version, the second shows it.
