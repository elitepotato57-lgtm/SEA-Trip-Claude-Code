# Traveller ideas: what would make this app better on the road

Written by walking through the trip as a backpacker, day by day, and asking "what would I open the app for right now, and does it help?"
"Today" means what the app does as of version 2.2.0. Nothing here is built yet; it is a list of ideas to pick from.

Effort: **S** = an evening, **M** = a day or two, **L** = a week or more.

---

## Day by day

### 1. Landing at BKK at night, no Thai SIM, no baht
- **Today:** Map, saved places, phrasebook, currency converter and guide all work offline once opened at home. Essentials chips find ATMs and SIM shops on the map. Transport tool has the Airport Rail Link.
- **Would help:**
  - An **"Arrival" checklist card** that appears on landing day: TDAC done? Get a SIM in the arrivals hall (which floor, rough price with source), take out cash at an ATM that isn't a currency-exchange booth, the official public-taxi queue (meter plus an airport surcharge and tolls: add the current figures with a source), or the Airport Rail Link if it is still running.
  - **"Show this to the driver" card**: your hostel's name and address in big Thai script, with a map, readable in a dark taxi. Uses the Thai address the app already stores.
  - A **"before you fly" reminder** to open every tab once with Wi-Fi so it is all saved for offline.

### 2. Cash and ATM fees
- **Today:** Currency converter (works offline), guide section on money, ATMs on the map.
- **Would help:**
  - A **fee calculator**: "take out 10,000 baht, fee 220 baht, my bank charges X%" gives the real cost in pounds per withdrawal, and nudges you to take out bigger amounts less often.
  - Tip in the Money guide: always **decline the ATM's own conversion** (choose "without conversion" / pay in baht). Needs a source link.
  - Tag ATMs on the map by bank where OpenStreetMap has the operator (`operator=*`).

### 3. Tuk-tuk and taxi scams
- **Today:** Guide has a "Staying safe" section; transport prices show baht and pounds.
- **Would help:**
  - A **"Fair fare" checker**: pick from/to on the map, the app estimates a metered-taxi fare from distance (with the source of the meter rates), so you know when 400 baht for a tuk-tuk is silly.
  - A short **"Common scams" card** per city ("Grand Palace is closed today", gem shops, jet-ski damage in Phuket), each with a source.
  - Phrasebook quick-row: "Meter, please" / "How much to …?" pinned at the top of the translator.

### 4. Night bus or train to Chiang Mai
- **Today:** Transport tool has routes, times and prices (baht plus pounds) with sources, and a route map.
- **Would help:**
  - **Booking links** next to each route (12Go, the State Railway site) and a "book early, sleeper berths sell out" note on popular routes.
  - **"What to bring" mini-list** for night journeys (jumper for the freezing air-con, eye mask, snacks).
  - **Arrival alarm**: use location to buzz when you are 20 minutes from your stop (works without signal, GPS only). M effort, and iOS limits background location in web apps, so this one would be better in an App Store version.

### 5. Pai (the 762-bend road)
- **Today:** Places on the map, weather tool.
- **Would help:** a motion-sickness note on the minivan route; scooter safety and licence rules (already in the guide) surfaced on the Pai page; offline map download for the whole Pai valley (see "Offline" below).

### 6. Islands (Koh Phangan, Koh Tao, Phi Phi, Krabi)
- **Today:** Ferries in the transport tool, stays and activities on the map.
- **Would help:**
  - **Ferry + bus combined tickets** clearly shown as one journey with total time and price.
  - **Sea conditions** on the weather tool: wave height from Open-Meteo's free Marine API, with a plain warning ("rough: ferries may be cancelled, speedboats feel awful").
  - Mark which islands have **no ATMs or few ATMs** (from OpenStreetMap counts) so you bring cash.

### 7. Full Moon Party
- **Today:** Nothing specific.
- **Would help:**
  - **Party dates** for the trip window (from the official/well-known listings, with source), shown on the Activities tab.
  - A **"party mode" card**: bucket and drink-spiking warnings, keep your phone in a zip bag, meet-up spot pinned on the map for the group, how to get back to your hostel (taxi boats, songthaew prices).
  - Links into the existing Emergency page from that card.

