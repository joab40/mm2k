import { put } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { accountId, profile } = req.body ?? {};
    if (!accountId || !profile) return res.status(400).json({ error: 'Missing accountId or profile' });

    const pathname = `profiles/${accountId}.json`;

    const { url, pathname: saved } = await put(
      pathname,
      JSON.stringify(profile),
      {
        access: 'public',                 // ← viktigt: public
        contentType: 'application/json',
        addRandomSuffix: false,           // stabil filväg (överskriv samma fil)
        token: process.env.BLOB_READ_WRITE_TOKEN
      }
    );

    res.status(200).json({ ok: true, url, pathname: saved });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Upload failed' });
  }
}
