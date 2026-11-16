'use client';
import { useActionState } from 'react';
import { login } from '../actions-auth';

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="stack">
      {state?.error && <div className="alert bad">{state.error}</div>}
      <label>Email<input name="email" type="email" required autoComplete="username" defaultValue={state?.email || ""} key={state?.email} /></label>
      <label>Mot de passe<input name="password" type="password" required autoComplete="current-password" /></label>
      <button className="primary" disabled={pending}>{pending ? 'Connexion…' : 'Se connecter'}</button>
    </form>
  );
}
