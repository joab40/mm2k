export const config = { runtime: "nodejs" };
import { list } from "@vercel/blob";

export default async function handler(req, res) {
  try {
    const key = (req.query.key || "").toString();
    if (!key) return res.status(400).json({ error: "missing key" });

    const items = [];
    let cursor;
    do {
      const { blobs, cursor: next } = await list({
        prefix: `profiles/${key}/`,
        cursor,
        token: process.env.BLOB_READ_WRITE_TOKEN
      });
      cursor = next;
      for (const b of blobs) {
        if (!/\/rev-\d+\.json$/.test(b.pathname)) continue;
        items.push({ pathname: b.pathname, url: b.url, size: b.size, uploadedAt: b.uploadedAt });
      }
    } while (cursor);

    items.sort((a, b) => (a.uploadedAt || 0) < (b.uploadedAt || 0) ? 1 : -1);
    return res.status(200).json({ items });
  } catch (e) {
    console.error("HISTORY_ERROR", e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
