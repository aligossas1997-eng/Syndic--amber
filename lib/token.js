import { SignJWT, jwtVerify } from 'jose';

export const COOKIE_NAME = 'syndic_session';
const DEV_SECRET = 'dev-secret-a-changer-en-production-0123456789abcdef';

function secret() {
  const s = process.env.SESSION_SECRET || DEV_SECRET;
  if (process.env.NODE_ENV === 'production' && s === DEV_SECRET) {
    console.warn('[sécurité] SESSION_SECRET non défini : utilise une vraie clé en production !');
  }
  return new TextEncoder().encode(s);
}

export async function signSession(payload) {
  return new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('8h').sign(secret());
}

export async function verifySession(token) {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload;
  } catch {
    return null;
  }
}
