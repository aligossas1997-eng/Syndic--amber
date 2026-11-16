import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getUser } from '@/lib/auth';
import FormMdp from './FormMdp';

export const dynamic = 'force-dynamic';

export default async function MotDePasse() {
  const u = await getUser();
  if (!u) redirect('/login');
  return (
    <main className="login">
      <div className="card">
        <h1>{u.doit_changer_mdp ? 'Choisissez votre mot de passe' : 'Changer mon mot de passe'}</h1>
        {u.doit_changer_mdp ? (
          <p className="small muted">Bienvenue {u.nom} ! Pour sécuriser votre compte, remplacez le mot de passe provisoire qui vous a été remis par un mot de passe personnel (10 caractères minimum).</p>
        ) : <p className="small"><Link href="/">← Retour</Link></p>}
        <FormMdp provisoire={!!u.doit_changer_mdp} />
      </div>
    </main>
  );
}
