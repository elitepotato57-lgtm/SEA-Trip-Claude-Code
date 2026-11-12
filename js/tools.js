/* ============================================================
   60-tools: the Tools hub (backpacker toolkit), currency, translator and phrasebook, settings
   Budget, weather, Wi-Fi, guide, emergency, assistant and deals are in 65-tools-more.
   ============================================================ */
const TOOLS = [
  {id:"currency", l:"Currency", d:"Baht and other rates, works offline", ic:"cash"},
  {id:"translate", l:"Translator", d:"Thai phrasebook and live translation", ic:"lang", alt:1},
  {id:"budget", l:"Budget", d:"Set a budget, log what you spend", ic:"wallet"},
  {id:"weather", l:"Weather", d:"Now and the next 7 days", ic:"cloudsun", alt:1},
  {id:"transport", l:"Transport", d:"Buses, trains, ferries and flights", ic:"bus"},
  {id:"wifi", l:"Wi-Fi finder", d:"Cafés and spots with Wi-Fi", ic:"wifi", alt:1},
  {id:"guide", l:"Thailand guide", d:"Entry rules, money, customs", ic:"book"},
  {id:"emergency", l:"Emergency", d:"Numbers, hospitals, embassy", ic:"siren", alt:1},
  {id:"assistant", l:"Trip assistant", d:"Ask about stays, food, journeys", ic:"spark"},
  {id:"deals", l:"Deals", d:"Where genuine offers are posted", ic:"tag", alt:1}
];
const TOOL_PAGES = {};          // id -> {render(root), title}; filled in by each tool below
function renderTools(){
  const root = $("#pageview"), sub = ui.sub;
  if (sub === "transport"){ root.innerHTML = transportPage(); bindTransport(); return; }
  if (sub === "settings"){ root.innerHTML = setupPage(); bindSetup(); return; }
  if (sub && TOOL_PAGES[sub]){ TOOL_PAGES[sub](root); return; }
  const c = D.countries[S.country];
  root.innerHTML = hero({title:"Tools", sub:`Backpacker toolkit for ${c.name}`, img:HERO_IMG.tools}) + `<div class="page">
    <div class="tgrid">${TOOLS.map(t => `<a class="tool ${t.alt ? "alt" : ""}" href="#tools/${t.id}"><span class="ti">${icon(t.ic)}</span><span><b>${t.l}</b><small>${t.d}</small></span></a>`).join("")}</div>
    <div class="sect"><h2>Essentials nearby</h2><a href="#map" id="t-essmap">View on map</a></div>
    <div class="egrid">${["laundry","atm","pharmacy","water","shop","supermarket","sim","hospital"].map(id => { const e = ESS_BY_ID[id]; return `<button class="ebtn" type="button" data-ess="${id}">${icon(e.ic)}${e.l.replace(" and minimarts", "")}</button>`; }).join("")}</div>
    <p class="note" style="margin-top:8px">Opens the map on that service around ${esc(focusPt().none ? c.name : focusLabel())}.</p>
    <div class="sect"><h2>App</h2></div>
    <div class="tgrid"><a class="tool" href="#saved"><span class="ti">${icon("bookmark")}</span><span><b>Saved places</b><small>${Object.keys(S.saved).length} saved on this phone</small></span></a>
      <a class="tool alt" href="#tools/settings"><span class="ti">${icon("cog")}</span><span><b>Settings</b><small>Location, rates, data</small></span></a>
      <a class="tool" href="#discover"><span class="ti">${icon("compass")}</span><span><b>Discover Thailand</b><small>Destinations at a glance</small></span></a></div>
  </div>`;
  root.querySelectorAll("[data-ess]").forEach(b => b.onclick = () => showEssentialOnMap(b.dataset.ess));
  $("#t-essmap").onclick = e => { e.preventDefault(); ui.essOpen = true; go("#map"); };
}
const toolHero = (title, sub) => hero({title, sub, back:["#tools", "Tools"]});

