"use strict";
// Đăng nhập admin bằng email + mật khẩu. Mật khẩu lưu dạng băm scrypt trong private/auth.json (repo GitHub),
// không bao giờ lưu dạng chữ thường. Phiên đăng nhập là token ký HMAC, hết hạn sau 30 ngày.
const crypto = require("crypto");
const store = require("./store");

const AUTH_FILE = "private/auth.json";
const TOKEN_DAYS = 30;

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return { salt, hash };
}
function verifyPassword(password, rec) {
  if (!rec || !rec.salt || !rec.hash) return false;
  const h = hashPassword(password, rec.salt).hash;
  return crypto.timingSafeEqual(Buffer.from(h, "hex"), Buffer.from(rec.hash, "hex"));
}

async function loadAuth() {
  const buf = await store.readFile(AUTH_FILE);
  if (!buf) throw new Error("Chưa có file private/auth.json trong repo");
  return JSON.parse(buf.toString("utf8"));
}
async function saveAuth(auth) {
  await store.writeFile(AUTH_FILE, JSON.stringify(auth, null, 2) + "\n", "Admin: cập nhật tài khoản quản trị");
}

function secret() {
  const s = process.env.SESSION_SECRET || process.env.GITHUB_TOKEN || (store.LOCAL ? "local-dev-secret" : "");
  if (!s) throw new Error("Chưa cấu hình GITHUB_TOKEN trên Vercel");
  return crypto.createHash("sha256").update("map-local:" + s).digest();
}
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return body + "." + mac;
}
function issueToken(auth) {
  return sign({ e: auth.email, v: auth.version || 1, x: Date.now() + TOKEN_DAYS * 864e5 });
}

async function checkAdmin(req) {
  try {
    const h = String(req.headers.authorization || "");
    const tok = h.replace(/^Bearer\s+/i, "");
    const [body, mac] = tok.split(".");
    if (!body || !mac) return { ok: false, status: 401, error: "Vui lòng đăng nhập" };
    const good = crypto.createHmac("sha256", secret()).update(body).digest();
    const given = Buffer.from(mac, "base64url");
    if (given.length !== good.length || !crypto.timingSafeEqual(given, good)) return { ok: false, status: 401, error: "Phiên đăng nhập không hợp lệ" };
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!p.x || p.x < Date.now()) return { ok: false, status: 401, error: "Phiên đăng nhập đã hết hạn, hãy đăng nhập lại" };
    const auth = await loadAuth();
    if (p.e !== auth.email || p.v !== (auth.version || 1)) return { ok: false, status: 401, error: "Tài khoản đã đổi mật khẩu, hãy đăng nhập lại" };
    return { ok: true, auth };
  } catch (e) {
    return { ok: false, status: 500, error: e.message };
  }
}

function send(res, status, obj, headers) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  Object.entries(headers || {}).forEach(([k, v]) => res.setHeader(k, v));
  res.end(JSON.stringify(obj));
}

async function readJson(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

module.exports = { checkAdmin, send, readJson, hashPassword, verifyPassword, loadAuth, saveAuth, issueToken };
