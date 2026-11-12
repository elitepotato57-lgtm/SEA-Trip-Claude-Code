// A tiny static web server for testing the app locally (no Python needed).
// Run on its own:  node tests/serve.js   then open http://localhost:8765/
// The smoke test starts one by itself.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const TYPES = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8",
  ".json":"application/json", ".mjs":"text/javascript; charset=utf-8", ".gz":"application/gzip", ".wasm":"application/wasm", ".webmanifest":"application/manifest+json", ".png":"image/png", ".jpg":"image/jpeg",
  ".jpeg":"image/jpeg", ".svg":"image/svg+xml", ".webp":"image/webp", ".md":"text/plain; charset=utf-8", ".traineddata":"application/octet-stream"};

function start(port = 8765){
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)){ res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err){ res.writeHead(404); return res.end("not found"); }
      res.writeHead(200, {"Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache"});
      res.end(buf);
    });
  });
  return new Promise(resolve => server.listen(port, "127.0.0.1", () => resolve(server)));
}

module.exports = {start};
if (require.main === module) start(+process.env.PORT || 8765).then(() => console.log("Serving the app at http://localhost:" + (+process.env.PORT || 8765) + "/"));
