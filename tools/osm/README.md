# Building a places database (tools/osm/extract.py)

The app's places (every gaff, munch spot, activity, essential and station) come from OpenStreetMap.
`extract.py` turns an OpenStreetMap extract into the folder layout the app reads (`places/<country>/`).

## What's built so far

| Folder | Covers | Places |
|---|---|---|
| `places/th` | All of Thailand (built by an earlier version of this tool) | ~128,600 |
| `places/id` | Indonesia: Lampung, South Sumatra and Bengkulu (Sumatra), Bali, and Lombok (+ the Gilis) | ~31,700 |
| `places/kh` | All of Cambodia (all 25 provinces, islands included), OpenStreetMap of 11 Nov 2026 | ~16,500 |
| `places/vn` | All of Vietnam (the 34 provinces and cities of the July 2025 reform), OpenStreetMap of 17 Nov 2026 | ~74,500 |
| `places/la` | All of Laos (17 provinces and Vientiane Capital), names in English where mapped | ~13,300 |
| `places/sg` | All of Singapore (the whole country: it has no provinces) | ~19,100 |

OpenStreetMap is much less detailed in Sumatra than in Thailand or Bali, so Sumatran towns have far fewer places.
Cambodia is well mapped in Phnom Penh, Siem Reap and the coast, thinner in the north-east (Mondulkiri, Ratanakiri).

## Rebuilding Cambodia

```bash
curl -LO https://download.geofabrik.de/asia/cambodia-latest.osm.pbf        # ~60 MB
.venv/Scripts/python tools/osm/extract.py --pbf cambodia-latest.osm.pbf --cc KH --out places/kh \
  --regions KH-1,KH-2,KH-3,KH-4,KH-5,KH-6,KH-7,KH-8,KH-9,KH-10,KH-11,KH-12,KH-13,KH-14,KH-15,KH-16,KH-17,KH-18,KH-19,KH-20,KH-21,KH-22,KH-23,KH-24,KH-25 \
  --region-names "Banteay Meanchey,Battambang,Kampong Cham,Kampong Chhnang,Kampong Speu,Kampong Thom,Kampot,Kandal,Koh Kong,Kratie,Mondulkiri,Phnom Penh,Preah Vihear,Prey Veng,Pursat,Ratanakiri,Siem Reap,Preah Sihanouk,Stung Treng,Svay Rieng,Takeo,Oddar Meanchey,Kep,Pailin,Tbong Khmum" \
  --dests "Phnom Penh:11.5683:104.9224;Siem Reap:13.3618:103.859;Kampot:10.6099:104.181;Kep:10.4846:104.3144;Battambang:13.0999:103.1967;Sihanoukville:10.622:103.5223;Koh Rong:10.674:103.288;Koh Rong Sanloem:10.584:103.2955;Kratie:12.489:106.0201;Sen Monorom:12.4569:107.1865;Banlung:13.7415:106.9874;Koh Kong:11.611:102.9819;Kampong Cham:11.9922:105.4628"
```

The province boxes in `PLACE_DBS` (`js/places.js`) were copied from the new `meta.json`; if a rebuild changes them, copy them again.

## Rebuilding Vietnam, Laos and Singapore

