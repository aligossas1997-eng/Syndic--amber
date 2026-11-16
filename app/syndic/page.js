import { requireSyndic } from '@/lib/auth';
import Link from 'next/link';
import { vueGlobale } from '@/lib/finance';
import { getDb, getResidence } from '@/lib/db';
import { eur, pct, dateFr, MODES_PAIEMENT } from '@/lib/format';
import { BalanceTotaux } from '@/components/BalanceAgee';
import Statut from '@/components/Statut';

export default async function Dashboard() {
  await requireSyndic(); // double contrôle (en plus du layout)
  const v = vueGlobale();
  const r = getResidence();
  const derniers = getDb().prepare('SELECT p.*, l.numero, l.proprietaire FROM paiements p JOIN lots l ON l.id = p.lot_id ORDER BY p.date DESC, p.id DESC LIMIT 6').all();
  const debiteurs = [...v.comptes].filter((c) => c.arriere > 0).sort((a, b) => b.arriere - a.arriere).slice(0, 5);
  return (
    <>
      <div className="header-line">
        <div><h1>Tableau de bord</h1><p className="muted small">{r.adresse} · {v.comptes.length} lots · budget annuel {eur(r.budget_annuel)}</p></div>
        <a className="btn secondary" href="/api/export/balance-agee">Exporter la balance âgée (CSV)</a>
      </div>
      <div className="grid">
        <div className="kpi"><div className="label">Appelé échu</div><div className="value">{eur(v.totalAppeleEchu)}</div><div className="hint">Total appelé : {eur(v.totalAppele)}</div></div>
        <div className="kpi ok"><div className="label">Encaissé</div><div className="value">{eur(v.totalPaye)}</div></div>
        <div className="kpi bad"><div className="label">Arriérés</div><div className="value">{eur(v.arriere)}</div><div className="hint">{v.lotsEnRetard} lot(s) sur {v.comptes.length} en retard</div></div>
        <div className={`kpi ${v.tauxRecouvrement < 0.9 ? 'bad' : 'ok'}`}><div className="label">Taux de recouvrement</div><div className="value">{pct(v.tauxRecouvrement)}</div><div className="hint">Encaissé / appelé échu</div></div>
        <div className="kpi"><div className="label">Avances copropriétaires</div><div className="value">{eur(v.avances)}</div><div className="hint">Comptes créditeurs</div></div>
      </div>
      <div className="card"><h2>Balance âgée des impayés</h2><BalanceTotaux b={v.balance} /></div>
      <div className="grid2">
        <div className="card">
          <h2>Principaux débiteurs</h2>
          <table><thead><tr><th>Lot</th><th>Copropriétaire</th><th className="num">Arriéré</th><th>Statut</th></tr></thead>
            <tbody>{debiteurs.map((c) => (
              <tr key={c.lot.id}><td><Link href={`/syndic/lots/${c.lot.id}`}>{c.lot.numero}</Link></td><td>{c.lot.proprietaire}</td><td className="num neg">{eur(c.arriere)}</td><td><Statut s={c.statut} /></td></tr>
            ))}</tbody></table>
        </div>
        <div className="card">
          <h2>Derniers encaissements</h2>
          <table><thead><tr><th>Date</th><th>Lot</th><th>Mode</th><th className="num">Montant</th></tr></thead>
            <tbody>{derniers.map((p) => (
              <tr key={p.id}><td>{dateFr(p.date)}</td><td>{p.numero} · {p.proprietaire}</td><td>{MODES_PAIEMENT[p.mode]}</td><td className="num">{eur(p.montant)}</td></tr>
            ))}</tbody></table>
        </div>
      </div>
    </>
  );
}