### 8. Getting sick (food poisoning, dengue, a scooter scrape)
- **Today:** Emergency tool with numbers and hospitals; pharmacies on the map.
- **Would help:**
  - **Symptom phrase cards** in the translator ("I have diarrhoea", "I am allergic to penicillin", "I need a doctor who speaks English").
  - Hospitals on the map labelled **private (faster, English, pricier) vs public**, from OSM `operator:type` / `healthcare` tags where present.
  - An **insurance card** in Settings: policy number and emergency phone saved on the phone, one tap to call.

### 9. Losing a phone
- **Today:** The app lives on the phone, so it's gone too. Saved places are only on that phone.
- **Would help:**
  - **Export/import trip data** (saved places, budget, dates) as a file or a QR code a mate can scan. S–M effort, free, no server.
  - A printable **"if I lose my phone" page**: embassy address, Tourist Police 1155, how to block your bank card, your mates' numbers.

### 10. Splitting costs with mates
- **Today:** Budget tool logs your own spending.
- **Would help:**
  - **Split mode**: mark an expense "shared by Dylan, Sam, Jack", it keeps a running "who owes who", settled in pounds or baht. Works offline. M effort.
  - Share the tally by **QR code or a copy-paste link** so nobody needs an account.

### 11. Finding each other
- **Today:** Nothing.
- **Would help:**
  - **"Meet here" share**: drop a pin, share it as a link that opens the app at that point (works through WhatsApp). S effort.
  - Live location sharing between mates needs a server: better to tell people to use WhatsApp/Find My for that and keep this app serverless.

### 12. Visa rules
- **Today:** Guide covers visa-exempt days for British passports and the TDAC, with sources and a "check again before you fly" note.
- **Would help:** a **day counter** in the guide ("you entered on 27 Nov, you must leave or extend by …"), and notes for border runs to Laos/Cambodia/Malaysia if the trip continues there.

### 13. Weather and monsoon
- **Today:** 7-day forecast from Open-Meteo.
- **Would help:** a **"best time" strip** per region (the Gulf islands are rainy Oct–Dec while the Andaman side is drying out: worth a sourced note because it affects the late-November trip); rain-hour bars ("rain 3–5 pm") so you plan around the daily downpour.

### 14. Temples dress code
- **Today:** Guide covers manners.
- **Would help:** a small **"cover shoulders and knees, shoes off" badge** on temple and palace cards in Activities, plus "sarongs to borrow or rent at the gate" where a source says so. (Text only: no Buddha imagery.)

### 15. Bangkok rush hour
- **Today:** Directions open Google/Apple Maps.
- **Would help:** a nudge on the details sheet between 7–9:30 am and 4:30–7:30 pm: "Rush hour: BTS/MRT will beat a taxi". Pin BTS/MRT stations near a place (the app already has stations in the data).

### 16. Offline with no signal
- **Today:** App, saved places, map tiles you have already looked at and place data you have opened all work offline.
- **Would help:**
  - **"Save this area for offline"** button: downloads the map tiles and place tiles for the visible area at a few zoom levels, with a size estimate first. M effort, free (OpenFreeMap allows it within fair use).
  - A small **offline badge** in the header so you know which features won't work right now.

---

## Top 15, in priority order

| # | Idea | Effort | Cost | API needed |
|---|------|--------|------|------------|
| 1 | "Show this to the driver" card (hostel name + address in big Thai) | S | Free | None |
| 2 | Export/import trip data (file or QR) so a lost phone doesn't lose everything | S–M | Free | None |
| 3 | "Save this area for offline" map download | M | Free | OpenFreeMap (fair use) |
| 4 | Split costs with mates in the Budget tool | M | Free | None |
| 5 | Arrival-night checklist card | S | Free | None (sourced facts) |
| 6 | Fair-fare checker for taxis/tuk-tuks | M | Free | None (published meter rates) |
| 7 | Symptom and pharmacy phrase cards | S | Free | None |
| 8 | "Meet here" shareable pin link | S | Free | None |
| 9 | Common scams card per city | S | Free | None (sourced) |
| 10 | Booking links on every transport route | S | Free | None |
| 11 | Sea conditions on the weather tool | S | Free | Open-Meteo Marine |
| 12 | Visa day counter | S | Free | None |
| 13 | Temple dress-code badge on cards | S | Free | None |
| 14 | Full Moon Party dates + party-safety card | S | Free | None (sourced) |
| 15 | In-app Claude assistant (see below) | M | Pennies per chat | Claude API via a Worker |

