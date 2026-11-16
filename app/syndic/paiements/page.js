import { requireSyndic } from '@/lib/auth';
import Link from 'next/link';
import { getDb } from '@/lib/db';
import { eur, dateFr, MODES_PAIEMENT } from '@/lib/format';

export default async function Encaissements({ searchParams }) {
  await requireSyndic(); // double contrôle (en plus du layout)
  const { mode } = await searchParams;
  const db = getDb();
  const filtre = MODES_PAIEMENT[mode] ? mode : null;
  const rows = db.prepare(`SELECT p.*, l.numero, l.proprietaire, l.id lot FROM paiements p JOIN lots l ON l.id = p.lot_id
    ${filtre ? 'WHERE p.mode = ?' : ''} ORDER BY p.date DESC, p.id DESC`).all(...(filtre ? [filtre] : []));
  const parMode = db.prepare('SELECT mode, COUNT(*) n, SUM(montant) total FROM paiements GROUP BY mode ORDER BY total DESC').all();
  return (
    <>
      <h1>Journal des encaissements</h1>
      <div className="grid">
        {parMode.map((m) => (
          <Link key={m.mode} href={`/syndic/paiements?mode=${m.mode}`} className="kpi" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="label">{MODES_PAIEMENT[m.mode]}</div><div className="value">{eur(m.total)}</div><div className="hint">{m.n} règlement(s)</div>
          </Link>
        ))}
      </div>
      {filtre && <p className="small">Filtre : {MODES_PAIEMENT[filtre]} · <Link href="/syndic/paiements">tout afficher</Link></p>}
      <div className="card table-wrap"><table>
        <thead><tr><th>Date</th><th>Reçu</th><th>Lot</th><th>Copropriétaire</th><th>Mode</th><th>Référence</th><th className="num">Montant</th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}><td>{dateFr(p.date)}</td><td><a href={`/api/recus/${p.id}`} target="_blank">{p.numero_recu}</a></td>
              <td><Link href={`/syndic/lots/${p.lot}`}>{p.numero}</Link></td><td>{p.proprietaire}</td><td>{MODES_PAIEMENT[p.mode]}</td><td>{p.reference}</td><td className="num">{eur(p.montant)}</td></tr>
          ))}
          <tr className="total"><td colSpan={6}>Total</td><td className="num">{eur(rows.reduce((s, p) => s + p.montant, 0))}</td></tr>
        </tbody>
      </table></div>
    </>
  );
}
