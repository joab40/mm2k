// /api/admin/profiles/index.js
// Lista senaste snapshot per profil (blobKey)

import { isAdminFromReq } from "../login.js";
import { listAllUnder } from "../_lib/blob.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  if (!isAdminFromReq(req)) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const blobs = await listAllUnder("mm2k/profiles/");
    const byKey = new Map();
    for (const b of blobs) {
      const m = b.pathname.match(/\/profiles\/([^/]+)\//);
      if (!m) continue;
      const key = m[1];
      const arr = byKey.get(key) || [];
      arr.push(b);
      byKey.set(key, arr);
    }
    const items = [];
    for (const [key, arr] of byKey) {
      let latest = arr.find(x => x.pathname.endsWith("/latest.json"));
      if (!latest) latest = arr.slice().sort((a,b)=> new Date(b.uploadedAt||0)-new Date(a.uploadedAt||0))[0];
      items.push({
        blobKey: key,
        pathname: latest?.pathname || arr[0]?.pathname,
        size: latest?.size || 0,
        uploadedAt: latest?.uploadedAt || null
      });
    }
    items.sort((a,b)=> a.blobKey.localeCompare(b.blobKey));
    res.status(200).json({ items });
  } catch (e) {
    res.status(500).json({ error: "List failed", details: String(e?.message || e) });
  }
}
