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
- **Experiments** (Dylan, 22 Nov 2026): changes to try on a developer phone, each behind its own switch in Tools › Developer ›
  Experiments, **off for everyone by default**; with a switch off the app must behave exactly as before. `exp(id)` (core.js) reads
  localStorage `sea-exp-v1` (`{"*":true}` = all on, used by the test run); each experiment adds itself to `EXPERIMENTS` next to its
  code and gets an `x-<id>` class on `<html>`. Still switches: **tools-groups, detail-buttons, tp-group, tp-saved, tp-border, tp-sea,
  tp-times, tp-day, tp-overnight, tp-book, tp-town, map-calm, late-open, fair-price, headsup, events, arrival, journal,
  leave-by, visa-count, meetup** (IMPROVEMENTS.md says what each does). Adopted for everyone on 23 Nov 2026
  (`EXP_ADOPTED`, `exp()` returns true; their old "off" code was removed the same day, the ids stay for the CSS classes): tp-fastest, tp-legnames,
  en-towns, lost-share, statusfade, map-onerow, help-btn, plan-here, gaff-dates, notes-once (`explain(key, html)`), slim-cards, daylight
  (`S.dayLook`, `lookPaper()`), route-save, driver-card, and **push** (Dylan asked for I'm lost to reach closed apps; adopted the
  same evening, its old "off" code is still in `js/road.js`). Never make one the default unless Dylan says so; to adopt one, add it to `EXP_ADOPTED`.
- The map keeps the summary counts for any tile whose places are still downloading (`waiting` in `refreshMapData`), so zooming in past
  the counts-to-places switch on slow signal never leaves an empty patch. Voice search (`listen` in js/ask.js) searches after 1.4 s of quiet.
