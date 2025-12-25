// api/admin/login.js
import { setAdminCookie, clearAdminCookie } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (req.method === "POST") {
    const { code, logout } = await readJson(req);
    if (logout) { clearAdminCookie(res); res.status(204).end(); return; }

    const ok = String(code || "") === String(process.env.ADMIN_CODE || "");
    if (!ok) { res.status(401).json({ error: "Bad code" }); return; }
    if (!process.env.ADMIN_SECRET) { res.status(500).json({ error: "Missing ADMIN_SECRET" }); return; }

    setAdminCookie(res, process.env.ADMIN_SECRET, 30); // 30 min
    res.status(204).end();
    return;
  }
  res.setHeader("Allow", "POST"); res.status(405).end();
}

function readJson(req) {
  return new Promise((resolve) => {
    let body = ""; req.on("data", (c)=> body+=c);
    req.on("end", ()=> { try { resolve(JSON.parse(body||"{}")); } catch { resolve({}); } });
  });
}
