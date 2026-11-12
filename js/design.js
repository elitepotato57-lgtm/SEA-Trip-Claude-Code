/* ============================================================
   45-design: the Design Lab (temporary). A floating panel, opened from the tab on the left edge,
   for trying colours, map colours, fonts, text size and box sizes live on any screen.
   Everything is stored in S.design and applied as CSS custom properties on <html> (so it sits on top
   of whichever look is chosen in Settings) plus live map paint changes.
   "Copy my look" gives a short code Dylan can paste to Claude to make his look the default.
   ============================================================ */
IC.copy = '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>';
IC.file = '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6"/>';
IC.upload = '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>';
IC.download = '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>';
IC.folder = '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>';
IC.passport = '<rect x="4" y="2" width="16" height="20" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M8 17h8"/>';
IC.palette = '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.56-2.5 5.56-5.55C21.97 6.01 17.46 2 11.98 2z"/>';

const LAB_GROUPS = ["stay", "food", "do", "ess", "move"];
const LAB_GROUP_NAMES = {stay:"Gaffs", food:"Munch", do:"Activities", ess:"Essentials", move:"Transport"};
const LAB_SIZES = {ts:1, chip:1, radius:1, pad:1, gap:12, ar:7.5, layout:"big", sideW:112, cl:1, clOp:.72, pin:1};

