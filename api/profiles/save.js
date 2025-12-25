export const config = { runtime: "nodejs" };
import { put } from "@vercel/blob";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    const { blobKey, profile } = req.body || {};
    if (!blobKey || !profile) return res.status(400).json({ error: "missing blobKey/profile" });

    const rev = Number(profile?.profileMeta?.rev) || 0;
    const body = JSON.stringify(profile);

    // Spara "current"
    const currentPath = `profiles/${blobKey}/current.json`;
    await put(currentPath, body, {
      access: "public",                 // <- viktigt
      contentType: "application/json",
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN
    });

    // Spara snapshot
    const snapPath = `profiles/${blobKey}/rev-${rev}.json`;
    await put(snapPath, body, {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN
    });

    return res.status(200).json({ ok: true, currentPath, snapPath, rev });
  } catch (e) {
    console.error("SAVE_ERROR", e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
