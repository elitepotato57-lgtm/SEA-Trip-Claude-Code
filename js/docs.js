/* ============================================================
   76-docs: Documents (Tools > Documents).
   Boarding passes, bookings, the TDAC, visas, insurance: photos and PDFs kept ONLY on this phone (IndexedDB),
   read on the phone to name and sort them: pdf.js for PDFs, Tesseract for photos and screenshots
   (both in vendor/, loaded the first time they're needed). Nothing is uploaded anywhere.
   ============================================================ */
const DOC_SECTIONS = [
  {id:"flight", l:"Flights", grp:"Transport", ic:"plane"},
  {id:"bus", l:"Buses and vans", grp:"Transport", ic:"bus"},
  {id:"train", l:"Trains", grp:"Transport", ic:"train"},
  {id:"ferry", l:"Ferries and boats", grp:"Transport", ic:"ship"},
  {id:"stay", l:"Accommodation", grp:"Accommodation", ic:"bed"},
  {id:"entry", l:"TDAC and visas", grp:"Entry and ID", ic:"passport"},
  {id:"id", l:"Passport and ID", grp:"Entry and ID", ic:"passport"},
  {id:"insurance", l:"Insurance", grp:"Entry and ID", ic:"shield"},
  {id:"tour", l:"Tours and tickets", grp:"Activities", ic:"ticket"},
  {id:"other", l:"Other", grp:"Other", ic:"file"}
];
const DOC_BY_ID = Object.fromEntries(DOC_SECTIONS.map(s => [s.id, s]));
const DOC_GROUPS = ["Transport", "Accommodation", "Entry and ID", "Activities", "Other"];

/* ---------- working out what a document is (pure: tested in tests/unit.js) ---------- */
// words that point to each kind of document, with how strongly
const DOC_RULES = {
  flight: [[/boarding pass|boarding time|\bgate\b|e-?ticket receipt|itinerary receipt|flight (no|number)|\bseat\b|\bpnr\b|booking reference|airways|airlines?\b|air ?asia|nok ?air|thai lion|lion air|thai smile|bangkok airways|vietjet|scoot|emirates|qatar|etihad|easyjet|ryanair|british airways|baggage allowance|cabin bag|terminal/i, 3],
           [/\bflight\b|depart(ure|s)|arriv(al|es)|\bfrom\b.*\bto\b/i, 1]],
  bus:    [[/\bbus\b|\bcoach\b|minivan|mini ?van|\bvan\b|nakhonchai|green bus|sombat tour|transport co|bus terminal|\bbks\b|mo chit/i, 3]],
  train:  [[/\btrain\b|railway|\bsrt\b|state railway|sleeper|\bberth\b|carriage|car no|krung thep aphiwat|hua lamphong/i, 3]],
  ferry:  [[/ferry|speedboat|speed boat|\bpier\b|lomprayah|seatran|songserm|catamaran|raja ferry|longtail|long-tail|\bboat\b/i, 3]],
  stay:   [[/booking\.com|agoda|hostelworld|airbnb|trip\.com|expedia|hotels\.com|check-?in|check-?out|reservation|\bnights?\b|room type|\bdorm|property|accommodation|guest ?house|\bhostel\b|\bhotel\b|\bresort\b/i, 2]],
  entry:  [[/tdac|digital arrival card|arrival card|immigration|\be-?visa\b|\bvisa\b|entry permit|\btm\.? ?6\b|visa on arrival|visa exemption/i, 4]],
  id:     [[/passport|p<gbr|nationality|date of birth|place of birth|driving licen[cs]e|identity card|\bid card\b/i, 3]],
  insurance: [[/insurance|insurer|policy (number|no)|certificate of cover|travel cover|world nomads|safetywing|\bclaims?\b|emergency assistance|medical cover/i, 3]],
  tour:   [[/\btour\b|excursion|admission|entry ticket|klook|getyourguide|get your guide|viator|island hopping|snorkel|cooking class|muay thai|\bticket\b/i, 2]]
};
const DOC_PRIORITY = ["entry", "id", "insurance", "flight", "train", "ferry", "bus", "stay", "tour"];
const AIRPORTS = {BKK:"Bangkok", DMK:"Bangkok Don Mueang", CNX:"Chiang Mai", CEI:"Chiang Rai", HKT:"Phuket", USM:"Koh Samui", KBV:"Krabi", URT:"Surat Thani",
  HDY:"Hat Yai", TDX:"Trat", UTH:"Udon Thani", KKC:"Khon Kaen", NST:"Nakhon Si Thammarat", HHQ:"Hua Hin", LHR:"London Heathrow", LGW:"London Gatwick",
  MAN:"Manchester", BHX:"Birmingham", EDI:"Edinburgh", GLA:"Glasgow", DUB:"Dublin", DXB:"Dubai", DOH:"Doha", AUH:"Abu Dhabi", IST:"Istanbul",
  SIN:"Singapore", KUL:"Kuala Lumpur", HAN:"Hanoi", SGN:"Ho Chi Minh City", DAD:"Da Nang", REP:"Siem Reap", SAI:"Siem Reap", PNH:"Phnom Penh",
  VTE:"Vientiane", LPQ:"Luang Prabang", DPS:"Bali", HKG:"Hong Kong", ICN:"Seoul", NRT:"Tokyo Narita", HND:"Tokyo Haneda", CMB:"Colombo", DEL:"Delhi", BOM:"Mumbai"};
