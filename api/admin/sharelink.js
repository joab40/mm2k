// api/admin/sharelink.js
import { requireAdmin } from "./_lib/auth.js";
export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  const key = String(req.query.key || "");
  if (!key) { res.status(400).json({ error: "Missing key" }); return; }
  const base = process.env.PUBLIC_BASE_URL || (req.headers["x-forwarded-proto"] + "://" + req.headers.host);
  res.status(200).json({ link: `${base}?k=${key}` });
}
