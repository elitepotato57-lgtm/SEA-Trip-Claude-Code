#!/usr/bin/env python3
"""Country outlines for the app (GEO in js/data.js), from the real state/province borders in an OpenStreetMap extract.

The app decides which country a point is in from GEO before anything else. The old outlines were rough (Malaysia had 278
points), so Johor Bahru's waterfront fell outside Malaysia and Brunei's capital outside Brunei. This joins each region's
border (repairing ones cut off at sea, as extract.py --repair-borders does), simplifies it to about --tol degrees
(0.004 is about 400 m, as for Laos), drops islands smaller than --min-km2 (the places databases' boxes catch those),
and writes the rings into GEO in place of the named country's outline.

  python tools/osm/outline.py --pbf malaysia.osm.pbf --name Malaysia --cc MY --regions MY-01,...,MY-16
  python tools/osm/outline.py --pbf malaysia.osm.pbf --name Brunei --regions BN-BE,BN-BM,BN-TE,BN-TU
Data © OpenStreetMap contributors, ODbL.
"""
import argparse, json, math, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
import osmium
from extract import repair_borders

def simplify(pts, tol):
    """Douglas-Peucker on a closed ring, iterative"""
    if len(pts) < 5: return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
    keep[far] = True; stack = [(0, far), (far, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1: continue
        (x1, y1), (x2, y2) = pts[a], pts[b]
        dx, dy = x2 - x1, y2 - y1; L = math.hypot(dx, dy) or 1e-12
        best, bi = -1, -1
        for i in range(a + 1, b):
            d = abs(dy * (pts[i][0] - x1) - dx * (pts[i][1] - y1)) / L
            if d > best: best, bi = d, i
        if best > tol: keep[bi] = True; stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]

def area_km2(r):
    lat = sum(p[1] for p in r) / len(r); kx = 111.32 * math.cos(math.radians(lat)); ky = 110.57
    return abs(sum(r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1] for i in range(len(r) - 1))) / 2 * kx * ky

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pbf", required=True); ap.add_argument("--name", required=True, help="the country's name in GEO (n)")
    ap.add_argument("--cc", default="", help="its code in GEO (empty for neighbours with no places database)")
    ap.add_argument("--regions", required=True); ap.add_argument("--tol", type=float, default=0.004); ap.add_argument("--min-km2", type=float, default=3)
    ap.add_argument("--data", default=os.path.join(os.path.dirname(__file__), "..", "..", "js", "data.js"))
    a = ap.parse_args()
    codes = a.regions.split(",")
    rings = {}
    fp = osmium.FileProcessor(a.pbf).with_areas(osmium.filter.TagFilter(("boundary", "administrative"))).with_filter(osmium.filter.EntityFilter(osmium.osm.AREA))
    for o in fp:
        code = o.tags.get("ISO3166-2") if o.tags.get("admin_level") == "4" else None
        if code in codes and code not in rings:
            rings[code] = [[(n.lon, n.lat) for n in outer] for outer in o.outer_rings()]
    missing = [c for c in codes if c not in rings]
    for code, rr in repair_borders(a.pbf, missing).items(): rings[code] = [r for bb, r in rr]
    if set(codes) - set(rings): sys.exit("borders not found: " + ",".join(sorted(set(codes) - set(rings))))
    out = []
    for code in codes:
        for r in rings[code]:
            if r[0] != r[-1]: r = r + [r[0]]
            if area_km2(r) < a.min_km2: continue
            s = simplify(r, a.tol)
            if len(s) >= 4: out.append([[round(x, 3), round(y, 3)] for x, y in s])
    n = sum(len(r) for r in out)
    print(f"{a.name}: {len(out)} rings, {n} points", flush=True)
    lines = open(a.data, encoding="utf-8").read().split("\n")
    i = next(k for k, l in enumerate(lines) if l.startswith("const GEO = "))
    cr = "\r" if lines[i].endswith("\r") else ""
    geo = json.loads(lines[i].rstrip("\r")[len("const GEO = "):].rstrip(";"))
    entry = next(g for g in geo if g["n"] == a.name)
    entry["p"] = out
    if a.cc: entry["cc"] = a.cc
    lines[i] = "const GEO = " + json.dumps(geo, separators=(",", ":")) + ";" + cr
    open(a.data, "w", encoding="utf-8").write("\n".join(lines))

if __name__ == "__main__":
    main()
