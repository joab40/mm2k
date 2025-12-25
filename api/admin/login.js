// /api/admin/login.js
export const config = { runtime: 'nodejs18.x' };

import { newPayload, signSession, setAdminCookie, clearAdminCookie, readJSON } from '../../utils/adminAuth.js';

export default async function handler(req, res){
  if (req.method !== 'POST') { res.statusCode=405; return res.end(); }

  const body = await readJSON(req);
  const input = String(body.code ?? '').trim();

  const ADMIN_CODE   = String(process.env.ADMIN_CODE   || '').trim();
  const ADMIN_SECRET = String(process.env.ADMIN_SECRET || '').trim();

  if (!ADMIN_CODE || !ADMIN_SECRET) {
    res.statusCode=500;
    res.setHeader('content-type','application/json; charset=utf-8');
    return res.end(JSON.stringify({ error:'Server misconfigured' }));
  }

  if (body.logout) {
    clearAdminCookie(req, res);
    return res.end(); // 200
  }

  if (input !== ADMIN_CODE) {
    res.statusCode=401;
    res.setHeader('content-type','application/json; charset=utf-8');
    return res.end(JSON.stringify({ error:'Bad code' }));
  }

  const token = signSession(newPayload(24*60*60*1000), ADMIN_SECRET);
  setAdminCookie(req, res, token);
  return res.end(); // 200
}
