import { requireSyndic } from '@/lib/auth';
import Link from 'next/link';
import { vueGlobale } from '@/lib/finance';
import { eur, MODES_PAIEMENT } from '@/lib/format';
import Statut from '@/components/Statut';
import { ajouterLot, importerLots } from '../actions-acces';

export default async function Lots({ searchParams }) {
  const sp = await searchParams;
  await requireSyndic(); // double contrôle (en plus du layout)
  const v = vueGlobale();
  return (
    <>
      <h1>Comptes copropriétaires</h1>
      <p className="muted small">Vue de tous les lots : solde, arriérés et modalités de paiement. Clique sur un lot pour voir sa fiche.</p>
      {sp.ok && <div className="alert ok">{sp.ok}</div>}
      {sp.erreur && <div className="alert bad">{sp.erreur}</div>}
      <div className="card table-wrap"><table>
        <thead><tr><th>Lot</th><th>Copropriétaire</th><th>Type</th><th className="num">Tantièmes</th><th className="num">Appelé</th><th className="num">Payé</th><th className="num">Solde</th><th className="num">Arriéré</th><th className="num">Retard max</th><th>Mode de paiement</th><th>Statut</th></tr></thead>
        <tbody>
          {v.comptes.map((c) => (
            <tr key={c.lot.id}>
              <td><Link href={`/syndic/lots/${c.lot.id}`}>{c.lot.numero}</Link></td>
              <td>{c.lot.proprietaire}</td><td>{c.lot.type}</td><td className="num">{c.lot.tantiemes}</td>
              <td className="num">{eur(c.totalAppele)}</td><td className="num">{eur(c.totalPaye)}</td>
              <td className={`num ${c.solde > 0 ? 'neg' : 'pos'}`}>{eur(c.solde)}</td>
              <td className={`num ${c.arriere ? 'neg' : ''}`}>{eur(c.arriere)}</td>
              <td className="num">{c.retardMax ? `${c.retardMax} j` : ''}</td>
              <td>{MODES_PAIEMENT[c.lot.mode_paiement]}</td><td><Statut s={c.statut} /></td>
            </tr>
          ))}
          <tr className="total"><td colSpan={3}>Total</td><td className="num">{v.comptes.reduce((s, c) => s + c.lot.tantiemes, 0)}</td><td className="num">{eur(v.totalAppele)}</td><td className="num">{eur(v.totalPaye)}</td><td className="num">{eur(v.totalAppele - v.totalPaye)}</td><td className="num">{eur(v.arriere)}</td><td colSpan={3} /></tr>
        </tbody>
      </table></div>
      <div className="grid2">
        <div className="card">
          <h2>Importer les lots depuis Excel</h2>
          <p className="small muted">Dans Excel, prépare ces colonnes <strong>dans cet ordre</strong>, sélectionne les lignes, copie (Ctrl+C) et colle ici (Ctrl+V). Un lot qui existe déjà (même numéro) est mis à jour.</p>
          <p className="small"><code>Numéro | Bâtiment | Étage | Type | Surface | Tantièmes | Propriétaire | Email | Téléphone</code></p>
          <form action={importerLots} className="stack">
            <textarea name="donnees" required placeholder="C01	C	0	T3	65	450	Marie Durand	marie.durand@mail.fr	0612345678" />
            <button className="primary">Importer</button>
          </form>
        </div>
        <div className="card">
          <h2>Ajouter un lot</h2>
          <form action={ajouterLot} className="stack">
            <div className="row">
              <label>Numéro*<input name="numero" required placeholder="C01" /></label>
              <label>Bâtiment<input name="batiment" /></label>
              <label>Étage<input name="etage" inputMode="numeric" /></label>
            </div>
            <div className="row">
              <label>Type<input name="type" placeholder="T3" /></label>
              <label>Surface (m²)<input name="surface" inputMode="decimal" /></label>
              <label>Tantièmes*<input name="tantiemes" inputMode="numeric" required /></label>
            </div>
            <label>Propriétaire*<input name="proprietaire" required /></label>
            <div className="row">
              <label>Email<input name="email" type="email" /></label>
              <label>Téléphone<input name="telephone" /></label>
            </div>
            <button className="primary">Ajouter</button>
          </form>
        </div>
      </div>
    </>
  );
}
