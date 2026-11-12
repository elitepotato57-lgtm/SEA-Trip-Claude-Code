/* ============================================================
   62-camera: Camera translator (Tools > Camera translator, next to the Translator).
   Take or pick a photo of Thai writing (a menu, a sign, a label). Google's text reader (Cloud Vision) finds
   the words, then every line is translated to English with an easy say-it-like-this pronunciation.
   Needs the Google key with the Cloud Vision API allowed: the first 1,000 photos a month are free, and
   this phone is limited to 15 a day (G_DAILY.vision) so it can't run up a bill.
   ============================================================ */
const camState = {img:null, lines:null, status:"", err:""};

/* the lines of text Google found, cleaned up (pure: tested in tests/unit.js) */
function visionLines(resp){
  const t = resp && resp.textAnnotations && resp.textAnnotations[0] && resp.textAnnotations[0].description;
  if (!t) return [];
  const seen = new Set();
  return t.split(/\n+/).map(s => s.replace(/\s+/g, " ").trim())
    .filter(s => s && /[\p{L}]/u.test(s) && !seen.has(s) && seen.add(s))
    .slice(0, 40);
}
const hasThai = s => /[฀-๿]/.test(s);

// make the photo smaller before sending (quicker, and Google charges the same either way)
async function photoBase64(blob, max = 1600){
  const img = await createImageBitmap(blob);
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/jpeg", .85);
  return url.slice(url.indexOf(",") + 1);
}
async function visionRead(blob){
  const r = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${enc(googleKey())}`, {method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({requests:[{image:{content:await photoBase64(blob)}, features:[{type:"TEXT_DETECTION"}], imageContext:{languageHints:[S.country === "ID" ? "id" : "th", "en"]}}]})});
  const j = await r.json().catch(() => ({}));
  const err = (j.error && j.error.message) || (j.responses && j.responses[0] && j.responses[0].error && j.responses[0].error.message);
  if (!r.ok || err){
    const e = new Error(err || "Google couldn't read the photo");
    e.setup = /not been used|disabled|blocked|not authorized|API_KEY|referer|PERMISSION_DENIED/i.test(err || "");
    throw e;
  }
  return visionLines(j.responses && j.responses[0]);
}
// all the Thai lines in one request
async function translateLines(lines){
  // in Thailand only the Thai lines need translating; in Indonesia the writing is in Latin letters, so send every line
  const ID = S.country === "ID";
  const thai = ID ? lines.slice() : lines.filter(hasThai);
  const out = {};
  if (!thai.length) return out;
  const r = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${enc(googleKey())}`, {method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify(Object.assign({q:thai, target:"en", format:"text"}, ID ? {source:"id"} : {source:"th"}))});
  const j = await r.json().catch(() => ({}));
  if (r.ok && j.data) j.data.translations.forEach((t, i) => out[thai[i]] = t.translatedText);
  return out;
}

