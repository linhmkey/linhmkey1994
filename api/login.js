"use strict";
// POST { email, password } -> { token }.  GET (có token) -> kiểm tra phiên.
const store = require("./_lib/store");
const A = require("./_lib/auth");

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const r = await A.checkAdmin(req);
      if (!r.ok) return A.send(res, r.status, { error: r.error });
      return A.send(res, 200, { ok: true, email: r.auth.email, storage: store.configured() }, { "Cache-Control": "no-store" });
    }
    if (req.method !== "POST") return A.send(res, 405, { error: "Method not allowed" });
    if (!store.configured()) return A.send(res, 503, { error: "Chưa cấu hình GITHUB_TOKEN trên Vercel" });
    const body = await A.readJson(req);
    const email = String(body.email || "").trim().toLowerCase();
    const auth = await A.loadAuth();
    const ok = email === String(auth.email).toLowerCase() && A.verifyPassword(String(body.password || ""), auth);
    if (!ok) {
      await new Promise((r) => setTimeout(r, 800)); // làm chậm dò mật khẩu
      return A.send(res, 401, { error: "Sai email hoặc mật khẩu" });
    }
    return A.send(res, 200, { ok: true, token: A.issueToken(auth), email: auth.email }, { "Cache-Control": "no-store" });
  } catch (e) {
    return A.send(res, 500, { error: e.message || "Lỗi máy chủ" });
  }
};
