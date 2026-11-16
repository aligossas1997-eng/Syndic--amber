import { requireSyndic } from '@/lib/auth';
import Link from 'next/link';
import { vueGlobale } from '@/lib/finance';
import { eur, MODES_PAIEMENT } from '@/lib/format';
import Statut from '@/components/Statut';

export default async function Lots() {
  await requireSyndic(); // double contrôle (en plus du layout)
  const v = vueGlobale();
  return (
    <>
      <h1>Comptes copropriétaires</h1>
      <p className="muted small">Vue de tous les lots : solde, arriérés et modalités de paiement. Clique sur un lot pour voir sa fiche.</p>
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
    </>
  );
}
