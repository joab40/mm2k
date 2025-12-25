// /api/admin/profiles/index.js
export const config = { runtime: 'nodejs' };

import { requireAdmin } from '../../../utils/adminAuth.js';
import { list } from '@vercel/blob';

export default async function handler(req, res) {
  // Kräver inloggad admin (signerad cookie)
  if (!requireAdmin(req, res)) return;

  const token = (process.env.BLOB_READ_WRITE_TOKEN || '').trim();
  if (!token) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'missing_blob_token' }));
  }

  try {
    // Lista alla profiler som har profile.json
    const out = await list({ prefix: 'profiles/', limit: 1000, token });

    const items = (out.blobs || [])
      .filter(b => b.pathname.endsWith('/profile.json'))
      .map(b => ({
        pathname: b.pathname,
        uploadedAt: b.uploadedAt,
        size: b.size,
        url: b.url,
        // Korrekt regex: fånga nyckeln mellan "profiles/" och nästa "/"
        blobKey: (b.pathname.match(/^profiles\/([^/]+)/) || [,''])[1]
      }));

    res.setHeader('content-type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ items }));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({
      error: 'list_failed',
      details: String(e?.message || e)
    }));
  }
}
