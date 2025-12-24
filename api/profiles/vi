// /api/profiles/history.js (ESM)
import { list, head } from '@vercel/blob';

export default async function handler(req, res) {
  try {
    const { key } = req.query;
    if (!key) return res.status(400).json({ error: 'Missing ?key=' });

    const prefix = `profiles/${key}/history/`;
    const items = [];
    let cursor;

    do {
      const resp = await list({ prefix, cursor, token: process.env.BLOB_READ_WRITE_TOKEN });
      for (const b of resp.blobs || []) {
        const meta = await head(b.pathname, { token: process.env.BLOB_READ_WRITE_TOKEN });
        items.push({
          pathname: b.pathname,
          uploadedAt: b.uploadedAt || meta?.uploadedAt || null,
          size: b.size ?? meta?.size ?? null,
          url: meta?.downloadUrl || meta?.url, // direkt JSON-url
        });
      }
      cursor = resp?.cursor;
    } while (cursor);

    // Senaste först
    items.sort((a, b) => (new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0)) || b.pathname.localeCompare(a.pathname));

    res.status(200).json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
