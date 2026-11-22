"use strict";
// (admin) POST { currentPassword, newEmail?, newPassword? } -> đổi email / mật khẩu, trả token mới.
const A = require("./_lib/auth");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") return A.send(res, 405, { error: "Method not allowed" });
    const r = await A.checkAdmin(req);
    if (!r.ok) return A.send(res, r.status, { error: r.error });
    const body = await A.readJson(req);
    const auth = r.auth;
    if (!A.verifyPassword(String(body.currentPassword || ""), auth)) {
      await new Promise((x) => setTimeout(x, 800));
      return A.send(res, 400, { error: "Mật khẩu hiện tại không đúng" });
    }
    const email = String(body.newEmail || auth.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return A.send(res, 400, { error: "Email không hợp lệ" });
    const next = { email, salt: auth.salt, hash: auth.hash, version: (auth.version || 1) + 1, updatedAt: new Date().toISOString() };
    if (body.newPassword) {
      const pw = String(body.newPassword);
      if (pw.length < 8) return A.send(res, 400, { error: "Mật khẩu mới cần ít nhất 8 ký tự" });
      Object.assign(next, A.hashPassword(pw));
    }
    await A.saveAuth(next);
    return A.send(res, 200, { ok: true, email: next.email, token: A.issueToken(next) });
  } catch (e) {
    return A.send(res, 500, { error: e.message || "Lỗi máy chủ" });
  }
};