/* ---------- currency ---------- */
const HOME_CURS = ["GBP", "USD", "EUR", "AUD"];
let conv = {cur:null, home:"GBP", gbp:"10", loc:""};
async function refreshLiveRates(force){
  if (!force && S.live && Date.now() - S.live.at < 12 * 3600e3) return S.live;
  const urls = ["https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/gbp.json", "https://latest.currency-api.pages.dev/v1/currencies/gbp.json"];
  for (const u of urls){
    try {
      const j = await getJSON(u, {timeout:9000});
      const rates = {};
      Object.keys(D.rates).forEach(k => { const v = j.gbp && j.gbp[k.toLowerCase()]; if (k !== "GBP" && v > 0) rates[k] = v; });
      if (!rates.THB) continue;
      S.live = {at:Date.now(), date:j.date, rates}; persist();
      return S.live;
    } catch(e){}
  }
  return null;
}
function curOptions(sel, list){
  return list.map(k => `<option value="${k}" ${k === sel ? "selected" : ""}>${k} (${CUR_NAME[k]})</option>`).join("");
}
const cross = (v, from, to) => from === to ? v : v / rate(from) * rate(to);         // every rate is "per £1"
TOOL_PAGES.currency = root => {
  const c = D.countries[S.country];
  if (!conv.cur || conv.lastCountry !== S.country){ conv.cur = c.cur; conv.lastCountry = S.country; conv.loc = ""; }
  const locals = [c.cur, ...c.alt, ...Object.keys(D.rates).filter(k => k !== c.cur && !c.alt.includes(k) && k !== conv.home)];
  const r = cross(1, conv.home, conv.cur);
  const homeVal = conv.gbp !== "" ? +conv.gbp : null;
  const locVal = conv.loc !== "" ? conv.loc : (homeVal != null ? String(Math.round(homeVal * r * 100) / 100) : "");
  const quick = (NOTES[conv.cur] || []).map(n => `<div><span>${money(n, conv.cur)}</span><b>${money(cross(n, conv.cur, conv.home), conv.home)}</b></div>`).join("");
  const live = S.live && S.live.rates[conv.cur];
  root.innerHTML = toolHero("Currency", `Money for ${c.name}`) + `<div class="page">
  <section class="block" aria-labelledby="h-conv">
    <h2 id="h-conv">Money converter</h2>
    <div class="conv" style="margin-top:8px">
      <label class="field"><select id="cv-home" aria-label="Your currency">${curOptions(conv.home, HOME_CURS)}</select><input class="big-in" inputmode="decimal" id="cv-gbp" value="${esc(conv.gbp)}" aria-label="Amount in your currency"></label>
      <span style="padding-bottom:12px;color:var(--muted)">${icon("swap")}</span>
      <label class="field"><select id="cv-cur" aria-label="Local currency">${curOptions(conv.cur, locals)}</select><input class="big-in" inputmode="decimal" id="cv-loc" value="${esc(locVal)}" aria-label="Amount in local currency"></label>
    </div>
    <p class="note" style="margin-top:10px" id="cv-note">${money(1, conv.home)} = ${money(r, conv.cur)}. ${esc(S.rates[conv.cur] > 0 ? "Using your own rate." : live ? `Live mid-market rate, updated ${S.live.date}.` : `Built-in rate (${D.rates[conv.cur].note}).`)} Cash exchanges and cards give a little less.</p>
    <div class="row" style="margin-top:8px"><button class="btn small" type="button" id="cv-refresh">${icon("swap","i s")}Update rates now</button><a class="btn small ghost" href="#tools/settings">Set my own rate</a></div>
    <div class="quick" aria-label="Common notes">${quick}</div>
  </section>
  <p class="note">Rates come free from the open currency-api project (updated daily) and are saved on your phone, so the converter keeps working with no signal. Built-in fallback rates were checked on ${esc(D.checked)}.</p></div>`;
  const hIn = $("#cv-gbp"), lIn = $("#cv-loc");
  const num = s => { const v = parseFloat(String(s).replace(/,/g, "")); return isNaN(v) ? null : v; };
  hIn.oninput = () => { conv.gbp = hIn.value; conv.loc = ""; const v = num(hIn.value); lIn.value = v == null ? "" : String(Math.round(cross(v, conv.home, conv.cur) * 100) / 100); };
  lIn.oninput = () => { conv.loc = lIn.value; const v = num(lIn.value); const g = v == null ? "" : String(Math.round(cross(v, conv.cur, conv.home) * 100) / 100); hIn.value = g; conv.gbp = g; };
  $("#cv-cur").onchange = e => { conv.cur = e.target.value; conv.loc = ""; renderPage(); };
  $("#cv-home").onchange = e => { conv.home = e.target.value; if (conv.cur === conv.home) conv.cur = c.cur === conv.home ? "THB" : c.cur; conv.loc = ""; renderPage(); };
  $("#cv-refresh").onclick = async () => { toast("Checking rates…"); const l = await refreshLiveRates(true); toast(l ? `Rates updated (${l.date})` : "Couldn’t reach the rates service. Using saved rates."); if (ui.sub === "currency") renderPage(); };
  refreshLiveRates(false).then(l => { if (l && !live && ui.view === "tools" && ui.sub === "currency" && document.activeElement !== hIn && document.activeElement !== lIn) renderPage(); });
};

