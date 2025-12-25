// /api/admin/sharelink.js
import { isAdminFromReq } from "./login.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  if (!isAdminFromReq(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
  const key = req.query.key;
  if (!key) { res.status(400).json({ error: "Missing key" }); return; }
  const base = process.env.PUBLIC_BASE_URL || `https://${req.headers.host || ""}`;
  res.status(200).json({ link: `${base}?k=${encodeURIComponent(key)}` });
}
