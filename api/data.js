"use strict";
// GET: trả toàn bộ dữ liệu bản đồ. PUT: (admin) lưu dữ liệu.
const store = require("./_lib/store");
const { checkAdmin, send, readJson } = require("./_lib/auth");

const DB = "data/db.json";

function clean(db) {
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    settings: db.settings && typeof db.settings === "object" ? db.settings : {},
    categories: arr(db.categories),
    places: arr(db.places),
    tours: arr(db.tours),
    areas: arr(db.areas),
  };
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      if (!store.configured()) return send(res, 503, { error: "not_configured" });
      const buf = await store.readFile(DB);
      const db = buf ? JSON.parse(buf.toString("utf8")) : clean({});
      const fresh = req.query && req.query.fresh;
      return send(res, 200, db, {
        "Cache-Control": fresh ? "no-store" : "public, max-age=0, s-maxage=10, stale-while-revalidate=60",
      });
    }
    if (req.method === "PUT" || req.method === "POST") {
      const auth = await checkAdmin(req);
      if (!auth.ok) return send(res, auth.status, { error: auth.error });
      if (!store.configured()) return send(res, 503, { error: "Chưa cấu hình GITHUB_TOKEN trên Vercel" });
      const body = await readJson(req);
      if (!body || !body.db) return send(res, 400, { error: "Thiếu dữ liệu" });
      const curBuf = await store.readFile(DB);
      const cur = curBuf ? JSON.parse(curBuf.toString("utf8")) : null;
      if (cur && body.baseUpdatedAt && cur.updatedAt && body.baseUpdatedAt !== cur.updatedAt && !body.force) {
        return send(res, 409, { error: "Dữ liệu vừa được sửa ở nơi khác. Hãy tải lại trang admin.", current: cur });
      }
      const db = clean(body.db);
      const json = JSON.stringify(db, null, 2);
      if (json.length > 900000) return send(res, 413, { error: "Dữ liệu quá lớn" });
      await store.writeFile(DB, json + "\n", "Admin: cập nhật bản đồ (" + db.places.length + " địa điểm)");
      return send(res, 200, { ok: true, updatedAt: db.updatedAt });
    }
    res.setHeader("Allow", "GET, PUT");
    return send(res, 405, { error: "Method not allowed" });
  } catch (e) {
    return send(res, 500, { error: e.message || "Lỗi máy chủ" });
  }
};
