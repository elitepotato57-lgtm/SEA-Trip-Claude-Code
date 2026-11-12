#!/usr/bin/env python3
"""Build the app's places database for a country, or part of one, from an OpenStreetMap extract.

It writes the same layout the app already reads for Thailand (places/th):
  meta.json           kinds, the tiles ("leaves") for each section, search settings
  coverage.json       counts and what was dropped
  sum-<group>.json    counts on a zoom-13 grid, for zoomed-out map views
  <group>/<z>-<x>-<y>.json   the places themselves, at most CAP per file
  search/s-<key>.json name search, one small file per word prefix

Usage (needs pyosmium:  pip install osmium):
  python tools/osm/extract.py --pbf sumatra-latest.osm.pbf --cc ID --out places/id \
      --regions ID-LA,ID-SS,ID-BE --region-names "Lampung,South Sumatra,Bengkulu"

Extracts come from https://download.geofabrik.de/ (e.g. asia/indonesia/sumatra-latest.osm.pbf).
--regions are ISO 3166-2 codes of admin_level 4 areas (provinces); only places inside them are kept.
Data: © OpenStreetMap contributors, ODbL. Keep the attribution in meta.json.
"""
import argparse, json, math, os, re, sys, unicodedata, datetime
from collections import Counter, defaultdict

import osmium

CAP = 1500          # most places in one tile file
SUM_Z = 13          # summary grid zoom
TOP_Z = 6           # tiles start at this zoom and split until they hold at most CAP places
MAX_Z = 16

# the same kinds as places/th/meta.json: kind -> [group, label]
KINDS = {"hostel":["stay","Hostel"],"hotel":["stay","Hotel"],"guesthouse":["stay","Guesthouse"],"resort":["stay","Resort"],"bungalow":["stay","Bungalow"],
  "apartment":["stay","Apartment"],"motel":["stay","Motel"],"campsite":["stay","Campsite"],"hut":["stay","Park hut"],"restaurant":["food","Restaurant"],
  "cafe":["food","Café"],"fastfood":["food","Quick eats"],"foodcourt":["food","Food court"],"bakery":["food","Bakery"],"dessert":["food","Dessert"],
  "market":["food","Market"],"beach":["do","Beach"],"temple":["do","Temple"],"worship":["do","Shrine or place of worship"],"historic":["do","Historic site"],
  "attraction":["do","Attraction"],"viewpoint":["do","Viewpoint"],"museum":["do","Museum or gallery"],"zoo":["do","Zoo or aquarium"],
  "themepark":["do","Theme or water park"],"waterfall":["do","Waterfall"],"peak":["do","Peak"],"cave":["do","Cave"],"hotspring":["do","Hot spring"],
  "park":["do","Park"],"nationalpark":["do","National park or reserve"],"dive":["do","Dive centre"],"climbing":["do","Climbing"],"muaythai":["do","Muay Thai"],
  "massage":["do","Massage or spa"],"cooking":["do","Cooking class"],"tour":["do","Tour or travel agency"],"bar":["do","Bar or pub"],"club":["do","Nightclub"],
  "culture":["do","Theatre or arts centre"],"laundry":["ess","Laundry"],"atm":["ess","ATM"],"bank":["ess","Bank"],"exchange":["ess","Money exchange"],
  "pharmacy":["ess","Pharmacy"],"hospital":["ess","Hospital"],"clinic":["ess","Clinic"],"dentist":["ess","Dentist"],"police":["ess","Police"],
  "embassy":["ess","Embassy or consulate"],"immigration":["ess","Immigration office"],"supermarket":["ess","Supermarket"],"convenience":["ess","Convenience store"],
  "mall":["ess","Mall"],"sim":["ess","SIM and phone shop"],"water":["ess","Drinking water"],"toilet":["ess","Toilets"],"fuel":["ess","Fuel"],
  "post":["ess","Post office"],"cowork":["ess","Coworking or internet café"],"wifi":["ess","Wi-Fi spot"],"luggage":["ess","Luggage storage"],
  "airport":["move","Airport"],"train":["move","Train station"],"metro":["move","Metro or Skytrain station"],"bus":["move","Bus station"],
  "ferry":["move","Ferry pier"],"carrental":["move","Car rental"],"scooter":["move","Scooter rental"],"bike":["move","Bicycle rental"],"taxi":["move","Taxi stand"]}
