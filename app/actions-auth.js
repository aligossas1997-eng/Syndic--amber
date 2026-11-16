'use server';
import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import { createSession, destroySession, getUser } from '@/lib/auth';
import { MDP_MIN } from '@/lib/motdepasse';

// Anti force brute simple : 8 essais ratés par identifiant sur 15 minutes.
const echecs = new Map();
const FENETRE = 15 * 60 * 1000;

export async function login(_prev, formData) {
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const now = Date.now();
  const e = (echecs.get(email) || []).filter((t) => now - t < FENETRE);
  if (e.length >= 8) return { error: 'Trop de tentatives. Réessayez dans 15 minutes.', email };
  const user = getDb().prepare('SELECT * FROM users WHERE lower(email) = ?').get(email);
  // même message dans tous les cas : on ne révèle pas si l'identifiant existe
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    echecs.set(email, [...e, now]);
    return { error: 'Identifiant ou mot de passe incorrect.', email };
  }
  if (!user.actif) return { error: 'Ce compte est désactivé. Contactez votre syndic.', email };
  echecs.delete(email);
  getDb().prepare("UPDATE users SET derniere_connexion = datetime('now') WHERE id = ?").run(user.id);
  await createSession(user);
  if (user.doit_changer_mdp) redirect('/mot-de-passe');
  redirect(user.role === 'syndic' ? '/syndic' : '/resident');
}

export async function logout() {
  await destroySession();
  redirect('/login');
}

export async function changerMotDePasse(_prev, formData) {
  const user = await getUser();
  if (!user) redirect('/login');
  const actuel = String(formData.get('actuel') || '');
  const nouveau = String(formData.get('nouveau') || '');
  const confirmation = String(formData.get('confirmation') || '');
  const row = getDb().prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
  if (!bcrypt.compareSync(actuel, row.password_hash)) return { error: 'Le mot de passe actuel est incorrect.' };
  if (nouveau.length < MDP_MIN) return { error: `Le nouveau mot de passe doit faire au moins ${MDP_MIN} caractères.` };
  if (nouveau !== confirmation) return { error: 'Les deux nouveaux mots de passe ne sont pas identiques.' };
  if (nouveau === actuel) return { error: "Choisissez un mot de passe différent de l'actuel." };
  getDb().prepare('UPDATE users SET password_hash = ?, doit_changer_mdp = 0 WHERE id = ?').run(bcrypt.hashSync(nouveau, 10), user.id);
  await createSession(user); // nouvelle session (les anciennes sont invalidées)
  redirect(user.role === 'syndic' ? '/syndic' : '/resident');
}
