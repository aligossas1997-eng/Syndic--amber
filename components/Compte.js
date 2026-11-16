// Blocs d'affichage partagés entre la fiche lot (syndic) et l'espace résident.
import { eur, dateFr, CATEGORIES, MODES_PAIEMENT } from '@/lib/format';
import Statut from './Statut';

export function Kpis({ c }) {
  return (
    <div className="grid">
      <div className={`kpi ${c.solde > 0 ? 'bad' : 'ok'}`}>
        <div className="label">{c.solde < 0 ? 'Avance (crédit)' : 'Solde à payer'}</div>
        <div className="value">{eur(Math.abs(c.solde))}</div>
        <div className="hint">Appelé {eur(c.totalAppele)} − Payé {eur(c.totalPaye)}</div>
      </div>
      <div className={`kpi ${c.arriere > 0 ? 'bad' : 'ok'}`}>
        <div className="label">Arriéré (échu impayé)</div>
        <div className="value">{eur(c.arriere)}</div>
        <div className="hint">{c.retardMax ? `Plus ancien retard : ${c.retardMax} jours` : 'Aucun retard'}</div>
      </div>
      <div className="kpi">
        <div className="label">Prochaine échéance</div>
        <div className="value">{c.prochainAppel ? eur(c.prochainAppel.reste) : '—'}</div>
        <div className="hint">{c.prochainAppel ? `le ${dateFr(c.prochainAppel.date_echeance)}` : 'Rien à venir'}</div>
      </div>
      <div className="kpi">
        <div className="label">Statut</div>
        <div className="value" style={{ fontSize: '1.1rem' }}><Statut s={c.statut} /></div>
        <div className="hint">Mode : {MODES_PAIEMENT[c.lot.mode_paiement]}</div>
      </div>
    </div>
  );
}

export function Releve({ c }) {
  return (
    <div className="card">
      <h2>Relevé de compte</h2>
      <div className="table-wrap"><table>
        <thead><tr><th>Date</th><th>Libellé</th><th className="num">Débit (appelé)</th><th className="num">Crédit (payé)</th><th className="num">Solde</th><th>Reçu</th></tr></thead>
        <tbody>
          {c.mouvements.map((m, i) => (
            <tr key={i}>
              <td>{dateFr(m.date)}</td><td>{m.libelle}</td>
              <td className="num">{m.debit ? eur(m.debit) : ''}</td>
              <td className="num pos">{m.credit ? eur(m.credit) : ''}</td>
              <td className={`num ${m.solde > 0 ? 'neg' : ''}`}>{eur(m.solde)}</td>
              <td>{m.paiementId ? <a href={`/api/recus/${m.paiementId}`} target="_blank">{m.numeroRecu} (PDF)</a> : ''}</td>
            </tr>
          ))}
          <tr className="total"><td colSpan={2}>Total</td><td className="num">{eur(c.totalAppele)}</td><td className="num">{eur(c.totalPaye)}</td><td className="num">{eur(c.solde)}</td><td /></tr>
        </tbody>
      </table></div>
    </div>
  );
}

export function DetailAppels({ c }) {
  return (
    <div className="card">
      <h2>Appels de fonds et imputation des paiements</h2>
      <p className="muted small">Les paiements sont imputés sur les appels les plus anciens en premier.</p>
      <div className="table-wrap"><table>
        <thead><tr><th>Appel</th><th>Catégorie</th><th>Échéance</th><th className="num">Montant</th><th className="num">Réglé</th><th className="num">Reste dû</th><th className="num">Retard</th><th>Statut</th></tr></thead>
        <tbody>{c.appels.map((a) => (
          <tr key={a.id}>
            <td>{a.libelle}</td><td>{CATEGORIES[a.categorie] || a.categorie}</td><td>{dateFr(a.date_echeance)}</td>
            <td className="num">{eur(a.montant)}</td><td className="num">{eur(a.impute)}</td>
            <td className={`num ${a.reste ? 'neg' : ''}`}>{eur(a.reste)}</td>
            <td className="num">{a.retard ? `${a.retard} j` : ''}</td>
            <td><Statut s={a.reste && !a.retard ? 'À venir' : a.statut} /></td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

export function Echeancier({ e }) {
  if (!e) return null;
  const pctPaye = e.montant_total ? Math.round((e.totalPaye / e.montant_total) * 100) : 0;
  return (
    <div className="card">
      <h2>Échéancier (plan d&apos;apurement) {e.enRetard ? <Statut s="En retard" /> : <Statut s="À jour" />}</h2>
      <p className="small muted">Accordé le {dateFr(e.date_accord)} · {e.nb_echeances} mensualités · {e.commentaire}</p>
      <div className="bar" style={{ margin: '.5rem 0 1rem' }}><span style={{ width: `${pctPaye}%` }} /></div>
      <p className="small">{eur(e.totalPaye)} réglés sur {eur(e.montant_total)} ({pctPaye} %) · reste {eur(e.reste)}</p>
      <div className="table-wrap"><table>
        <thead><tr><th>N°</th><th>Date</th><th className="num">Montant</th><th className="num">Réglé</th><th>Statut</th></tr></thead>
        <tbody>{e.echeances.map((x) => (
          <tr key={x.id}><td>{x.numero}</td><td>{dateFr(x.date)}</td><td className="num">{eur(x.montant)}</td><td className="num">{eur(x.paye)}</td><td><Statut s={x.statut} /></td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

export function Paiements({ c }) {
  return (
    <div className="card">
      <h2>Paiements et reçus</h2>
      {c.paiements.length === 0 ? <p className="muted">Aucun paiement enregistré.</p> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Date</th><th>Mode</th><th>Référence</th><th className="num">Montant</th><th>Reçu</th></tr></thead>
          <tbody>{[...c.paiements].reverse().map((p) => (
            <tr key={p.id}><td>{dateFr(p.date)}</td><td>{MODES_PAIEMENT[p.mode] || p.mode}</td><td>{p.reference}</td><td className="num">{eur(p.montant)}</td>
              <td><a href={`/api/recus/${p.id}`} target="_blank">Télécharger {p.numero_recu}</a></td></tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}
