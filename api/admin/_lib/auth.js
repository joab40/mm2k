// api/admin/_lib/auth.js
import { createHmac } from "node:crypto";

const COOKIE = "mm2k_admin";
const ALG = "sha256";

function sign(payload, secret) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac(ALG, secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function verify(token, secret) {
  if (!token || !token.includes(".")) return null;
  const [data, sig] = token.split(".");
  const good = createHmac(ALG, secret).update(data).digest("base64url");
  if (sig !== good) return null;
  const obj = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  if (obj.exp && Date.now() > obj.exp) return null;
  return obj;
}

export function setAdminCookie(res, secret, minutes = 30) {
  const payload = { role: "admin", exp: Date.now() + minutes * 60 * 1000 };
  const token = sign(payload, secret);
  const cookie = `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${minutes*60}`;
  res.setHeader("Set-Cookie", cookie);
}

export function clearAdminCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

export function requireAdmin(req, res) {
  try {
    const raw = (req.headers.cookie || "").split(";").map(s=>s.trim()).find(s=>s.startsWith(`${COOKIE}=`));
    const token = raw ? raw.split("=")[1] : null;
    const ok = verify(token, process.env.ADMIN_SECRET || "");
    if (!ok || ok.role !== "admin") {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return null;
    }
    return ok;
  } catch {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return null;
  }
}