/* ---------- translator and phrasebook ---------- */
const TR_LANGS = [["th", "Thai"], ["km", "Khmer (Cambodia)"], ["vi", "Vietnamese"], ["lo", "Lao"], ["ms", "Malay"], ["id", "Indonesian"], ["zh-CN", "Chinese (Mandarin)"]];
const TR_VOICE = {th:"th-TH", km:"km-KH", vi:"vi-VN", lo:"lo-LA", ms:"ms-MY", id:"id-ID", "zh-CN":"zh-CN", en:"en-GB"};
const trState = {text:"", lang:null, out:"", outFor:"", status:"", via:"", rev:false};
const trLang = () => trState.lang || (S.country === "SG" ? "zh-CN" : (TR_LANGS.find(l => l[0] === D.countries[S.country].lang) || TR_LANGS[0])[0]);
let trCache = {}; try { trCache = JSON.parse(localStorage.getItem("tr-cache") || "{}"); } catch(e){}
function paintTranslation(){
  const el = $("#tr-out"); if (!el) return;
  if (trState.status === "error"){ el.innerHTML = `<p class="note">Couldn’t translate. Check your signal and try again. The phrasebook below works offline.</p>`; return; }
  if (trState.status === "limit"){ el.innerHTML = `<p class="note">The free translation service has reached today’s limit. The phrasebook below still works, or add a Google key in <a href="#tools/settings">Settings</a>.</p>`; return; }
  if (!trState.out){ el.innerHTML = trState.status === "busy" ? `<p class="note">Translating…</p>` : ""; return; }
  const outLang = trState.rev ? "en" : trLang();
  const sayIt = outLang === "th" && thaiRom.has(trState.out) ? `<div class="tr-say">Say (approximate): ${esc(thaiRom.text(trState.out, "easy"))}</div><p class="note">Worked out on your phone from the Thai letters, so it’s only a rough guide. Tap the speaker to hear it.</p>`
    : !trState.rev && ["km", "lo", "zh-CN"].includes(outLang) ? `<p class="note">No pronunciation guide for this language yet. Tap the speaker to hear it.</p>` : "";
  el.innerHTML = `<div class="tr-res"><div class="tr-text" lang="${esc(outLang)}">${esc(trState.out)}${sayIt}</div><button class="icon-btn" id="tr-say" type="button" aria-label="Read it out loud">${icon("speaker")}</button></div>
    <p class="note" style="margin-top:6px">${trState.via === "google" ? "Translated by Google." : "Translated by MyMemory (free service). Machine translation can be wrong, so keep it simple."}</p>`;
  $("#tr-say").onclick = () => speak(trState.out, outLang);
}
async function translateVia(text, from, to){
  if (googleKey()){
    try {
      const r = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${enc(googleKey())}`, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({q:text, source:from, target:to, format:"text"})});
      const j = await r.json();
      if (r.ok && j.data) return {out:j.data.translations[0].translatedText, via:"google"};
    } catch(e){}
  }
  // free fallback, no key: MyMemory allows about 5,000 characters a day from one connection
  const j = await getJSON(`https://api.mymemory.translated.net/get?q=${enc(text)}&langpair=${enc(from.slice(0, 2))}|${enc(to === "zh-CN" ? "zh-CN" : to)}`, {timeout:10000});
  if (j.quotaFinished || /MYMEMORY WARNING/i.test((j.responseData && j.responseData.translatedText) || "")) { const e = new Error("limit"); e.limit = true; throw e; }
  if (!j.responseData || !j.responseData.translatedText) throw new Error("failed");
  return {out:j.responseData.translatedText, via:"mymemory"};
}
async function doTranslate(){
  const text = trState.text.trim(), lang = trLang(), rev = trState.rev;
  if (!text){ trState.out = ""; trState.status = ""; paintTranslation(); return; }
  const k = (rev ? "<" : "") + lang + "|" + text;
  if (trCache[k]){ trState.out = trCache[k].o || trCache[k]; trState.via = trCache[k].v || "google"; trState.status = ""; paintTranslation(); return; }
  trState.status = "busy"; if (trState.outFor !== k) trState.out = ""; paintTranslation();
  try {
    const res = await translateVia(text, rev ? lang : "en", rev ? "en" : lang);
    if (trState.text.trim() !== text || trLang() !== lang || trState.rev !== rev) return;
    trState.out = res.out; trState.via = res.via; trState.outFor = k; trState.status = "";
    trCache[k] = {o:res.out, v:res.via};
    const keys = Object.keys(trCache); if (keys.length > 300) delete trCache[keys[0]];
    try { localStorage.setItem("tr-cache", JSON.stringify(trCache)); } catch(e){}
  } catch(e){ trState.status = e.limit ? "limit" : "error"; }
  paintTranslation();
}
function speak(text, lang){
  if (!("speechSynthesis" in window)){ toast("This phone can’t read text out"); return; }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = TR_VOICE[lang] || lang; u.rate = .85;
  const voices = speechSynthesis.getVoices();
  const v = voices.find(x => x.lang.replace("_", "-").toLowerCase() === u.lang.toLowerCase()) || voices.find(x => x.lang.toLowerCase().startsWith(u.lang.slice(0, 2).toLowerCase()));
  if (v) u.voice = v; else if (voices.length) toast("No voice for this language yet. On iPhone add one in Settings > Accessibility > Spoken Content > Voices.");
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}
/* Thai phrasebook: works with no signal. Romanisation is a pronunciation guide, not an official spelling. */
/* Thai phrasebook: works with no signal. Each phrase: English, Thai, the tone-marked romanisation, and an easy say-it-like-it-looks version
   written by hand for English speakers (krap if you're a man, ka if you're a woman). Neither is an official spelling. */
const PHRASES = [
  {t:"Basics", p:[
    ["Hello", "สวัสดี", "sà-wàt-dee", "sa-wat-dee krap / ka"], ["Thank you", "ขอบคุณ", "khàwp khun", "kop-koon krap / ka"], ["Yes", "ใช่", "châi", "chai"], ["No", "ไม่ใช่", "mâi châi", "mai chai"],
    ["Sorry / excuse me", "ขอโทษ", "khǎw thôht", "kor-toht"], ["No problem", "ไม่เป็นไร", "mâi pen rai", "mai pen rai"], ["I don’t understand", "ไม่เข้าใจ", "mâi khâo jai", "mai kao jai"],
    ["Do you speak English?", "พูดภาษาอังกฤษได้ไหม", "phûut phaa-sǎa ang-grìt dâi mái", "poot paa-saa ang-grit dai mai"], ["How are you?", "สบายดีไหม", "sà-baai dee mái", "sa-bai dee mai"]]},
  {t:"Money and shopping", p:[
    ["How much is this?", "อันนี้เท่าไหร่", "an née thâo rài", "an nee tao-rai"], ["Too expensive", "แพงไป", "phaeng pai", "paeng pai"], ["Can you lower the price?", "ลดหน่อยได้ไหม", "lót nòi dâi mái", "lot noi dai mai"],
    ["I’ll take this one", "เอาอันนี้", "ao an née", "ow an nee"], ["Do you take cards?", "รับบัตรไหม", "ráp bàt mái", "rap bat mai"], ["Where is an ATM?", "ตู้เอทีเอ็มอยู่ที่ไหน", "tûu ay-thee-em yùu thêe nǎi", "too ay-tee-em yoo tee-nai"]]},
  {t:"Food", p:[
    ["Not spicy", "ไม่เผ็ด", "mâi phèt", "mai pet"], ["A little spicy", "เผ็ดนิดหน่อย", "phèt nít nòi", "pet nit-noy"], ["I don’t eat meat", "ไม่กินเนื้อสัตว์", "mâi gin néua sàt", "mai gin neua sat"],
    ["No fish sauce", "ไม่ใส่น้ำปลา", "mâi sài nám plaa", "mai sai nam plaa"], ["I’m allergic to peanuts", "แพ้ถั่วลิสง", "pháe thùa lí-sǒng", "pae tua li-song"], ["Water, please", "ขอน้ำเปล่า", "khǎw nám plào", "kor nam plao"],
    ["The bill, please", "เช็คบิลด้วย", "chék bin dûai", "check bin duay"], ["Delicious", "อร่อย", "à-ròi", "a-roy"], ["Takeaway", "ใส่ถุงกลับบ้าน", "sài thǔng glàp bâan", "sai toong glap baan"]]},
  {t:"Getting around", p:[
    ["Where is …?", "…อยู่ที่ไหน", "… yùu thêe nǎi", "… yoo tee-nai"], ["How much to go to …?", "ไป…เท่าไหร่", "pai … thâo rài", "pai … tao-rai"], ["Please use the meter", "เปิดมิเตอร์ด้วย", "pèrt mí-têr dûai", "perd mee-ter duay"],
    ["Stop here", "จอดตรงนี้", "jàwt trong née", "jot trong nee"], ["Turn left", "เลี้ยวซ้าย", "líao sáai", "lee-ow sai"], ["Turn right", "เลี้ยวขวา", "líao khwǎa", "lee-ow kwaa"], ["Straight on", "ตรงไป", "trong pai", "trong pai"],
    ["Bus station", "สถานีขนส่ง", "sà-thǎa-nee khǒn sòng", "sa-taa-nee kon-song"], ["Train station", "สถานีรถไฟ", "sà-thǎa-nee rót fai", "sa-taa-nee rot fai"], ["Pier", "ท่าเรือ", "thâa reua", "taa reua"], ["Airport", "สนามบิน", "sà-nǎam bin", "sa-naam bin"],
    ["What time does it leave?", "ออกกี่โมง", "àwk gèe mohng", "ork gee mong"], ["One ticket to …", "ตั๋วไป…หนึ่งใบ", "tǔa pai … nèung bai", "tua pai … neung bai"]]},
  {t:"Staying", p:[
    ["Do you have a room?", "มีห้องว่างไหม", "mee hâwng wâang mái", "mee hong waang mai"], ["How much per night?", "คืนละเท่าไหร่", "kheun lá thâo rài", "keun la tao-rai"], ["Can I see the room?", "ขอดูห้องได้ไหม", "khǎw duu hâwng dâi mái", "kor doo hong dai mai"],
    ["Is there Wi-Fi?", "มีไวไฟไหม", "mee wai-fai mái", "mee wai-fai mai"], ["Where is the toilet?", "ห้องน้ำอยู่ที่ไหน", "hâwng nám yùu thêe nǎi", "hong naam yoo tee-nai"], ["Where can I do laundry?", "ซักผ้าได้ที่ไหน", "sák phâa dâi thêe nǎi", "sak paa dai tee-nai"]]},
  {t:"Help and health", p:[
    ["Help!", "ช่วยด้วย", "chûai dûai", "chuay duay"], ["Call the police", "เรียกตำรวจ", "rîak tam-rùat", "riak tam-ruat"], ["I need a doctor", "ต้องการหมอ", "tâwng gaan mǎw", "tong-gaan mor"],
    ["Take me to a hospital", "พาไปโรงพยาบาล", "phaa pai rohng phá-yaa-baan", "paa pai rong pa-yaa-baan"], ["I’m lost", "หลงทาง", "lǒng thaang", "long taang"], ["I lost my passport", "หนังสือเดินทางหาย", "nǎng-sěu dern thaang hǎai", "nang-seu dern taang hai"],
    ["It hurts here", "เจ็บตรงนี้", "jèp trong née", "jep trong nee"], ["Pharmacy", "ร้านขายยา", "ráan khǎai yaa", "raan kai yaa"]]},
  {t:"Numbers", p:[
    ["1", "หนึ่ง", "nèung", "neung"], ["2", "สอง", "sǎwng", "song"], ["3", "สาม", "sǎam", "saam"], ["4", "สี่", "sèe", "see"], ["5", "ห้า", "hâa", "haa"], ["6", "หก", "hòk", "hok"], ["7", "เจ็ด", "jèt", "jet"],
    ["8", "แปด", "pàet", "paet"], ["9", "เก้า", "gâo", "gao"], ["10", "สิบ", "sìp", "sip"], ["20", "ยี่สิบ", "yêe sìp", "yee-sip"], ["100", "หนึ่งร้อย", "nèung rói", "neung roy"], ["1,000", "หนึ่งพัน", "nèung phan", "neung pan"]]}
];
let phraseTab = 0;
TOOL_PAGES.translate = root => {
  const lang = trLang(), langName = (TR_LANGS.find(l => l[0] === lang) || TR_LANGS[0])[1];
  const g = PHRASES[phraseTab];
  root.innerHTML = toolHero("Translator", "Live translation and an offline Thai phrasebook") + `<div class="page">
  <section class="block" aria-labelledby="h-tr">
    <h2 id="h-tr">Translator</h2>
    <div class="row" style="margin-top:8px"><label class="field">Language<select id="tr-lang">${TR_LANGS.map(([code, name]) => `<option value="${code}" ${code === lang ? "selected" : ""}>${esc(name)}</option>`).join("")}</select></label>
      <div class="seg" role="group" aria-label="Direction" style="align-self:end"><button type="button" data-rev="0" aria-pressed="${!trState.rev}">English → ${esc(langName.split(" ")[0])}</button><button type="button" data-rev="1" aria-pressed="${trState.rev}">→ English</button></div></div>
    <label class="field" style="margin-top:8px">${trState.rev ? `Type or paste the ${esc(langName.split(" ")[0])} text` : "What do you want to say?"}<textarea id="tr-text" placeholder="${trState.rev ? "" : "How much is a bed for two nights?"}">${esc(trState.text)}</textarea></label>
    <div class="tr-out" id="tr-out" aria-live="polite"></div>
    <p class="note" style="margin-top:8px">Needs signal. ${googleKey() ? "Uses your Google key, with a free service as the fallback." : "Uses the free MyMemory service (about 5,000 characters a day)."}</p>
  </section>
  <section class="block" aria-labelledby="h-pb">
    <h2 id="h-pb">Thai phrasebook</h2>
    <p class="note">Works offline. To be polite, end a sentence with <b>krap</b> if you’re a man or <b>ka</b> if you’re a woman. The “Say” line is a rough guide for English speakers; tap the speaker to hear it properly.</p>
    <div class="scroller" style="margin-top:8px">${PHRASES.map((x, i) => `<button class="chip" type="button" data-pt="${i}" aria-pressed="${i === phraseTab}">${x.t}</button>`).join("")}</div>
    <div style="margin-top:6px">${g.p.map((p, i) => `<div class="phrase"><span class="en">${esc(p[0])}</span><button class="icon-btn" type="button" data-say="${i}" aria-label="Hear ${esc(p[0])} in Thai">${icon("speaker")}</button><span class="th" lang="th">${esc(p[1])}</span><span class="say">Say: ${esc(p[3])}</span><span class="ro">With tone marks: ${esc(p[2])}</span></div>`).join("")}</div>
  </section></div>`;
  const tt = $("#tr-text"), tl = $("#tr-lang");
  let timer = null;
  tt.oninput = () => { clearTimeout(timer); trState.text = tt.value; trState.lang = tl.value; timer = setTimeout(doTranslate, 600); };
  tl.onchange = () => { trState.lang = tl.value; renderPage(); doTranslate(); };
  root.querySelectorAll("[data-rev]").forEach(b => b.onclick = () => { trState.rev = b.dataset.rev === "1"; trState.out = ""; renderPage(); doTranslate(); });
  root.querySelectorAll("[data-pt]").forEach(b => b.onclick = () => { phraseTab = +b.dataset.pt; const y = root.scrollTop; renderPage(); root.scrollTop = y; });
  root.querySelectorAll("[data-say]").forEach(b => b.onclick = () => speak(g.p[+b.dataset.say][1].replace(/…/g, " "), "th"));
  paintTranslation();
};

/* ---------- settings ---------- */
function setupPage(){
  const domains = [...new Set([...D.places, ...D.routes, ...D.net.edges].flatMap(x => x.src || []).map(s => s[0]))].sort();
  const gk = googleKey(), m = Places.meta;
  return toolHero("Settings", "Location, photos, exchange rates and data") + `<div class="page">
  <section class="block"><h2>Test location</h2>
    <p class="note">While you’re testing at home, the app can pretend you’re somewhere on the trip. Turn this off before you fly.</p>
    <label class="field" style="margin-top:8px">Pretend I’m in<select id="testLoc"><option value="off" ${S.testLoc === "off" ? "selected" : ""}>Off (use my real location)</option>${TEST_SPOTS.map(c => `<option value="${esc(c[0])}" ${S.testLoc === c[0] ? "selected" : ""}>${esc(c[0])}${c[0] === "Bangkok" ? " (Siam, city centre)" : ""}</option>`).join("")}</select></label>
  </section>
  <section class="block"><h2>Country</h2>
    <p class="note">Sets the money converter, translator and ride tips. Thailand is the country covered in depth.</p>
    <div class="seg" role="group" aria-label="How to choose the country" style="margin:6px 0 10px">
      <button data-cmode="auto" aria-pressed="${S.countryMode === "auto"}">Use my location</button>
      <button data-cmode="manual" aria-pressed="${S.countryMode === "manual"}">Pick it myself</button></div>
    <p class="note">${esc(LOC_LINE())}</p>
    <button class="btn small" id="relocate" type="button" style="margin:8px 0 10px">${icon("locate","i s")}Check my location again</button>
    <div class="cgrid">${Object.entries(D.countries).map(([k, x]) => `<button data-country="${k}" aria-pressed="${S.country === k}"><span class="f" aria-hidden="true">${x.flag}</span>${esc(x.name)}</button>`).join("")}</div>
  </section>
  <section class="block"><h2>Photos from Google</h2>
    <p class="note">With a Google key, the researched places show Google photos, their Google rating and exact location. Other places only load Google photos when you ask, to keep Google’s costs at zero.</p>
    <p class="note" style="color:var(--ink)">${gk ? (S.gkey ? "Key saved on this phone." : "Key set in config.js, so everyone gets photos.") : "No key yet."}</p>
    <label class="field">Google Maps API key<input type="text" id="gkey" autocomplete="off" spellcheck="false" placeholder="Paste your key here" value="${esc(S.gkey)}"></label>
    <div class="row" style="margin-top:10px"><button class="btn small primary" id="gkeySave" type="button">Save key</button><button class="btn small" id="gkeyTest" type="button">Test it</button></div>
    <p class="note" style="margin-top:10px">Photos only load with signal; Google doesn’t allow saving them for offline use.</p>
  </section>
  <section class="block"><h2>Look</h2>
    <p class="note">Night is the standard dark look. Paper Atlas is a lighter, old-map style that is easier to read in bright sun. The app reloads to switch.</p>
    <div class="seg" role="group" aria-label="Look" style="margin-top:8px"><button data-look="night" aria-pressed="${S.look !== "paper"}">Night</button><button data-look="paper" aria-pressed="${S.look === "paper"}">Paper Atlas</button></div>
  </section>
  <section class="block"><h2>Design Lab</h2>
    <p class="note">A place to try colours, map colours, fonts and sizes live on any screen. Open it from the palette tab on the left edge of the screen.</p>
    <div class="row" style="margin-top:8px;gap:8px;flex-wrap:wrap"><button class="btn" type="button" data-openlab>${icon("palette","i s")}Open the Design Lab</button>
      <button class="switch" type="button" data-labtoggle aria-pressed="${S.design.on !== false}"><i></i>Show the palette tab</button></div>
  </section>
  <section class="block"><h2>Exchange rates</h2>
    <p class="note">How much £1 gets you. ${S.live ? `Live rates were last updated ${esc(S.live.date)}.` : "Live rates load when you open the Currency tool with signal."} Type your own rate to override one.</p>
    ${Object.keys(D.rates).filter(k => k !== "GBP").map(k => `<div class="rate-row"><label for="rate-${k}">£1 in ${k}</label><input type="number" step="any" min="0" id="rate-${k}" data-rate="${k}" value="${rate(k)}"><small>${S.rates[k] > 0 ? `Your own rate. Built-in: ${fmtNum(D.rates[k].v)} (${esc(D.rates[k].note)})` : liveRate(k) ? `Live rate. Built-in: ${fmtNum(D.rates[k].v)}` : `Built-in, ${esc(D.rates[k].note)}`}</small></div>`).join("")}
    <button class="btn small" id="resetRates" type="button" style="margin-top:10px">Clear my own rates</button>
    <p class="note" style="margin-top:10px">Built-in rates checked on: ${D.rateSources.map(s => `<a href="${esc(s[1])}" target="_blank" rel="noopener">${esc(s[0])}</a>`).join(", ")}.</p>
  </section>
  <section class="block" id="aboutData"><h2>About the data</h2>
    <p>Version ${VERSION}: ${D.places.filter(p => p.c === "gaff").length} researched gaffs, ${D.places.filter(p => p.c === "munch").length} food spots, ${D.places.filter(p => p.c === "cool").length} activities, and a Thailand transport network of ${D.net.hubs.length} places and ${D.net.edges.length} connections. Prices and ratings were checked in ${esc(D.checked)}.</p>
    <p>${m ? `On top of that, ${Object.values(m.groups).reduce((a, g) => a + g.n, 0).toLocaleString("en-GB")} Thailand places from OpenStreetMap (data as of ${esc((m.osm || "").slice(0, 10))}).` : "The wider Thailand places list loads from OpenStreetMap data when you have signal."} © OpenStreetMap contributors, Open Database Licence. Street map tiles by OpenFreeMap, © OpenMapTiles.</p>
    <p>Anything marked “not checked yet” uses typical prices, not ones we looked up. Taxi prices are estimates from Bangkok’s meter rates. OpenStreetMap places never show a price or rating, because it doesn’t record them.</p>
    <p class="note">Sources for the researched places: ${domains.map(esc).join(", ")}. Country outlines from Natural Earth. Weather by Open-Meteo. Exchange rates by the open currency-api project.</p>
    <details class="more"><summary>Photo credits</summary>
      <p class="note" style="margin-top:6px">Photos from Wikimedia Commons, cropped for the app and shared under the same licences:</p>
      <ul class="known note">${PHOTO_CREDITS.map(([what, by, lic, url]) => `<li>${esc(what)}: <a href="${esc(url)}" target="_blank" rel="noopener">${esc(by)}</a>, ${esc(lic)}</li>`).join("")}</ul>
    </details>
  </section></div>`;
}
function bindSetup(){
  const root = $("#pageview");
  $("#testLoc").onchange = e => {
    S.testLoc = e.target.value; persist();
    if (S.testLoc === "off"){ userLoc = null; locStatus = "idle"; updateMe(); locate(true); }
    else { applyTestLocation(); updateMe(); if (map) flyTo(userLoc, 12); toast(`Test location: ${S.testLoc}`); }
    rerender();
  };
  root.querySelector("[data-openlab]").onclick = () => openLab();
  root.querySelector("[data-labtoggle]").onclick = () => { S.design.on = S.design.on === false; persist(); renderLabButton(); renderPage(); };
  root.querySelectorAll("[data-look]").forEach(b => b.onclick = () => { if (S.look === b.dataset.look) return; S.look = b.dataset.look; persist(); location.reload(); });
  root.querySelectorAll("[data-cmode]").forEach(b => b.onclick = () => { S.countryMode = b.dataset.cmode; persist(); if (S.countryMode === "auto") locate(true); renderPage(); });
  root.querySelectorAll("[data-country]").forEach(b => b.onclick = () => setCountry(b.dataset.country, true));
  $("#relocate").onclick = () => locate(true);
  $("#gkeySave").onclick = () => { S.gkey = $("#gkey").value.trim(); persist(); gReady = null; toast(S.gkey ? "Key saved on this phone" : "Key removed"); renderPage(); };
  $("#gkeyTest").onclick = async () => {
    const k = $("#gkey").value.trim(); if (k && k !== S.gkey){ S.gkey = k; persist(); gReady = null; }
    if (!googleKey()){ toast("Paste a key first"); return; }
    toast("Testing…");
    const pl = await googlePlace(D.places.find(p => p.id === "c-grandpalace"), ["photos"]);
    toast(pl && pl.photos && pl.photos.length ? "Working: Google found the Grand Palace with photos" : "Didn’t work here. Check the key and its website restriction, and test on your own web address.");
  };
  root.querySelectorAll("[data-rate]").forEach(inp => inp.onchange = () => { const v = parseFloat(inp.value); const k = inp.dataset.rate; if (v > 0 && Math.abs(v - (liveRate(k) || D.rates[k].v)) > 1e-9) S.rates[k] = v; else delete S.rates[k]; persist(); renderPage(); toast("Rate saved"); });
  $("#resetRates").onclick = () => { const old = S.rates; S.rates = {}; persist(); renderPage(); toast("Your own rates cleared", () => { S.rates = old; persist(); renderPage(); }); };
  if (!Places.meta) Places.ready().then(m => { if (m && ui.view === "tools" && ui.sub === "settings") renderPage(); });
}
