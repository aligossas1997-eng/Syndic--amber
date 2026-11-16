import Link from 'next/link';
import { requireSyndic } from '@/lib/auth';
import { getResidence } from '@/lib/db';
import { modifierResidence } from '../actions-acces';

export default async function Parametres({ searchParams }) {
  await requireSyndic();
  const sp = await searchParams;
  const r = getResidence();
  return (
    <>
      <h1>Paramètres de la résidence</h1>
      {sp.ok && <div className="alert ok">{sp.ok}</div>}
      {sp.erreur && <div className="alert bad">{sp.erreur}</div>}
      <div className="card">
        <form action={modifierResidence} className="stack">
          <div className="row">
            <label>Nom de la résidence<input name="nom" defaultValue={r.nom} required /></label>
            <label>Adresse<input name="adresse" defaultValue={r.adresse || ''} /></label>
            <label>Nom du syndic (affiché sur les reçus)<input name="syndic_nom" defaultValue={r.syndic_nom || ''} /></label>
          </div>
          <div className="row">
            <label>IBAN du syndicat (pour les virements)<input name="iban" defaultValue={r.iban || ''} /></label>
            <label>BIC<input name="bic" defaultValue={r.bic || ''} /></label>
            <label>Budget prévisionnel annuel (€)<input name="budget_annuel" inputMode="decimal" defaultValue={(r.budget_annuel / 100).toFixed(2).replace('.', ',')} /></label>
          </div>
          <button className="primary">Enregistrer</button>
        </form>
      </div>
      <p className="small"><Link href="/mot-de-passe">Changer mon mot de passe syndic</Link></p>
    </>
  );
}
