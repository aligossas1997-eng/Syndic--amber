import { requireSyndic } from '@/lib/auth';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { compteLot, aujourdhui } from '@/lib/finance';
import { eur, MODES_PAIEMENT, CATEGORIES } from '@/lib/format';
import { Kpis, Releve, DetailAppels, Echeancier, Paiements } from '@/components/Compte';
import { enregistrerPaiement, ajouterAppelIndividuel, changerModePaiement, creerEcheancier, cloturerEcheancier } from '../../actions';

export default async function FicheLot({ params, searchParams }) {
  await requireSyndic(); // double contrôle (en plus du layout)
  const { id } = await params;
  const sp = await searchParams;
  const c = compteLot(Number(id));
  if (!c) notFound();
  const { lot } = c;
  const today = aujourdhui();
  return (
    <>
      <p className="small"><Link href="/syndic/lots">← Tous les comptes</Link></p>
      <div className="header-line">
        <div><h1>Lot {lot.numero} · {lot.proprietaire}</h1>
          <p className="muted small">Bât. {lot.batiment}, étage {lot.etage} · {lot.type} · {lot.surface} m² · {lot.tantiemes} tantièmes · {lot.email} · {lot.telephone}</p></div>
      </div>
      {sp.ok && <div className="alert ok">{sp.ok}</div>}
      {sp.erreur && <div className="alert bad">{sp.erreur}</div>}
      <Kpis c={c} />

      <div className="grid2">
        <div className="card">
          <h2>Enregistrer un paiement</h2>
          <form action={enregistrerPaiement} className="stack">
            <input type="hidden" name="lot_id" value={lot.id} />
            <div className="row">
              <label>Date<input type="date" name="date" defaultValue={today} required /></label>
              <label>Montant (€)<input name="montant" inputMode="decimal" placeholder={c.arriere ? (c.arriere / 100).toFixed(2).replace('.', ',') : '0,00'} required /></label>
            </div>
            <div className="row">
              <label>Mode<select name="mode" defaultValue={lot.mode_paiement}>{Object.entries(MODES_PAIEMENT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <label>Référence<input name="reference" placeholder="n° chèque, libellé virement…" /></label>
            </div>
            <button className="primary">Enregistrer et générer le reçu</button>
          </form>
        </div>

        <div className="card">
          <h2>Modalités de paiement</h2>
          <form action={changerModePaiement} className="stack">
            <input type="hidden" name="lot_id" value={lot.id} />
            <label>Mode de paiement habituel<select name="mode" defaultValue={lot.mode_paiement}>{Object.entries(MODES_PAIEMENT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <button className="primary">Mettre à jour</button>
          </form>
          <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '1rem 0' }} />
          <h2>{c.echeancier ? 'Remplacer l’échéancier' : 'Accorder un échéancier'}</h2>
          <form action={creerEcheancier} className="stack">
            <input type="hidden" name="lot_id" value={lot.id} />
            <div className="row">
              <label>Montant à étaler (€)<input name="montant_total" inputMode="decimal" defaultValue={c.arriere ? (c.arriere / 100).toFixed(2).replace('.', ',') : ''} required /></label>
              <label>Nb mensualités<input name="nb_echeances" type="number" min="1" max="36" defaultValue="6" required /></label>
              <label>1re échéance<input type="date" name="premiere_echeance" required /></label>
            </div>
            <label>Commentaire<input name="commentaire" placeholder="Motif, accord signé le…" /></label>
            <button className="primary">Créer l’échéancier</button>
          </form>
          {c.echeancier && (
            <form action={cloturerEcheancier} style={{ marginTop: '.6rem' }}>
              <input type="hidden" name="lot_id" value={lot.id} />
              <button className="primary" style={{ background: 'var(--muted)' }}>Clôturer l’échéancier en cours</button>
            </form>
          )}
        </div>
      </div>

      <Echeancier e={c.echeancier} />
      <DetailAppels c={c} />
      <Releve c={c} />

      <div className="card">
        <h2>Ajouter un appel individuel (régularisation, frais…)</h2>
        <form action={ajouterAppelIndividuel} className="stack">
          <input type="hidden" name="lot_id" value={lot.id} />
          <div className="row">
            <label>Libellé<input name="libelle" required placeholder="Frais de relance recommandée" /></label>
            <label>Catégorie<select name="categorie">{Object.entries(CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label>Montant (€)<input name="montant" inputMode="decimal" required /></label>
            <label>Émission<input type="date" name="date_emission" defaultValue={today} required /></label>
            <label>Échéance<input type="date" name="date_echeance" required /></label>
          </div>
          <button className="primary">Ajouter au compte</button>
        </form>
      </div>
      <Paiements c={c} />
      <p className="small muted">Solde actuel : {eur(c.solde)}</p>
    </>
  );
}