/* ---------- colour maths ---------- */
const isHex = v => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
const hexRGB = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgbHex = a => "#" + a.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
const cmix = (a, b, t) => { const x = hexRGB(a), y = hexRGB(b); return rgbHex(x.map((v, i) => v + (y[i] - v) * t)); };
const calpha = (h, a) => { const [r, g, b] = hexRGB(h); return `rgba(${r},${g},${b},${a})`; };
const clum = h => { const [r, g, b] = hexRGB(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
const asHex = v => { v = String(v || "").trim(); if (isHex(v)) return v; const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v); return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}` : null; };

/* ---------- presets ---------- */
const LAB_SECTION_PRESETS = {
  "Original":  null,
  "Bold":      {stay:"#FF6B57", food:"#2ECC71", do:"#9B59B6", ess:"#F1C40F", move:"#3498DB"},
  "Tropical":  {stay:"#FF7A59", food:"#14B8A6", do:"#A78BFA", ess:"#FBBF24", move:"#38BDF8"},
  "Pastel":    {stay:"#F4A7A0", food:"#A8E6CF", do:"#CDB4DB", ess:"#FFE5A5", move:"#A2D2FF"},
  "Jungle":    {stay:"#E07A5F", food:"#81B29A", do:"#9D8CC4", ess:"#F2CC8F", move:"#5FA8D3"},
  "Neon":      {stay:"#FF4D8D", food:"#39FF88", do:"#B967FF", ess:"#FFE14D", move:"#34D3FF"}
};
const LAB_ACCENTS = {"Coral":null, "Orange":"#F28C38", "Teal":"#14B8A6", "Gold":"#E3B341", "Pink":"#F472B6", "Sky":"#38BDF8", "Lime":"#A3E635"};
const LAB_APP_PRESETS = {
  "Night":          null,
  "Ocean Explorer": {bg:"#0F2236", surface:"#163049", ink:"#EAF4F2"},
  "Midnight":       {bg:"#121417", surface:"#1C1F24", ink:"#F2F2F2"},
  "Forest":         {bg:"#18211B", surface:"#223027", ink:"#EEF2EA"},
  "Plum":           {bg:"#221C2B", surface:"#2E2638", ink:"#F3EEF6"},
  "Sand (light)":   {bg:"#F4EEE4", surface:"#FFFDF8", ink:"#2B2620"}
};
// the map's look, in eight colours
const LAB_MAP_KEYS = [["land", "Land"], ["water", "Water"], ["parks", "Parks"], ["buildings", "Buildings"], ["roads", "Small roads"], ["majors", "Main roads"], ["motorways", "Motorways"], ["labels", "Place names"]];
const LAB_MAP_PRESETS = {
  "Standard":       null,
  "Paper Atlas":    {land:"#F1E6CF", water:"#B9D3DC", parks:"#CCDAB0", buildings:"#E5D4B4", roads:"#FBF5E8", majors:"#F7E6C8", motorways:"#D88A5E", labels:"#5E4D3A"},
  "Ocean Explorer": {land:"#102A43", water:"#164E63", parks:"#134E3F", buildings:"#1A3550", roads:"#24425E", majors:"#2F5A73", motorways:"#0D9488", labels:"#E5F3EF"},
  "Jungle":         {land:"#1F2A1F", water:"#1E4D5C", parks:"#2E4A2A", buildings:"#2A3528", roads:"#3A4A36", majors:"#5A6B3F", motorways:"#C9A227", labels:"#DDE5D0"},
  "Sunset":         {land:"#2B2233", water:"#2D3E66", parks:"#3A3A3F", buildings:"#3A2E40", roads:"#4A3A50", majors:"#B8656A", motorways:"#F08A5D", labels:"#F6E3D4"},
  "Light & clean":  {land:"#F5F5F2", water:"#AAD3DF", parks:"#D8E8C8", buildings:"#E4E2DD", roads:"#FFFFFF", majors:"#FCE8B2", motorways:"#F4B183", labels:"#444444"},
  "Mono dark":      {land:"#1C1C1E", water:"#2C2C2E", parks:"#232826", buildings:"#26262A", roads:"#3A3A3C", majors:"#48484A", motorways:"#636366", labels:"#D1D1D6"}
};
// fonts: [label, CSS family stack, Google Fonts family query or "" for a font already on the phone]
const LAB_FONTS = {
  inter:     ["Inter (standard)", '"Inter","SF Pro Text",-apple-system,"Segoe UI",Roboto,Arial,sans-serif', ""],
  system:    ["iPhone system font", '-apple-system,"SF Pro Text","Segoe UI",Roboto,Arial,sans-serif', ""],
  dmsans:    ["DM Sans", '"DM Sans",sans-serif', "DM+Sans:wght@400;500;600;700"],
  nunito:    ["Nunito (rounded)", '"Nunito",sans-serif', "Nunito:wght@400;600;700;800"],
  poppins:   ["Poppins", '"Poppins",sans-serif', "Poppins:wght@400;500;600;700"],
  manrope:   ["Manrope", '"Manrope",sans-serif', "Manrope:wght@400;500;600;700"],
  outfit:    ["Outfit", '"Outfit",sans-serif', "Outfit:wght@400;500;600;700"],
  grotesk:   ["Space Grotesk", '"Space Grotesk",sans-serif', "Space+Grotesk:wght@400;500;600;700"],
  fraunces:  ["Fraunces (serif)", '"Fraunces",Georgia,serif', "Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700"],
  playfair:  ["Playfair Display (serif)", '"Playfair Display",Georgia,serif', "Playfair+Display:wght@400;600;700"],
  lora:      ["Lora (serif)", '"Lora",Georgia,serif', "Lora:wght@400;600;700"],
  dmserif:   ["DM Serif Display", '"DM Serif Display",Georgia,serif', "DM+Serif+Display"],
  bebas:     ["Bebas Neue (tall caps)", '"Bebas Neue",Impact,sans-serif', "Bebas+Neue"]
};
function loadLabFont(key){
  const f = LAB_FONTS[key]; if (!f || !f[2]) return;
  const id = "labfont-" + key; if (document.getElementById(id)) return;
  const l = document.createElement("link"); l.id = id; l.rel = "stylesheet";
  l.href = `https://fonts.googleapis.com/css2?family=${f[2]}&display=swap`; document.head.appendChild(l);
}

/* ---------- applying a look ---------- */
const labD = () => S.design || (S.design = {on:true});
const labNum = (k) => { const v = labD()[k]; return typeof v === "number" && isFinite(v) ? v : LAB_SIZES[k]; };

