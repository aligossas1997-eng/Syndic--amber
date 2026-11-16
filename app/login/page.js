import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { getResidence } from '@/lib/db';
import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const u = await getUser();
  if (u) redirect(u.role === 'syndic' ? '/syndic' : '/resident');
  const r = getResidence();
  return (
    <main className="login">
      <div className="card">
        <h1>{r?.nom || 'Gestion syndic'}</h1>
        <p className="muted small">Espace syndic et copropriétaires</p>
        <LoginForm />
      </div>
      {process.env.NODE_ENV !== 'production' || process.env.DEMO === 'true' ? (
        <div className="card small">
          <strong>Comptes de démonstration</strong>
          <ul>
            <li>Syndic : <code>syndic@demo.fr</code> / <code>syndic123</code></li>
            <li>Résident à jour : <code>sophie.martin@demo.fr</code> / <code>resident123</code></li>
            <li>Résident en gros impayé : <code>pierre.dubois@demo.fr</code> / <code>resident123</code></li>
            <li>Résident sous échéancier : <code>mamadou.diallo@demo.fr</code> / <code>resident123</code></li>
          </ul>
        </div>
      ) : null}
    </main>
  );
}