```bash
curl -Lo vietnam.osm.pbf https://download.geofabrik.de/asia/vietnam-latest.osm.pbf                # ~330 MB
curl -Lo laos.osm.pbf https://download.geofabrik.de/asia/laos-latest.osm.pbf                      # ~55 MB
curl -Lo msb.osm.pbf https://download.geofabrik.de/asia/malaysia-singapore-brunei-latest.osm.pbf  # ~220 MB (Singapore is in here)
.venv/Scripts/python tools/osm/extract.py --pbf vietnam.osm.pbf --cc VN --out places/vn --clip "VN-34:108.55,11.25,109.47,12.88" --box-fallback   --regions VN-HN,VN-HP,VN-13,VN-02,VN-01,VN-04,VN-05,VN-07,VN-09,VN-18,VN-21,VN-22,VN-23,VN-25,VN-26,VN-DN,VN-29,VN-30,VN-33,VN-34,VN-35,VN-37,VN-39,VN-SG,VN-44,VN-45,VN-49,VN-CT,VN-59,VN-56,VN-66,VN-68,VN-69,VN-71   --region-names "Hanoi,Hai Phong,Quang Ninh,Lao Cai,Lai Chau,Cao Bang,Son La,Tuyen Quang,Lang Son,Ninh Binh,Thanh Hoa,Nghe An,Ha Tinh,Quang Tri,Hue,Da Nang,Quang Ngai,Gia Lai,Dak Lak,Khanh Hoa,Lam Dong,Tay Ninh,Dong Nai,Ho Chi Minh City,An Giang,Dong Thap,Vinh Long,Can Tho,Ca Mau,Bac Ninh,Hung Yen,Phu Tho,Thai Nguyen,Dien Bien"   --dests "Hanoi:21.0285:105.8542;Ha Long:20.951:107.08;Cat Ba:20.7259:107.0484;Ninh Binh:20.2153:105.9357;Sapa:22.3364:103.8438;Ha Giang:22.8233:104.9836;Phong Nha:17.6115:106.3077;Hue:16.4637:107.5909;Da Nang:16.0544:108.2022;Hoi An:15.88:108.33;Quy Nhon:13.7765:109.2237;Nha Trang:12.2388:109.1967;Da Lat:11.94:108.44;Mui Ne:10.9333:108.2833;Ho Chi Minh City:10.7769:106.7009;Can Tho:10.0452:105.7469;Phu Quoc:10.2167:103.9667"
.venv/Scripts/python tools/osm/extract.py --pbf laos.osm.pbf --cc LA --out places/la --english-names   --regions LA-VT,LA-VI,LA-LP,LA-AT,LA-BK,LA-BL,LA-CH,LA-HO,LA-KH,LA-LM,LA-OU,LA-PH,LA-SL,LA-SV,LA-XA,LA-XE,LA-XI,LA-XS   --region-names "Vientiane Capital,Vientiane Province,Luang Prabang,Attapeu,Bokeo,Bolikhamsai,Champasak,Houaphanh,Khammouane,Luang Namtha,Oudomxay,Phongsaly,Salavan,Savannakhet,Sainyabuli,Sekong,Xiangkhouang,Xaisomboun"   --dests "Vientiane:17.9757:102.6331;Vang Vieng:18.9235:102.4478;Luang Prabang:19.8856:102.1347;Nong Khiaw:20.5693:102.6131;Luang Namtha:20.9486:101.4022;Phonsavan:19.4497:103.1912;Thakhek:17.4103:104.8306;Savannakhet:16.5563:104.7528;Pakse:15.1202:105.799;Don Det:14.0128:105.9178"
.venv/Scripts/python tools/osm/extract.py --pbf msb.osm.pbf --cc SG --out places/sg --regions SG --region-names "Singapore"   --dests "Singapore:1.29:103.85;Sentosa:1.2494:103.8303"
```

- Vietnam's provinces are the 34 of the July 2025 reform. Khánh Hòa's (VN-34, Nha Trang) border is broken in OpenStreetMap
  (it takes in the Spratly Islands), so `--box-fallback` uses its `--clip` box instead.
- Laos: `--english-names` uses `name:en` where mapped (most places) and keeps the Lao name as `nt` (shown as "Name in Lao").
- Singapore: a plain country code in `--regions` takes the whole country (admin_level 2).
- The app's Laos outline (`GEO` in `js/data.js`) is the real border simplified to ~400 m and checked before Thailand's,
  because the rough outlines put Savannakhet and Huay Xai on the Thai side of the Mekong.

## Rebuilding Indonesia

