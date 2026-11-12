/* ============================================================
   00-core: helpers, icons, constants, saved state, money, distance
   ============================================================ */
const VERSION = "2.6.0";
// Google photos: paste your Google Maps API key between the quotes so everyone using this file gets photos.
const GOOGLE_KEY_IN_FILE = "";

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
// "A", "A and B", "A, B and C"
const listAnd = xs => xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1];
const enc = encodeURIComponent;
const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const niceDate = iso => { try { return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", {day:"numeric", month:"short"}); } catch(e){ return iso; } };

/* ---------- icons (24 x 24, stroke) ---------- */
const IC = {
  pin:'<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  map:'<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/>',
  bed:'<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
  food:'<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  compass:'<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"/>',
  bus:'<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>',
  grid:'<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  cog:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  locate:'<line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/>',
  ext:'<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  nav:'<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
  train:'<rect width="16" height="16" x="4" y="3" rx="2"/><path d="M4 11h16"/><path d="M12 3v8"/><path d="m8 19-2 3"/><path d="m18 22-2-3"/><path d="M8 15h.01"/><path d="M16 15h.01"/>',
  ship:'<path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/><path d="M12 10v4"/><path d="M12 2v3"/>',
  plane:'<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  x:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  sliders:'<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M1 14h6"/><path d="M9 8h6"/><path d="M17 16h6"/>',
  route:'<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  swap:'<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  trash:'<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  image:'<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  globe:'<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  speaker:'<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  chev:'<path d="m6 15 6-6 6 6"/>',
  chevd:'<path d="m6 9 6 6 6-6"/>',
  chevr:'<path d="m9 6 6 6-6 6"/>',
  back:'<path d="m15 6-6 6 6 6"/>',
  car:'<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  layers:'<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  fit:'<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
  bookmark:'<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1Z"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  phone:'<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>',
  wifi:'<path d="M2 8.8a15 15 0 0 1 20 0"/><path d="M5 12.5a10.5 10.5 0 0 1 14 0"/><path d="M8.5 16a6 6 0 0 1 7 0"/><circle cx="12" cy="19.5" r=".8"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  cloud:'<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 10.5a3.75 3.75 0 0 1-.5 7.5Z"/>',
  cloudsun:'<circle cx="8" cy="8" r="3"/><path d="M8 2v1.5M2 8h1.5M3.8 3.8l1 1M12.2 3.8l-1 1"/><path d="M10 21a4 4 0 0 1-.5-7.96A5.5 5.5 0 0 1 20 14.5a3.3 3.3 0 0 1-.5 6.5Z"/>',
  rain:'<path d="M7 15a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 7.5a3.75 3.75 0 0 1-.5 7.5Z"/><path d="M8 18v3M12 18v3M16 18v3"/>',
  storm:'<path d="M7 15a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 7.5a3.75 3.75 0 0 1-.5 7.5Z"/><path d="m12.5 13-2.5 4h3.5l-2 4"/>',
  fog:'<path d="M4 8h16M3 12h18M5 16h14M8 20h8"/>',
  wallet:'<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M16 15h2"/><path d="M6 6V5a1 1 0 0 1 1-1h10"/>',
  lang:'<path d="M4 5h8"/><path d="M8 3v2"/><path d="M5.5 5c0 4 2.5 6.5 6 7.5"/><path d="M10.5 5c0 4-2.5 7-6.5 8"/><path d="m13 20 4-9 4 9"/><path d="M14.5 17h5"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14.3a6.5 6.5 0 0 1 3.5 5.7"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  minus:'<path d="M5 12h14"/>',
  check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.6" r=".6"/>',
  alert:'<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v5"/><circle cx="12" cy="17.6" r=".6"/>',
  shield:'<path d="M12 3 4.5 6v6c0 4.5 3.2 7.7 7.5 9 4.3-1.3 7.5-4.5 7.5-9V6L12 3Z"/>',
  drop:'<path d="M12 3s6.5 6.6 6.5 11.2A6.5 6.5 0 0 1 5.5 14.2C5.5 9.6 12 3 12 3Z"/>',
  washer:'<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13.5" r="4"/><path d="M7.5 6.5h.01M10.5 6.5h.01"/>',
  cash:'<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5v5M18 9.5v5"/>',
  cross:'<path d="M9.5 3h5v6.5H21v5h-6.5V21h-5v-6.5H3v-5h6.5V3Z"/>',
  pill:'<rect x="2.6" y="8.5" width="18.8" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="m9 9 6 6"/>',
  cart:'<path d="M3 4h2.5l2.2 10.5h10.2L20 7H6.3"/><circle cx="9.5" cy="19" r="1.4"/><circle cx="16.5" cy="19" r="1.4"/>',
  sim:'<rect x="6.5" y="2.5" width="11" height="19" rx="2"/><path d="M10.5 18.5h3"/>',
  fuel:'<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M3 21h12"/><path d="M6.5 7h5v4h-5z"/><path d="M14 9h2a2 2 0 0 1 2 2v5.5a1.5 1.5 0 0 0 3 0V8l-3-3"/>',
  temple:'<path d="M12 2v3"/><path d="M6 10 12 5l6 5"/><path d="M4 15 12 9l8 6"/><path d="M6 15v6M18 15v6M3 21h18"/><path d="M10 21v-3a2 2 0 0 1 4 0v3"/>',
  waves:'<path d="M2 8c2.5-2 4.5-2 7 0s4.5 2 7 0 4-2 6 0"/><path d="M2 13c2.5-2 4.5-2 7 0s4.5 2 7 0 4-2 6 0"/><path d="M2 18c2.5-2 4.5-2 7 0s4.5 2 7 0 4-2 6 0"/>',
  mountain:'<path d="m3 20 6.5-11 4 6.5 2.5-4L21 20H3Z"/>',
  fish:'<path d="M2.5 12c3-4.5 7-6 11-5 3 .8 5 2.8 6 5-1 2.2-3 4.2-6 5-4 1-8-.5-11-5Z"/><path d="m19.5 12 2.5-3v6l-2.5-3Z"/><circle cx="14.5" cy="10.8" r=".7"/>',
  coffee:'<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 3v3M12 3v3"/>',
  leaf:'<path d="M5 19c0-9 5-14 15-14 0 10-5 15-14 15"/><path d="M5 21c2-6 5-9.5 10-12"/>',
  glass:'<path d="M4 4h16l-8 9-8-9Z"/><path d="M12 13v7M8 20h8"/>',
  ticket:'<path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8Z"/><path d="M14 6v12" stroke-dasharray="2 2"/>',
  pot:'<path d="M4 11h16v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-4Z"/><path d="M2 11h20M9 7c0-1.5 1-1.5 1-3M14 7c0-1.5 1-1.5 1-3"/>',
  camera:'<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.5"/>',
  tree:'<path d="M12 3 6 11h3l-4 6h14l-4-6h3L12 3Z"/><path d="M12 17v4"/>',
  spark:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/>',
  tag:'<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  book:'<path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2V5Z"/><path d="M4 20a2 2 0 0 0 2 2h13v-4"/>',
  siren:'<path d="M7 18v-6a5 5 0 0 1 10 0v6"/><path d="M5 21h14v-3H5v3Z"/><path d="M12 2v2M4 6l1.5 1.5M20 6l-1.5 1.5M2 12h2M20 12h2"/>',
  share:'<path d="M12 15V3"/><path d="m7.5 7.5 4.5-4.5 4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  edit:'<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  toilet:'<path d="M7 3h10v7H7z"/><path d="M5 10h14a7 7 0 0 1-14 0Z"/><path d="M9 17l-1 4h8l-1-4"/>',
  flag:'<path d="M5 21V4"/><path d="M5 4h13l-2.5 4.5L18 13H5"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  luggage:'<rect x="6" y="7" width="12" height="13" rx="2"/><path d="M9 7V4h6v3M9 11v5M15 11v5"/>',
  send:'<path d="M21 3 3 10.5l7 2.5 2.5 7L21 3Z"/>',
  star:'<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  hands:'<path d="M7 11V6a1.5 1.5 0 0 1 3 0v4M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V12M16 12V8.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L4.3 14a1.5 1.5 0 0 1 2.5-1.6L8 14"/>',
  glove:'<path d="M7 12V7a2 2 0 0 1 4 0v-1a2 2 0 0 1 4 0v1a2 2 0 0 1 4 0v6a6 6 0 0 1-6 6H9a4 4 0 0 1-4-4v-2a2 2 0 0 1 2-2Z"/><path d="M8 19v2h8v-2"/>'
};
const icon = (n, cls = "i") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${IC[n] || IC.pin}</svg>`;
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';

/* ---------- sections ---------- */
const CAT = {
  gaff:  {label:"Gaffs",      one:"Gaff",          ic:"bed",     v:"--stay", sub:"Places to stay",   grp:"stay"},
  munch: {label:"Munch",      one:"Munch",         ic:"food",    v:"--food", sub:"Places to eat",    grp:"food"},
  cool:  {label:"Activities", one:"Activity",      ic:"compass", v:"--do",   sub:"Things to do",     grp:"do"},
  ess:   {label:"Essentials", one:"Essential",     ic:"cross",   v:"--ess",  sub:"Everyday services", grp:"ess"},
  move:  {label:"Transport",  one:"Transport hub", ic:"bus",     v:"--move", sub:"Getting around",   grp:"move"}
};
const CAT_OF_GRP = {stay:"gaff", food:"munch", do:"cool", ess:"ess", move:"move"};
const TABS = [
  {id:"map", label:"Map", ic:"map"},
  {id:"gaffs", label:"Gaffs", ic:"bed", cat:"gaff"},
  {id:"munch", label:"Munch", ic:"food", cat:"munch"},
  {id:"activities", label:"Activities", ic:"compass", cat:"cool"},
  {id:"tools", label:"Tools", ic:"grid"}
];
const VIEW_OF_CAT = {gaff:"gaffs", munch:"munch", cool:"activities"};
const SYM = {GBP:"£",THB:"฿",USD:"$",EUR:"€",AUD:"A$",VND:"₫",LAK:"₭",MYR:"RM ",SGD:"S$",IDR:"Rp ",KHR:"៛"};
const CUR_NAME = {GBP:"Pounds",THB:"Thai baht",USD:"US dollars",EUR:"Euros",AUD:"Australian dollars",VND:"Vietnamese dong",LAK:"Lao kip",MYR:"Malaysian ringgit",SGD:"Singapore dollars",IDR:"Indonesian rupiah",KHR:"Cambodian riel"};
const NOTES = {THB:[20,100,500,1000],USD:[1,5,10,20],EUR:[5,10,20,50],AUD:[5,10,20,50],VND:[10000,50000,100000,500000],KHR:[1000,10000,20000,50000],LAK:[10000,50000,100000,200000],MYR:[5,10,50,100],SGD:[2,5,10,50],IDR:[10000,50000,100000,500000]};

/* ---------- Paper Atlas look (Settings > Look) ----------
   Same map data, warmer colours: cream land, soft blue water, muted green parks, terracotta roads.
   OpenFreeMap's font server only has Noto Sans, so map labels stay Noto (italic for water names). */
function applyLook(){
  const paper = S.look === "paper", root = document.documentElement;
  if (paper) root.dataset.look = "paper"; else delete root.dataset.look;
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = paper ? "#F3EAD7" : "#20262B";
  if (paper && !document.getElementById("serifFont")){
    const l = document.createElement("link"); l.id = "serifFont"; l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&display=swap"; document.head.appendChild(l);
  }
}
const PAPER_HALO = "rgba(251,245,232,0.92)";
const PAPER_MAP = {
  background:{"background-color":"#F1E6CF"}, water:{"fill-color":"#B9D3DC"}, waterway:{"line-color":"#A6C6D2"},
  water_name:{"text-color":"#4A7686", "text-halo-color":"rgba(241,230,207,0.9)"},
  landuse_residential:{"fill-color":"#EBDCBF"}, landcover_wood:{"fill-color":"#CCDAB0"}, landuse_park:{"fill-color":"#CCDAB0"},
  building:{"fill-color":"#E5D4B4", "fill-outline-color":"#D5C09A"},
  "aeroway-taxiway":{"line-color":"#E2D1B0"}, "aeroway-runway-casing":{"line-color":"#CDB894"}, "aeroway-area":{"fill-color":"#E9DCC2"}, "aeroway-runway":{"line-color":"#F8F0E0"},
  road_area_pier:{"fill-color":"#E9DCC2"}, road_pier:{"line-color":"#E9DCC2"},
  highway_path:{"line-color":"#B78C68"}, highway_minor:{"line-color":"#FBF5E8"},
  highway_major_casing:{"line-color":"#C99B73"}, highway_major_inner:{"line-color":"#F7E6C8"}, highway_major_subtle:{"line-color":"#D8B18A"},
  highway_motorway_casing:{"line-color":"#A65E3A"}, highway_motorway_inner:{"line-color":"#D88A5E"}, highway_motorway_subtle:{"line-color":"#C98058"},
  railway_transit:{"line-color":"#9C8B74"}, railway_transit_dashline:{"line-color":"#F1E6CF"}, railway_minor:{"line-color":"#9C8B74"},
  railway_minor_dashline:{"line-color":"#F1E6CF"}, railway:{"line-color":"#9C8B74"}, railway_dashline:{"line-color":"#F1E6CF"},
  highway_name_other:{"text-color":"#6B5340", "text-halo-color":PAPER_HALO}, highway_name_motorway:{"text-color":"#7A4A2C"},
  boundary_state:{"line-color":"#B9A27E"}, "boundary_country_z0-4":{"line-color":"#8F6F4E"}, "boundary_country_z5-":{"line-color":"#8F6F4E"}
};
/* the map style for the current look, plus any colours chosen in the Design Lab (js/design.js) */
function mapStyle(){
  const base = mapStyleBase();
  const lab = typeof labMapPaint === "function" ? labMapPaint() : {};
  if (!Object.keys(lab).length) return base;
  const st = base === MAP_STYLE ? JSON.parse(JSON.stringify(MAP_STYLE)) : base;
  st.layers.forEach(l => { if (lab[l.id]) Object.assign(l.paint = l.paint || {}, lab[l.id]); });
  return st;
}
function mapStyleBase(){
  if (S.look !== "paper") return MAP_STYLE;
  const st = JSON.parse(JSON.stringify(MAP_STYLE)); st.name = "SEA Trip, Paper Atlas";
  st.layers.forEach(l => {
    if (PAPER_MAP[l.id]) Object.assign(l.paint = l.paint || {}, PAPER_MAP[l.id]);
    else if (/^place_/.test(l.id)) Object.assign(l.paint = l.paint || {}, {"text-color":/city|state|country/.test(l.id) ? "#3A2E22" : "#5E4D3A", "text-halo-color":PAPER_HALO});
    if (l.id === "water_name" && l.layout) l.layout["text-font"] = ["Noto Sans Italic"];
  });
  return st;
}

/* ---------- saved state ---------- */
const LS_KEY = "sea-trip-app-v1";
function loadState(){ try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch(e){ return {}; } }
// v: the saved-state version (2 = the test location is off unless someone picked one)
const S_DEFAULTS = {v:2, countryMode:"auto", country:"TH", rates:{}, testLoc:"off", gkey:"", nearClosed:false,
  saved:{}, budget:{total:"", cur:"GBP", days:"", items:[]}, stay:{cin:"", cout:"", guests:2}, focus:null, live:null, mapView:null, seenDiscover:false, look:"night", design:{on:false}, packs:{}, packPhotos:true, lastBackup:null};
const S_SAVED = loadState();
let S = Object.assign({}, S_DEFAULTS, S_SAVED);
// Before version 2 every phone started with a pretend location of Bangkok, which then hid the real GPS position.
// That default is switched off once; a different test city someone actually picked is kept.
if (!(S_SAVED.v >= 2)){ if (S_SAVED.testLoc === "Bangkok" || S_SAVED.testLoc === undefined) S.testLoc = "off"; S.v = 2; try { localStorage.setItem(LS_KEY, JSON.stringify(Object.assign({}, S_SAVED, {testLoc:S.testLoc, v:2}))); } catch(e){} }
if (!D.countries[S.country]) S.country = "TH";
if (!S.saved || typeof S.saved !== "object") S.saved = {};
if (!S.budget || !Array.isArray(S.budget.items)) S.budget = {total:"", cur:"GBP", days:"", items:[]};
if (!S.stay) S.stay = {cin:"", cout:"", guests:2};
if (!S.design || typeof S.design !== "object") S.design = {on:false};
applyLook();
delete S.stay.rooms;                                    // rooms were dropped in 2.1: the booking sites pick rooms themselves
function persist(){
  try { const o = {}; Object.keys(S_DEFAULTS).forEach(k => o[k] = S[k]); localStorage.setItem(LS_KEY, JSON.stringify(o)); return true; }
  catch(e){ return false; }
}

let userLoc = null, locStatus = "idle";
// Stays and activities open on "Recommended" (researched and well-known places first). Food opens on nearest, because lunch is local.
const DEFAULT_SORT = {gaff:"top", munch:"near", cool:"top"};
const newList = cat => ({radius:0, types:new Set(), sort:DEFAULT_SORT[cat] || "near", minR:0, q:"", chip:"all", open:false, flags:new Set(), picks:false, shown:30, filters:false});
const ui = {
  view:"map", sub:"",
  lists:{gaff:newList("gaff"), munch:newList("munch"), cool:newList("cool")},
  mapCats:new Set(["gaff","munch","cool"]), essKinds:new Set(), mapMode:"map", basemap:"map", satHelp:false, satChecking:false,
  mapSort:"near", mapFilters:false,
  mf:{move:{t:"all"}},      // the map's transport-type filter (maximum prices are in ui.pf, shared with the lists: js/estimate.js)
  mapSel:null, mapQ:"", mapSaved:false,
  tp:{from:null, to:null, sort:"fast", sel:0, date:"", people:1}
};

/* ---------- money ---------- */
const liveRate = cur => (S.live && S.live.rates && S.live.rates[cur] > 0 ? S.live.rates[cur] : null);
const rate = cur => (S.rates[cur] > 0 ? S.rates[cur] : liveRate(cur) || (D.rates[cur] ? D.rates[cur].v : 1));
const rateSource = cur => S.rates[cur] > 0 ? "your own rate" : liveRate(cur) ? `live rate, updated ${S.live.date}` : (D.rates[cur] ? D.rates[cur].note : "");
const toGBP = (amt, cur) => amt / rate(cur);
function fmtNum(v){
  if (v >= 100) return Math.round(v).toLocaleString("en-GB");
  const r = Math.round(v * 100) / 100;
  return r.toLocaleString("en-GB", {minimumFractionDigits: r % 1 ? 2 : 0, maximumFractionDigits: 2});
}
const money = (v, cur) => (SYM[cur] || cur + " ") + fmtNum(v);
function rangeText(p, cur){
  if (!p) return null;
  return p.length > 1 && p[1] !== p[0] ? `${money(p[0], cur)}–${fmtNum(p[1])}` : money(p[0], cur);
}
function gbpRange(p, cur){
  if (!p) return null;
  const a = toGBP(p[0], cur), b = p.length > 1 ? toGBP(p[1], cur) : null;
  return b && Math.abs(b - a) > 0.004 ? `£${fmtNum(a)}–${fmtNum(b)}` : `£${fmtNum(a)}`;
}
const gbpMin = it => it.p ? toGBP(it.p[0], it.cur) : null;
const dispCur = (cc, fallback) => (cc && D.countries[cc]) ? D.countries[cc].cur : fallback;
const convert = (v, from, to) => from === to ? v : v / rate(from) * rate(to);
function niceRound(v, cur){
  if (cur === "VND" || cur === "LAK" || cur === "IDR") return v >= 10000 ? Math.round(v / 1000) * 1000 : Math.round(v / 100) * 100;
  if (cur === "KHR") return Math.round(v / 500) * 500;
  if (cur === "THB") return v >= 50 ? Math.round(v / 5) * 5 : Math.round(v);
  return v >= 20 ? Math.round(v) : Math.round(v * 2) / 2;
}
function localRange(p, from, to){
  if (!p) return null;
  const vals = p.map(x => from === to ? x : niceRound(convert(x, from, to), to));
  return vals.length > 1 && vals[1] !== vals[0] ? `${money(vals[0], to)}–${fmtNum(vals[1])}` : money(vals[0], to);
}
const itemLocal = it => localRange(it.p, it.cur, dispCur(it.cc, it.cur));
// "฿120–150 (£2.70–3.40)": local money first, pounds after. Used wherever a transport price shows.
const withGBP = (local, p, cur) => local && p ? `${local} (${gbpRange(p, cur)})` : local;
const thbGBP = (a, b) => `${money(a, "THB")}${b != null && b !== a ? "–" + fmtNum(b) : ""} (${gbpRange(b != null && b !== a ? [a, b] : [a], "THB")})`;
const routeLocal = r => localRange(r.p, r.cur, dispCur(r.cc[0], r.cur));

/* ---------- distance ---------- */
function dist(a, b){
  const R = 6371, toR = x => x * Math.PI / 180;
  const dLa = toR(b.lat - a.lat), dLo = toR(b.lng - a.lng);
  const h = Math.sin(dLa/2)**2 + Math.cos(toR(a.lat))*Math.cos(toR(b.lat))*Math.sin(dLo/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const distShort = km => km < 1 ? `${Math.round(km*1000)} m` : km < 20 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString("en-GB")} km`;
const distText = km => `${distShort(km)} away`;
function inRing(lat, lng, ring){
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++){
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function countryAt(lat, lng){
  for (const c of GEO){ if (c.cc && c.p.some(r => inRing(lat, lng, r))) return c.cc; }
  // small islands may be missing from the outline: the places databases' coverage boxes (js/places.js) know them, e.g. the Gilis
  if (typeof PLACE_DBS !== "undefined"){ const d = PLACE_DBS.find(x => x.bbs && x.bbs.some(b => lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3])); if (d) return d.cc; }
  // otherwise fall back to a nearby trip city
  let best = null, bestKm = 60;
  for (const p of D.places){ const km = dist({lat, lng}, p); if (km < bestKm){ bestKm = km; best = p.cc; } }
  return best;
}

/* ---------- links ---------- */
const q = it => `${it.n}, ${it.city}`;
const coord = it => `${(+it.lat).toFixed(6)},${(+it.lng).toFixed(6)}`;
// researched places search by name (their pins can be approximate); OpenStreetMap places have exact pins
const L_maps = it => it.osm && it.unnamed ? `https://www.google.com/maps/search/?api=1&query=${coord(it)}` : `https://www.google.com/maps/search/?api=1&query=${enc(it.osm ? `${it.n}, ${it.city}` : q(it))}`;
const L_dir = it => `https://www.google.com/maps/dir/?api=1&destination=${it.osm || !it.ap ? coord(it) : enc(q(it))}`;
const L_apple = it => it.osm || !it.ap ? `https://maps.apple.com/?daddr=${coord(it)}&q=${enc(it.n || "Pin")}` : `https://maps.apple.com/?daddr=${enc(q(it))}`;
const L_google = s => `https://www.google.com/search?q=${enc(s)}`;
const L_osm = it => { const m = /^o:([nwr])(\d+)$/.exec(it.id || ""); return m ? `https://www.openstreetmap.org/${{n:"node", w:"way", r:"relation"}[m[1]]}/${m[2]}` : null; };
const ext = (href, label, cls = "btn small") => `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener">${label}</a>`;

/* ---------- sideways rows: fade the edge that has more to see ---------- */
const FADE_ROWS = ".scroller, .map-chips, .near-row";
function updateFade(el){
  const max = el.scrollWidth - el.clientWidth;
  el.classList.toggle("fade-l", max > 2 && el.scrollLeft > 2);
  el.classList.toggle("fade-r", max > 2 && el.scrollLeft < max - 2);
}
const updateFades = () => $$(FADE_ROWS).forEach(updateFade);
document.addEventListener("scroll", e => { const t = e.target; if (t && t.matches && t.matches(FADE_ROWS)) updateFade(t); }, {capture:true, passive:true});
window.addEventListener("resize", debounce(updateFades, 100));
// rows are redrawn all the time, so check again after any change to the page (at most once a frame)
let fadeFrame = 0;
new MutationObserver(() => { if (!fadeFrame) fadeFrame = requestAnimationFrame(() => { fadeFrame = 0; updateFades(); }); }).observe(document.documentElement, {childList:true, subtree:true});
if (document.fonts && document.fonts.ready) document.fonts.ready.then(updateFades);

/* ---------- toast ---------- */
let toastTimer;
function toast(msg, undo){
  const root = $("#toastRoot");
  root.innerHTML = `<div class="toast" role="status"><span>${esc(msg)}</span>${undo ? '<button type="button" id="undoBtn">Undo</button>' : ""}</div>`;
  if (undo) $("#undoBtn").onclick = () => { undo(); root.innerHTML = ""; };
  clearTimeout(toastTimer); toastTimer = setTimeout(() => root.innerHTML = "", undo ? 6000 : 3200);
}

/* ---------- network helper: JSON with a timeout and an abort signal ---------- */
async function getJSON(url, {signal, timeout = 12000} = {}){
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  if (signal) signal.addEventListener("abort", () => ctl.abort(), {once:true});
  try {
    const r = await fetch(url, {signal: ctl.signal});
    if (!r || !r.ok) throw new Error("HTTP " + (r ? r.status : "error"));
    return await r.json();
  } finally { clearTimeout(t); }
}
const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch(e){ return false; } };

/* Made by tools/photos.js. Don't edit by hand: change the lists in that tool and run it again. */
const DEST_IMG = {"Bangkok":"img/dest-bangkok.jpg","Chiang Mai":"img/dest-chiang-mai.jpg","Pai":"img/dest-pai.jpg","Chiang Rai":"img/dest-chiang-rai.jpg","Sukhothai":"img/dest-sukhothai.jpg","Ayutthaya":"img/dest-ayutthaya.jpg","Kanchanaburi":"img/dest-kanchanaburi.jpg","Hua Hin":"img/dest-hua-hin.jpg","Pattaya":"img/dest-pattaya.jpg","Koh Chang":"img/dest-koh-chang.jpg","Koh Tao":"img/dest-koh-tao.jpg","Koh Phangan":"img/dest-koh-phangan.jpg","Koh Samui":"img/dest-koh-samui.jpg","Khao Sok":"img/dest-khao-sok.jpg","Phuket":"img/dest-phuket.jpg","Krabi Town":"img/dest-krabi-town.jpg","Ao Nang":"img/dest-ao-nang.jpg","Railay":"img/dest-railay.jpg","Koh Phi Phi":"img/dest-koh-phi-phi.jpg","Koh Lanta":"img/dest-koh-lanta.jpg","Koh Lipe":"img/dest-koh-lipe.jpg","Ubud":"img/dest-ubud.jpg","Canggu":"img/dest-canggu.jpg","Seminyak":"img/dest-seminyak.jpg","Uluwatu":"img/dest-uluwatu.jpg","Sanur":"img/dest-sanur.jpg","Amed":"img/dest-amed.jpg","Nusa Penida":"img/dest-nusa-penida.jpg","Kuta Lombok":"img/dest-kuta-lombok.jpg","Senggigi":"img/dest-senggigi.jpg","Gili Trawangan":"img/dest-gili-trawangan.jpg","Gili Air":"img/dest-gili-air.jpg","Senaru":"img/dest-senaru.jpg","Bandar Lampung":"img/dest-bandar-lampung.jpg","Palembang":"img/dest-palembang.jpg","Bengkulu":"img/dest-bengkulu.jpg","Krui":"img/dest-krui.jpg","Pagar Alam":"img/dest-pagar-alam.jpg"};
// what each photo shows, who took it, its licence and its page on Wikimedia Commons
const PHOTO_CREDITS = [["Wat Arun and the Chao Phraya at sunset, Bangkok","Trip.with.taste","CC BY-SA 4.0","https://commons.wikimedia.org/wiki/File:Wat_Arun_on_the_sunset.jpg"],["Bottle Beach, Koh Phangan","Fabio Achilli","CC BY 2.0","https://commons.wikimedia.org/wiki/File:Koh_Phangan,_Bottle_Beach_(6217790821).jpg"],["Yaowarat Road (Chinatown) at night, Bangkok","Ninara","CC BY 2.0","https://commons.wikimedia.org/wiki/File:Yaowarat_at_night_(32455695783).jpg"],["Maya Bay, Koh Phi Phi Leh","Mikecleggphoto","CC BY-SA 4.0","https://commons.wikimedia.org/wiki/File:Maya_Bay,_Thailand_by_Mike_Clegg_Photography.jpg"],["Longtail boats at Railay, Krabi","Caitriana Nicholson","CC BY-SA 2.0","https://commons.wikimedia.org/wiki/File:Longtail_boats_(4443013006).jpg"],["Bangkok and the Chao Phraya at dusk","Swaminathan Gurgaon, India","CC BY 2.0","https://commons.wikimedia.org/wiki/File:Statetower.jpg"],["Tha Phae Gate, Chiang Mai","shankar s","CC BY 2.0","https://commons.wikimedia.org/wiki/File:Tha_Phae_Gate_on_the_old_city_walls_(14737657804).jpg"],["Pai Canyon","Bernhard T","CC BY-SA 3.0","https://commons.wikimedia.org/wiki/File:Pai_Canyon,_Thailand_2012-12-08_-_panoramio.jpg"],["Wat Rong Khun (the White Temple), Chiang Rai","Chainwit","CC BY 4.0","https://commons.wikimedia.org/wiki/File:Chiang_Rai_-_Wat_Rong_Khun_%E0%B8%A7%E0%B8%B1%E0%B8%94%E0%B8%A3%E0%B9%88%E0%B8%AD%E0%B8%87%E0%B8%82%E0%B8%B8%E0%B9%88%E0%B8%99_(2026)_-_img_11.jpg"],["Wat Sa Si, Sukhothai Historical Park","Dominic Nelson","CC BY-SA 4.0","https://commons.wikimedia.org/wiki/File:Sukhothai_-_Wat_Sa_Si_seen_across_the_lotus_pond_Jan_2024.jpg"],["Wat Chaiwatthanaram, Ayutthaya","Justin Vidamo","CC BY 2.0","https://commons.wikimedia.org/wiki/File:Sunset_at_Wat_Chaiwatthanaram,_Ayutthaya,_Thailand.jpg"],["The bridge over the River Kwai, Kanchanaburi","Krzysztof Golik","CC BY-SA 4.0","https://commons.wikimedia.org/wiki/File:River_Kwai_bridge_(17).jpg"],["Hua Hin beach","Elmschrat","CC0","https://commons.wikimedia.org/wiki/File:02_Hua_Hin_Beach.jpg"],["Pattaya bay","Omio Asad","CC BY 3.0","https://commons.wikimedia.org/wiki/File:Pattaya,_Thailand_Skyline.jpg"],["A beach on Koh Chang","gbuschner","CC BY-SA 3.0","https://commons.wikimedia.org/wiki/File:DPT.,_Tambon_Ko_Chang,_Amphoe_Ko_Chang,_Chang_Wat_Trat_23170,_Thailand_-_panoramio_(1).jpg"],["Sunrise over Ao Leuk, Koh Tao","Dominic Nelson","CC BY-SA 4.0","https://commons.wikimedia.org/wiki/File:Koh_Tao_-_sunrise_over_Ao_Leuk_bay_-_Oct_2024.jpg"],["Bottle Beach from the viewpoint, Koh Phangan","kaaist","CC0","https://commons.wikimedia.org/wiki/File:View_to_Bottle_Beach,_Koh_Phangan.jpg"],["A beach on Koh Samui","Roma Neus","CC BY 3.0","https://commons.wikimedia.org/wiki/File:Samui_(2014_febr.)_-_panoramio_(68).jpg"],["Cheow Lan Lake, Khao Sok","Avenlarosa","CC BY-SA 4.0","https://commons.wikimedia.org/wiki/File:Rajjaprabha_Dam_Reservoir_05.jpg"],["Phuket from a viewpoint","Wikimedia Commons contributor","CC BY-SA 3.0","https://commons.wikimedia.org/wiki/File:Phuket_Viewpoint.jpg"],["Khao Khanab Nam, Krabi Town","Stefan Fussan","CC BY-SA 3.0","https://commons.wikimedia.org/wiki/File:Krabi_-_Khao_Khanab_Nam_-_0004.jpg"],["Ao Nang beach","kallerna","CC BY-SA 3.0","https://commons.wikimedia.org/wiki/File:Ao_Nang_beach_panorama_3.jpg"],["Railay","Wokshots","CC BY-SA 4.0","https://commons.wikimedia.org/wiki/File:Postcard_image_of_blue_water_Krabi_Railay_Beach_Thailand.jpg"],["Koh Phi Phi from the viewpoint","Caitriana Nicholson","CC BY-SA 2.0","https://commons.wikimedia.org/wiki/File:Koh_Phi_Phi_viewpoint_(4464253988).jpg"],["Klong Nin beach, Koh Lanta","Fabio Achilli","CC BY 2.0","https://commons.wikimedia.org/wiki/File:Klong_Nin_Beach,_Koh_Lanta.jpg"],["A beach on Koh Lipe","Koh Lipe Thailand: Koh Lipe Beach Resort","CC0","https://commons.wikimedia.org/wiki/File:Koh_Lipe_Thailand._Koh_Lipe_Beach_Resort,_Koh_Lipe_Island_01.jpg"],["Tegallalang rice terraces, near Ubud","Philip Nalangan","CC BY 4.0","https://commons.wikimedia.org/wiki/File:Tegallalang_Rice_Terraces_Bali.jpg"],["Canggu beach","Mx. Granger","CC0","https://commons.wikimedia.org/wiki/File:Canggu_beach_2.jpg"],["Seminyak beach at sunset","Christophe95","CC BY-SA 4.0","https://commons.wikimedia.org/wiki/File:Seminyak_Beach_at_sunset.jpg"],["The cliffs at Uluwatu","Jakub Hałun","CC BY-SA 4.0","https://commons.wikimedia.org/wiki/File:Uluwatu,_Bali,_Indonesia,_20220826_0950_1004.jpg"],["Sanur beach","Aspere","CC0","https://commons.wikimedia.org/wiki/File:250217_Sanur_Beach_08.jpg"],["Fishing boats on the beach at Amed","Marklchaves","CC BY-SA 4.0","https://commons.wikimedia.org/wiki/File:Bali-amed-village-fishing-beach-boats.jpg"],["Kelingking Beach, Nusa Penida","Chainwit.","CC BY 4.0","https://commons.wikimedia.org/wiki/File:Kelingking_Beach_(T-Rex_Bay)_of_Nusa_Penida,_Bali_(2025)_-_img_08.jpg"],["Kuta beach, Lombok","Midori","CC BY 3.0","https://commons.wikimedia.org/wiki/File:Kuta_Beach_Lombok_4.JPG"],["Senggigi beach","Midori","CC BY 3.0","https://commons.wikimedia.org/wiki/File:Senggigi_Beach_by_Senggigi_Beach_Hotel.JPG"],["A beach on Gili Trawangan","Jorge Láscar from Melbourne, Australia","CC BY 2.0","https://commons.wikimedia.org/wiki/File:Beach_-_Gili_Trawangan_(16950555226).jpg"],["Gili Air’s east coast, looking towards Lombok","Laurent Bigué","CC BY-SA 3.0","https://commons.wikimedia.org/wiki/File:Gili_Air_Eastern_coast_looking_at_Lombok.jpg"],["Tiu Kelep waterfall, Senaru","JVan","CC BY-SA 3.0","https://commons.wikimedia.org/wiki/File:Senaru_Waterfall.JPG"],["Bandar Lampung and its bay","22Kartika","CC BY-SA 3.0","https://commons.wikimedia.org/wiki/File:Bandar_Lampung.JPG"],["The Ampera Bridge over the Musi river, Palembang","Herusutimbul","CC BY-SA 4.0","https://commons.wikimedia.org/wiki/File:LRT_Palembang_Melintas_di_Samping_Jembatan_Ampera_Palembang.jpg"],["Fort Marlborough, Bengkulu","Senaa09","CC BY-SA 4.0","https://commons.wikimedia.org/wiki/File:Fort_Marlborough_Depan.jpg"],["The Bukit Barisan mountains from the beach at Krui","Hutanrimba366","CC BY-SA 4.0","https://commons.wikimedia.org/wiki/File:Pesona_Bukit_Barisan_Selatan_dari_Hamparan_Pantai_Krui.jpg"],["Tea plantation below Mount Dempo, Pagar Alam","Achmad Rabin Taim","CC BY 2.0","https://commons.wikimedia.org/wiki/File:Mount-dempo-tea-plantation.jpg"]];
