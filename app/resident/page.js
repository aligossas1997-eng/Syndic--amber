import { requireResident } from '@/lib/auth';
import { getDb, getResidence } from '@/lib/db';
import { compteLot } from '@/lib/finance';
import { eur } from '@/lib/format';
import { Kpis, Releve, DetailAppels, Echeancier, Paiements } from '@/components/Compte';

export default async function MonCompte() {
  // Le lot affiché vient UNIQUEMENT de la session (relue en base), jamais de l'URL :
  // impossible pour un résident d'afficher un autre appartement.
  const user = await requireResident();
  const c = compteLot(user.lot_id);
  const r = getResidence();
  const totalT = getDb().prepare('SELECT SUM(tantiemes) t FROM lots').get().t;
  const { lot } = c;
  return (
    <>
      <h1>Mon appartement · Lot {lot.numero}</h1>
      <p className="muted small">Bât. {lot.batiment}, étage {lot.etage} · {lot.type} · {lot.surface} m² · {lot.tantiemes} / {totalT} tantièmes</p>
      <Kpis c={c} />
      <div className="grid2">
        <div className="card">
          <h2>Comment payer ?</h2>
          {c.solde > 0 ? <p>Montant à régler : <strong>{eur(c.solde)}</strong>{c.arriere ? <> dont <strong className="neg">{eur(c.arriere)}</strong> en retard</> : null}.</p> : <p className="pos">Votre compte est à jour, merci !</p>}
          <dl className="info">
            <dt>Bénéficiaire</dt><dd>Syndicat des copropriétaires {r.nom}</dd>
            <dt>IBAN</dt><dd><code>{r.iban}</code></dd>
            <dt>BIC</dt><dd><code>{r.bic}</code></dd>
            <dt>Référence</dt><dd><code>LOT {lot.numero}</code> (à indiquer dans le libellé)</dd>
          </dl>
          <p className="small muted">Pour passer au prélèvement automatique ou demander un échéancier, contactez votre syndic ({r.syndic_nom}).</p>
        </div>
        <Echeancier e={c.echeancier} />
      </div>
      <DetailAppels c={c} />
      <Paiements c={c} />
      <Releve c={c} />
    </>
  );
}
