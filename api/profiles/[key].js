export const config = { runtime: "nodejs" };
import { list } from "@vercel/blob";

export default async function handler(req, res) {
  try {
    const key = (req.query.key || "").toString();
    if (!key) return res.status(400).json({ error: "missing key" });

    const { blobs } = await list({
      prefix: `profiles/${key}/`,
      token: process.env.BLOB_READ_WRITE_TOKEN
    });
    const cur = blobs.find(b => b.pathname.endsWith("/current.json"));
    if (!cur) return res.status(404).json({ error: "not found" });

    const r = await fetch(cur.url);
    if (!r.ok) return res.status(502).json({ error: "fetch failed" });
    const data = await r.json();
    return res.status(200).json(data);
  } catch (e) {
    console.error("GET_ERROR", e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
