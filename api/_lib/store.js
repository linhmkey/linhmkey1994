// Lưu trữ dữ liệu: GitHub (khi chạy trên Vercel) hoặc thư mục cục bộ (khi chạy thử trên máy).
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const LOCAL = process.env.LOCAL_STORE === "1";

function repoInfo() {
  const full = process.env.GITHUB_REPO ||
    (process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
      ? process.env.VERCEL_GIT_REPO_OWNER + "/" + process.env.VERCEL_GIT_REPO_SLUG : "");
  const branch = process.env.GITHUB_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || "main";
  return { full, branch, token: process.env.GITHUB_TOKEN || "" };
}

function configured() {
  if (LOCAL) return true;
  const r = repoInfo();
  return Boolean(r.full && r.token);
}

function safePath(p) {
  const clean = String(p || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean || clean.split("/").some((s) => s === ".." || s === "")) throw new Error("Đường dẫn không hợp lệ");
  return clean;
}

async function gh(method, p, body, accept) {
  const r = repoInfo();
  const url = "https://api.github.com/repos/" + r.full + "/contents/" + p.split("/").map(encodeURIComponent).join("/") +
    (method === "GET" ? "?ref=" + encodeURIComponent(r.branch) : "");
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: "Bearer " + r.token,
      Accept: accept || "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "map-local-site",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

// Đọc file -> Buffer, hoặc null nếu không có
async function readFile(p) {
  p = safePath(p);
  if (LOCAL) {
    const f = path.join(ROOT, p);
    return fs.existsSync(f) ? fs.readFileSync(f) : null;
  }
  const res = await gh("GET", p, null, "application/vnd.github.raw+json");
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("GitHub trả lỗi " + res.status + " khi đọc " + p);
  return Buffer.from(await res.arrayBuffer());
}

async function getSha(p) {
  const res = await gh("GET", p);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("GitHub trả lỗi " + res.status + " khi đọc " + p);
  const j = await res.json();
  return j.sha || null;
}

// Ghi file (Buffer hoặc chuỗi)
async function writeFile(p, content, message) {
  p = safePath(p);
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(String(content), "utf8");
  if (LOCAL) {
    const f = path.join(ROOT, p);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, buf);
    return;
  }
  const r = repoInfo();
  for (let attempt = 0; attempt < 3; attempt++) {
    const sha = await getSha(p);
    const res = await gh("PUT", p, {
      message: message || "Cập nhật " + p,
      content: buf.toString("base64"),
      branch: r.branch,
      ...(sha ? { sha } : {}),
    });
    if (res.ok) return;
    if (res.status !== 409 && res.status !== 422) {
      const t = await res.text();
      throw new Error("GitHub trả lỗi " + res.status + ": " + t.slice(0, 200));
    }
  }
  throw new Error("Không ghi được " + p + " sau nhiều lần thử");
}

module.exports = { readFile, writeFile, configured, repoInfo, LOCAL };
