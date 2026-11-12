/* ============================================================
   90-boot: start the app
   ============================================================ */
(function boot(){
  makeArt();
  const tested = applyTestLocation();
  show();
  renderLabButton();                    // the Design Lab's palette tab (Settings can hide it)
  if (tested){ updateMe(); }
  else locate(false);                    // the phone's position (asks the first time); the country only follows it in automatic mode
  Places.ready();                       // fetch the small index of the places database in the background
  // feel like an app, not a web page: no pinch-zoom of the page on iPhone (the map handles its own pinch)
  document.addEventListener("gesturestart", e => { if (!e.target.closest || !e.target.closest("#map, .tmap")) e.preventDefault(); }, {passive:false});
  refreshLiveRates(false);              // and today's exchange rates, if there is signal
})();


/* ---------- offline support: register the service worker (not inside Claude previews) ---------- */
if ("serviceWorker" in navigator && location.protocol === "https:" && !/claude\.ai|claudeusercontent/.test(location.hostname)) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
