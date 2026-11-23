# Improvements pass (started 23 Nov 2026, before flying on 26 Nov)

A running log: what was checked, what was found, what changed, what was skipped and why.
Anything users can see that changed is an **experiment** (off by default, Tools › Developer › Experiments).
Pure bug fixes and invisible fixes are not.

## Phase 1: audit

### How it was checked
- `node tests/audit.js`: a 393 x 852 phone visits every tab and every Tools page (24 screens) with the pretend location in
  **Bangkok**, **Koh Phangan** and **Siem Reap**, and reports JavaScript errors, anything wider than the screen, tap targets under
  32 px, icon buttons with no label, empty links and broken pictures.
- `node tests/audit-offline.js`: first load on slow 4G (1.6 Mbit/s, 150 ms), memory with central Bangkok loaded, scrolling a long
  list, then Bangkok saved for offline and every tab opened in airplane mode.
- Facts on the route re-checked against gov.uk (its content API, fetched 23 Nov 2026): entry rules and emergency numbers for
  Thailand, Cambodia and Vietnam.
- Firebase rules (`firebase/database.rules.json`) read line by line.

### What was found
| # | Finding | How bad on the trip | Done |
|---|---|---|---|
| 1 | No JavaScript errors on any of the 72 screen visits, and nothing makes the page scroll sideways. | Good news | – |
| 2 | Settings › Testing: the "Pretend I'm in" menu stuck out 11 px past the screen edge (its padding was added on top of its width). | Small | Fixed (all `.field` menus and boxes now size with their padding included) |
| 3 | Chips that run past the screen edge (Munch, Activities, Translator, Emergency) are in rows that scroll sideways on purpose. | None | Audit taught to skip them |
| 4 | Small tap targets: only links inside sentences (sources, credits), which the accessibility guidelines exempt. Every button and icon is 32 px or more, and every icon button has a VoiceOver label. | None | – |
| 5 | Offline: after saving Bangkok, all 18 tabs and Tools pages open in airplane mode with no errors and nothing blank. Lists come from the saved city; pages that need signal (weather, translator, Friends, currency rates) say so. | Good news | – |
| 6 | Speed: on slow 4G the map is ready in about 5.5 s, with about 830 KB downloaded (GitHub Pages compresses the files; the test server now does the same so the numbers match). Memory with central Bangkok loaded is about 51 MB; scrolling the Munch list is smooth (20 steps in 0.3 s). | Fine | Test server compresses like the live site |
| 7 | Facts: Thailand visa-free stay 30 days (since 15 Sep 2026), digital arrival card (TDAC) within 3 days before arriving, emergency 191 / 1155 / 1669 / 199. Cambodia: visa needed, 30 days, e-visa at least 4 days ahead, 117 / 118 / 119. Vietnam: visa-free 45 days, 113 / 114 / 115 / 112. **All match what the app says.** | – | "Checked" dates for Thailand and Cambodia moved to 23 Nov 2026 |
| 8 | The map's base streets and the Wikimedia photos can't be reached from the test machine, so they weren't part of the speed or offline check. | – | Note only |

### Firebase rules: what's protected, and the risks
Protected properly: your location (`loc`) is readable only by the friends you switched "Sees you" on for; phone numbers (`phones`)
only by the friends you allow; messages, SOS alerts, invites and friend requests only by the person they're addressed to; live split
groups only by their members; the Google key only by developers and the friends a developer switched on; usage counts only by developers.

Risks, smallest first:
1. **Anyone with the app can sign in** (anonymous sign-in is how it works). Someone who somehow learned a person's private ID could
   send them a message, an invite, a friend request or a fake "I'm lost" alert. They can't read anything back. IDs are never shown
   in the app; friend codes are 6 random characters (about a billion possibilities).
2. **Message and alert sizes aren't capped**, so a malicious app user could write large junk into someone's inbox. Low risk with
   six mates; worth a size limit if the app goes public.
3. **Developers can make other developers**, and every developer can delete split groups, set everyone's photo, share the Google key
   and read usage. Phase 2 ties deleting groups to your phone only.
