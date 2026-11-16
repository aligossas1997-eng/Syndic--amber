import { requireSyndic } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { eur, dateFr, CATEGORIES } from '@/lib/format';
import { genererAppelGlobal } from '../actions';

export default async function Appels({ searchParams }) {
  await requireSyndic(); // double contrôle (en plus du layout)
  const sp = await searchParams;
  const rows = getDb().prepare(`SELECT libelle, categorie, date_emission, date_echeance, COUNT(*) nb, SUM(montant) total
    FROM appels GROUP BY libelle, categorie, date_emission, date_echeance ORDER BY date_echeance DESC`).all();
  return (
    <>
      <h1>Appels de fonds</h1>
      {sp.ok && <div className="alert ok">{sp.ok}</div>}
      {sp.erreur && <div className="alert bad">{sp.erreur}</div>}
      <div className="card">
        <h2>Émettre un nouvel appel (réparti par tantièmes)</h2>
        <p className="small muted">Le montant global est réparti entre tous les lots au prorata de leurs tantièmes. L’écart d’arrondi (quelques centimes) est affecté aux plus gros lots pour que la somme tombe juste.</p>
        <form action={genererAppelGlobal} className="stack">
          <div className="row">
            <label>Libellé<input name="libelle" required placeholder="Appel provisionnel T1 2027" /></label>
            <label>Catégorie<select name="categorie">{Object.entries(CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label>Montant global (€)<input name="montant_total" inputMode="decimal" required placeholder="13 000,00" /></label>
            <label>Date d’émission<input type="date" name="date_emission" required /></label>
            <label>Date d’échéance<input type="date" name="date_echeance" required /></label>
          </div>
          <button className="primary">Générer l’appel pour tous les lots</button>
        </form>
      </div>
      <div className="card table-wrap"><table>
        <thead><tr><th>Libellé</th><th>Catégorie</th><th>Émis le</th><th>Échéance</th><th className="num">Lots</th><th className="num">Montant total</th></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i}><td>{r.libelle}</td><td>{CATEGORIES[r.categorie]}</td><td>{dateFr(r.date_emission)}</td><td>{dateFr(r.date_echeance)}</td><td className="num">{r.nb}</td><td className="num">{eur(r.total)}</td></tr>
        ))}</tbody>
      </table></div>
    </>
  );
}
