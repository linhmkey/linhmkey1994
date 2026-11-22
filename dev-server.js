// Máy chủ chạy thử trên máy: `npm run dev` rồi mở http://localhost:3000 (mật khẩu admin mặc định: admin)
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOT = __dirname;
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

function matchRewrite(p) {
  for (const r of cfg.rewrites) {
    const re = new RegExp("^" + r.source.replace(/:(\w+)\*/g, "(?<$1>.+)").replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$");
    const m = re.exec(p);
    if (m) return r.destination.replace(/:(\w+)\*?/g, (_, k) => encodeURIComponent(m.groups[k]).replace(/%2F/g, "/"));
  }
  return null;
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  let p = decodeURIComponent(u.pathname);
  if (/^\/(private|api\/_lib)(\/|$)/.test(p)) { res.statusCode = 404; return res.end("Not found"); }
  let file = path.join(ROOT, p === "/" ? "index.html" : p);
  for (const r of cfg.redirects || []) {
    const m = new RegExp("^" + r.source.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$").exec(p);
    if (m) { res.statusCode = 307; res.setHeader("Location", r.destination.replace(/:(\w+)/g, (_, k) => m.groups[k])); return res.end(); }
  }
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const dest = matchRewrite(p);
    if (dest) { const d = new URL(dest, "http://x"); p = d.pathname; d.searchParams.forEach((v, k) => u.searchParams.set(k, v)); }
    file = path.join(ROOT, p);
  }
  if (p.startsWith("/api/")) {
    const mod = path.join(ROOT, p + ".js");
    if (!fs.existsSync(mod)) { res.statusCode = 404; return res.end("no api"); }
    req.query = Object.fromEntries(u.searchParams);
    delete require.cache[mod];
    return require(mod)(req, res);
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end("Not found"); }
  res.setHeader("Content-Type", MIME[path.extname(file)] || "application/octet-stream");
  fs.createReadStream(file).pipe(res);
}).listen(process.env.PORT || 3000, () => console.log("http://localhost:" + (process.env.PORT || 3000)));
