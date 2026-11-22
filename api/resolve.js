"use strict";
// (admin) Lấy toạ độ từ link Google Maps (kể cả link rút gọn maps.app.goo.gl).
const { checkAdmin, send } = require("./_lib/auth");

function extract(s) {
  s = decodeURIComponent(String(s || ""));
  let m = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(s);
  if (m) return { lat: +m[1], lng: +m[2] };
  m = /[?&](?:q|query|ll|destination|center)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(s);
  if (m) return { lat: +m[1], lng: +m[2] };
  m = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(s);
  if (m) return { lat: +m[1], lng: +m[2] };
  return null;
}

module.exports = async function handler(req, res) {
  const auth = await checkAdmin(req);
  if (!auth.ok) return send(res, auth.status, { error: auth.error });
  const url = String((req.query && req.query.url) || "");
  let u;
  try { u = new URL(url); } catch (e) { return send(res, 400, { error: "Link không hợp lệ" }); }
  const okHost = /(^|\.)(google\.[a-z.]+|goo\.gl|app\.goo\.gl)$/i.test(u.hostname);
  if (!okHost || u.protocol !== "https:") return send(res, 400, { error: "Chỉ hỗ trợ link Google Maps" });
  let found = extract(url);
  let name = "";
  if (!found) {
    try {
      let cur = url;
      for (let i = 0; i < 5 && !found; i++) {
        const r = await fetch(cur, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "vi" } });
        const loc = r.headers.get("location");
        if (loc) { cur = new URL(loc, cur).toString(); found = extract(cur); continue; }
        const html = await r.text();
        found = extract(html.slice(0, 400000));
        break;
      }
      const pm = /\/maps\/place\/([^/@?]+)/.exec(decodeURIComponent(cur));
      if (pm) name = pm[1].replace(/\+/g, " ");
    } catch (e) { /* bỏ qua */ }
  }
  if (!found) return send(res, 422, { error: "Không đọc được toạ độ từ link này. Hãy dán toạ độ trực tiếp." });
  return send(res, 200, { ...found, name });
};
