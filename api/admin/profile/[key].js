// /api/admin/profile/[key].js
export const config = { runtime: 'nodejs' };

import { requireAdmin, readJSON } from '../../../utils/adminAuth.js';
import { list, put, del } from '@vercel/blob';

async function loadLatestProfile(key){
  const prefix = `profiles/${key}/`;
  const out = await list({ prefix, limit: 100, token: process.env.BLOB_READ_WRITE_TOKEN });
  // hitta senaste profile.json
  const profs = (out.blobs || []).filter(b=>b.pathname.endsWith('/profile.json'));
  if (profs.length === 0) return null;
  const latest = profs.sort((a,b)=> new Date(b.uploadedAt)-new Date(a.uploadedAt))[0];
  const r = await fetch(latest.url);
  if (!r.ok) throw new Error('fetch_failed');
  const j = await r.json();
  return { data: j, latest };
}

async function saveProfile(key, data){
  const pathname = `profiles/${key}/profile.json`;
  await put(pathname, JSON.stringify(data), { access: 'public', token: process.env.BLOB_READ_WRITE_TOKEN });
}

export default async function handler(req, res){
  const url = new URL(req.url, `http://${req.headers.host}`);
  const key = url.pathname.split('/').pop();

  if (!requireAdmin(req,res)) return;

  if (req.method === 'GET') {
    try {
      const p = await loadLatestProfile(key);
      if (!p) { res.statusCode=404; return res.end(JSON.stringify({ error:'not_found'})); }
      res.setHeader('content-type','application/json; charset=utf-8');
      return res.end(JSON.stringify(p.data));
    } catch (e){
      res.statusCode=500; res.setHeader('content-type','application/json'); return res.end(JSON.stringify({ error:'get_failed', details:e.message }));
    }
  }

  if (req.method === 'PATCH') {
    try{
      const body = await readJSON(req);
      const p = await loadLatestProfile(key);
      if (!p) { res.statusCode=404; return res.end(JSON.stringify({ error:'not_found'})); }
      const prof = p.data || {};
      prof.users = Array.isArray(prof.users) ? prof.users : [];
      prof.profileMeta = prof.profileMeta || { rev: 0 };

      const { op } = body || {};
      if (op === 'renameUser') {
        const u = prof.users.find(x=>x.id===body.id);
        if (u) u.name = String(body.name ?? u.name);
      } else if (op === 'setWorkingRm') {
        const u = prof.users.find(x=>x.id===body.id);
        if (u) u.workingRmKg = Number(body.value);
      } else if (op === 'resetLogs') {
        const u = prof.users.find(x=>x.id===body.id);
        if (u) u.logs = {};
      } else if (op === 'removeUser') {
        prof.users = prof.users.filter(x=>x.id!==body.id);
      } else {
        res.statusCode=400; return res.end(JSON.stringify({ error:'bad_op'}));
      }

      prof.profileMeta.rev = (prof.profileMeta.rev||0)+1;
      prof.profileMeta.lastSavedAt = new Date().toISOString();

      await saveProfile(key, prof);
      res.setHeader('content-type','application/json; charset=utf-8');
      return res.end(JSON.stringify({ ok:true, rev: prof.profileMeta.rev }));
    } catch(e){
      res.statusCode=500; res.setHeader('content-type','application/json'); return res.end(JSON.stringify({ error:'patch_failed', details:e.message }));
    }
  }

  if (req.method === 'DELETE') {
    try {
      const prefix = `profiles/${key}/`;
      const out = await list({ prefix, limit: 1000, token: process.env.BLOB_READ_WRITE_TOKEN });
      const paths = (out.blobs||[]).map(b=>b.pathname);
      if (paths.length) await del(paths, { token: process.env.BLOB_READ_WRITE_TOKEN });
      res.statusCode=204; return res.end();
    } catch(e){
      res.statusCode=500; res.setHeader('content-type','application/json'); return res.end(JSON.stringify({ error:'delete_failed', details:e.message }));
    }
  }

  res.statusCode=405; res.end();
}