function applyDesign(){
  const d = labD(), root = document.documentElement, st = root.style;
  const setv = (k, v) => v == null || v === "" ? st.removeProperty(k) : st.setProperty(k, v);

  // app colours: three choices, the rest worked out from them
  const app = d.app && isHex(d.app.bg) && isHex(d.app.surface) && isHex(d.app.ink) ? d.app : null;
  const appVars = ["--bg", "--surface", "--raised", "--line", "--ink", "--muted", "--faint", "--placeholder", "--halo", "--art-bg"];
  if (app){
    const {bg, surface, ink} = app;
    setv("--bg", bg); setv("--surface", surface); setv("--raised", cmix(surface, ink, .07)); setv("--line", cmix(surface, ink, .16));
    setv("--ink", ink); setv("--muted", cmix(ink, bg, .3)); setv("--faint", cmix(ink, bg, .45)); setv("--placeholder", cmix(ink, bg, .4));
    setv("--halo", calpha(bg, .9)); setv("--art-bg", bg);
    st.colorScheme = clum(bg) > .45 ? "light" : "dark";
  } else { appVars.forEach(k => st.removeProperty(k)); st.colorScheme = ""; }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = app ? app.bg : (S.look === "paper" ? "#F3EAD7" : "#20262B");

  // section colours
  LAB_GROUPS.forEach(g => setv("--" + g, d.cols && isHex(d.cols[g]) ? d.cols[g] : null));
  if (d.cols && LAB_GROUPS.some(g => isHex(d.cols[g]))){
    const avg = LAB_GROUPS.reduce((a, g) => a + clum(asHex(cssv("--" + g)) || "#888888"), 0) / LAB_GROUPS.length;
    setv("--on-cat", avg > .35 ? "#16191C" : "#FFFFFF");
  } else st.removeProperty("--on-cat");

  // accent: the one colour for selected things and the main button
  if (isHex(d.accent)){
    const a = d.accent, ink = asHex(cssv("--ink")) || "#F2F1ED";
    setv("--accent", a); setv("--accent-2", cmix(a, ink, .4)); setv("--on-accent", clum(a) > .4 ? "#1B1410" : "#FFFFFF");
    setv("--accent-soft", calpha(a, .16)); setv("--link", cmix(a, ink, .2));
  } else ["--accent", "--accent-2", "--on-accent", "--accent-soft", "--link"].forEach(k => st.removeProperty(k));

  // map background colours used outside the map canvas (loading screen, offline outline)
  const m = d.map || {};
  setv("--land", isHex(m.land) ? m.land : null); setv("--sea", isHex(m.water) ? m.water : null);

  // fonts
  if (LAB_FONTS[d.fontBody] && d.fontBody !== "inter"){ loadLabFont(d.fontBody); setv("--font", LAB_FONTS[d.fontBody][1]); } else st.removeProperty("--font");
  if (LAB_FONTS[d.fontHead]){ loadLabFont(d.fontHead); setv("--font-head", LAB_FONTS[d.fontHead][1]); setv("--serif", LAB_FONTS[d.fontHead][1]); }
  else { st.removeProperty("--font-head"); st.removeProperty("--serif"); }

  // sizes
  setv("--ts", labNum("ts") === 1 ? null : String(labNum("ts")));
  setv("--chip", labNum("chip") === 1 ? null : String(labNum("chip")));
  setv("--pad", labNum("pad") === 1 ? null : String(labNum("pad")));
  setv("--card-gap", labNum("gap") === LAB_SIZES.gap ? null : labNum("gap") + "px");
  setv("--card-ar", labNum("ar") === LAB_SIZES.ar ? null : `16/${labNum("ar")}`);
  const r = labNum("radius");
  setv("--r-s", r === 1 ? null : Math.round(6 * r) + "px"); setv("--r", r === 1 ? null : Math.round(8 * r) + "px"); setv("--r-l", r === 1 ? null : Math.round(10 * r) + "px");
  root.classList.toggle("lab-side", d.layout === "side");
  setv("--side-w", labNum("sideW") + "px");

  // rules that need selectors: the header fade and the floating map controls follow the app colours
  let css = "";
  if (app){
    const sf = calpha(app.surface, .96);
    css += `html:root:root .hero::after{background:linear-gradient(180deg,${calpha(app.bg, .55)} 0%,${calpha(app.bg, .8)} 55%,${app.bg} 100%)}
html:root:root .map-top .sbar,html:root:root .map-chips .chip,html:root:root .map-side .icon-btn,html:root:root #mapModeRow .seg,html:root:root .near-title,html:root:root .map-status{background:${sf}!important;border-color:var(--line)!important;color:var(--ink)}
html:root:root .map-chips .chip[aria-pressed="true"]{background:var(--accent)!important;border-color:var(--accent)!important;color:var(--on-accent)!important}
html:root:root .where,html:root:root .hbtn,html:root:root .crumb{background:${calpha(app.bg, .6)};border-color:var(--line)}`;
  }
  if (LAB_FONTS[d.fontHead]) css += `html:root:root h1,html:root:root h2,html:root:root h3,html:root:root .card h3,html:root:root .sheet h2{font-family:var(--font-head)!important}`;
  let tag = document.getElementById("designLabCSS");
  if (!tag){ tag = document.createElement("style"); tag.id = "designLabCSS"; document.head.appendChild(tag); }
  tag.textContent = css;
}

