# SE Asia Trip app: notes for Claude

A phone web app (PWA) for Dylan and his mates' Southeast Asia backpacking trip (landing Bangkok 27 Nov 2026).
Dylan is not a developer: write anything addressed to him in plain English. He may later put it on the App Store.

## Structure

- The repo root **is** the live GitHub Pages site (https://elitepotato57-lgtm.github.io/SEA-Trip-Claude-Code/). There is no build step and no separate source.
- `index.html`: all HTML, CSS and JS, hand-edited and readable (~3,600 lines).
  - CSS tokens are at the top (`:root{...}`). The optional Paper Atlas look is a block of overrides under `:root[data-look="paper"]` at the end of the `<style>`.
  - One line, `const D = {...}` (~line 490), is ~290 KB of embedded trip data. **Don't rewrite it by hand.** Edit it with a script (parse, change, re-serialise) if you must.
  - `const MAP_STYLE` is the night map style. `mapStyle()` returns it, or the Paper Atlas variant (`PAPER_MAP` overrides by layer id).
  - `const VERSION`: bump it on every release.
- `sw.js`: service worker (offline). If you change it, bump the `APP` cache name at the top.
- `manifest.webmanifest`, `icon-*.png`, `img/` (header photos).
- `places/th/`: the map's places database. `meta.json`, `coverage.json`, `sum-stay/food/do.json` (summaries for zoomed-out clusters) and per-tile JSON.
- `vendor/`: MapLibre GL (the map engine).
- `tests/smoke.js`: headless phone-size check (see below).

## Rules

- Keep the tab names: **Map, Gaffs, Munch, Activities, Tools** (Settings behind the cog).
- Prices: local currency first, GBP underneath or alongside (use the existing `rate`/`gbp`/`withGBP` helpers).
- **No Buddha imagery anywhere** (deliberate choice). No temple drawings in themes either.
- Never invent prices, hours, ratings, deals or places. Researched facts need a source link in the data.
- Must work offline after first load, and on a 393 px wide iPhone screen (no sideways scrolling).
- Colour rule: the accent colour is only for **selected** things (chips, active tab, segmented buttons, toggles) and the **one** main button on a screen. Everything else is neutral. Category colours (`--stay --food --do --ess --move`) must match between chips and map clusters in every look.
- Google: never add, invent or commit an API key. `config.js` is not in the repo (404 on the live site) and `GOOGLE_KEY_IN_FILE` is empty, so Google photos/ratings only work if someone pastes a key into Settings. Every Google feature must work gracefully with no key.
- Google spend cap is GBP 2/month: cache results in localStorage, only request for cards actually on screen (IntersectionObserver), request minimal fields.
- Work on a branch and open a PR. Don't push to `main` unless Dylan asks.

## How to test

```bash
python3 -m http.server 8765 &            # from the repo root
NODE_PATH=$(npm root -g) node tests/smoke.js
```

It loads every tab at 393x852, checks there are no JavaScript errors and no sideways scrolling, checks the map and its clusters draw, that each place summary downloads once, that a place opens, that the look switch works, and that the app opens offline.
Errors from blocked hosts (map tiles, Wikidata, exchange rates) and the missing `config.js` are ignored, because cloud sandboxes often can't reach those. Real map tiles therefore need checking on a phone.

## How to publish

1. Merge the PR into `main` on GitHub. GitHub Pages redeploys by itself in a minute or two.
2. On the phone, **close the home-screen app fully and reopen it, twice**: the first open downloads the new version in the background, the second shows it.
