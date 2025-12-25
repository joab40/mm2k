// /api/admin/login.js
// Node-runtime + signerad admin-cookie (mm2k_admin)

import crypto from "crypto";

export const config = { runtime: "nodejs" };

const COOKIE = "mm2k_admin";
const ONE_DAY = 60 * 60 * 24;

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function sign(payload, secret) {
  const data = Buffer.from(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", String(secret || "")).update(data).digest();
  return `${b64url(data)}.${b64url(sig)}`;
}
function verify(token, secret) {
  const [p, s] = String(token || "").split(".");
  if (!p || !s) return null;
  const data = Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const expect = b64url(crypto.createHmac("sha256", String(secret || "")).update(data).digest());
  if (expect !== s) return null;
  try { return JSON.parse(String(data)); } catch { return null; }
}
function setCookie(res, value, maxAge = ONE_DAY) {
  res.setHeader("Set-Cookie", [
    `${COOKIE}=${value}`,
    "Path=/",
    "SameSite=Lax",
    "HttpOnly",
    "Secure",
    `Max-Age=${maxAge}`
  ].join("; "));
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).end(); return; }

  const chunks = []; for await (const c of req) chunks.push(c);
  let body = null; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"); } catch {}
  const { code, logout } = body || {};

  if (logout) { setCookie(res, "", 0); res.status(204).end(); return; }

  if (!code || code !== process.env.ADMIN_CODE) { res.status(401).json({ error: "Bad code" }); return; }

  const payload = { iat: Date.now(), exp: Date.now() + ONE_DAY * 1000 };
  const token = sign(payload, process.env.ADMIN_SECRET || "mm2k");
  setCookie(res, token, ONE_DAY);
  res.status(204).end();
}

export function isAdminFromReq(req) {
  const c = req.headers.cookie || "";
  const m = c.match(/(?:^|; )mm2k_admin=([^;]+)/);
  if (!m) return false;
  const data = verify(m[1], process.env.ADMIN_SECRET || "mm2k");
  return !!data && (!data.exp || Date.now() < data.exp);
}
