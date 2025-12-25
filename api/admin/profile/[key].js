// /api/admin/profile/[key].js
// GET = hämta senaste JSON, DELETE = rensa alla, PATCH = enkla adminåtgärder

import { isAdminFromReq } from "../login.js";
import { list, put, del } from "@vercel/blob";

export const config = { runtime: "nodejs" };

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

async function readLatest(key) {
  const { blobs } = await list({ prefix: `mm2k/profiles/${key}/`, token: TOKEN });
  let cand = blobs.find(b=> b.pathname.endsWith("/latest.json"));
  if (!cand) cand = blobs.slice().sort((a,b)=> new Date(b.uploadedAt||0) - new Date(a.uploadedAt||0))[0];
  if (!cand) return null;
  const r = await fetch(cand.url);
  if (!r.ok) throw new Error("Fetch latest failed");
  return await r.json();
}

async function writeSnapshot(key, profile) {
  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `mm2k/profiles/${key}`;
  const body = JSON.stringify(profile, null, 2);
  await put(`${base}/${now}.json`, body, { access: "public", addRandomSuffix: false, token: TOKEN, contentType: "application/json" });
  await put(`${base}/latest.json`, body, { access: "public", addRandomSuffix: false, token: TOKEN, contentType: "application/json" });
}

export default async function handler(req, res) {
  if (!isAdminFromReq(req)) { res.status(401).json({ error: "Unauthorized" }); return; }

  const key = req.query.key;
  if (!key) { res.status(400).json({ error: "Missing key" }); return; }

  if (req.method === "GET") {
    try {
      const profile = await readLatest(key);
      if (!profile) { res.status(404).json({ error: "Not found" }); return; }
      res.status(200).json(profile);
    } catch(e) { res.status(500).json({ error: "Read failed", details: String(e?.message || e) }); }
    return;
  }

  if (req.method === "DELETE") {
    try {
      const { blobs } = await list({ prefix: `mm2k/profiles/${key}/`, token: TOKEN });
      await del(blobs.map(b=> b.pathname), { token: TOKEN });
      res.status(204).end();
    } catch(e) { res.status(500).json({ error: "Delete failed", details: String(e?.message || e) }); }
    return;
  }

  if (req.method === "PATCH") {
    const chunks = []; for await (const c of req) chunks.push(c);
    let body = null; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"); } catch {}
    const { op } = body || {};
    if (!op) { res.status(400).json({ error: "Missing op" }); return; }

    try {
      const cur = (await readLatest(key)) || { users: [], profileMeta: { rev: 0 } };
      const users = Array.isArray(cur.users) ? cur.users.slice() : [];
      const meta = { ...(cur.profileMeta||{}), rev: (cur.profileMeta?.rev||0)+1, lastSavedAt: new Date().toISOString() };

      if (op === "renameUser") {
        const { id, name } = body; const u = users.find(x=>x.id===id); if (u) u.name = name;
      } else if (op === "setWorkingRm") {
        const { id, value } = body; const u = users.find(x=>x.id===id); if (u) u.workingRmKg = Number(value)||0;
      } else if (op === "resetLogs") {
        const { id } = body; const u = users.find(x=>x.id===id); if (u) u.logs = {};
      } else if (op === "removeUser") {
        const { id } = body; const idx = users.findIndex(x=>x.id===id); if (idx>=0) users.splice(idx,1);
      } else {
        res.status(400).json({ error: "Unknown op" }); return;
      }

      await writeSnapshot(key, { users, profileMeta: meta });
      res.status(204).end();
    } catch(e){ res.status(500).json({ error: "Patch failed", details: String(e?.message || e) }); }
    return;
  }

  res.status(405).end();
}
