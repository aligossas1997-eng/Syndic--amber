'use client';
import { useActionState } from 'react';
import { changerMotDePasse } from '../actions-auth';

export default function FormMdp({ provisoire }) {
  const [state, action, pending] = useActionState(changerMotDePasse, null);
  return (
    <form action={action} className="stack">
      {state?.error && <div className="alert bad">{state.error}</div>}
      <label>{provisoire ? 'Mot de passe provisoire (reçu du syndic)' : 'Mot de passe actuel'}<input name="actuel" type="password" required autoComplete="current-password" /></label>
      <label>Nouveau mot de passe (10 caractères min.)<input name="nouveau" type="password" required minLength={10} autoComplete="new-password" /></label>
      <label>Confirmer le nouveau mot de passe<input name="confirmation" type="password" required minLength={10} autoComplete="new-password" /></label>
      <button className="primary" disabled={pending}>{pending ? 'Enregistrement…' : 'Enregistrer'}</button>
    </form>
  );
}
