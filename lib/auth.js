import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from './db';
import { COOKIE_NAME, signSession, verifySession } from './token';

export async function createSession(user) {
  const token = await signSession({ uid: user.id });
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
    maxAge: 8 * 3600,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE_NAME);
}

/**
 * Lit la session ET recharge l'utilisateur en base : le rôle et le lot viennent
 * toujours de la base, jamais du navigateur. C'est la base de toute la sécurité.
 */
export async function getUser() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifySession(token);
  if (!payload?.uid) return null;
  return getDb().prepare('SELECT id, email, nom, role, lot_id FROM users WHERE id = ?').get(payload.uid) || null;
}

export async function requireSyndic() {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.role !== 'syndic') redirect('/resident');
  return u;
}

export async function requireResident() {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.role !== 'resident') redirect('/syndic');
  if (!u.lot_id) throw new Error('Compte résident sans appartement associé');
  return u;
}