/* map paint for the eight map colours, by layer, worked out from the choices */
function labMapPaint(){
  const m = (S.design && S.design.map) || {}, out = {};
  const put = (id, prop, v) => { (out[id] = out[id] || {})[prop] = v; };
  if (isHex(m.land)){ put("background", "background-color", m.land); put("landuse_residential", "fill-color", cmix(m.land, clum(m.land) > .5 ? "#000000" : "#ffffff", .04)); put("aeroway-area", "fill-color", cmix(m.land, "#808080", .08)); }
  if (isHex(m.water)){ put("water", "fill-color", m.water); put("waterway", "line-color", cmix(m.water, "#000000", .08)); put("water_name", "text-color", cmix(m.water, clum(m.water) > .3 ? "#000000" : "#ffffff", .55)); }
  if (isHex(m.parks)){ put("landcover_wood", "fill-color", m.parks); put("landuse_park", "fill-color", m.parks); }
  if (isHex(m.buildings)){ put("building", "fill-color", m.buildings); put("building", "fill-outline-color", cmix(m.buildings, "#000000", .12)); }
  if (isHex(m.roads)){ put("highway_minor", "line-color", m.roads); put("highway_path", "line-color", cmix(m.roads, "#808080", .25)); put("road_pier", "line-color", m.roads); }
  if (isHex(m.majors)){ put("highway_major_inner", "line-color", m.majors); put("highway_major_casing", "line-color", cmix(m.majors, "#000000", .25)); put("highway_major_subtle", "line-color", cmix(m.majors, "#808080", .2)); }
  if (isHex(m.motorways)){ put("highway_motorway_inner", "line-color", m.motorways); put("highway_motorway_casing", "line-color", cmix(m.motorways, "#000000", .3)); put("highway_motorway_subtle", "line-color", cmix(m.motorways, "#808080", .2)); }
  if (isHex(m.labels)){
    const halo = isHex(m.land) ? calpha(m.land, .85) : null;
    MAP_STYLE.layers.filter(l => /^place_|^highway_name_/.test(l.id)).forEach(l => { put(l.id, "text-color", m.labels); if (halo) put(l.id, "text-halo-color", halo); });
  }
  return out;
}
const LAB_MAP_LAYERS = ["background", "landuse_residential", "aeroway-area", "water", "waterway", "water_name", "landcover_wood", "landuse_park", "building", "highway_minor",
  "highway_path", "road_pier", "highway_major_inner", "highway_major_casing", "highway_major_subtle", "highway_motorway_inner", "highway_motorway_casing", "highway_motorway_subtle"];

/* live changes on the main map: colours, circle size and see-through, pin size */
function applyDesignToMap(){
  if (typeof map === "undefined" || !map || !mapLoaded) return;
  try {
    // map colours: start from the look's own colours, then the Lab's on top
    const base = mapStyleBase(), lab = labMapPaint();
    const ids = new Set(LAB_MAP_LAYERS.concat(MAP_STYLE.layers.filter(l => /^place_|^highway_name_/.test(l.id)).map(l => l.id)));
    ids.forEach(id => {
      if (!map.getLayer(id)) return;
      const bl = base.layers.find(l => l.id === id), bp = (bl && bl.paint) || {};
      ["background-color", "fill-color", "fill-outline-color", "line-color", "text-color", "text-halo-color"].forEach(prop => {
        if (!(prop in bp) && !(lab[id] && prop in lab[id])) return;
        const v = lab[id] && prop in lab[id] ? lab[id][prop] : bp[prop];
        if (ui.basemap === "sat" && id === "background") return;
        map.setPaintProperty(id, prop, v);
      });
    });
    const k = labNum("cl"), op = labNum("clOp"), pin = labNum("pin");
    MAP_GROUPS.forEach(g => {
      if (!map.getLayer("cl-circle-" + g)) return;
      map.setPaintProperty("cl-circle-" + g, "circle-color", cssv("--" + g));
      map.setPaintProperty("cl-circle-" + g, "circle-radius", ["*", k, CL_RADIUS]);
      map.setPaintProperty("cl-circle-" + g, "circle-opacity", op);
      map.setPaintProperty("cl-circle-" + g, "circle-stroke-opacity", Math.min(1, op + .15));
      map.setPaintProperty("cl-count-" + g, "text-color", cssv("--on-cat"));
      map.setLayoutProperty("cl-count-" + g, "text-size", Math.round(11 * clamp(k, .8, 1.3) * 10) / 10);
      map.setLayoutProperty("pt-icon-" + g, "icon-size", ["interpolate", ["linear"], ["zoom"], 9, .5 * pin, 14, .7 * pin, 17, .85 * pin]);
    });
  } catch(e){ /* the map may still be setting up */ }
}

