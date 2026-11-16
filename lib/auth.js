import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from './db';
import { COOKIE_NAME, signSession, verifySession } from './token';

export async function createSession(user) {
  const token = await signSession({ uid: user.id, v: versionMdp(user.id) });
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
    maxAge: 8 * 3600,
  });
}

// Une empreinte courte du hash du mot de passe : change dès que le mot de passe change.
function versionMdp(uid) {
  const h = getDb().prepare('SELECT password_hash FROM users WHERE id = ?').get(uid)?.password_hash || '';
  return h.slice(-10);
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
  const u = getDb().prepare('SELECT id, email, nom, role, lot_id, actif, doit_changer_mdp FROM users WHERE id = ?').get(payload.uid);
  // compte supprimé ou désactivé : accès coupé immédiatement
  if (!u || !u.actif) return null;
  // mot de passe changé depuis l'émission du jeton : les anciennes sessions ne valent plus rien
  if (u && payload.v !== versionMdp(u.id)) return null;
  return u;
}

export async function requireSyndic() {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.doit_changer_mdp) redirect('/mot-de-passe');
  if (u.role !== 'syndic') redirect('/resident');
  return u;
}

export async function requireResident() {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.doit_changer_mdp) redirect('/mot-de-passe');
  if (u.role !== 'resident') redirect('/syndic');
  if (!u.lot_id) throw new Error('Compte résident sans appartement associé');
  return u;
}
