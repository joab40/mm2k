// /api/admin/profiles/index.js
export const config = { runtime: 'nodejs18.x' };

import { requireAdmin } from '../../../utils/adminAuth.js';
import { list } from '@vercel/blob';

export default async function handler(req, res){
  if (!requireAdmin(req,res)) return;

  try {
    const out = await list({ prefix: 'profiles/', limit: 1000, token: process.env.BLOB_READ_WRITE_TOKEN });
    const items = (out.blobs || []).map(b => ({
      pathname: b.pathname,
      uploadedAt: b.uploadedAt,
      size: b.size,
      url: b.url,
      blobKey: (b.pathname.match(/^profiles\\/([^/]+)/) || [,''])[1]
    })).filter(x => x.pathname.endsWith('/profile.json'));
    res.setHeader('content-type','application/json; charset=utf-8');
    return res.end(JSON.stringify({ items }));
  } catch (e) {
    res.statusCode=500;
    res.setHeader('content-type','application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'list_failed', details: e.message }));
  }
}