/* after a colour change: redraw the things that copied colours when they were made */
const labRepaint = debounce(() => {
  applyDesign();
  if (typeof makeArt === "function") makeArt();
  if (typeof map !== "undefined" && map && mapLoaded){ addPinImages(); applyDesignToMap(); }
  if (typeof rerender === "function") rerender();
}, 120);
const labResize = debounce(() => { applyDesign(); if (typeof map !== "undefined" && map && mapLoaded){ applyDesignToMap(); try { map.resize(); } catch(e){} } }, 60);

/* ---------- the floating panel ---------- */
const lab = {open:false, min:false, tab:"colours"};
function renderLabButton(){
  let b = document.getElementById("labBtn");
  const want = labD().on !== false && !lab.open;
  if (!want){ if (b) b.remove(); return; }
  if (!b){
    b = document.createElement("button"); b.id = "labBtn"; b.className = "lab-btn"; b.type = "button";
    b.setAttribute("aria-label", "Open the Design Lab"); b.innerHTML = icon("palette");
    b.onclick = () => openLab();
    document.body.appendChild(b);
  }
}
function placeLab(){
  const p = document.getElementById("lab"), nav = document.getElementById("tabs");
  if (!p || !nav) return;
  p.style.bottom = Math.max(0, window.innerHeight - nav.getBoundingClientRect().top) + "px";
}
window.addEventListener("resize", () => placeLab());

function openLab(tab){
  lab.open = true; lab.min = false; if (tab) lab.tab = tab;
  renderLab(); renderLabButton();
}
function closeLab(){
  lab.open = false; const p = document.getElementById("lab"); if (p) p.remove(); renderLabButton();
}

function renderLab(){
  let p = document.getElementById("lab");
  if (!p){ p = document.createElement("section"); p.id = "lab"; p.className = "lab"; p.setAttribute("aria-label", "Design Lab"); document.body.appendChild(p); }
  p.classList.toggle("min", lab.min);
  const tabs = [["colours", "Colours"], ["map", "Map"], ["text", "Text"], ["sizes", "Sizes"], ["save", "Save"]];
  p.innerHTML = `<div class="lab-head">
      <span class="lab-title">${icon("palette", "i s")}Design Lab</span>
      <span class="lab-hint">${lab.min ? "Shrunk: tap + to carry on" : "Changes show straight away"}</span>
      <button class="lab-x" type="button" data-labmin aria-label="${lab.min ? "Show the Design Lab" : "Shrink the Design Lab"}">${icon(lab.min ? "plus" : "minus", "i s")}</button>
      <button class="lab-x" type="button" data-labclose aria-label="Close the Design Lab">${icon("x", "i s")}</button>
    </div>
    <div class="lab-tabs" role="tablist">${tabs.map(([id, l]) => `<button type="button" class="chip" role="tab" data-labtab="${id}" aria-pressed="${lab.tab === id}">${l}</button>`).join("")}</div>
    <div class="lab-body">${labTab(lab.tab)}</div>`;
  p.querySelectorAll("[data-labtab]").forEach(b => b.onclick = () => { lab.tab = b.dataset.labtab; lab.min = false; renderLab(); });
  p.querySelector("[data-labmin]").onclick = () => { lab.min = !lab.min; renderLab(); };
  p.querySelector("[data-labclose]").onclick = closeLab;
  bindLab(p);
  placeLab();
}