GROUPS = ["stay", "food", "do", "ess", "move"]
UNNAMED_OK = {"toilet", "water", "atm", "viewpoint", "fuel", "taxi", "luggage"}
POI_KEYS = ("amenity", "tourism", "shop", "leisure", "natural", "waterway", "historic", "railway", "aeroway", "office", "public_transport", "boundary", "sport", "place")
TEMPLE_RELIGIONS = {"buddhist", "hindu", "taoist", "confucian", "chinese_folk", "shinto"}
HISTORIC_KEEP = {"monument", "memorial", "ruins", "archaeological_site", "castle", "fort", "building", "tomb", "city_gate", "palace", "manor", "heritage",
  "citywalls", "temple", "mosque", "church", "ship", "locomotive", "aircraft", "battlefield", "house", "yes"}
NOTABLE_NAME = re.compile(r"\b(agung|raya|kesultanan|sultan|cheng ?ho|al[- ]?akbar|kuno|bersejarah|cathedral|katedral)\b", re.I)
LIFECYCLE = ("disused:", "abandoned:", "was:", "demolished:", "removed:", "razed:")


def classify(t, name):
    """the kinds a place belongs to, as (group, kind) pairs"""
    out = []
    am, to, sh, le, na, hi = (t.get(k) for k in ("amenity", "tourism", "shop", "leisure", "natural", "historic"))
    nm = (name or "").lower()
    # stays
    if to == "hostel": out.append("hostel")
    elif to == "hotel": out.append("resort" if "resort" in nm else "hotel")
    elif to == "guest_house": out.append("guesthouse")
    elif to == "motel": out.append("motel")
    elif to == "apartment": out.append("apartment")
    elif to == "chalet": out.append("bungalow")
    elif to == "camp_site": out.append("campsite")
    elif to in ("alpine_hut", "wilderness_hut"): out.append("hut")
    elif le == "resort" or to == "resort": out.append("resort")
    # food
    if am == "restaurant": out.append("restaurant")
    elif am == "cafe": out.append("cafe")
    elif am == "fast_food": out.append("fastfood")
    elif am == "food_court": out.append("foodcourt")
    elif am == "ice_cream" or sh == "confectionery": out.append("dessert")
    elif sh in ("bakery", "pastry"): out.append("bakery")
    if am == "marketplace": out.append("market")                 # a market is food and a thing to do (both groups)
    # things to do
    if na == "beach": out.append("beach")
    if am == "place_of_worship":
        rel = t.get("religion", "")
        if rel in TEMPLE_RELIGIONS: out.append("temple")
        # mosques and churches are everywhere: only the notable ones count as somewhere to visit
        elif t.get("wikidata") or t.get("wikipedia") or t.get("tourism") or t.get("historic") or t.get("heritage") or NOTABLE_NAME.search(name or ""):
            out.append("worship")
    if hi in HISTORIC_KEEP and "temple" not in out and "worship" not in out: out.append("historic")
    if to == "attraction" and not out: out.append("attraction")
    if to == "viewpoint": out.append("viewpoint")
    if to in ("museum", "gallery"): out.append("museum")
    if to in ("zoo", "aquarium"): out.append("zoo")
    if to == "theme_park" or le == "water_park": out.append("themepark")
    if t.get("waterway") == "waterfall" or na == "waterfall": out.append("waterfall")
    if na in ("peak", "volcano") and name: out.append("peak")
    if na == "cave_entrance": out.append("cave")
    if na == "hot_spring": out.append("hotspring")
    if le == "park" and name: out.append("park")
    if le == "nature_reserve" or t.get("boundary") == "national_park" or (t.get("boundary") == "protected_area" and t.get("protect_class") in ("2", "1a", "1b")):
        if name: out.append("nationalpark")
    if am == "dive_centre" or sh == "scuba_diving": out.append("dive")
    if t.get("sport") == "climbing" and le in ("sports_centre", "pitch", None): out.append("climbing")
    if sh == "massage" or am == "spa" or le == "spa": out.append("massage")
    if am == "cooking_school": out.append("cooking")
    if sh == "travel_agency" or t.get("office") == "travel_agent": out.append("tour")
    if am in ("bar", "pub", "biergarten"): out.append("bar")
    if am == "nightclub": out.append("club")
    if am in ("theatre", "arts_centre"): out.append("culture")
    # essentials
    if sh in ("laundry", "dry_cleaning"): out.append("laundry")
    if am == "atm": out.append("atm")
    if am == "bank": out.append("bank")
    if am == "bureau_de_change": out.append("exchange")
    if am == "pharmacy" or sh == "chemist": out.append("pharmacy")
    if am == "hospital": out.append("hospital")
    if am in ("clinic", "doctors"): out.append("clinic")
    if am == "dentist": out.append("dentist")
    if am == "police": out.append("police")
    if am == "embassy" or t.get("office") == "diplomatic": out.append("embassy")
    if t.get("office") == "government" and t.get("government") == "immigration": out.append("immigration")
    if sh == "supermarket": out.append("supermarket")
    if sh == "convenience": out.append("convenience")
    if sh in ("mall", "department_store"): out.append("mall")
    if sh in ("mobile_phone", "telecommunication"): out.append("sim")
    if am in ("drinking_water", "water_point"): out.append("water")
    if am == "toilets": out.append("toilet")
    if am == "fuel": out.append("fuel")
    if am == "post_office": out.append("post")
    if am in ("coworking_space", "internet_cafe") or t.get("office") == "coworking": out.append("cowork")
    if am in ("luggage_locker", "left_luggage"): out.append("luggage")
    # getting around
    if t.get("aeroway") == "aerodrome" and (t.get("iata") or re.search(r"bandara|bandar udara|airport", nm)): out.append("airport")
    if t.get("railway") in ("station", "halt") and name:
        out.append("metro" if t.get("station") in ("light_rail", "subway", "monorail") or t.get("light_rail") == "yes" else "train")
    if am == "bus_station" or (t.get("public_transport") == "station" and t.get("bus") == "yes"): out.append("bus")
    if am == "ferry_terminal": out.append("ferry")
    if am == "car_rental": out.append("carrental")
    if am == "motorcycle_rental" or sh == "motorcycle_rental": out.append("scooter")
    if am == "bicycle_rental": out.append("bike")
    if am == "taxi": out.append("taxi")
    seen = []
    for k in out:
        if k not in seen: seen.append(k)
    return seen


