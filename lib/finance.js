import { getDb } from './db.js';
import { MODES_PAIEMENT } from './format.js';

export const aujourdhui = () => new Date().toISOString().slice(0, 10);

const jours = (de, a) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(de + 'T00:00:00Z')) / 86400000);

/**
 * Compte d'un lot (= un appartement / copropriétaire).
 *  - solde > 0 : le copropriétaire doit de l'argent ; solde < 0 : il est en avance (créditeur).
 *  - Les paiements sont imputés sur les appels les plus anciens d'abord (méthode FIFO),
 *    ce qui permet de calculer l'ancienneté des impayés (balance âgée).
 */
export function compteLot(lotId, ref = aujourdhui()) {
  const db = getDb();
  const lot = db.prepare('SELECT * FROM lots WHERE id = ?').get(lotId);
  if (!lot) return null;
  const appels = db.prepare('SELECT * FROM appels WHERE lot_id = ? AND date_emission <= ? ORDER BY date_echeance, id').all(lotId, ref); // un appel pas encore émis n'est pas dû
  const paiements = db.prepare('SELECT * FROM paiements WHERE lot_id = ? ORDER BY date, id').all(lotId);

  const totalAppele = appels.reduce((s, a) => s + a.montant, 0);
  const totalAppeleEchu = appels.filter((a) => a.date_echeance <= ref).reduce((s, a) => s + a.montant, 0);
  const totalPaye = paiements.reduce((s, p) => s + p.montant, 0);

  // Imputation FIFO + balance âgée
  const balance = { nonEchu: 0, j0_30: 0, j31_90: 0, j91_180: 0, j180p: 0 };
  let dispo = totalPaye;
  let retardMax = 0;
  const appelsDetail = appels.map((a) => {
    const impute = Math.min(dispo, a.montant);
    dispo -= impute;
    const reste = a.montant - impute;
    const retard = Math.max(0, jours(a.date_echeance, ref));
    if (reste > 0) {
      if (retard === 0) balance.nonEchu += reste;
      else {
        retardMax = Math.max(retardMax, retard);
        if (retard <= 30) balance.j0_30 += reste;
        else if (retard <= 90) balance.j31_90 += reste;
        else if (retard <= 180) balance.j91_180 += reste;
        else balance.j180p += reste;
      }
    }
    return { ...a, impute, reste, retard: reste > 0 ? retard : 0, statut: reste === 0 ? 'Payé' : impute > 0 ? 'Partiel' : 'Impayé' };
  });
  const arriere = balance.j0_30 + balance.j31_90 + balance.j91_180 + balance.j180p;
  const solde = totalAppele - totalPaye;

  // Relevé chronologique avec solde cumulé
  const mouvements = [
    ...appels.map((a) => ({ date: a.date_emission, libelle: a.libelle, debit: a.montant, credit: 0, ordre: 0 })),
    ...paiements.map((p) => ({ date: p.date, libelle: `Règlement (${(MODES_PAIEMENT[p.mode] || p.mode).toLowerCase()})${p.reference ? ' – ' + p.reference : ''}`, debit: 0, credit: p.montant, ordre: 1, paiementId: p.id, numeroRecu: p.numero_recu })),
  ].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.ordre - y.ordre));
  let cumul = 0;
  for (const m of mouvements) { cumul += m.debit - m.credit; m.solde = cumul; }

  const echeancier = echeancierActif(lotId, ref);
  const prochainAppel = appelsDetail.find((a) => a.reste > 0 && a.date_echeance > ref) || null;

  let statut;
  if (arriere === 0) statut = solde < 0 ? 'En avance' : 'À jour';
  else if (echeancier && !echeancier.enRetard) statut = 'Sous échéancier';
  else if (retardMax <= 30) statut = 'Retard < 30 j';
  else if (retardMax <= 90) statut = 'Retard 31–90 j';
  else statut = 'Retard > 90 j';

  return { lot, appels: appelsDetail, paiements, mouvements, totalAppele, totalAppeleEchu, totalPaye, solde, arriere, balance, retardMax, statut, echeancier, prochainAppel };
}

/** Échéancier (plan d'apurement) actif d'un lot, avec le statut de chaque échéance. */
export function echeancierActif(lotId, ref = aujourdhui()) {
  const db = getDb();
  const e = db.prepare("SELECT * FROM echeanciers WHERE lot_id = ? AND statut = 'actif' ORDER BY id DESC LIMIT 1").get(lotId);
  if (!e) return null;
  const echeances = db.prepare('SELECT * FROM echeances WHERE echeancier_id = ? ORDER BY numero').all(e.id);
  // Les règlements reçus depuis l'accord servent d'abord à honorer l'échéancier
  let dispo = db.prepare('SELECT COALESCE(SUM(montant),0) s FROM paiements WHERE lot_id = ? AND date >= ?').get(lotId, e.date_accord).s;
  let enRetard = false;
  const lignes = echeances.map((x) => {
    const paye = Math.min(dispo, x.montant);
    dispo -= paye;
    let statut = paye === x.montant ? 'Payée' : x.date < ref ? 'En retard' : 'À venir';
    if (statut === 'En retard') enRetard = true;
    if (paye > 0 && paye < x.montant && statut !== 'En retard') statut = 'Partielle';
    return { ...x, paye, statut };
  });
  const totalPaye = lignes.reduce((s, l) => s + l.paye, 0);
  return { ...e, echeances: lignes, totalPaye, reste: e.montant_total - totalPaye, enRetard };
}

/** Vue d'ensemble de tous les lots (réservée au syndic). */
export function vueGlobale(ref = aujourdhui()) {
  const lots = getDb().prepare('SELECT id FROM lots ORDER BY numero').all();
  const comptes = lots.map((l) => compteLot(l.id, ref));
  const tot = (k) => comptes.reduce((s, c) => s + c[k], 0);
  const totB = (k) => comptes.reduce((s, c) => s + c.balance[k], 0);
  const totalAppeleEchu = tot('totalAppeleEchu');
  const totalPaye = tot('totalPaye');
  return {
    comptes,
    totalAppele: tot('totalAppele'),
    totalAppeleEchu,
    totalPaye,
    arriere: tot('arriere'),
    avances: comptes.filter((c) => c.solde < 0).reduce((s, c) => s - c.solde, 0),
    tauxRecouvrement: totalAppeleEchu ? Math.min(1, totalPaye / totalAppeleEchu) : 1,
    lotsEnRetard: comptes.filter((c) => c.arriere > 0).length,
    balance: { nonEchu: totB('nonEchu'), j0_30: totB('j0_30'), j31_90: totB('j31_90'), j91_180: totB('j91_180'), j180p: totB('j180p') },
  };
}

/** Répartit un montant global entre les lots au prorata des tantièmes, en corrigeant l'écart d'arrondi. */
export function repartirParTantiemes(montantTotal, lots) {
  const totalT = lots.reduce((s, l) => s + l.tantiemes, 0);
  const parts = lots.map((l) => ({ lot: l, montant: Math.floor((montantTotal * l.tantiemes) / totalT) }));
  let ecart = montantTotal - parts.reduce((s, p) => s + p.montant, 0);
  // l'écart (quelques centimes) va aux plus gros lots, 1 centime chacun
  const ordre = [...parts].sort((a, b) => b.lot.tantiemes - a.lot.tantiemes);
  for (let i = 0; ecart > 0; i = (i + 1) % ordre.length, ecart--) ordre[i].montant += 1;
  return parts;
}