```bash
python -m venv .venv && .venv/Scripts/python -m pip install osmium      # once (macOS/Linux: .venv/bin/python)
curl -LO https://download.geofabrik.de/asia/indonesia/sumatra-latest.osm.pbf
curl -LO https://download.geofabrik.de/asia/indonesia/nusa-tenggara-latest.osm.pbf
.venv/Scripts/python tools/osm/extract.py \
  --pbf sumatra-latest.osm.pbf,nusa-tenggara-latest.osm.pbf --cc ID --out places/id \
  --regions ID-LA,ID-SS,ID-BE,ID-BA,ID-NB --region-names "Lampung,South Sumatra,Bengkulu,Bali,Lombok" \
  --clip "ID-NB:115.75,-9.0,116.74,-8.15" \
  --dests "Bandar Lampung:-5.4294:105.2626;Palembang:-2.9888:104.7569;Bengkulu:-3.7923:102.2624;Krui:-5.1889:103.9349;Pagar Alam:-4.0212:103.2517;Ubud:-8.5069:115.2625;Canggu:-8.65:115.13;Seminyak:-8.6899:115.1668;Uluwatu:-8.8208:115.1136;Sanur:-8.6946:115.2606;Amed:-8.3346:115.6409;Nusa Penida:-8.7445:115.5355;Kuta Lombok:-8.8853:116.2757;Senggigi:-8.4952:116.0447;Gili Trawangan:-8.3515:116.0383;Gili Air:-8.358:116.0817;Senaru:-8.3029:116.4007"
```

The download files are big (Sumatra ~280 MB, Nusa Tenggara ~180 MB): keep them out of the repo.
It takes a couple of minutes.

- `--regions`: ISO 3166-2 codes of provinces (OpenStreetMap `admin_level=4`). Only places inside their borders are kept.
- `--clip`: keep part of a province. West Nusa Tenggara (`ID-NB`) is clipped to Lombok and the Gilis, leaving out Sumbawa.
- `--dests`: destinations to count places around (the numbers on the Discover page).

## Adding another region or country

1. Find the Geofabrik extract that contains it, and the province codes (e.g. `ID-JT` Central Java, `VN-HN` Hanoi).
2. Run `extract.py` with the new regions **added to** the existing ones for that country (the folder is rebuilt each time).
3. In `js/places.js`, add or update the country in `PLACE_DBS`. Countries covered only in part need a `bbs` box per area;
   copy them from `"regions"` in the new `meta.json`.
4. Add the destinations to `D.cities` in `js/data.js` (with a script) and their one-line notes to `DEST_NOTE` in `js/tools-more.js`.
5. For a new country, also add: price tables in `js/estimate.js` (`PRICE_TABLES`), a phrasebook (`js/tools.js`),
   a guide and emergency numbers with official sources (`js/tools-more.js`), and the folder's small files to `PLACES_CORE` in `sw.js`.
6. Then the hand-researched layer, as for Thailand and Indonesia (all edited with a script, never by hand):
   - researched gaffs, munch spots and activities in `D.places`, with sources, `city` set to the destination's name in `D.cities`,
     and pins taken from the new `places/<cc>/` files where the name matches (`osmid`); otherwise an approximate pin with `ap: true`;
   - hubs, stations and legs in `D.net` (plus `go12` names), each leg with a source or marked `verified: false` (shown as an estimate),
     including the links across its borders, so the planner goes from anywhere to anywhere on the map. Add them to
     `tools/transport-asia.js` (or a file like it) and run it; check `npm test`'s "reaches every country" test still passes;
   - one Wikimedia Commons photo per destination: `img/dest-*.jpg` (440×270), `DEST_IMG` and `PHOTO_CREDITS` in `js/core.js`,
     and the credit in `img/CREDITS.md` and `img/credits.json`;
   - a `wd` (Wikidata item) or `wp` (English Wikipedia page) on researched places, only when that item **is** the place
     (never a town's item on a hostel). Temples get no photo unless the exact picture was looked at and listed in
     `PHOTO_CHECKED` (`js/detail.js`): no Buddha imagery.
7. Run `node tools/photo-index.js` then `node tools/photo-geo.js` for the photos, then `npm test`.

## What it keeps

The same 71 kinds as Thailand (see `KINDS`). Mosques and churches are only kept when they're notable (a Wikipedia/Wikidata
entry, a tourism or heritage tag, or a name like "Masjid Agung"), because they're everywhere and aren't usually somewhere to visit.
Unnamed places are dropped except toilets, drinking water, ATMs, viewpoints, fuel, taxi stands and luggage storage.

Data © OpenStreetMap contributors, available under the Open Database Licence (ODbL).

## Lockers and gluten-free on folders built earlier

`node tools/osm/add-extras.js` asks the free Overpass API for luggage lockers / left-luggage desks and `diet:gluten_free`, and adds
them to `places/th`, `places/kh` and `places/id` without a full rebuild. `extract.py` keeps both itself, so a rebuild needs nothing extra.
