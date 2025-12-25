// api/admin/profiles.js
export const config = { runtime: 'nodejs18.x' }; 
import { list, del, put } from "@vercel/blob";
import { requireAdmin } from "./_lib/auth.js";

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json");
  if (!requireAdmin(req, res)) return;

  if (req.method === "GET") {
    const { cursor, q } = req.query || {};
    const { blobs, hasMore, cursor: next } = await list({ prefix: "profiles/", cursor });
    // Visa bara toppfilen profile.json
    const rows = blobs
      .filter(b => b.pathname.endsWith("/profile.json"))
      .filter(b => !q || b.pathname.includes(String(q)))
      .map(b => {
        const key = b.pathname.split("/")[1]; // profiles/<key>/profile.json
        return {
          blobKey: key,
          url: b.url,
          size: b.size,
          uploadedAt: b.uploadedAt,
        };
      });
    res.status(200).json({ items: rows, hasMore, cursor: next });
    return;
  }

  res.setHeader("Allow", "GET");
  res.status(405).end();
}
