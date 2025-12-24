import { head } from '@vercel/blob';

export default async function handler(req, res) {
  const { id } = req.query || {};
  if (!id) return res.status(400).json({ error: 'Missing id' });

  try {
    const meta = await head(`profiles/${id}.json`, {
      token: process.env.BLOB_READ_WRITE_TOKEN
    });
    const url = meta.downloadUrl || meta.url;
    const json = await fetch(url).then(r => {
      if (!r.ok) throw new Error('Not found');
      return r.json();
    });
    res.status(200).json(json);
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
}
