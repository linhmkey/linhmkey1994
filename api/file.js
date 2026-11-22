"use strict";
// Phục vụ ảnh vừa tải lên trong lúc Vercel chưa build lại (sau đó ảnh được phục vụ tĩnh).
const store = require("./_lib/store");

const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

module.exports = async function handler(req, res) {
  try {
    let p = String((req.query && req.query.path) || "");
    if (Array.isArray(req.query && req.query.path)) p = req.query.path.join("/");
    p = "uploads/" + p.replace(/^\/?uploads\//, "");
    const ext = (p.split(".").pop() || "").toLowerCase();
    if (!MIME[ext]) { res.statusCode = 404; return res.end("Not found"); }
    const buf = store.configured() ? await store.readFile(p) : null;
    if (!buf) { res.statusCode = 404; return res.end("Not found"); }
    res.setHeader("Content-Type", MIME[ext]);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.end(buf);
  } catch (e) {
    res.statusCode = 500; res.end("Error");
  }
};