def num(v):
    try: return int(float(str(v).strip().split()[0].replace(",", "")))
    except Exception: return None


def extras(t, ts):
    """the extra facts the app shows (same short keys as places/th)"""
    x = {}
    cu = t.get("cuisine")
    if cu: x["cu"] = [c.strip().replace("_", " ").lower() for c in cu.split(";") if c.strip()][:4]
    if t.get("brand"): x["br"] = t["brand"]
    if t.get("operator") and (t.get("amenity") in ("atm", "bank")): x["op"] = t["operator"]
    ph = t.get("phone") or t.get("contact:phone") or t.get("contact:mobile")
    if ph: x["ph"] = ph.split(";")[0].strip()
    w = t.get("website") or t.get("contact:website") or t.get("url")
    if w: x["w"] = w if re.match(r"^https?://", w) else "https://" + w
    fb = t.get("contact:facebook") or t.get("facebook")
    if fb: x["fb"] = fb
    ig = t.get("contact:instagram") or t.get("instagram")
    if ig: x["ig"] = ig
    if t.get("opening_hours"): x["oh"] = t["opening_hours"]
    ia = t.get("internet_access")
    if ia in ("wlan", "yes", "wifi"): x["wifi"] = 2 if t.get("internet_access:fee") == "no" else 1
    street, hn = t.get("addr:street"), t.get("addr:housenumber")
    if street: x["ad"] = street + (f" No. {hn}" if hn else "")
    elif t.get("addr:full"): x["ad"] = t["addr:full"]
    if ts: x["ts"] = ts
    if t.get("check_date"): x["cd"] = t["check_date"]
    d = t.get("description") or t.get("description:en")
    if d: x["d"] = d[:240]
    for key, short in (("stars", "st"), ("rooms", "rm"), ("beds", "bd"), ("ele", "ele")):
        n = num(t.get(key)) if t.get(key) else None
        if n: x[short] = n
    if t.get("air_conditioning") == "yes": x["ac"] = 1
    if t.get("swimming_pool") == "yes" or t.get("leisure") == "swimming_pool": x["pool"] = 1
    if t.get("takeaway") in ("yes", "only"): x["tk"] = 1
    if t.get("outdoor_seating") == "yes": x["os"] = 1
    veg, vgn = t.get("diet:vegetarian"), t.get("diet:vegan")
    if veg in ("yes", "only"): x["v"] = 2 if veg == "only" else 1
    if vgn in ("yes", "only"): x["vg"] = 2 if vgn == "only" else 1
    if t.get("wikidata"): x["wd"] = t["wikidata"]
    if t.get("wikipedia"): x["wp"] = t["wikipedia"]
    if t.get("image") and "commons.wikimedia.org" in t["image"]: x["img"] = t["image"]
    if t.get("religion"): x["rel"] = t["religion"]
    if t.get("fee") in ("yes", "no"): x["fee"] = t["fee"]
    if t.get("charge"): x["ch"] = t["charge"][:40]
    if t.get("wheelchair") in ("yes", "no", "limited"): x["wc"] = t["wheelchair"]
    if t.get("iata"): x["iata"] = t["iata"]
    if t.get("amenity") == "bank" and t.get("atm") == "yes": x["atm"] = 1
    if t.get("amenity") == "toilets" and t.get("fee") == "yes": x["paid"] = 1
    if t.get("wikidata") or t.get("wikipedia") or t.get("heritage"): x["x"] = 1
    return x


