// api/admin/profile/[key].js
import { list, del, put } from "@vercel/blob";
import { requireAdmin } from "../../_lib/auth.js";

export const config = { api: { bodyParser: { sizeLimit: "2mb" } } };

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  const key = req.url.split("/api/admin/profile/")[1]?.split("?")[0];
  if (!key) { res.status(400).json({ error: "Missing key" }); return; }

  if (req.method === "GET") {
    // Hämta profile.json
    const url = `profiles/${key}/profile.json`;
    try {
      const r = await fetch(url);
      if (!r.ok) { res.status(r.status).json({ error: "Not found" }); return; }
      const json = await r.json();
      res.status(200).json(json);
    } catch (e) { res.status(500).json({ error: String(e) }); }
    return;
  }

  if (req.method === "PATCH") {
    try {
      const patch = await readJson(req);
      const url = `profiles/${key}/profile.json`;
      const r = await fetch(url);
      const current = r.ok ? await r.json() : { users: [], profileMeta: { rev: 0 } };
      const next = applyPatch(current, patch);
      // bump rev
      next.profileMeta = { ...(next.profileMeta||{}), rev: (current?.profileMeta?.rev||0)+1, lastSavedAt: new Date().toISOString(), savedByDeviceId: "admin" };
      await put(url, JSON.stringify(next), { access: "public", contentType: "application/json" });
      res.status(200).json({ ok: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
    return;
  }

  if (req.method === "DELETE") {
    // rensa ALLT under profiles/<key>/*
    const { blobs } = await list({ prefix: `profiles/${key}/` });
    await Promise.all(blobs.map(b => del(b.url)));
    res.status(204).end();
    return;
  }

  res.setHeader("Allow", "GET,PATCH,DELETE");
  res.status(405).end();
}

function readJson(req) {
  return new Promise((resolve) => {
    let body = ""; req.on("data", (c)=> body+=c);
    req.on("end", ()=> { try { resolve(JSON.parse(body||"{}")); } catch { resolve({}); } });
  });
}

// Exempel-patch: { op:"renameUser", id:"...", name:"Ny" } | { op:"removeUser", id:"..." } | { op:"resetLogs", id:"..." }
function applyPatch(cur, p) {
  const next = JSON.parse(JSON.stringify(cur||{}));
  next.users ||= [];
  const idx = next.users.findIndex(u => u.id === p.id);
  if (p.op === "renameUser" && idx>=0) next.users[idx].name = String(p.name||"");
  if (p.op === "resetLogs" && idx>=0) next.users[idx].logs = {};
  if (p.op === "removeUser" && idx>=0) next.users.splice(idx,1);
  if (p.op === "setWorkingRm" && idx>=0) next.users[idx].workingRmKg = Number(p.value||0);
  return next;
}