4. **No rate limits**: on the free plan, someone could fill the database. Firebase's free-plan limits stop the bill at £0 (the
   project has no card), so the worst case is the app's Friends features stop until the next month.

## Phase 2: split costs and alerts

### 1. Only Dylan's phone deletes split groups (done, not an experiment: a permissions fix)
Before: the Delete button showed on any developer phone, and the rules let any developer delete a group or take someone out.
Now there's an **owner** (`owner/` in Firebase): a developer phone claims it once (Tools › Developer › Owner), and from then on the
rules only let the owner delete a group's name or take people out, which is what deleting a group needs. The button shows only on the
owner's phone. Adding people, adding and deleting payments and everything else in Split costs are unchanged.
**Dylan must re-publish the rules and claim owner on his phone** (FIREBASE-SETUP.md).

### 2. Notifications when the app is closed: not done yet
Needs a Cloudflare Worker that signs and encrypts Web Push messages, a push handler in the service worker, a subscribe step on
each phone and PUSH-SETUP.md for Dylan's accounts and keys. It can't be tried end to end from here (no iPhone, no Cloudflare
account), and a half-built version would be worse than none. Left for a phase of its own.

### 3. Calmer zoomed-out map: not done yet
One bubble per destination means replacing the per-category clusters at low zoom with a single layer; it touches the busiest code in
the app (`refreshMapData`), so it was left rather than rushed before the flight.

## Phase 3: transport

### Route check (`node tests/audit-route.js`)
Every leg of the route and every pair of neighbouring stops was run through the planner. Found:
| Finding | Done |
|---|---|
| **Detours through another country**: Bangkok → Pai via a flight to Luang Prabang (Laos); Siem Reap → Phnom Penh via Bangkok; Phnom Penh → Saigon via Singapore. | Fixed (bug fix): a trip inside one country stays in it; a trip between two countries only goes through a third if that's quicker than every way that doesn't |
| **The long way round**: Bangkok → Pai via Phuket (5 h slower, an extra unpriced flight). | Fixed: a journey goes if another is at least 30% quicker, no dearer, with no more legs and no more unpriced legs. Cheaper slow options (the Bangkok → Chiang Mai bus, bus + minivan to Pai) stay |
| **Koh Tao → Koh Phangan direct ferry has no saved price**, so Fastest shows "check live". | Not fixed: needs a sourced fare (Lomprayah / Seatran); 12Go and Rome2Rio can't be read from the test machine |
| **Ho Chi Minh City → Hoi An → Hanoi only offers unpriced flights**; the Reunification Express trains (the classic way, overnight) aren't in the network. | Not fixed: needs Vietnam Railways or 12Go timetables and fares, which can't be read from here. Top of the list for a session that can reach them |
| **No land crossing Thailand ↔ Cambodia in the planner**: matches the FCDO advice against travel within 20 km of that border; the Cambodia guide already says so. | – |
| Fastest / Cheapest badges on the route: all correct after the fixes above. | – |

### Built as experiments (all off; Tools › Developer › Experiments)
- **tp-group**: with 2+ people chosen, journeys show the group total and the price each, in local money and pounds.
- **tp-saved**: save a journey from its sheet (kept whole on the phone, so it opens offline) and pin one as "our next journey" at the top of Transport.
- **tp-border**: overland legs into another country get a card from gov.uk: the visa to sort first, the stamp to check, unofficial fees to watch for (the Thailand–Cambodia land border warning too).
- **tp-sea**: boat legs show the waves forecast for the travel day (Open-Meteo marine, free), described on the WMO sea-state scale, with a warning from "moderate" up.

### Not built, and why
- **4 Departure times, 5 day-of-travel cards, 8 booking pressure, 9 getting around town fares**: each needs sourced timetables,
  pier and office details, sell-out patterns or fares. The sources that have them (12Go, Rome2Rio, operators) can't be read from
  the test machine, and the rules say never to invent them.
- **6 Comfort and overnight**: the network doesn't record departure times or bus class for most legs, so "overnight" and
  "sleeper" can't be told apart honestly yet. Comes with the timetables above.
