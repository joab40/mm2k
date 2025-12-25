// utils/adminAuth.js  (ESM, Node 18+)
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}
function b64urlJSON(obj){ return b64url(Buffer.from(JSON.stringify(obj))); }

export function signSession(payload, secret) {
  const header = { alg:'HS256', typ:'MM2K' };
  const h = b64urlJSON(header);
  const p = b64urlJSON(payload);
  const mac = createHmac('sha256', String(secret)).update(`${h}.${p}`).digest();
  const s = b64url(mac);
  return `${h}.${p}.${s}`;
}

export function verifySession(token, secret) {
  const [h,p,s] = String(token||'').split('.');
  if(!h || !p || !s) return null;
  const mac = createHmac('sha256', String(secret)).update(`${h}.${p}`).digest();
  const ok = timingSafeEqual(Buffer.from(b64url(mac)), Buffer.from(s));
  if(!ok) return null;
  const payload = JSON.parse(Buffer.from(p.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8')||'{}');
  if(payload.exp && Date.now() > payload.exp) return null;
  return payload;
}

export function newPayload(ttlMs = 24*60*60*1000) {
  return { iat: Date.now(), exp: Date.now()+ttlMs, nonce: b64url(randomBytes(16)) };
}

export function parseCookie(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(
    raw.split(';').map(v=>v.trim()).filter(Boolean).map(x=> {
      const i = x.indexOf('=');
      return i<0 ? [x, ''] : [decodeURIComponent(x.slice(0,i)), decodeURIComponent(x.slice(i+1))];
    })
  );
}

// sätt admin-cookie (Secure bara på https)
export function setAdminCookie(req, res, token, maxAgeSec = 86400) {
  const scheme = (req.headers['x-forwarded-proto'] || '').toString();
  const host = (req.headers.host || '').toString();
  const isSecure = scheme === 'https' || host.endsWith('.vercel.app');

  const parts = [
    `admin=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
  ];
  if (isSecure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearAdminCookie(req, res) {
  const parts = ['admin=','Path=/','HttpOnly','SameSite=Lax','Max-Age=0'];
  const scheme = (req.headers['x-forwarded-proto'] || '').toString();
  const host = (req.headers.host || '').toString();
  if (scheme === 'https' || host.endsWith('.vercel.app')) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

// enkel guard att återanvända i admin-endpoints
export function requireAdmin(req, res) {
  const ADMIN_SECRET = String(process.env.ADMIN_SECRET || '').trim();
  if (!ADMIN_SECRET) {
    res.statusCode = 500;
    res.setHeader('content-type','application/json; charset=utf-8');
    res.end(JSON.stringify({ error:'Server misconfigured: ADMIN_SECRET missing' }));
    return null;
  }
  const { admin } = parseCookie(req);
  const payload = verifySession(admin, ADMIN_SECRET);
  if (!payload) {
    res.statusCode = 401;
    res.setHeader('content-type','application/json; charset=utf-8');
    res.end(JSON.stringify({ error:'Unauthorized' }));
    return null;
  }
  return payload;
}

// robust body-parser för Node runtime
export async function readJSON(req) {
  return await new Promise((resolve) => {
    let d=''; req.on('data',(c)=>d+=c); req.on('end',()=>{ try{ resolve(JSON.parse(d||'{}')); } catch { resolve({}); } });
  });
}
