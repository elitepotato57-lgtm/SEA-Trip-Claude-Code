// Loads the app's code files into a sandbox with a pretend browser, so the logic can be tested in Node
// without opening a real browser. Only the files listed are loaded (never boot.js, which starts the app).
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function fakeElement(){
  return {style:{setProperty(){}, removeProperty(){}}, dataset:{}, classList:{add(){}, remove(){}, toggle(){}, contains(){ return false; }},
    setAttribute(){}, removeAttribute(){}, getAttribute(){ return null; }, appendChild(){}, addEventListener(){}, querySelector(){ return null; },
    querySelectorAll(){ return []; }, innerHTML:"", textContent:""};
}
function load(files = ["data", "core", "places", "shell", "lists", "transport"], extra = {}){
  const store = new Map();
  const ctx = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, URL, URLSearchParams, Intl, Date, Math, JSON, Promise,
    performance:{now:() => Date.now()},
    localStorage:{getItem:k => store.has(k) ? store.get(k) : null, setItem:(k, v) => store.set(k, String(v)), removeItem:k => store.delete(k)},
    navigator:{onLine:true, language:"en-GB", userAgent:"node"},
    location:{hash:"", search:"", protocol:"http:", hostname:"localhost", href:"http://localhost/"},
    matchMedia:() => ({matches:false, addEventListener(){}}),
    getComputedStyle:() => ({getPropertyValue:() => ""}),
    document:{documentElement:fakeElement(), body:fakeElement(), head:fakeElement(), querySelector:() => null, querySelectorAll:() => [],
      createElement:() => fakeElement(), addEventListener(){}, getElementById:() => null},
    addEventListener(){}, removeEventListener(){}, requestAnimationFrame:f => setTimeout(f, 0),
    fetch:() => Promise.reject(new Error("no network in unit tests")), Image:function(){}, AbortController,
    MutationObserver:function(){ this.observe = () => {}; this.disconnect = () => {}; },
    IntersectionObserver:function(){ this.observe = () => {}; this.unobserve = () => {}; this.disconnect = () => {}; },
    ResizeObserver:function(){ this.observe = () => {}; this.disconnect = () => {}; },
    ...extra
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  // classic scripts share one global scope; run them as one so top-level const/let are visible across files
  const code = files.map(f => fs.readFileSync(path.join(__dirname, "..", "js", f + ".js"), "utf8")).join("\n;\n");
  const names = [...code.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/gm)].map(m => m[1] || m[2]);
  vm.runInContext(code + `\n;globalThis.__app = {${[...new Set(names)].join(",")}};`, ctx, {filename:"app.js"});
  return ctx.__app;
}
module.exports = {load};
