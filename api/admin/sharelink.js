// /api/admin/sharelink.js
export const config = { runtime: 'nodejs18.x' };

import { requireAdmin } from '../../utils/adminAuth.js';

export default async function handler(req, res){
  if (!requireAdmin(req,res)) return;
  const url = new URL(req.url, `http://${req.headers.host}`);
  const key = url.searchParams.get('key');
  if (!key) { res.statusCode=400; res.setHeader('content-type','application/json'); return res.end(JSON.stringify({ error:'missing key' })); }

  const base = String(process.env.PUBLIC_BASE_URL || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`);
  res.setHeader('content-type','application/json; charset=utf-8');
  return res.end(JSON.stringify({ link: `${base}?k=${encodeURIComponent(key)}` }));
}
