// /api/profiles/[id].js
import { head } from '@vercel/blob';

export default async function handler(req, res) {
  const { id } = req.query || {};
  if (!id) return res.status(400).json({ error: 'missing id' });

  const pathname = `profiles/${id}.json`;
  try {
    // Hämta blobens URL och läs JSON:en
    const meta = await head(pathname);
    const data = await fetch(meta.url).then(r => r.json());
    return res.status(200).json(data);
  } catch (e) {
    return res.status(404).json({ error: 'not found' });
  }
}
