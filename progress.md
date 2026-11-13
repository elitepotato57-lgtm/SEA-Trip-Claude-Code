# SEA-Trip: progress log

Branch `claude/fixes-and-cambodia` (worktree `.claude/worktrees/optimistic-dhawan-3046f6`), stacked on
`claude/optimistic-dhawan-3046f6` (Indonesia researched layer, pushed). `gh` isn't installed, so PRs need a click.
Nothing is merged into `main` or deployed. The main checkout (`claude/modules-and-design-lab`) is untouched.
Everything stays at £0: no billing, paid programmes or trials. No Google key was added; `config.js` was not touched.

## Completed (with what was checked)

| # | Change | Checked by |
|---|---|---|
| 1 | **Price filters**: one rule (`passPF` in `js/estimate.js`) for the map and the Gaffs/Munch/Activities lists. Preset buttons (Gaffs £5–20 a night, Munch £1/2/5/10 a dish, Activities Free/£1/5/10), a custom amount in pounds or local money (validated), Any to clear, kept when switching map ⇄ list. Gaffs compare dorm-bed prices with dorm beds and room prices with rooms. Unknown prices never pass; estimates are labelled and can be switched off. Fixed: rupiah estimates were converted to pounds as if they were baht. | unit tests; browser: presets, custom ฿60, −3 refused, map ⇄ list, rupiah and dollar custom amounts |
| 2 | **"Take me to the nearest …"** typed or spoken: finds the true nearest place (`Places.nearest` keeps searching until nothing unopened could be closer), selects it on the map with its preview and Directions (not launched). Location off: says so and uses the middle of the map. | unit tests (11 phrasings); browser: nearest ATM, nothing closer, location blocked |
| 3 | **Heading on the blue dot**: compass beam (iPhone asks only when the locate button is tapped), arrow for direction of travel when moving, smoothing across north, screen rotation, faint beam + calibration tip when rough, stops when the map is hidden. | unit test for the smoothing; needs a real phone (no compass in a desktop browser) |
| 4 | **Photos**: see the report below. Faster, smaller, batched, no Buddha imagery, 44 more researched places with a genuine photo. | browser timings before/after; unit tests |
| 5 | **Currency converter**: local money left, pounds right, both directions. | browser |
| 6 | **Camera translator** switched off (it needed Google Cloud Vision, which requires billing). Tesseract's free Thai model was tried on four real sign/menu photos: mostly garbage (37–51 % confidence). The Translator page explains the phones' own free camera translation instead. | browser |
| 7 | **Budget hidden**: no tile, no Discover card; the page and saved spending are kept. | browser (data kept) |
| 8 | **Booking links**: each leg opens 12Go's page for that leg's own mode and direction, with date and number of people (`?date=…&people=…`, confirmed on 12Go). All 272 page variants checked; 139 mode pages that list services are stored (`D.net.go12ok`); other legs open the route's all-transport search and say "Search". | browser (on 12Go itself); unit + browser tests |
| 9 | **Transport counts**: zoomed out, counts follow the transport type (Airports showed all 2,664 transport places). Price-filtered counts say they're before the filter. A selected place keeps its preview and says when a filter hides its pin. | unit + browser |
| 10 | **Wi-Fi finder** opens the main map with only Wi-Fi, centred on the phone. | browser |
| 11 | **Design Lab** off by default; Night / Paper Atlas moved into the Lab; Settings keeps one switch. | browser + unit |
| 12 | **Real location by default**: pretend-Bangkok off (one-time migration keeps a city someone picked); first fix centres the map; manual country stays until Automatic; denied/unavailable/rough location said plainly. | browser: fresh install in Ubud, returning user with old Bangkok default, manual override, location refused; unit test |
| 13 | **Cambodia, stage 1** (see below). | unit + browser |

## Test results (12 Nov 2026)

- Unit tests (`node tests/unit.js`): **66 passed, 0 failed**.
- Browser suite (`PORT=8766 node tests/smoke.js`, 393 px phone, Edge): **88 checks, all passed** (no JavaScript errors).
- Photo timings (`node tests/photos-perf.js`): below.

## Photo report (item 4)

**What changed**
- Lookups are batched: one Wikipedia request and one Wikidata request per screenful of cards, not one or two per card.
- Card pictures are 500 px and the details sheet 960 px: Wikimedia's standard sizes. The old 640 px request was being
  rounded up to 960 px by Wikimedia, so every card downloaded a 960 px picture.
- Wikidata pictures are requested straight from `upload.wikimedia.org` (the address is worked out from the file name, like
  MediaWiki does), which removes two redirects per picture. If that fails (a picture smaller than 500 px), it falls back.
- Only cards on screen (plus 200 px) load; one lookup per place even if it's on two cards; failures (no signal) are retried
  later rather than remembered as "no photo"; cards keep a fixed photo box, so nothing jumps when a picture arrives.
