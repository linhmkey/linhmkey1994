"use strict";
// (admin) Tải ảnh lên: nhận JSON { name, data: base64 }, lưu vào uploads/ trong repo.
const crypto = require("crypto");
const store = require("./_lib/store");
const { checkAdmin, send, readJson } = require("./_lib/auth");

const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
    const auth = await checkAdmin(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.error });
    if (!store.configured()) return send(res, 503, { error: "Chưa cấu hình GITHUB_TOKEN trên Vercel" });
    const body = await readJson(req);
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(body.data || ""));
    if (!m) return send(res, 400, { error: "Ảnh không hợp lệ (chỉ nhận JPG, PNG, WEBP)" });
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > 3.5 * 1024 * 1024) return send(res, 413, { error: "Ảnh quá lớn" });
    const base = String(body.name || "anh").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "anh";
    const d = new Date();
    const folder = "uploads/" + d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    const file = folder + "/" + base + "-" + crypto.randomBytes(4).toString("hex") + "." + TYPES[m[1]];
    await store.writeFile(file, buf, "Admin: tải ảnh " + file);
    return send(res, 200, { ok: true, url: "/" + file });
  } catch (e) {
    return send(res, 500, { error: e.message || "Lỗi máy chủ" });
  }
};