## UI and visual polish ideas
- **Bottom sheet that snaps** to half and full height, and closes with a swipe down and with the phone's back gesture.
- **Pull-to-refresh** on the list tabs (rates, opening times).
- **Skeleton photos** that fade in, instead of the photo popping in.
- **Haptic tap** (on phones that support it) when saving a place.
- **Bigger tap targets** on the map's category chips for sweaty thumbs; 44 px minimum everywhere.
- **"Open now" glow** on cards that are open, grey-out for closed, so you can scan a list at night.
- A **home-screen "Today" card**: weather, where you are sleeping tonight, next journey.
- Paper Atlas look: add a hand-drawn compass rose and a subtle paper texture (CSS only, no images of temples or Buddha).
- **Dark-mode map labels**: slightly larger and with stronger halos for reading in a moving tuk-tuk.

## Free or cheap data sources worth adding

| Source | What it gives | Pros | Cons |
|--------|---------------|------|------|
| **Wikidata / Wikipedia / Wikimedia Commons** (already used for some photos) | Photos, descriptions, opening years, official websites for landmarks | Free, no key, openly licensed (needs attribution) | Only famous places; descriptions can be thin or out of date |
| **OpenTripMap** | Sights and attractions with Wikipedia links and ratings of "interest" | Free tier (needs a free key), good for "what's around me" | Data mostly from OSM + Wikidata, so little new; key must be in the page (low risk, free) |
| **Foursquare Places (free tier)** | Restaurant/bar categories, popularity, some photos and tips | Good food and nightlife coverage | Free tier limits; key exposure needs a proxy; terms restrict caching |
| **Open-Meteo** (already used) + **Open-Meteo Marine** | Forecasts, rain by hour, wave height | Free, no key, generous | Forecasts only, no warnings feed |
| **Frankfurter** (ECB rates) | Exchange rates | Free, no key, reliable | Euro-based daily rates; doesn't cover every Asian currency (no LAK, KHR, VND) so keep the current currency-api as the main source |
| **OpenStreetMap via Overpass** | Anything OSM has (ATMs by bank, hospitals, water refill) | Free, the app's data already comes from OSM | Public servers rate-limit; better to keep precomputing into `places/` as now |
| **Google Places** (already optional) | Photos, ratings, price level | The best coverage | Costs money; keep the daily quotas (see PR) |
| **GOV.UK travel advice** | Entry rules, safety | Authoritative, has an API (Content API) | Changes often; show "checked on" dates |

## The planned Claude assistant (not built)

The current "Trip assistant" works offline from the app's own data. A real AI assistant could sit next to it:

1. **A small Cloudflare Worker** (free plan covers this) holds the Claude API key as a secret. The page never sees the key.
2. The app sends the question plus a **small, trimmed context**: where you are, your dates, the few places on screen, your saved places. Nothing personal beyond that.
3. The Worker adds a system prompt ("only recommend places from the provided list or say you don't know; never invent prices"), calls the Claude API, and streams the answer back.
4. Protect the Worker: allow only requests from `elitepotato57-lgtm.github.io`, rate-limit per phone (e.g. 30 questions a day), and set a monthly spend limit in the Anthropic console.
5. In the app: when there is signal, the Trip assistant shows an "Ask Claude" button under the offline answer; offline it stays as it is today.
6. Cost: a short question and answer on a small, fast model costs well under a penny, so a group trip would be a few pounds at most.