- **No Buddha imagery**: temple photos were never filtered. Wikimedia's pictures for "Big Buddha" (Samui, Phuket) are a
  Buddha statue, and 1,409 Thai and 31 Cambodian temples from OpenStreetMap had photo links. Now temples get no photo (not
  Google's either) unless that exact picture was looked at and listed in `PHOTO_CHECKED`; any picture whose file name
  mentions a Buddha, monks or a pagoda is skipped. 18 temple pictures were checked by eye and allowed (architecture only);
  Big Buddha ×3, Grand Palace (picture is Wat Phra Kaew), Wat Plai Laem, Wat Chalong, White Temple, Wat Ratchaburana,
  Wat Si Chum and Khao Takiab stay without a photo.
- 44 researched places got a Wikidata link after checking each match is the place itself (146 candidates found near the
  places; hostels matched to their town's photo and look-alike names were rejected).

**Timings: cold start, phone size, real network** (first screen shows 1–2 cards)

| List | Before | After |
|---|---|---|
| Bangkok activities | first photo 926 ms, 960 px pictures, 505 kB | **738 ms, 500 px, 4 requests, 250 kB** |
| Ubud activities | 1,526 ms, 960 px, 639 kB | **740 ms, 500 px, 4 requests, 196 kB** |
| Bangkok munch | no photos | no photos (none exist for free, see below) |
| Palembang gaffs | no photos | no photos |

No failed requests in either run.

**Coverage: researched places with a free photo** (shown / of all; "held" = temple link not shown)

| Country | Gaffs | Munch | Activities |
|---|---|---|---|
| Thailand | 1 / 135 | 5 / 84 | 54 / 142 (was 41; 11 held) |
| Indonesia | 0 / 103 | 0 / 69 | 39 / 84 (was 20) |
| Cambodia | 0 / 4 | 0 / 2 | 3 / 3 |

**Coverage: OpenStreetMap places with a photo link**

| Country | Stay | Food | Do | Essentials | Transport |
|---|---|---|---|---|---|
| Thailand | 0.4 % of 18,000 | 0.1 % of 34,000 | 2.9 % of 30,400 (+1,409 temples held) | 0.5 % | 21.9 % |
| Indonesia | 0.2 % of 7,100 | 0.0 % of 10,800 | 8.2 % of 5,500 | 0.4 % | 28.6 % |
| Cambodia | 0.3 % of 2,800 | 0.1 % of 4,500 | 2.4 % of 3,800 (+31 held) | 0.4 % | 4.6 % |

**Provider limits (unresolved)**
- Hostels, restaurants and food stalls almost never have free photos (Wikipedia, Wikidata and OpenStreetMap cover
  landmarks, not businesses). The only source that covers them is Google Places photos, which needs Dylan's API key and a
  billing account; the app already uses it when a key is set (capped at 40 photos a phone a day). Without a key, those cards
  keep their illustration. Nothing was scraped, and no town photo is used as if it showed a business.
- Wikidata rate-limits per-place searches (it answered "too many requests" during matching), so matching was done with
  one area-wide query per destination. The app itself only sends batched requests.
- Google's photos of temples are never shown (nobody can check them).

## Cambodia (item 13): stage 1 done, not "fully supported" yet

**Done and tested**
- Places database for the whole country: 16,540 places in all 25 provinces, islands included (`places/kh/`, OpenStreetMap
  of 11 Nov 2026). A stay, food and something to do within 1 km of each of Phnom Penh, Siem Reap, Kampot, Kep, Battambang,
  Sihanoukville, Koh Rong and Koh Rong Sanloem (browser test); 758 food places on the map in central Phnom Penh.
- The app switches to Cambodia from the phone's location; 13 destinations (Discover "Explore Cambodia", map search).
- Prices in US dollars with pounds alongside, estimates only for kinds 2026 cost guides cover (dorm $5–10, guesthouse
  $10–25, street food $1–4, local restaurant $3–10, local beer $1–2); everything else shows no price rather than a guess.
  No chain prices. Custom price filter in dollars.
- Cambodia guide (GOV.UK travel advice, incl. the 20 km Thai-border warning, e-visa / visa on arrival, e-Arrival card,
  landmines, bag snatching, methanol, boats, job scams), emergency numbers (police 117, fire 118, ambulance 119, Phnom Penh
  tourist police) and the British Embassy in Phnom Penh; Khmer phrasebook (Wikivoyage); riel/dollar converter; ride tips.

**Remaining**
- Researched layer: hand-checked gaffs, munch spots and activities with sources (only 9 researched places so far).
- Journey planner network: Cambodia has no hubs or legs yet. Trips inside Cambodia say "outside the saved network" and
  offer Rome2Rio; short hops get a taxi estimate; the older saved routes (e.g. Bangkok to Siem Reap bus) still show.
- One destination photo per Cambodian destination (`img/dest-*.jpg`).

## Known limitations

- Heading arrow and compass need a real phone to check.
- Camera translator is off (would need paid Google Cloud Vision).
- Photos of businesses need a Google key (see above).

## Running the development version

```bash
npm install                   # once
node tests/serve.js           # then open http://localhost:8765 (phone size: browser dev tools, 393 px wide)
npm test                      # unit tests, then the browser run
PORT=8766 npm run test:smoke  # if 8765 is busy
node tests/photos-perf.js     # photo timings (needs signal)
```

## 13 Nov 2026: polish and surf (branch `claude/polish-and-surf`)

- Price filter: one box the size of the price buttons for your own amount in pounds (no "Custom" box, currency menu or Set button).
- Distance filter: a slider from 1 to 50 km, then 50+ (any distance), on Gaffs, Munch and Activities.
- Removed: the long price explanation in Filters and under the lists; the place count beside Map / List on the map.
- Stars sit directly under the name on cards, wherever a rating is known (researched places; nothing is invented).
- Each list opens on a card that has a photo; the rest keep their order.
- The page can no longer be double-tapped or pinched to zoom (the map still pinches).
- Surf: a Surf chip in Activities; 18 surf spots and 17 schools/shops from OpenStreetMap (also on the map); live wave height,
  period and wind from Open-Meteo on surf cards and on every beach's details; an "Open on Surfline" button.
  Surfline offers no data to other apps, so its ratings and spot list are not copied. The Surfline link could not be
  checked from here (Surfline blocks automated visits).
- Tests: unit 71 passed; browser suite 98 passed.