const labSw = cols => `<span class="lab-sw">${cols.map(c => `<i style="background:${c}"></i>`).join("")}</span>`;
const labHex = v => asHex(v) || "#000000";
function labColor(label, key, value){ return `<label class="lab-row"><span>${label}</span><input type="color" data-labcol="${key}" value="${labHex(value)}"></label>`; }
function labRange(label, key, min, max, step, fmt){
  const v = labNum(key);
  return `<label class="lab-row"><span>${label} <b class="lab-val" data-labval="${key}">${fmt(v)}</b></span><input type="range" data-labnum="${key}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`;
}
const LAB_FMT = {pct:v => Math.round(v * 100) + "%", px:v => v + "px", pic:v => v <= 5 ? "short" : v >= 10 ? "tall" : "medium", plain:v => String(v)};
function labTab(t){
  const d = labD();
  if (t === "colours") return `
    <h3>Section colours</h3>
    <div class="lab-presets">${Object.entries(LAB_SECTION_PRESETS).map(([n, c]) => `<button type="button" class="lab-preset" data-labpreset="cols" data-name="${esc(n)}">${labSw(c ? LAB_GROUPS.map(g => c[g]) : LAB_GROUPS.map(g => cssvDefault(g)))}${esc(n)}</button>`).join("")}</div>
    ${LAB_GROUPS.map(g => labColor(LAB_GROUP_NAMES[g], "cols." + g, d.cols && d.cols[g] || cssv("--" + g))).join("")}
    <h3>Highlight colour</h3>
    <p class="note">Used only for selected things and the main button on each screen.</p>
    <div class="lab-presets">${Object.entries(LAB_ACCENTS).map(([n, c]) => `<button type="button" class="lab-preset" data-labpreset="accent" data-name="${esc(n)}">${labSw([c || "#DA8667"])}${esc(n)}</button>`).join("")}</div>
    ${labColor("Highlight", "accent", d.accent || cssv("--accent"))}
    <h3>App colours</h3>
    <div class="lab-presets">${Object.entries(LAB_APP_PRESETS).map(([n, c]) => `<button type="button" class="lab-preset" data-labpreset="app" data-name="${esc(n)}">${labSw(c ? [c.bg, c.surface, c.ink] : ["#20262B", "#303A40", "#F2F1ED"])}${esc(n)}</button>`).join("")}</div>
    ${labColor("Background", "app.bg", (d.app && d.app.bg) || cssv("--bg"))}
    ${labColor("Cards and boxes", "app.surface", (d.app && d.app.surface) || cssv("--surface"))}
    ${labColor("Text", "app.ink", (d.app && d.app.ink) || cssv("--ink"))}`;
  if (t === "map") return `
    <h3>Map colours</h3>
    <div class="lab-presets">${Object.entries(LAB_MAP_PRESETS).map(([n, c]) => `<button type="button" class="lab-preset" data-labpreset="map" data-name="${esc(n)}">${labSw(c ? [c.land, c.water, c.parks, c.motorways] : ["#27343A", "#1E5263", "#2F4046", "#DA8667"])}${esc(n)}</button>`).join("")}</div>
    ${LAB_MAP_KEYS.map(([k, l]) => labColor(l, "map." + k, (d.map && d.map[k]) || labMapNow(k))).join("")}
    <h3>Circles and pins</h3>
    ${labRange("Circle size", "cl", .5, 1.6, .05, LAB_FMT.pct)}
    ${labRange("Circle see-through", "clOp", .3, 1, .02, v => Math.round((1 - v) * 100) + "% clear")}
    ${labRange("Pin size", "pin", .6, 1.5, .05, LAB_FMT.pct)}
    <p class="note">Section colours (Colours tab) also colour the circles and pins.</p>`;
  if (t === "text") return `
    <h3>Fonts</h3>
    <label class="lab-row"><span>Main text</span><select data-labfont="fontBody">${Object.entries(LAB_FONTS).map(([k, f]) => `<option value="${k}" ${(d.fontBody || "inter") === k ? "selected" : ""}>${esc(f[0])}</option>`).join("")}</select></label>
    <label class="lab-row"><span>Headings</span><select data-labfont="fontHead"><option value="">Same as main text</option>${Object.entries(LAB_FONTS).map(([k, f]) => `<option value="${k}" ${d.fontHead === k ? "selected" : ""}>${esc(f[0])}</option>`).join("")}</select></label>
    <h3>Size</h3>
    ${labRange("Text size", "ts", .8, 1.35, .05, LAB_FMT.pct)}
    <p class="note">The map's own street names keep their size.</p>`;
  if (t === "sizes") return `
    <h3>Place cards (Gaffs, Munch, Activities)</h3>
    <div class="seg" role="group" aria-label="Card layout" style="margin:2px 0 6px"><button type="button" data-lablayout="big" aria-pressed="${d.layout !== "side"}">Big picture on top</button><button type="button" data-lablayout="side" aria-pressed="${d.layout === "side"}">Picture at the side</button></div>
    ${d.layout === "side" ? labRange("Picture width", "sideW", 80, 170, 2, LAB_FMT.px) : labRange("Picture height", "ar", 4, 12, .25, LAB_FMT.pic)}
    ${labRange("Space inside cards", "pad", .6, 1.6, .05, LAB_FMT.pct)}
    ${labRange("Gap between cards", "gap", 4, 28, 1, LAB_FMT.px)}
    <h3>Everything</h3>
    ${labRange("Corner roundness", "radius", 0, 2.5, .1, LAB_FMT.pct)}
    ${labRange("Buttons and chips", "chip", .8, 1.3, .05, LAB_FMT.pct)}`;
  return `
    <h3>Keep your look</h3>
    <p class="note">Your look is saved on this phone. When you're happy with it, copy it and paste it to Claude in chat to make it the app's look for everyone.</p>
    <textarea class="lab-code" id="labCode" readonly rows="4">${esc(labExport())}</textarea>
    <div class="lab-actions"><button class="btn primary" type="button" data-labcopy>${icon("copy", "i s")}Copy my look</button></div>
    <h3>Try someone else's look</h3>
    <textarea class="lab-code" id="labPaste" rows="3" placeholder="Paste a look code here"></textarea>
    <div class="lab-actions"><button class="btn" type="button" data-labapply>Use this look</button></div>
    <h3>Start again</h3>
    <div class="lab-actions"><button class="btn" type="button" data-labreset>Reset everything to standard</button></div>
    <p class="note">You can hide the Design Lab tab in Settings.</p>`;
}
// the colour a section has with no Lab choice, for the preset swatches
function cssvDefault(g){ return ({stay:"#DA8667", food:"#8CC3A6", do:"#B9A4DC", ess:"#E3C47C", move:"#7FB2D2"})[g]; }
function labMapNow(k){
  const st = mapStyleBase(), get = (id, prop) => { const l = st.layers.find(x => x.id === id); const v = l && l.paint && l.paint[prop]; return typeof v === "string" ? v : null; };
  const v = {land:get("background", "background-color"), water:get("water", "fill-color"), parks:get("landuse_park", "fill-color"), buildings:get("building", "fill-color"),
    roads:get("highway_minor", "line-color"), majors:get("highway_major_inner", "line-color"), motorways:get("highway_motorway_inner", "line-color"), labels:get("place_city", "text-color")}[k];
  return asHex(v) || (v && /^rgb/.test(v) ? rgbHex(v.match(/[\d.]+/g).slice(0, 3).map(Number)) : "#888888");
}