// The tool is switched off (no tile in Tools): Google's text reader needs a billing account, and reading Thai on the phone itself
// (Tesseract) was too unreliable to offer. An old link to #tools/camera shows the free alternatives and asks for nothing.
TOOL_PAGES.camera = root => {
  root.innerHTML = toolHero("Camera translator", "Use your phone's own camera translation") + `<div class="page">${CAMERA_TIP.replace("<details", "<details open")}
    <p class="note"><a href="#tools/translate">Type something to translate instead</a></p></div>`;
};
TOOL_PAGES.cameraGoogle = root => {
  const key = !!googleKey();
  root.innerHTML = toolHero("Camera translator", "Point at a menu, sign or label") + `<div class="page">
    ${key ? "" : `<div class="callout">${icon("info")}<div><b>This needs the Google key.</b> Add it in Settings, with the <b>Cloud Vision API</b> switched on for it. Until then, the iPhone can do this itself: open the Camera, point at the text, tap the text icon in the corner, then <b>Translate</b>.</div></div>`}
    <div class="row cam-btns">
      <label class="btn primary ${key ? "" : "off"}" style="cursor:pointer">${icon("camera", "i s")}Take a photo<input type="file" id="camShot" accept="image/*" capture="environment" hidden ${key ? "" : "disabled"}></label>
      <label class="btn ${key ? "" : "off"}" style="cursor:pointer">${icon("image", "i s")}Choose a photo<input type="file" id="camPick" accept="image/*" hidden ${key ? "" : "disabled"}></label>
    </div>
    <p class="note">Get close and fill the frame with the writing. Each line comes back in English with how to say it.${key ? ` Up to ${G_DAILY.vision} photos a day on this phone.` : ""}</p>
    <div id="camOut"></div>
    <p class="note" style="margin-top:12px"><a href="#tools/translate">Type something to translate instead</a></p>
  </div>`;
  paintCam();
  const take = async e => {
    const f = e.target.files && e.target.files[0]; e.target.value = "";
    if (!f) return;
    if (!gAllow("vision")){ toast(`That's today's ${G_DAILY.vision} photos on this phone. More tomorrow.`); return; }
    if (camState.img) URL.revokeObjectURL(camState.img);
    camState.img = URL.createObjectURL(f); camState.lines = null; camState.err = ""; camState.status = "Reading the writing…"; paintCam();
    try {
      gSpend("vision");
      const lines = await visionRead(f);
      camState.status = lines.length && (S.country === "ID" || lines.some(hasThai)) ? "Translating…" : ""; paintCam();
      const tr = await translateLines(lines).catch(() => ({}));
      // a line counts as foreign if it's Thai, or (in Indonesia) if Google's English differs from it
      camState.lines = lines.map(s => { const en = tr[s] || null, foreign = hasThai(s) || (S.country === "ID" && !!en && en.trim().toLowerCase() !== s.trim().toLowerCase());
        return {src:s, th:foreign, en, say:hasThai(s) ? thaiRom.text(s, "easy") : ""}; });
      camState.status = "";
    } catch(err){
      camState.status = ""; camState.err = err.setup ? `Google said: ${err.message}. Check the Cloud Vision API is switched on for your key and allowed in its restrictions (Google Cloud > APIs & Services).` : (err.message || "Couldn't read that photo");
    }
    if (ui.sub === "camera") paintCam();
  };
  $("#camShot").onchange = take; $("#camPick").onchange = take;
};
function paintCam(){
  const el = $("#camOut"); if (!el) return;
  let h = camState.img ? `<img class="cam-photo" src="${camState.img}" alt="Your photo">` : "";
  if (camState.status) h += `<p class="note" style="margin-top:8px">${icon("clock", "i xs")} ${esc(camState.status)}</p>`;
  if (camState.err) h += `<div class="callout">${icon("alert")}<div>${esc(camState.err)}</div></div>`;
  if (camState.lines){
    h += !camState.lines.length ? `<p class="note" style="margin-top:8px">No writing found. Try closer, with more light.</p>`
      : `<div class="cam-lines">${camState.lines.map((l, i) => `<div class="cam-line">
          <div class="cam-src" ${l.th ? `lang="${S.country === "ID" ? "id" : "th"}"` : ""}>${esc(l.src)}</div>
          ${l.th ? `${l.say ? `<div class="cam-say">say: ${esc(l.say)}</div>` : ""}<div class="cam-en">${l.en ? esc(l.en) : '<span class="note">No translation came back</span>'}</div>` : `<div class="note">${S.country === "ID" ? "Already English, or a name" : "Not Thai: shown as it is"}</div>`}
          ${l.th ? `<button class="btn small" type="button" data-camsay="${i}">${icon("speaker", "i s")}Say it</button>` : ""}</div>`).join("")}</div>
        <p class="note" style="margin-top:8px">Pronunciation is an approximate English spelling worked out on your phone. Translations by Google.</p>`;
  }
  el.innerHTML = h;
  el.querySelectorAll("[data-camsay]").forEach(b => b.onclick = () => speak(camState.lines[+b.dataset.camsay].src, S.country === "ID" ? "id" : "th"));
}
