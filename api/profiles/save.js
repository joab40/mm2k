// api/profiles/save.js
export const config = { runtime: "nodejs" };

import { put } from "@vercel/blob";

const JSON_CT = "application/json; charset=utf-8";

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader("content-type", JSON_CT);
  res.end(JSON.stringify(obj));
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });

    const { blobKey, profile } = await readJson(req);
    if (!blobKey || !profile) return send(res, 400, { error: "Missing blobKey or profile" });

    // Bygg sökvägar
    const base = `profiles/${blobKey}`;
    const currentPath = `${base}/current.json`;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const snapshotPath = `${base}/history/${ts}.json`;

    // 1) Snapshot (unik fil, ingen overwrite)
    await put(snapshotPath, JSON.stringify(profile), {
      access: "public",
      contentType: JSON_CT,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false, // ts gör namnet unikt
    });

    // 2) Skriv/överskriv "current.json"
    const putRes = await put(currentPath, JSON.stringify(profile), {
      access: "public",
      contentType: JSON_CT,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false,
      allowOverwrite: true, // <-- FIX: tillåt överskrivning
    });

    return send(res, 200, {
      ok: true,
      currentUrl: putRes.url,
      currentPath,
      snapshotPath,
    });
  } catch (err) {
    console.error("SAVE_ERROR", err);
    return send(res, 500, { error: "SAVE_ERROR", message: err?.message || String(err) });
  }
}

async function readJson(req) {
  try {
    const chunks = [];
    for await (const ch of req) chunks.push(ch);
    const text = Buffer.concat(chunks).toString("utf8");
    return JSON.parse(text || "{}");
  } catch {
    return {};
  }
}