- Transport extras (experiments): tp-group (`groupLine`), tp-saved (`S.savedTrips`, the whole sheet kept for offline), tp-border
  (`BORDER_IN`, gov.uk only), tp-sea (`seaFor`, Open-Meteo marine, WMO sea states). The planner drops detours through a third country
  and long-way-round trips (`planTrips`). `node tests/audit.js`, `audit-offline.js` and `audit-route.js` are the audits (not in npm test);
  IMPROVEMENTS.md is the running log. Only the **owner** (`owner/` in Firebase: Dylan's phone, claimed once in Tools › Developer) can
  delete a split group or take someone out; the rules enforce it.
- Asking once: every location request goes through `geoLast` (js/shell.js; a fix under 2 minutes old is reused, the map's and
  Friends' GPS watches keep it fresh) and voice search reuses one recogniser (`recOne`). Settings explains the iPhone settings that make it permanent.
- `js/design.js`: the Design Lab (floating panel, palette tab on the left edge). Applies `S.design` as CSS custom
  properties on `<html>` and live map paint. Look codes start `SEALOOK:` (see below).
- `js/places.js`: the places model, OpenStreetMap tiles, opening hours, Thai romaniser (`thaiRom`), chips.
- `js/estimate.js`: food types and typical-price **estimates** (`foodType`, `estPrice`, `priceBand`), known ratings.
  OpenStreetMap has no ratings and only researched hostels do, so the map filters on price, not stars.
- `js/shell.js`: tabs, routing, sheets, location. `js/lists.js`: place cards and the Gaffs/Munch/Activities pages. Their Filters have
  "Measured from" (`distFromField`): the distance is from where you are or any trip destination (it sets the same `S.focus` as the place button).
  Rows that scroll sideways (`.scroller`, `.map-chips`, the price rows) never scroll up and down (`overflow-y:hidden`).
  With a maximum price set, places with no saved price aren't hidden: they come after the ones that fit, under "No saved price"
  (`listItems.fit`). Reviews is a 1-5 star slider (`st.minR`), shared with the map's star chips; `rate5` uses researched ratings, else
  Google ratings the phone has seen. Every list sorts by Recommended, Nearest, Cheapest, Priciest, Best reviewed. Where are you looking? and
  Measured from have a type-a-town box (`townMatches`, `bindTownBox`: trip towns offline, OpenStreetMap search with signal).
- `js/map.js`: the MapLibre map, per-category clusters, the filter row (price, or transport type). The app opens on the map with
  nothing selected (`ui.mapCats` starts empty; Dylan, 23 Nov 2026). The statusfade fade is on the map only and stops above the search bar.
- Surf: `D.surf` (hand-researched surf breaks with sources and photos in `img/surf/`, written by `node tools/surf-spots.js`) becomes
  `SURF` in `js/places.js`. Activities › Surf opens the map in surf mode (`ui.mapSurf`, `openSurfMap`). The wave forecast (`surfNow`,
  Open-Meteo, free) and the Surfline button are in `js/tools-more.js`. Surfline has no open data: never scrape it. No schools or shops.
- `js/friends.js`: Tools › Friends: friends list, friends on the main map (only while the map's Friends chip is on: `ui.mapFriends === true`,
  off on every start), live split (embedded `splitSectionHTML`), sticker messages (`msgs/`: a "Sam sent you a message" popup on any
  screen, `frMsgPopup`; Open shows the sticker and its name, then deletes it). `boot.js` starts `frLoop`, so messages and game invites
  pop up wherever you are. Firebase REST (anonymous sign-in + Realtime Database, free Spark plan); live data via `frListen` (event stream,
  polling fallback).
  Sharing uses its own GPS watch (`frHere`), never the pretend test location. Developer phone (7 taps on Settings › About the data,
  then claim; `admins/`) is the only one that can set friends' photos (`photos/`, small JPEGs).
  A phone a developer switches on in Tools › Developer (`admins/{uid}`) gets the Developer tool by itself (`frDevSync` in `frPoll`;
  `S.devGranted` makes it flip once each way, so ELITE POTATO still hides it).
  Typing ELITE POTATO in the map search sets `S.dev`: Tools › Developer (last tool) has the Design Lab switch, stickers (add, rename,
  delete), who is a developer, and everyone's photos. The Design Lab is only ever shown on developer phones. Anyone can give a friend
  their own name and photo with the pencil (kept on the phone, `S.friends.list[uid].pic`).
  Dylan adds `window.SEA_FIREBASE = {apiKey, databaseURL}` to `config.js` himself (FIREBASE-SETUP.md); rules in `firebase/database.rules.json`
  (keep them and `tests/fakefirebase.js` in step; when they change, tell Dylan to re-publish them). Sharing is off until switched on, per friend; only real GPS is sent, only while open.
- `js/games.js`: Friends › Play (`TOOL_PAGES["friends-play"]`): Four in a row, Sink the fleet, Liar's dice, Guess the price (researched
  prices only, never estimates or GBP) and Where in the world (`DEST_IMG` photos). A game is `parties/{pid}` `{g,h,m:{uid:name},j,k,s}`
  (members only); invites `invites/{uid}/{from}` `{g,n,t,p}` (`gmInvited`/`openParty`); Trip tally `tally/{uid}` `{game:{w,p}}`
  (each finished game against someone counts once per phone; the loser's forfeit is kept on the phone). Turn games are written only by
  the player whose turn it is; Play again writes the new game and its number together (PATCH) so nothing is counted twice.
  Each game shows its rules the first time (`gm-seen`), and from the ? button. A game fills the screen (`gmLockSheet`); leaving takes the X
  then Leave (`gmAskLeave`); messages and invites wait until you leave (`gmHold`/`gmAfter`; I'm lost still pops up). Sink the fleet: drag a
  boat to move it, tap to turn it (`sfMove`, `sfRotate`, `sfPlace`), drawn in CSS (`sfPart`), developers get a peek button. Guess the price
  only uses rounds with a photo (`gpPhoto`; journeys show the destination's photo and the distance) and keeps a half-typed guess across
  redraws; every photo is loaded at the start (`gmPreload`). "Where in SEA". The Trip tally is for the people in a split-costs group,
  with the group's shared forfeit (`groups/{gid}/ff`).
- Activities on the map open a row of sections like Essentials (`ui.doKinds`, `CHIPS.cool` with `kinds`), including **Boozas** (id `boozer`, no explainer toast): bars,
  pubs, clubs and bottle shops (kind `liquor`, added to built folders by `node tools/osm/add-booze.js`; extract.py keeps them now).
- `js/funny.js`: funny mode (Settings › Funny mode, `S.funny`, off by default; nothing runs while it's off). Munch slides `img/tom-fried.jpg` across (no box, big text),
  Nightlife `img/tom-aid-ping.png` with a half-second two-tone alarm (Web Audio, `funnyAlarm`) and flashing yellow exclamation marks. On start `media/tommy.mp4`
  plays full screen (blob URL, inline, with sound if allowed, else muted), then fades away; it also plays when the app comes back after 10+ minutes away
  (iPhones often resume rather than restart). `media/` is kept in its own cache (`sea-trip-media-v1` in sw.js) so updates don't throw the video away. Tapping China on the main map
  (`funnyMapTap`, called from the map's click handler; GEO's China, which stops at 30°N, plus a coarse Natural Earth outline north of that) plays
  `media/chinese.mp3`. Opening Tools › Friends makes Ben wave: `img/ben-wave.png`, a 16-frame see-through strip cut from
  `media/ben-wave.mp4` by `python3 tools/ben-sprite.py` (flood-fills the black from the edges, so his navy jumper stays), animated with CSS `steps()`.
- `js/split.js`: Tools › Split costs: "On this phone" (`S.split`, shared by link) or a live group with friends (bottom of
  `js/friends.js`: `groups/{gid}` in Firebase, members only; last copy kept on the phone for no signal). The page works from a "model".
  The tally shows first; the payment form opens from **Add a payment**. Only the developer phone (`admins/`) can delete a live group or
  take someone out of it (members can still add people); the rules enforce it.
- Friends also has **I'm lost** (`frSosSend`): an alert on every friend's phone (`sos/{to}/{from}`, popup on any screen) with your spot,
  a Call button (your number in `phones/{uid}`, readable only by the friends in `pallow/{uid}`) and your WhatsApp/FaceTime group call link.
  A web app can't ring several phones at once. Photos of friends are cropped by hand first (`frCropPhoto`).
- Tools › Developer also shares the developer phone's Google key with friends they switch on (`gkey`, `gkeyok/{uid}`, `gkeyask/{uid}`;
  `googleKey()` falls back to it) and shows what's used by whom (`stats/{uid}`, counts only: Google photos/lookups/camera, pages opened), for Today, Last 7 days,
  Last month or All time (`STAT_PERIODS`; Firebase keeps every day).
- Photos load from `places/photos.json` (each place's Commons file, built by `node tools/photo-index.js`, then `node tools/photo-geo.js`,
  which adds places OpenStreetMap doesn't link but whose Wikidata item has the same name at the same spot): no lookup on the phone.
  Re-run both after rebuilding any `places/` folder. **A place shows its own photo or none** (Dylan, 19 Nov 2026): the typical
  photos of each kind (`img/kind/`, `KIND_PHOTO`) are switched off with `SHOW_TYPICAL = false` in `js/detail.js`. A card or sheet photo
  that won't load moves on (Google › free photo › the drawing, `photoAfterFail`); Google gets 8 s per card. Place field `ph` is a phone number; a stored photo is `pic`.
- `js/ask.js`: questions in the map search, typed or spoken ("nearest toilet", "cheap noodles near me"): rule-based, no AI.
  "Top 5 temples", "cheapest 3 hostels", "worst 3 bars in Pai", "10 most expensive restaurants" (`parseTopN`, `rankTop`, `goTop`): any number
  (max 25), ranking word and kind of place, optionally "in <destination>"; the answer goes on the map as numbered pins only (`ui.mapPick`,
  source `pick`, strip `pickBar` at the bottom), and a place's details sheet gets Back to all N / previous / next (`pickNavHTML`). Any map chip clears it.
  "Worst" ranks only rated places; cheapest/most expensive use the researched price, else the estimate.
  `js/ask-more.js`: what a tuk-tuk/taxi should cost (`fareEstimates`, est. from the Bangkok meter and researched app fares), how long, how far,
  and "I'm hungover / got the shits" (`REMEDIES` per country, with sources; also the guide's "Hangover and the shits" section).
- `js/transport.js`: journey planner over `D.net` (Thailand, Cambodia, Vietnam, Laos, Singapore, Malaysia and Indonesia; the newer
  countries come from `node tools/transport-asia.js` and `node tools/transport-my-id.js` (Malaysia, Java, Sumatra, Flores, Sulawesi,
  Kalimantan, Raja Ampat), re-runnable, sources per link (Seat 61, Wikivoyage); legs whose source gives no time are `verified:false`). Nothing is worked
  out until **Search** is pressed; a journey opens in a sheet with every leg and a map (each leg its own colour, numbered stops, mode icons);
  flight legs link to Google Flights on the chosen date. When a country is added to the map, research its transport too. Its map
  names the `D.cities` that aren't stops (`city-name` layer) and the stops from zoom 4.6.
  Totals show in the money of the country a journey starts in. `node tools/transport-fares.js` (re-runnable, fills gaps only, never
  overwrites a saved price) priced 53 more legs on 23 Nov 2026 from Lomprayah's booking API, Baolau (operator fares), Seat 61, Wikivoyage,
  BusOnlineTicket and Kiwi.com, and added Lomprayah's Bangkok/Hua Hin to Gulf-island bus-and-boat tickets. Kiwi flight fares
  (`tools/transport-fares-kiwi.json`) are the lowest one-way seen, so those edges have `from:true` and a journey with one shows
  "from £x" (`t.low` in `tripPrice`), never a range. `js/tools.js`: Tools hub, currency, translator, Settings.
- `js/camera.js`: camera translator. `js/tools-more.js`: budget, weather, Wi-Fi, guide, emergency, assistant, deals.
- `js/offline.js`: Tools › Offline & backup (city packs, backup/restore). Packs can include up to 150 free Wikimedia Commons
  landmark photos per city (500 px, credits kept); cards and the details sheet use them first (`PACK_PHOTOS`). Never store Google photos.
- `js/docs.js`: Tools › Documents. Tickets are named kind · person · route (`docKind`, `docPerson`; old ones renamed once by `docsUpgrade`, never a name the user typed) and transport documents are grouped per journey (`docTrips`). There is no top fade anywhere any more (statusfade removed 25 Nov 2026; status bar style "black"). iOS 26 blurs content under the clock itself; Dylan chose to leave that (25 Nov 2026).
- `js/trips.js`: Tools › Trips (Dylan, 23 Nov 2026): Start a trip / End trip records the phone's own GPS while the app is open
  (`trkKeep`: 40 m or 10 min; stretches with the app closed are dashed, `trkSegments`); after it, photos picked from the library go
  on the trip's map by their own EXIF location, else by the route's position at the time they were taken (`exifRead`, `trkPlace`),
  with a Photos switch (`S.tripPhotos`). Everything in IndexedDB `sea-trip-trips`, on the phone only. `S.tripOn` = the trip recording.
  Share live (Dylan, 25 Nov 2026): `tripl/{uid}` {n,s,e,p,t} readable only by friends in `tripok/{uid}` (`trkSendLive`, every 45 s while recording; `trkShareSheet` also sends a WhatsApp link `#tools/trips?f=<uid>`); friends see it under Friends' trips (`trkFriendPage`). Firebase may return a list as an object, so read lists with `Object.values`.
  Different from the journal experiment in js/road.js (places marked "Been here").
- `js/road.js` (after detail.js): life on the road, all experiments: Tools › Fair price (`FAIR`, `fairAnswer`), Heads-ups (`HEADSUP`,
  scams per route stop), Events (`EVENTS`, Full Moon Parties from `FULL_MOONS`), Trip journal (`S.been`, `S.visits`, `wrapped()`),
  Visa countdown (`VISA_DAYS`, `S.entered`); the arrival card (`openArrival`, once per stop, `S.arrived`); Leave by on a journey;
  Friends › Meet up (`meetSend`, a `msgs/` entry with `s:"meet"` and `m`) and Notifications (`pushOn`, `pushNotify`). `boot.js`
  runs `roadTick` every 30 s (real GPS only). Facts come from Wikivoyage town pages, Seat 61, AirAsia and gov.uk, named in place.
- Notifications with the app closed: `push/worker.js` (a free Cloudflare Worker: Web Push, RFC 8291/8292, WebCrypto only) reads
  `push/{uid}` with the sender's own Firebase token, so the rules (`push`, `pushok`) decide who may notify whom; `sw.js` shows them.
  Needs `window.SEA_PUSH = {url, key}` in config.js: Dylan's steps are in PUSH-SETUP.md. Tested in `tests/push.js` (run by unit.js).
- Transport timetables: an edge's `dep` is `{fromHub: [[leaves, arrives, +days, service]]}` with `depSrc`, and `day` is
  `{fromHub: {at, to, early, bag, tips, src}}`; `night:true` marks sleeper options (tp-overnight). Thai route facts are written by
  `node tools/transport-route.js` (run after `tools/transport-asia.js`, which re-creates its own links). `TOWN` in js/transport.js
  is getting around each route stop (Wikivoyage).
- `js/detail.js`: photos and the place details sheet, Google helpers (`googleKey`, daily allowance `G_DAILY`). Temples get no photo
  unless that exact picture was checked by eye (`PHOTO_CHECKED`); file names mentioning a Buddha are skipped. `js/boot.js`: starts the app.
- `css/app.css`: tokens in `:root`, Paper Atlas overrides under `:root[data-look="paper"]`, Design Lab knobs
  (`--ts` text size, `--chip`, `--pad`, `--card-gap`, `--card-ar`, radii).
- `sw.js`: service worker. Bump `APP` when files change. The app's own `js/`, `css/` and `config.js` load
  network-first (so a phone never mixes versions); places and tiles are cached; `sea-trip-packs-v1` holds saved cities and is never trimmed.
- `places/th/`, `places/id/`, `places/my/`, `places/kh/`, `places/vn/`, `places/la/` and `places/sg/` (all of Thailand, Indonesia, Malaysia,
  Cambodia, Vietnam, Laos, Singapore): the places databases, listed in `PLACE_DBS` in `js/places.js` (order matters for points outside
  every outline). Built from OpenStreetMap by `tools/osm/extract.py` (see `tools/osm/README.md`; Indonesia and Malaysia came from
  download.openstreetmap.fr with `--repair-borders`, since cloud sessions can't reach Geofabrik). Malaysia's and Brunei's outlines in
  `GEO` are real borders from `tools/osm/outline.py`; `node tools/destinations-my-id.js` adds their destinations to `D.cities`.
  Luggage lockers and gluten-free (`gf`) were added to the existing folders by `node tools/osm/add-extras.js` (Overpass); extract.py now keeps both.
  Country-specific parts: price tables (`PRICE_TABLES` in `js/estimate.js`), phrasebooks (`js/tools.js`), guide and emergency
  numbers (`js/tools-more.js`; `GUIDES` entries can carry their own `checked` date), destinations (`D.cities`, `DEST_NOTE`, Explore sections
  in `js/places.js`/`js/lists.js`: Indonesia by island group, Malaysia and Malaysian Borneo). The app follows `S.country`.
  Researched gaffs/munch/activities (`D.places`) exist for Thailand, Indonesia's original 17 destinations and a few main cities elsewhere.
  **Wikivoyage researched places** (24 Nov 2026): `node tools/wv-research.js` turns every Sleep/Eat/Drink/See/Do listing on the Wikivoyage
  pages of ~55 cities in Thailand, Cambodia and Vietnam (Bangkok's district pages too) into researched places (`wv:true`, price as written
  in `pt` and parsed into `p`, `hrs`, `ad`, `web`, the listing's photo as `img` → `pic`, never temples), about 2,800, in
  `places/research/{th,kh,vn}.json`, loaded after start (`researchReady`, `addResearch` in js/places.js). A map place with the same name
  within 350 m is the same place and only the researched one shows (`curTwin`). Listings without a position are placed only if exactly
  one OpenStreetMap place nearby has that name. `node tools/photo-near.js` finds a place's own photo on Commons (taken within 250 m, the
  title naming it) → `places/photos-near.json`, merged into photos.json with `--merge`.
- `vendor/`: MapLibre, pdf.js, Tesseract.js (see `vendor/README.md`). `media/`: funny mode's video and sound (not pre-cached; saved on first use).
- `tests/`: `run-all.js` (what `npm test` runs: unit and smoke with experiments off, then again with `SEA_EXP=all`), `unit.js` (logic, in Node), `smoke.js` (phone-size browser run; `EXPON` when all on), `load.js`, `serve.js`, `sweep.js` (not in npm test: taps hundreds of
  cards across every country and reports sheets that don't open, JS errors, photos lost between card and sheet), `check-new.js` (Map button, Boozer, typical photos, journey sheet).

## Rules

- Keep the tab names: **Map, Gaffs, Munch, Activities, Transport, Tools** (Settings behind the cog). Transport opens `#tools/transport`.
- Dylan wants every country to work to the same extent as Thailand. When adding one, do all the steps in `tools/osm/README.md`.
- Prices: local currency first, GBP alongside. **Estimates** are allowed only from the rules in `js/estimate.js`,
  always shown as "est." and never instead of a researched price. Never invent researched prices, hours, ratings or places.
- **No Buddha imagery anywhere** (deliberate choice). No temple drawings in themes either.
- Must work offline after first load, and on a 393 px wide iPhone screen (no sideways scrolling).
- Colour rule: the accent is only for **selected** things and the **one** main button on a screen.
  Category colours (`--stay --food --do --ess --move`) must match between chips, pins and map clusters in every look.
- Google: never add, invent or commit an API key. Dylan adds `config.js` himself on GitHub
  (`window.SEA_GOOGLE_KEY = "…";`). **Never delete or overwrite `config.js`.** Every Google feature must work without a key.
  Spend cap about GBP 25/month (Dylan, 19 Nov 2026; about six phones): cache results, only fetch for cards on screen, minimal fields,
  per-phone daily allowance (`G_DAILY`: photo 30, details 25, vision 15). Google photos are never stored beyond a day or saved offline (Google's terms).
- Documents stay on the phone (IndexedDB) and are read on the phone. Never send them to a server.
- **Standing permission from Dylan (given 17 Nov 2026), for while he's travelling with only his phone:** once a change is done,
  merge it straight into `main` and push, so it goes live, **but only if `npm test` passes in full** (it runs everything twice: experiments off, then all on). Work on a branch first,
  then merge into `main` (don't rewrite `main`'s history). If any test fails and you can't fix it, don't merge: push the branch,
  open a PR and tell Dylan in plain English what's wrong. After merging, tell him it's live and to close and reopen the app twice.
  If he asks to undo a change, revert its commit on `main` (a new commit; never force-push).

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
two phones on a pretend Firebase (friends, messages, live split, and the games played against each other),
funny mode, saving Bangkok for offline and using it with no signal, and that there are no JavaScript errors.
Errors from blocked hosts and the missing `config.js` are ignored.

## How to publish

1. Merge the PR into `main` on GitHub. GitHub Pages redeploys by itself in a minute or two.
2. On the phone, **close the home-screen app fully and reopen it, twice**: the first open downloads the new version, the second shows it.