- **13 Own ideas** (suggested, not built): (a) "Leave by" times on a saved journey, from the planner's journey time plus the
  airport/pier allowance; (b) a "who's booked" tick per person on a saved journey, shared through the live split group, so the
  group knows who still needs a ticket.

## Pass 2, part A: transport data and transport experiments (23 Nov 2026)

This ran in a cloud session (Dylan's PC wasn't connected). 12Go and Rome2Rio still refuse automated visits (their own servers
answer "403"), so the facts come from Seat 61, SiamTickets (which publishes Lomprayah, Seatran, Songserm, Andaman Wave Master,
Prem Pracha and Nakhonchai Air timetables and fares), AirAsia's own route pages, Vietnam Airlines' route pages and Wikivoyage.
Vietjet's and Bangkok Airways' pages only work in a full browser, so nothing was taken from them.

### Route check, before → after (`node tests/audit-route.js`)
| Leg | Before | After |
|---|---|---|
| Koh Tao → Koh Phangan | direct boat had no price ("check live") | **450–600 baht** (Lomprayah catamaran 600, Laemsor ferry 450, Songserm 500), Mae Haad → Thong Sala |
| Ho Chi Minh City → Hoi An | flight with no price | flight **from 817,000 dong** (Vietnam Airlines); with tp-overnight on, the **Reunification Express** night train too (661,000–1,274,000 dong, Seat 61) |
| Hoi An → Hanoi | flight with no price | flight **849,000–968,000 dong**; with tp-overnight on, the night train (567,000–1,137,000 dong) |
| Koh Samui / Krabi → Ao Nang | taxi with no price | **white songthaew 60 baht** (80 after 6 pm), Krabi Town ↔ Ao Nang |
| Chiang Mai → Phuket | no price | **4,086–9,000 baht** (AirAsia, December) |
| Bangkok → Phnom Penh, Saigon, Hanoi, Da Nang, Luang Prabang, Vientiane, Singapore, Phu Quoc; Chiang Mai → Luang Prabang | no price | AirAsia's lowest fare each day in Dec 2026–Jan 2027 |
| Ho Chi Minh City → Hanoi | no price | 888,000–1,610,000 dong (Vietnam Airlines) |
| Bangkok → Siem Reap | no price | **still "check live"**: AirAsia doesn't fly it and Bangkok Airways' page can't be read here |

Saved timetables (for tp-times) now exist for: Bangkok ⇄ Chiang Mai trains (Seat 61) and Nakhonchai Air buses, Chiang Mai → Pai
minivans, Koh Tao → Koh Phangan, Koh Phangan → Koh Samui, Koh Phangan → Ao Nang, Krabi → Koh Phi Phi, Koh Phi Phi → Phuket, and
the Reunification Express both ways (Saigon ⇄ Da Nang ⇄ Hanoi). Scripts: `tools/transport-asia.js` (Vietnam trains, flight fares)
then `tools/transport-route.js` (the Thai route), both re-runnable.

### New experiments (all off)
- **tp-times**: legs with a saved timetable show today's next departures and the last one (local time where the leg starts),
  or every departure on a chosen date. Always labelled a saved timetable, not live.
- **tp-day**: an "On the day" card per leg: the pier or station, where it arrives, how early to be there, luggage limit, tips.
- **tp-overnight**: night trains and sleeper buses are offered even when flying is quicker, marked "saves a night's gaff, about £X"
  (the middle price of our researched hostels where it leaves from), and that saving counts towards Cheapest. Bangkok → Chiang Mai
  keeps the flight and adds the sleeper train; Saigon → Hoi An adds the Reunification Express, which becomes Cheapest.
- **tp-book**: "When to book": Koh Phangan boats within 3 days of a Full Moon Party (24 Dec, 31 Dec, 22 Jan), Thai trains at New
  Year (book the day booking opens, up to 6 months ahead), Thai 1st-class sleepers, and Vietnamese train booking (60 days ahead;
  Tet). A "Book ahead" tag on the journey card. The sources give no number of days for the ferries, so it says "as soon as you know".
