import { put } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { blobKey, profile } = req.body ?? {};
    if (!blobKey || !profile) return res.status(400).json({ error: 'blobKey + profile required' });

    const mainPath = `profiles/${blobKey}.json`;
    const body = JSON.stringify(profile, null, 2);

    // Skriv huvudfilen (publik, stabil sökväg)
    await put(mainPath, body, {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN
    });

    // Skriv snapshot i history/
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    await put(`profiles/${blobKey}/history/${ts}.json`, body, {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN
    });

    res.status(200).json({ ok: true, key: blobKey });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Upload failed' });
  }
}
