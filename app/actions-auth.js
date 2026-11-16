'use server';
import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import { createSession, destroySession } from '@/lib/auth';

export async function login(_prev, formData) {
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const user = getDb().prepare('SELECT * FROM users WHERE lower(email) = ?').get(email);
  // même message dans tous les cas : on ne révèle pas si l'email existe
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return { error: 'Email ou mot de passe incorrect.', email };
  await createSession(user);
  redirect(user.role === 'syndic' ? '/syndic' : '/resident');
}

export async function logout() {
  await destroySession();
  redirect('/login');
}
