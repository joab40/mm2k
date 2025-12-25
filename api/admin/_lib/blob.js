// /api/admin/_lib/blob.js
import { list, put, del } from "@vercel/blob";

export const config = { runtime: "nodejs" };

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

export async function listAllUnder(prefix) {
  const prefixes = prefix.endsWith("/") ? [prefix] : [prefix + "/"];
  if (prefixes[0] !== "mm2k/profiles/") prefixes.push("mm2k/profiles/"); // fallback
  const seen = new Map();
  for (const pre of prefixes) {
    const { blobs } = await list({ prefix: pre, token: TOKEN });
    for (const b of blobs) seen.set(b.pathname, b);
  }
  return [...seen.values()];
}

export async function saveJson(pathname, obj) {
  const body = JSON.stringify(obj, null, 2);
  const { url } = await put(pathname, body, {
    access: "public",
    addRandomSuffix: false,
    token: TOKEN,
    contentType: "application/json",
  });
  return url;
}

export async function deleteMany(paths) {
  return del(paths, { token: TOKEN });
}
