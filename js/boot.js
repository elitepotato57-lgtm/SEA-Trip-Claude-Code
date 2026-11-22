/* ============================================================
   90-boot: start the app
   ============================================================ */
(function boot(){
  expClasses();                         // experiments switched on in Tools › Developer (CSS ones)
  makeArt();
  const tested = applyTestLocation();
  show();
  renderLabButton();                    // the Design Lab's palette tab (Settings can hide it)
  if (tested){ updateMe(); }
  else locate(false);                    // the phone's position (asks the first time); the country only follows it in automatic mode
  Places.ready();                       // fetch the small index of the places database in the background
  // feel like an app, not a web page: no pinch-zoom of the page on iPhone (the map handles its own pinch)
  document.addEventListener("gesturestart", e => { if (!e.target.closest || !e.target.closest("#map, .tmap")) e.preventDefault(); }, {passive:false});
  // a quick second tap never zooms the page (older iPhones ignore the page's no-zoom setting)
  let lastTouch = 0;
  document.addEventListener("touchend", e => { const now = Date.now(); if (now - lastTouch < 320 && !(e.target.closest && e.target.closest("#map, .tmap, input, textarea, select"))) e.preventDefault(); lastTouch = now; }, {passive:false});
  refreshLiveRates(false);              // and today's exchange rates, if there is signal
  // friends: messages and game invites pop up on whatever screen you're on (does nothing until Friends is set up)
  if (typeof frLoop === "function") setTimeout(() => { try { frLoop(); } catch(e){} }, 1500);
  if (typeof funnyStart === "function") funnyStart();   // funny mode's intro video (only when switched on in Settings)
})();


/* ---------- offline support: register the service worker (not inside Claude previews) ---------- */
if ("serviceWorker" in navigator && location.protocol === "https:" && !/claude\.ai|claudeusercontent/.test(location.hostname)) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