function setLabPath(path, v){
  const d = labD(), [a, b] = path.split(".");
  if (b){ d[a] = Object.assign({}, d[a] || {}); if (v == null) delete d[a][b]; else d[a][b] = v; if (!Object.keys(d[a]).length) delete d[a]; }
  else if (v == null) delete d[a]; else d[a] = v;
}
const labSave = debounce(() => persist(), 300);

function bindLab(p){
  p.querySelectorAll("[data-labcol]").forEach(inp => inp.oninput = () => {
    const key = inp.dataset.labcol;
    if (key.startsWith("app.")){                       // app colours need all three: fill the others from what's showing now
      const d = labD(); d.app = Object.assign({bg:asHex(cssv("--bg")) || "#20262B", surface:asHex(cssv("--surface")) || "#303A40", ink:asHex(cssv("--ink")) || "#F2F1ED"}, d.app || {});
    }
    setLabPath(key, inp.value); labSave(); labRepaint();
  });
  p.querySelectorAll("[data-labnum]").forEach(inp => inp.oninput = () => {
    const k = inp.dataset.labnum, v = +inp.value;
    labD()[k] = v; labSave(); labResize();
    const out = p.querySelector(`[data-labval="${k}"]`);
    if (out){ const f = {cl:LAB_FMT.pct, pin:LAB_FMT.pct, ts:LAB_FMT.pct, pad:LAB_FMT.pct, radius:LAB_FMT.pct, chip:LAB_FMT.pct, sideW:LAB_FMT.px, gap:LAB_FMT.px, ar:LAB_FMT.pic,
      clOp:x => Math.round((1 - x) * 100) + "% clear"}[k]; out.textContent = f ? f(v) : v; }
  });
  p.querySelectorAll("[data-labfont]").forEach(sel => sel.onchange = () => { setLabPath(sel.dataset.labfont, sel.value || null); labSave(); labResize(); });
  p.querySelectorAll("[data-lablayout]").forEach(b => b.onclick = () => { labD().layout = b.dataset.lablayout === "side" ? "side" : null; if (!labD().layout) delete labD().layout; labSave(); labResize(); renderLab(); });
  p.querySelectorAll("[data-labpreset]").forEach(b => b.onclick = () => {
    const kind = b.dataset.labpreset, name = b.dataset.name, d = labD();
    const src = {cols:LAB_SECTION_PRESETS, accent:LAB_ACCENTS, app:LAB_APP_PRESETS, map:LAB_MAP_PRESETS}[kind];
    const val = src[name];
    if (val == null) delete d[kind]; else d[kind] = typeof val === "object" ? Object.assign({}, val) : val;
    persist(); labRepaint(); setTimeout(renderLab, 160);
  });
  const copy = p.querySelector("[data-labcopy]");
  if (copy) copy.onclick = async () => {
    const t = p.querySelector("#labCode"); const code = labExport();
    try { await navigator.clipboard.writeText(code); toast("Copied. Paste it to Claude in chat."); }
    catch(e){ t.focus(); t.select(); toast("Select the code and copy it"); }
  };
  const apply = p.querySelector("[data-labapply]");
  if (apply) apply.onclick = () => {
    const raw = p.querySelector("#labPaste").value.trim();
    const d = labImport(raw);
    if (!d){ toast("That doesn't look like a look code"); return; }
    S.design = Object.assign({on:labD().on !== false}, d); persist(); labRepaint(); setTimeout(renderLab, 160); toast("Look applied");
  };
  const reset = p.querySelector("[data-labreset]");
  if (reset) reset.onclick = () => { S.design = {on:labD().on !== false}; persist(); labRepaint(); setTimeout(renderLab, 160); toast("Back to the standard look"); };
}

