import { requireSyndic } from '@/lib/auth';
import Link from 'next/link';
import { vueGlobale } from '@/lib/finance';
import { eur, MODES_PAIEMENT } from '@/lib/format';
import { TRANCHES } from '@/components/BalanceAgee';
import Statut from '@/components/Statut';

export default async function Impayes() {
  await requireSyndic(); // double contrôle (en plus du layout)
  const v = vueGlobale();
  const lignes = v.comptes.filter((c) => c.arriere > 0).sort((a, b) => b.retardMax - a.retardMax);
  return (
    <>
      <div className="header-line">
        <div><h1>Impayés – balance âgée</h1><p className="muted small">Arriérés classés par ancienneté de l’échéance impayée la plus ancienne.</p></div>
        <a className="btn secondary" href="/api/export/balance-agee">Exporter (CSV Excel)</a>
      </div>
      <div className="card table-wrap"><table>
        <thead><tr><th>Lot</th><th>Copropriétaire</th><th>Mode</th>{TRANCHES.map(([k, l]) => <th key={k} className="num">{l}</th>)}<th className="num">Total arriéré</th><th className="num">Retard max</th><th>Statut</th></tr></thead>
        <tbody>
          {lignes.map((c) => (
            <tr key={c.lot.id}>
              <td><Link href={`/syndic/lots/${c.lot.id}`}>{c.lot.numero}</Link></td><td>{c.lot.proprietaire}</td><td>{MODES_PAIEMENT[c.lot.mode_paiement]}</td>
              {TRANCHES.map(([k]) => <td key={k} className="num">{c.balance[k] ? eur(c.balance[k]) : ''}</td>)}
              <td className="num neg"><strong>{eur(c.arriere)}</strong></td><td className="num">{c.retardMax} j</td><td><Statut s={c.statut} /></td>
            </tr>
          ))}
          <tr className="total"><td colSpan={3}>Total</td>{TRANCHES.map(([k]) => <td key={k} className="num">{eur(v.balance[k])}</td>)}<td className="num">{eur(v.arriere)}</td><td colSpan={2} /></tr>
        </tbody>
      </table></div>
    </>
  );
}
