// /api/profiles/save.js
import { put } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  const { accountId, profile } = req.body || {};
  if (!accountId || !profile) {
    return res.status(400).json({ error: 'accountId + profile required' });
  }

  // En stabil sökväg per profil (”mappar” skapas av prefixet automatiskt)
  const pathname = `profiles/${accountId}.json`;

  const { url } = await put(
    pathname,
    JSON.stringify(profile, null, 2),
    {
      access: 'private',        // profiler ska inte vara publika
      contentType: 'application/json',
      addRandomSuffix: false,   // så att URL:en inte ändras varje gång
    }
  );

  return res.status(200).json({ ok: true, url });
}