/* ---------- look codes: what's copied and pasted ---------- */
function labExport(){
  const d = Object.assign({}, labD()); delete d.on;
  return "SEALOOK:" + JSON.stringify(d);
}
// only known settings with sensible values get through, so a pasted code can't do anything odd
function labImport(raw){
  let o; try { o = JSON.parse(String(raw).replace(/^\s*SEALOOK:/, "")); } catch(e){ return null; }
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const out = {};
  const hexes = (src, keys) => { if (!src || typeof src !== "object") return null; const r = {}; keys.forEach(k => { if (isHex(src[k])) r[k] = src[k]; }); return Object.keys(r).length ? r : null; };
  const cols = hexes(o.cols, LAB_GROUPS); if (cols) out.cols = cols;
  const app = hexes(o.app, ["bg", "surface", "ink"]); if (app && app.bg && app.surface && app.ink) out.app = app;
  const mp = hexes(o.map, LAB_MAP_KEYS.map(x => x[0])); if (mp) out.map = mp;
  if (isHex(o.accent)) out.accent = o.accent;
  if (LAB_FONTS[o.fontBody]) out.fontBody = o.fontBody;
  if (LAB_FONTS[o.fontHead]) out.fontHead = o.fontHead;
  if (o.layout === "side") out.layout = "side";
  const R = {ts:[.8, 1.35], chip:[.8, 1.3], radius:[0, 2.5], pad:[.6, 1.6], gap:[4, 28], ar:[4, 12], sideW:[80, 170], cl:[.5, 1.6], clOp:[.3, 1], pin:[.6, 1.5]};
  Object.entries(R).forEach(([k, [a, b]]) => { if (typeof o[k] === "number" && isFinite(o[k])) out[k] = clamp(o[k], a, b); });
  return out;
}

applyDesign();       // as early as possible, so the first screen already has the chosen look