const MONTHS = {jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, sept:8, oct:9, nov:10, dec:11};

// the first sensible date in the text, as YYYY-MM-DD
function docDate(text){
  const t = String(text || "");
  const ok = (y, m, d) => y >= 2024 && y <= 2030 && m >= 0 && m < 12 && d >= 1 && d <= 31;
  const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const year2 = y => y < 100 ? 2000 + y : y;
  let m;
  const re = [
    [/\b(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s*,?\s*(\d{2,4})\b/gi, x => [year2(+x[3]), MONTHS[x[2].toLowerCase()], +x[1]]],
    [/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/gi, x => [+x[3], MONTHS[x[1].toLowerCase()], +x[2]]],
    [/\b(20\d{2})-(\d{2})-(\d{2})\b/g, x => [+x[1], +x[2] - 1, +x[3]]],
    [/\b(\d{1,2})[\/.](\d{1,2})[\/.](20\d{2})\b/g, x => [+x[3], +x[2] - 1, +x[1]]]          // UK style: day first
  ];
  let best = null;
  for (const [r, f] of re){ while ((m = r.exec(t))){ const [y, mo, d] = f(m); if (ok(y, mo, d) && (!best || m.index < best.at)) best = {at:m.index, iso:iso(y, mo, d)}; } }
  return best ? best.iso : null;
}
// two places in the order they appear: airport codes for flights, destination names otherwise
function docRoute(text, section){
  const t = String(text || "");
  if (section === "flight"){
    const codes = [...t.matchAll(/\b([A-Z]{3})\b/g)].map(x => x[1]).filter(c => AIRPORTS[c]);
    const uniq = [...new Set(codes)];
    if (uniq.length >= 2) return [uniq[0], uniq[1]];
  }
  const names = (typeof D !== "undefined" ? D.cities.map(c => c[0]) : []).concat(["Surat Thani", "Krabi", "Chumphon", "Don Sak", "Hat Yai", "Trat", "Ko Tao", "Ko Phangan", "Ko Samui"]);
  const hits = [];
  names.forEach(n => { const i = t.toLowerCase().indexOf(n.toLowerCase()); if (i >= 0) hits.push([i, n.replace(/^Ko /, "Koh ")]); });
  hits.sort((a, b) => a[0] - b[0]);
  const uniq = [...new Set(hits.map(h => h[1]))];
  return uniq.length >= 2 ? [uniq[0], uniq[1]] : null;
}
const shortDate = iso => { try { return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", {day:"numeric", month:"short"}); } catch(e){ return iso; } };
const prettyFile = f => String(f || "Document").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 50) || "Document";

/* returns {section, name, date, route} from the text read off the document plus its file name */
function classifyDoc(text, filename){
  const all = `${filename || ""}\n${text || ""}`;
  const score = {};
  for (const [sec, rules] of Object.entries(DOC_RULES)){
    let s = 0;
    for (const [re, w] of rules){ const g = new RegExp(re.source, "gi"); const n = (all.match(g) || []).length; s += Math.min(n, 4) * w; }
    score[sec] = s;
  }
  // a boarding pass mentions "seat" and "gate"; a hotel booking mentions "check-in" too: flights win when there's an airline flight number
  if (/\b[A-Z0-9]{2}\s?\d{2,4}\b/.test(text || "") && score.flight >= 6) score.flight += 4;
  let section = "other", best = 0;
  for (const sec of DOC_PRIORITY){ if (score[sec] > best){ best = score[sec]; section = sec; } }
  if (best < 3) section = "other";
  const date = docDate(all), route = section === "other" ? null : docRoute(all, section);
  const when = date ? `, ${shortDate(date)}` : "";
  const way = route ? ` ${route[0]} → ${route[1]}` : "";
  let name;
  if (section === "flight") name = `Flight${way}${when}`;
  else if (section === "bus") name = `Bus${way}${when}`;
  else if (section === "train") name = `Train${way}${when}`;
  else if (section === "ferry") name = `Ferry${way}${when}`;
  else if (section === "stay"){
    const site = (/(booking\.com|agoda|hostelworld|airbnb|trip\.com|expedia)/i.exec(all) || [])[1];
    const place = (/^.*\b(hostel|hotel|resort|guest ?house|bungalows?|villa|inn|lodge)\b.*$/im.exec(text || "") || [])[0];
    name = (place && place.trim().length <= 45 ? place.trim() : site ? `${site.replace(/^./, c => c.toUpperCase())} booking` : "Accommodation booking") + when;
  }
  else if (section === "entry") name = /tdac|digital arrival card|arrival card/i.test(all) ? "TDAC arrival card" + when : /visa/i.test(all) ? "Visa" + when : "Entry document" + when;
  else if (section === "id") name = /passport|p<gbr/i.test(all) ? "Passport" : "ID";
  else if (section === "insurance"){ const ins = (/(world nomads|safetywing|axa|allianz|aviva|direct line|post office|staysure|columbus|true traveller|battleface)/i.exec(all) || [])[1]; name = ins ? `Travel insurance (${ins.replace(/\b\w/g, c => c.toUpperCase())})` : "Travel insurance"; }
  else if (section === "tour") name = (/(klook|getyourguide|viator)/i.exec(all) ? "Booking: " : "Ticket") + (route ? way : "") + when;
  else name = prettyFile(filename);
  return {section, name: name.replace(/^Booking: $/, "Booking").trim(), date, route};
}

/* ---------- storage on the phone (IndexedDB) ---------- */
const Docs = {
  _db:null,
  db(){
    if (this._db) return this._db;
    this._db = new Promise((res, rej) => {
      const r = indexedDB.open("sea-trip-docs", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("docs", {keyPath:"id"});
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return this._db;
  },
  async tx(mode, fn){
    const db = await this.db();
    return new Promise((res, rej) => { const t = db.transaction("docs", mode); const st = t.objectStore("docs"); const out = fn(st); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); });
  },
  all(){ return this.tx("readonly", st => st.getAll()).then(r => (r || []).sort((a, b) => (b.date || b.added).localeCompare(a.date || a.added))); },
  put(doc){ return this.tx("readwrite", st => st.put(doc)); },
  del(id){ return this.tx("readwrite", st => st.delete(id)); },
  async exportAll(){
    if (!("indexedDB" in window)) return [];
    let list = []; try { list = await this.all(); } catch(e){ return []; }
    const out = [];
    for (const d of list){ const data = await blobToDataURL(d.blob); out.push(Object.assign({}, d, {blob:undefined, data})); }
    return out;
  },
  async importAll(list, replace){
    if (replace){ const have = await this.all(); for (const d of have) await this.del(d.id); }
    for (const d of list){
      if (!d || !d.id || typeof d.data !== "string" || !/^data:[\w.+\/-]+;base64,/.test(d.data)) continue;
      const blob = await (await fetch(d.data)).blob();
      const sec = DOC_BY_ID[d.section] ? d.section : "other";
      await this.put({id:String(d.id), name:String(d.name || "Document").slice(0, 80), section:sec, mime:blob.type, size:blob.size, added:String(d.added || new Date().toISOString()),
        date:d.date || null, text:String(d.text || "").slice(0, 4000), thumb:typeof d.thumb === "string" && /^data:image\//.test(d.thumb) ? d.thumb : null, blob});
    }
  }
};
const blobToDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });

/* ---------- reading documents on the phone ---------- */
let pdfjsLib = null, ocrWorker = null;
async function loadPdfjs(){
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import(new URL("vendor/pdfjs/pdf.min.mjs", location.href).href);
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("vendor/pdfjs/pdf.worker.min.mjs", location.href).href;
  return pdfjsLib;
}
async function pdfText(blob, maxPages = 3){
  const lib = await loadPdfjs();
  const pdf = await lib.getDocument({data:new Uint8Array(await blob.arrayBuffer())}).promise;
  let text = "";
  for (let i = 1; i <= Math.min(pdf.numPages, maxPages); i++){
    const page = await pdf.getPage(i); const tc = await page.getTextContent();
    text += tc.items.map(x => x.str + (x.hasEOL ? "\n" : " ")).join("") + "\n";
  }
  return {pdf, text};
}
async function pdfPageImage(pdf, n, width){
  const page = await pdf.getPage(n);
  const v1 = page.getViewport({scale:1}), scale = width / v1.width, vp = page.getViewport({scale});
  const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  await page.render({canvasContext:c.getContext("2d"), viewport:vp, canvas:c}).promise;
  return c;
}
function loadScript(src){ return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
async function ocrImage(blob){
  if (typeof Tesseract === "undefined") await loadScript("vendor/tesseract/tesseract.min.js");
  if (!ocrWorker){
    const abs = p => new URL(p, location.href).href;
    ocrWorker = await Tesseract.createWorker("eng", 1, {workerPath:abs("vendor/tesseract/worker.min.js"), corePath:abs("vendor/tesseract/tesseract-core-simd-lstm.wasm.js"),
      langPath:abs("vendor/tesseract"), gzip:true, workerBlobURL:false});
  }
  const {data} = await ocrWorker.recognize(blob);
  return data.text || "";
}
// a small picture for the list (JPEG, 360 px wide)
async function thumbFrom(source){
  const w = 360;
  let c;
  if (source instanceof HTMLCanvasElement) c = source;
  else {
    const img = await createImageBitmap(source);
    c = document.createElement("canvas"); c.width = img.width; c.height = img.height; c.getContext("2d").drawImage(img, 0, 0);
  }
  const t = document.createElement("canvas"); t.width = w; t.height = Math.round(c.height * w / c.width);
  t.getContext("2d").drawImage(c, 0, 0, t.width, t.height);
  return t.toDataURL("image/jpeg", .72);
}
// read one file: work out what it is, make its picture, and keep it
async function addDocFile(file, onStage){
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const isImg = /^image\//.test(file.type);
  if (!isPdf && !isImg) throw new Error(`${file.name}: only photos and PDFs can be added`);
  let text = "", thumb = null;
  try {
    if (isPdf){ onStage && onStage("Reading the PDF"); const r = await pdfText(file); text = r.text; thumb = await thumbFrom(await pdfPageImage(r.pdf, 1, 480)); }
    else { onStage && onStage("Reading the text in the picture"); thumb = await thumbFrom(file); text = await ocrImage(file); }
  } catch(e){ /* couldn't read it: it's still kept, sorted by its file name */ }
  const c = classifyDoc(text, file.name);
  const doc = {id:"d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name:c.name, section:c.section, mime:file.type || (isPdf ? "application/pdf" : "image/jpeg"),
    size:file.size, added:new Date().toISOString(), date:c.date, text:text.slice(0, 4000), thumb, blob:file};
  await Docs.put(doc);
  return doc;
}

/* ---------- the page: Tools > Documents ---------- */
const docUI = {q:"", busy:"", list:null};
TOOL_PAGES.docs = root => {
  root.innerHTML = toolHero("Documents", "Tickets, bookings and entry papers, kept on this phone") + `<div class="page">
    <div class="row" style="margin-top:4px"><label class="btn primary" style="cursor:pointer">${icon("upload", "i s")}Add photos or files<input type="file" id="docAdd" accept="image/*,application/pdf" multiple hidden></label></div>
    <p class="note" style="margin-top:6px">Boarding passes, booking confirmations, your TDAC, visa and insurance. Each one is read on your phone to name it and put it in the right section; nothing is uploaded. Screenshots work too.</p>
    <div id="docBusy"></div>
    <label class="sbar" style="margin-top:10px"><span class="vis-hidden">Search documents</span>${icon("search")}<input type="search" id="docQ" placeholder="Search your documents" value="${esc(docUI.q)}"></label>
    <div id="docList"><p class="note" style="margin-top:12px">Loading…</p></div>
    <p class="note" style="margin-top:14px">Documents live only on this phone. Back them up in Tools › Offline & backup, and keep paper or emailed copies of anything you can't travel without.</p>
  </div>`;
  if (!("indexedDB" in window)){ $("#docList").innerHTML = emptyBlock("Not available here", "<div>This browser can't keep documents.</div>"); return; }
  paintDocs();
  $("#docQ").oninput = debounce(e => { docUI.q = e.target.value; paintDocs(); }, 150);
  $("#docAdd").onchange = async e => {
    const files = [...(e.target.files || [])]; e.target.value = "";
    const busy = $("#docBusy"); const added = [];
    for (const [i, f] of files.entries()){
      const say = stage => { if (busy) busy.innerHTML = `<div class="callout">${icon("clock")}<div><b>${esc(f.name)}</b> (${i + 1} of ${files.length})<br>${esc(stage)}…${/picture/.test(stage) ? " The first one takes a little longer." : ""}</div></div>`; };
      say("Starting");
      try { added.push(await addDocFile(f, say)); } catch(err){ toast(err.message || `Couldn't add ${f.name}`); }
    }
    if (busy) busy.innerHTML = "";
    if (added.length) toast(added.length === 1 ? `Added “${added[0].name}” to ${DOC_BY_ID[added[0].section].l}` : `Added ${added.length} documents`);
    paintDocs();
  };
};
async function paintDocs(){
  const el = $("#docList"); if (!el) return;
  let list = []; try { list = await Docs.all(); } catch(e){ el.innerHTML = emptyBlock("Couldn't open your documents", "<div>Try closing and reopening the app.</div>"); return; }
  const q = foldText(docUI.q);
  if (q) list = list.filter(d => foldText(`${d.name} ${d.text} ${DOC_BY_ID[d.section].l}`).includes(q));
  if (!list.length){ el.innerHTML = q ? `<p class="note" style="margin-top:12px">Nothing matches “${esc(docUI.q)}”.</p>` : emptyBlock("No documents yet", "<div>Add your boarding passes, bookings and TDAC so they're here with no signal.</div>"); return; }
  el.innerHTML = DOC_GROUPS.map(g => {
    const secs = DOC_SECTIONS.filter(s => s.grp === g).map(s => [s, list.filter(d => d.section === s.id)]).filter(([, ds]) => ds.length);
    if (!secs.length) return "";
    return `<div class="sect"><h2>${esc(g)}</h2></div>` + secs.map(([s, ds]) => `${secs.length > 1 || s.l !== g ? `<h3 class="doc-sub">${icon(s.ic, "i s")}${esc(s.l)}</h3>` : ""}
      <div class="docs">${ds.map(d => `<button class="doc" type="button" data-doc="${esc(d.id)}">
        <span class="doc-ph" style="${d.thumb ? `background-image:url(${d.thumb})` : ""}">${d.thumb ? "" : icon(s.ic)}</span>
        <span class="doc-txt"><b>${esc(d.name)}</b><small>${d.date ? esc(niceDate(d.date)) + " · " : ""}${/pdf/.test(d.mime) ? "PDF" : "Photo"} · ${fmtBytes(d.size)}</small></span>${icon("chevr", "i s")}</button>`).join("")}</div>`).join("");
  }).join("");
  el.querySelectorAll("[data-doc]").forEach(b => b.onclick = () => openDoc(b.dataset.doc));
}
async function openDoc(id){
  const d = (await Docs.all()).find(x => x.id === id); if (!d) return;
  const url = URL.createObjectURL(d.blob);
  const isPdf = /pdf/.test(d.mime);
  openSheet(`<div class="sheet-head"><div><span class="kind">${icon(DOC_BY_ID[d.section].ic, "i xs")} ${esc(DOC_BY_ID[d.section].l)}</span><h2 id="docTitle">${esc(d.name)}</h2></div>
      <button class="icon-btn" type="button" data-close aria-label="Close">${icon("x")}</button></div>
    <div class="sheet-body">
      <div id="docView" class="doc-view">${isPdf ? `<p class="note">Opening the PDF…</p>` : `<img src="${url}" alt="${esc(d.name)}">`}</div>
      <div class="row" style="margin-top:10px"><button class="btn primary" type="button" id="docShare">${icon("share", "i s")}Share or open in…</button></div>
      <h3 style="margin-top:16px">Details</h3>
      <label class="field">Name<input type="text" id="docName" value="${esc(d.name)}" maxlength="80"></label>
      <label class="field">Section<select id="docSec">${DOC_SECTIONS.map(s => `<option value="${s.id}" ${s.id === d.section ? "selected" : ""}>${esc(s.grp === s.l ? s.l : s.grp + ": " + s.l)}</option>`).join("")}</select></label>
      <label class="field">Date<input type="date" id="docDateIn" value="${esc(d.date || "")}"></label>
      <div class="row" style="margin-top:10px"><button class="btn" type="button" id="docSave">${icon("check", "i s")}Save changes</button><button class="btn" type="button" id="docDel">${icon("trash", "i s")}Delete</button></div>
      <p class="note" style="margin-top:10px">Added ${esc(niceDate(d.added.slice(0, 10)))}. Kept only on this phone.</p>
    </div>`, "docTitle");
  if (isPdf){
    try {
      const lib = await loadPdfjs(); const pdf = await lib.getDocument({data:new Uint8Array(await d.blob.arrayBuffer())}).promise;
      const box = $("#docView"); if (!box) return; box.innerHTML = "";
      const width = Math.min(1200, (box.clientWidth || 360) * (window.devicePixelRatio || 1));
      for (let i = 1; i <= Math.min(pdf.numPages, 8); i++){ const c = await pdfPageImage(pdf, i, width); c.className = "doc-page"; box.appendChild(c); }
      if (pdf.numPages > 8) box.insertAdjacentHTML("beforeend", `<p class="note">First 8 of ${pdf.numPages} pages. Use “Share or open in…” for the rest.</p>`);
    } catch(e){ const box = $("#docView"); if (box) box.innerHTML = `<p class="note">Couldn't show this PDF here. Use “Share or open in…”.</p>`; }
  }
  $("#docShare").onclick = async () => {
    const ext = isPdf ? ".pdf" : "." + ((d.mime.split("/")[1] || "jpg").replace("jpeg", "jpg"));
    const file = new File([d.blob], d.name.replace(/[\\/:*?"<>|]+/g, " ").trim() + ext, {type:d.mime});
    if (navigator.canShare && navigator.canShare({files:[file]})){ try { await navigator.share({files:[file], title:d.name}); } catch(e){} }
    else window.open(url, "_blank", "noopener");
  };
  $("#docSave").onclick = async () => {
    d.name = ($("#docName").value || "").trim().slice(0, 80) || d.name; d.section = DOC_BY_ID[$("#docSec").value] ? $("#docSec").value : d.section; d.date = $("#docDateIn").value || null;
    await Docs.put(d); toast("Saved"); closeDetail(); paintDocs();
  };
  $("#docDel").onclick = async () => {
    if (!confirm(`Delete “${d.name}” from this phone? This can't be undone.`)) return;
    await Docs.del(d.id); URL.revokeObjectURL(url); toast("Deleted"); closeDetail(); paintDocs();
  };
}