- **tp-town**: "Getting around <town>" on Transport for the 15 stops on our route (BTS/MRT, river boats, songthaews, taxis,
  scooters, tuk-tuks, with Wikivoyage's fares), and a button that copies the destination for Grab or Bolt. Neither app publishes
  a link that fills in a destination, so copying is the honest version.

### Not done in part A, and why
- Bangkok → Siem Reap fare (above). Cambodian bus departure times: Seat 61's Cambodia page doesn't list them cleanly.
- Booking pressure around Christmas for flights and ferries: no source gives a number of days, so nothing was added.

## Pass 2, part B: life on the road (23 Nov 2026)

All in `js/road.js` (loaded after `js/detail.js`), every part an experiment, off by default. Facts are from each town's
Wikivoyage page (read 23 Nov 2026), Seat 61, AirAsia's Full Moon Party guide and gov.uk, named next to each one.

| Switch | What it does |
|---|---|
| **fair-price** | Tools › Fair price: type or say "tuk-tuk 3 km", "beer in a bar", "massage", "scooter a day", "laundry", "street food" and get the usual price where you are, with its source. Taxi and tuk-tuk fares reuse the existing estimates (Bangkok meter, Cambodian app fares), marked est. Where no source gives a price (a massage in Vietnam, say) it says so instead of guessing. |
| **headsup** | Tools › Heads-ups: the known scams at each stop on our route, the one you're in first: the gem scam and "it's closed today" (Bangkok, Chiang Mai), scooter "damage" (Koh Tao), jet-ski "damage" (Phuket), fake and torn dollars (Siem Reap), bag snatching and fake monks (Phnom Penh), taxi meters (Hanoi). |
| **events** | Tools › Events: Father's Day in Bangkok (5 Dec), Full Moon Parties (24 Dec, 31 Dec countdown, 22 Jan, 22 Feb), Bangkok's New Year fireworks, Hoi An's motorbike-free full-moon nights, and Tết's window. Moving dates say "check before you go"; past ones are greyed. |
| **arrival** | The first real GPS fix in a new stop opens "Welcome to <town>": the ways in from the airport with their saved prices, getting around, a fair 5 km fare, the nearest ATM, SIM shop and 7-Eleven (from the map data) and the local heads-ups. Once per stop. |
| **journal** | "Mark as been here" on every place; Tools › Trip journal: a map of the stops reached (in order) and the places been, and **Trip wrapped**: km between stops (as the crow flies), countries, stops, places, nights (each date the app saw you on the road) and the top three game winners from the Trip tally. Stops are only recorded from real GPS, never the pretend location. |

### Item 19: our own three ideas (suggested here first, then built)
1. **Leave by** (switch `leave-by`): on a journey whose first boat, train or bus has a saved timetable, "Leave by 08:55 to make the
   09:30": the next departure, minus how early the operator asks you to be there, minus the ride there from where you are
   (worked out at 25 km/h, marked est.). The thing everyone asks the morning of a travel day.
2. **Visa countdown** (switch `visa-count`): Tools › Visa countdown: days left in Thailand (30), Cambodia (30, e-visa) and Vietnam
   (45) from the day you arrived (noted from the first GPS fix in the country; editable, and it says the passport stamp is the
   one that counts). Overstaying costs a fine every day, and six people lose track.
3. **Meet-up spot** (switch `meetup`): Friends › Meet up sends every friend "meet at 20:00, outside the 7-Eleven" with the spot;
   it pops up on their phones like a sticker, with Directions. Uses the existing message rules: nothing to re-publish.

### Not done in part B
- Fair prices for SIM cards in Thailand and Vietnam, massages in Vietnam, laundry in Vietnam: the pages read didn't give one.
- Heads-ups for Pai, Ao Nang, Koh Phi Phi, Ho Chi Minh City, Da Nang and Hoi An: Wikivoyage's "Stay safe" sections for those
  either had no scam or couldn't be fetched (Wikivoyage rate-limited the session for Koh Phi Phi and Ho Chi Minh City).
