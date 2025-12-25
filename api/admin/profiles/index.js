// /api/admin/profiles/index.js
export const config = { runtime: 'nodejs' };

import { requireAdmin } from '../../../utils/adminAuth.js';
import { list } from '@vercel/blob';

export default async function handler(req, res){
  if (!requireAdmin(req,res)) return;

  const token = (process.env.BLOB_READ_WRITE_TOKEN || '').trim();
  if (!token) {
    res.statusCode = 500;
    res.setHeader('content-type','application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'missing_blob_token' }));
  }

  try {
    // Lista allt under "profiles/"
    const out = await list({ prefix: 'profiles/', limit: 1000, token });

    // Extrahera blobKey korrekt (regex ska vara /^profiles\/([^/]+)/)
    const items = (out.blobs || [])
      .filter(b => b.pathname.endsWith('/profile.json'))
      .map(b => ({
        pathname: b.pathname,
        uploadedAt: b.uploadedAt,
        size: b.size,
        url: b.url,
        blobKey: (b.pathname.match(/^profiles\/([^/]+)/) || [,''])[1]
      }));

    res.setHeader('content-type','application/json; charset=utf-8');
    return res.end(JSON.stringify({ items }));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('content-type','application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'list_failed', details: String(e?.message || e) }));
  }
}