def fold(s):
    s = unicodedata.normalize("NFKD", str(s or ""))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9฀-๿]+", " ", s).strip()


def lng2tile(lng, z): return int(math.floor((lng + 180) / 360 * 2 ** z))
def lat2tile(lat, z):
    r = math.radians(lat)
    return int(math.floor((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2 ** z))


def ring_centroid(pts):
    a = cx = cy = 0.0
    for i in range(len(pts) - 1):
        x0, y0 = pts[i]; x1, y1 = pts[i + 1]
        f = x0 * y1 - x1 * y0
        a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f
    if abs(a) < 1e-12:
        return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
    return cx / (3 * a), cy / (3 * a)


def point_in_rings(x, y, rings):
    """even-odd rule over all rings (outer and inner), with a bounding-box check first"""
    inside = False
    for bb, ring in rings:
        if not (bb[0] <= x <= bb[2] and bb[1] <= y <= bb[3]): continue
        j = len(ring) - 1
        for i in range(len(ring)):
            xi, yi = ring[i]; xj, yj = ring[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi: inside = not inside
            j = i
    return inside


class Grid:
    """a coarse grid of 0.1-degree cells, remembering for each cell whether it is surely inside, surely outside, or near a border"""
    def __init__(self, rings, step=0.1):
        self.rings, self.step, self.memo = rings, step, {}
    def inside(self, x, y):
        key = (int(x // self.step), int(y // self.step))
        st = self.memo.get(key)
        if st is None:
            x0, y0 = key[0] * self.step, key[1] * self.step
            corners = [point_in_rings(x0 + dx * self.step, y0 + dy * self.step, self.rings) for dx in (0, .5, 1) for dy in (0, .5, 1)]
            st = "in" if all(corners) else "out" if not any(corners) else "edge"
            # a border can still cross a cell whose sample points all agree: treat cells near any ring vertex as edge cells
            if st != "edge":
                for bb, ring in self.rings:
                    if bb[0] - self.step <= x0 <= bb[2] and bb[1] - self.step <= y0 <= bb[3]:
                        if any(x0 <= px <= x0 + self.step and y0 <= py <= y0 + self.step for px, py in ring[::4]): st = "edge"; break
            self.memo[key] = st
        return st == "in" or (st == "edge" and point_in_rings(x, y, self.rings))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pbf", required=True, help="one or more extracts, comma separated")
    ap.add_argument("--cc", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--regions", required=True, help="ISO 3166-2 codes, comma separated (admin_level 4)")
    ap.add_argument("--region-names", default="", help="English names for meta.json, same order")
    ap.add_argument("--clip", default="", help="keep only part of a region: 'ID-NB:115.7,-9.0,116.8,-8.0' (west,south,east,north); several with ';'")
    ap.add_argument("--dests", default="", help="destinations to count places around: 'Name:lat:lng;Name:lat:lng' (shown on the Discover page)")
    ap.add_argument("--dest-km", type=float, default=12, help="how far round each destination to count, km")
    a = ap.parse_args()
    codes = [c.strip() for c in a.regions.split(",") if c.strip()]
    clips = {}
    for spec in [s for s in a.clip.split(";") if s.strip()]:
        code, box = spec.split(":", 1); clips[code.strip()] = tuple(float(v) for v in box.split(","))
    pbfs = [p.strip() for p in a.pbf.split(",") if p.strip()]

    raw, towns, stats, regions, osm_ts = [], [], Counter(), {}, ""
    keyf = osmium.filter.KeyFilter(*POI_KEYS)
    for pbf in pbfs:
      # 1. the regions' borders in this extract (a clipped region keeps only its part inside the clip box)
      print(f"Reading region borders in {os.path.basename(pbf)}…", flush=True)
      found = {}
      fp = osmium.FileProcessor(pbf).with_areas(osmium.filter.TagFilter(("boundary", "administrative"))).with_filter(osmium.filter.EntityFilter(osmium.osm.AREA))
      for o in fp:
          code = o.tags.get("ISO3166-2")
          if o.tags.get("admin_level") != "4" or code not in codes or code in regions: continue
          rr = found.setdefault(code, [])
          for outer in o.outer_rings():
              pts = [(n.lon, n.lat) for n in outer]
              rr.append(((min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts)), pts))
              for inner in o.inner_rings(outer):
                  ip = [(n.lon, n.lat) for n in inner]
                  rr.append(((min(p[0] for p in ip), min(p[1] for p in ip), max(p[0] for p in ip), max(p[1] for p in ip)), ip))
      if not found:
          print("  none of the regions are in this extract", flush=True); continue
      for code, rr in found.items():
          bb = (min(r[0][0] for r in rr), min(r[0][1] for r in rr), max(r[0][2] for r in rr), max(r[0][3] for r in rr))
          if code in clips:
              c = clips[code]; bb = (max(bb[0], c[0]), max(bb[1], c[1]), min(bb[2], c[2]), min(bb[3], c[3]))
          regions[code] = {"grid": Grid(rr), "bb": bb}
          print(f"  {code}: bounding box {tuple(round(v, 3) for v in bb)}", flush=True)
      here = [regions[c] for c in found]
      bbox = (min(r["bb"][0] for r in here), min(r["bb"][1] for r in here), max(r["bb"][2] for r in here), max(r["bb"][3] for r in here))
      in_bbox = lambda x, y: bbox[0] <= x <= bbox[2] and bbox[1] <= y <= bbox[3]
      def inside(x, y, here=here):
          return any(r["bb"][0] <= x <= r["bb"][2] and r["bb"][1] <= y <= r["bb"][3] and r["grid"].inside(x, y) for r in here)
      ts_here = osmium.io.Reader(pbf, osmium.osm.osm_entity_bits.NOTHING).header().get("osmosis_replication_timestamp") or ""
      if ts_here > osm_ts: osm_ts = ts_here

      # 2. places, and the towns and villages used to name each place's area
      print("Reading places…", flush=True)
      fp = osmium.FileProcessor(pbf).with_locations().with_areas(keyf).with_filter(keyf)
      for o in fp:
        t = {k: v for k, v in o.tags}
        if o.is_area():
            if o.from_way() and not any(k in t for k in POI_KEYS if k != "place"): continue
            try:
                outer = next(iter(o.outer_rings()))
                pts = [(n.lon, n.lat) for n in outer]
            except Exception: continue
            if len(pts) < 3: continue
            x, y = ring_centroid(pts)
            oid = ("w" if o.from_way() else "r") + str(o.orig_id())
        elif o.is_node():
            if not o.location.valid(): continue
            x, y, oid = o.location.lon, o.location.lat, "n" + str(o.id)
        elif o.is_way():
            if o.is_closed() or len(o.nodes) < 2: continue          # closed ways come through as areas
            try: n = o.nodes[len(o.nodes) // 2]; x, y = n.lon, n.lat
            except Exception: continue
            oid = "w" + str(o.id)
        else: continue
        if not in_bbox(x, y): continue
        stats["objects_seen"] += 1
        if t.get("place") in ("city", "town", "village", "suburb", "quarter", "neighbourhood", "hamlet", "island") and t.get("name"):
            towns.append((x, y, t["place"], t["name"]))
        if any(k.startswith(LIFECYCLE) for k in t) and not any(k in t for k in ("amenity", "tourism", "shop")): stats["dropped_closed"] += 1; continue
        if t.get("opening_hours") in ("closed", "off"): stats["dropped_closed"] += 1; continue
        name = (t.get("name") or t.get("name:en") or "").split(";")[0].strip()
        kinds = classify(t, name)
        if not kinds: continue
        if not name and not any(k in UNNAMED_OK for k in kinds): stats["dropped_unnamed"] += 1; continue
        if not inside(x, y): stats["dropped_outside_border"] += 1; continue
        ts = o.timestamp.strftime("%Y-%m") if getattr(o, "timestamp", None) else None
        raw.append({"id": oid, "x": round(x, 5), "y": round(y, 5), "kinds": kinds, "n": name, "ex": extras(t, ts), "tags": len(t)})

    missing = set(codes) - set(regions)
    if missing: sys.exit(f"Borders not found in the extracts: {', '.join(sorted(missing))}")
    bbox = (min(r["bb"][0] for r in regions.values()), min(r["bb"][1] for r in regions.values()),
            max(r["bb"][2] for r in regions.values()), max(r["bb"][3] for r in regions.values()))

    # 3. merge duplicates (the same place drawn as a point and as an outline)
    print(f"  {len(raw)} places before merging duplicates", flush=True)
    raw.sort(key=lambda p: -p["tags"])
    cell = defaultdict(list); keep = []
    for p in raw:
        key = (round(p["x"] * 100), round(p["y"] * 100))
        fn = fold(p["n"])
        dup = False
        if fn:
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for q in cell[(key[0] + dx, key[1] + dy)]:
                        if q["fn"] == fn and q["kinds"][0] == p["kinds"][0] and abs(q["x"] - p["x"]) < .0008 and abs(q["y"] - p["y"]) < .0008: dup = True; break
                    if dup: break
                if dup: break
        if dup: stats["merged_duplicates"] += 1; continue
        p["fn"] = fn; cell[key].append(p); keep.append(p)

    # 4. which town each place is in
    tgrid = defaultdict(list)
    for x, y, kind, name in towns: tgrid[(int(x * 10), int(y * 10))].append((x, y, kind, name))
    def nearest(x, y, kinds, km):
        best, bd = None, km
        r = max(1, int(km / 11) + 1)
        cx, cy = int(x * 10), int(y * 10)
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                for tx, ty, tk, tn in tgrid.get((cx + dx, cy + dy), ()):
                    if tk not in kinds: continue
                    d = math.hypot((tx - x) * 111.32 * math.cos(math.radians(y)), (ty - y) * 110.57)
                    if d < bd: best, bd = tn, d
        return best
    region_label = a.region_names.split(",")[0].strip() if a.region_names else a.cc
    for p in keep:
        city = nearest(p["x"], p["y"], ("city",), 25) or nearest(p["x"], p["y"], ("town",), 15) or nearest(p["x"], p["y"], ("city", "town"), 60) or region_label
        local = nearest(p["x"], p["y"], ("suburb", "quarter", "neighbourhood", "village", "hamlet"), 3)
        p["area"] = (f"{local}, {city}" if local and local != city else city, city)

    # 5. one row per place per group (a market is food and an activity; free Wi-Fi gets an essentials twin)
    groups = {g: [] for g in GROUPS}
    by_kind = Counter()
    for p in keep:
        done = set()
        for k in p["kinds"]:
            g = KINDS[k][0]
            if g in done: continue
            done.add(g); groups[g].append((p, k)); by_kind[k] += 1
        if p["ex"].get("wifi") and "ess" not in done and p["n"]:
            groups["ess"].append((p, "wifi")); by_kind["wifi"] += 1

    # 6. tiles: split until each holds at most CAP places
    os.makedirs(a.out, exist_ok=True)
    meta_groups = {}
    for g in GROUPS:
        items = groups[g]
        gdir = os.path.join(a.out, g); os.makedirs(gdir, exist_ok=True)
        for f in os.listdir(gdir): os.remove(os.path.join(gdir, f))
        leaves = []
        def rec(z, x, y, its):
            if len(its) <= CAP or z >= MAX_Z: leaves.append((z, x, y, its)); return
            sub = defaultdict(list)
            for it in its: sub[(lng2tile(it[0]["x"], z + 1), lat2tile(it[0]["y"], z + 1))].append(it)
            for (sx, sy), s in sorted(sub.items()): rec(z + 1, sx, sy, s)
        top = defaultdict(list)
        for it in items: top[(lng2tile(it[0]["x"], TOP_Z), lat2tile(it[0]["y"], TOP_Z))].append(it)
        for (x, y), its in sorted(top.items()): rec(TOP_Z, x, y, its)
        out_leaves = []
        for z, x, y, its in leaves:
            areas, idx, rows = [], {}, []
            for p, k in its:
                ar = list(p["area"])
                key = tuple(ar)
                if key not in idx: idx[key] = len(areas); areas.append(ar)
                ex = dict(p["ex"])
                if k == "wifi": ex["ok"] = p["kinds"][0]
                row = [p["id"], p["y"], p["x"], k, p["n"], idx[key]]
                if ex: row.append(ex)
                rows.append(row)
            with open(os.path.join(gdir, f"{z}-{x}-{y}.json"), "w", encoding="utf-8") as fh:
                json.dump({"a": areas, "f": rows}, fh, ensure_ascii=False, separators=(",", ":"))
            out_leaves.append([z, x, y, len(its)])
        meta_groups[g] = {"n": len(items), "leaves": out_leaves}
        # summary grid for zoomed-out views
        kinds = sorted({k for _, k in items})
        kix = {k: i for i, k in enumerate(kinds)}
        cells = defaultdict(Counter)
        for p, k in items: cells[(lng2tile(p["x"], SUM_Z), lat2tile(p["y"], SUM_Z))][kix[k]] += 1
        cl = []
        for (x, y), cnt in sorted(cells.items()):
            row = [x, y]
            for ki, n in sorted(cnt.items()): row += [ki, n]
            cl.append(row)
        with open(os.path.join(a.out, f"sum-{g}.json"), "w", encoding="utf-8") as fh:
            json.dump({"z": SUM_Z, "kinds": kinds, "cells": cl}, fh, separators=(",", ":"))
        print(f"  {g}: {len(items)} places in {len(out_leaves)} tiles", flush=True)

    # 7. name search: every named place once, filed under each of its words' first letters
    rows, seen = [], set()
    for g in GROUPS:
        for p, k in groups[g]:
            if not p["n"] or k == "wifi" or p["id"] in seen: continue
            seen.add(p["id"]); rows.append((p, g, k))
    words = Counter(w for p, g, k in rows for w in set(fold(p["n"]).split()))
    stop = sorted({w for w, n in words.items() if n > max(150, len(rows) * .012)} | {"and", "the", "of", "at", "by", "dan", "di", "ke", "jl", "jalan", "no"})
    shards = defaultdict(list)
    for p, g, k in rows:
        toks = {w for w in fold(p["n"]).split() if len(w) >= 2 and w not in stop}
        for w in toks: shards[w[:2]].append((w, p, g, k))
    split = sorted(key for key, lst in shards.items() if len(lst) > 2500)
    final = defaultdict(list)
    for key, lst in shards.items():
        for w, p, g, k in lst:
            fk = w[:3] if key in split and len(w) >= 3 else key
            if key in split and len(w) < 3: continue
            final[fk].append([p["n"], p["y"], p["x"], g, k, p["id"], p["area"][1]])
    sdir = os.path.join(a.out, "search"); os.makedirs(sdir, exist_ok=True)
    for f in os.listdir(sdir): os.remove(os.path.join(sdir, f))
    for key, lst in final.items():
        uniq, ids = [], set()
        for r in lst:
            if r[5] in ids: continue
            ids.add(r[5]); uniq.append(r)
        with open(os.path.join(sdir, f"s-{key}.json"), "w", encoding="utf-8") as fh:
            json.dump(uniq, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"  search: {len(rows)} names in {len(final)} files", flush=True)

    # 8. meta.json and coverage.json
    today = datetime.date.today().isoformat()
    names = [n.strip() for n in a.region_names.split(",")] if a.region_names else codes
    meta = {"cc": a.cc.upper(), "v": 1, "generated": today, "osm": osm_ts, "cap": CAP, "sumZ": SUM_Z, "kinds": KINDS, "groups": meta_groups,
            "search": {"split": split, "stop": stop}, "regions": [{"code": c, "name": n, "bb": [round(v, 4) for v in regions[c]["bb"]]} for c, n in zip(codes, names)],
            "bb": [round(v, 4) for v in bbox], "attribution": "© OpenStreetMap contributors, ODbL", "source": "https://download.geofabrik.de/"}
    with open(os.path.join(a.out, "meta.json"), "w", encoding="utf-8") as fh: json.dump(meta, fh, ensure_ascii=False, separators=(",", ":"))
    by_dest = {}
    for spec in [s for s in a.dests.split(";") if s.strip()]:
        dn, dlat, dlng = spec.rsplit(":", 2); dlat, dlng = float(dlat), float(dlng)
        cnt = {}
        for g in GROUPS:
            cnt[g] = sum(1 for p, k in groups[g] if k != "wifi" and math.hypot((p["x"] - dlng) * 111.32 * math.cos(math.radians(dlat)), (p["y"] - dlat) * 110.57) <= a.dest_km)
        by_dest[dn.strip()] = cnt
    cov = {"generated": today, "osm": osm_ts, "total": len(keep), "stats": dict(stats), "by_group": {g: len(groups[g]) for g in GROUPS},
           "by_kind": dict(by_kind.most_common()), "by_destination": by_dest, "destination_km": a.dest_km, "regions": meta["regions"]}
    with open(os.path.join(a.out, "coverage.json"), "w", encoding="utf-8") as fh: json.dump(cov, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"Done: {len(keep)} places written to {a.out}", flush=True)


if __name__ == "__main__":
    main()
