'use server';
// Actions réservées au syndic. Chaque action revérifie le rôle côté serveur :
// un résident qui tenterait de les appeler directement est renvoyé vers son espace.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSyndic } from '@/lib/auth';
import { getDb, prochainNumeroRecu } from '@/lib/db';
import { parseMontant, MODES_PAIEMENT, CATEGORIES } from '@/lib/format';
import { repartirParTantiemes } from '@/lib/finance';

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const back = (lotId, msg, ok = true) => redirect(`/syndic/lots/${lotId}?${ok ? 'ok' : 'erreur'}=${encodeURIComponent(msg)}`);
const getLot = (id) => getDb().prepare('SELECT * FROM lots WHERE id = ?').get(Number(id));

export async function enregistrerPaiement(formData) {
  await requireSyndic();
  const lot = getLot(formData.get('lot_id'));
  if (!lot) redirect('/syndic/lots');
  const date = String(formData.get('date'));
  const montant = parseMontant(formData.get('montant'));
  const mode = String(formData.get('mode'));
  const reference = String(formData.get('reference') || '').slice(0, 120);
  if (!isDate(date) || !(montant > 0) || !MODES_PAIEMENT[mode]) back(lot.id, 'Paiement invalide : vérifie la date, le montant et le mode.', false);
  const db = getDb();
  const numero = db.transaction(() => {
    const n = prochainNumeroRecu(date);
    db.prepare('INSERT INTO paiements (lot_id,date,montant,mode,reference,numero_recu) VALUES (?,?,?,?,?,?)').run(lot.id, date, montant, mode, reference, n);
    return n;
  })();
  revalidatePath('/syndic', 'layout');
  back(lot.id, `Paiement enregistré, reçu ${numero} généré.`);
}

export async function ajouterAppelIndividuel(formData) {
  await requireSyndic();
  const lot = getLot(formData.get('lot_id'));
  if (!lot) redirect('/syndic/lots');
  const libelle = String(formData.get('libelle') || '').trim().slice(0, 150);
  const categorie = String(formData.get('categorie'));
  const montant = parseMontant(formData.get('montant'));
  const emission = String(formData.get('date_emission'));
  const echeance = String(formData.get('date_echeance'));
  if (!libelle || !CATEGORIES[categorie] || !(montant > 0) || !isDate(emission) || !isDate(echeance)) back(lot.id, 'Appel invalide.', false);
  getDb().prepare('INSERT INTO appels (lot_id,libelle,categorie,montant,date_emission,date_echeance) VALUES (?,?,?,?,?,?)').run(lot.id, libelle, categorie, montant, emission, echeance);
  revalidatePath('/syndic', 'layout');
  back(lot.id, 'Appel ajouté au compte.');
}

export async function changerModePaiement(formData) {
  await requireSyndic();
  const lot = getLot(formData.get('lot_id'));
  const mode = String(formData.get('mode'));
  if (!lot || !MODES_PAIEMENT[mode]) redirect('/syndic/lots');
  getDb().prepare('UPDATE lots SET mode_paiement = ? WHERE id = ?').run(mode, lot.id);
  back(lot.id, 'Mode de paiement mis à jour.');
}

export async function creerEcheancier(formData) {
  await requireSyndic();
  const lot = getLot(formData.get('lot_id'));
  if (!lot) redirect('/syndic/lots');
  const total = parseMontant(formData.get('montant_total'));
  const nb = parseInt(formData.get('nb_echeances'), 10);
  const premiere = String(formData.get('premiere_echeance'));
  const commentaire = String(formData.get('commentaire') || '').slice(0, 300);
  if (!(total > 0) || !(nb >= 1 && nb <= 36) || !isDate(premiere)) back(lot.id, 'Échéancier invalide (1 à 36 mensualités).', false);
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE echeanciers SET statut = 'remplacé' WHERE lot_id = ? AND statut = 'actif'").run(lot.id);
    const today = new Date().toISOString().slice(0, 10);
    const id = db.prepare("INSERT INTO echeanciers (lot_id,montant_total,nb_echeances,date_accord,statut,commentaire) VALUES (?,?,?,?,'actif',?)").run(lot.id, total, nb, today, commentaire).lastInsertRowid;
    const m = Math.floor(total / nb);
    for (let i = 0; i < nb; i++) {
      const d = new Date(premiere + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + i);
      db.prepare('INSERT INTO echeances (echeancier_id,numero,date,montant) VALUES (?,?,?,?)').run(id, i + 1, d.toISOString().slice(0, 10), i === nb - 1 ? total - m * (nb - 1) : m);
    }
  })();
  revalidatePath('/syndic', 'layout');
  back(lot.id, `Échéancier de ${nb} mensualités créé.`);
}

export async function cloturerEcheancier(formData) {
  await requireSyndic();
  const lot = getLot(formData.get('lot_id'));
  if (!lot) redirect('/syndic/lots');
  getDb().prepare("UPDATE echeanciers SET statut = 'clos' WHERE lot_id = ? AND statut = 'actif'").run(lot.id);
  back(lot.id, 'Échéancier clôturé.');
}

export async function genererAppelGlobal(formData) {
  await requireSyndic();
  const libelle = String(formData.get('libelle') || '').trim().slice(0, 150);
  const categorie = String(formData.get('categorie'));
  const total = parseMontant(formData.get('montant_total'));
  const emission = String(formData.get('date_emission'));
  const echeance = String(formData.get('date_echeance'));
  if (!libelle || !CATEGORIES[categorie] || !(total > 0) || !isDate(emission) || !isDate(echeance)) redirect('/syndic/appels?erreur=' + encodeURIComponent('Formulaire invalide.'));
  const db = getDb();
  const lots = db.prepare('SELECT id, tantiemes FROM lots').all();
  db.transaction(() => {
    const ins = db.prepare('INSERT INTO appels (lot_id,libelle,categorie,montant,date_emission,date_echeance) VALUES (?,?,?,?,?,?)');
    for (const p of repartirParTantiemes(total, lots)) ins.run(p.lot.id, libelle, categorie, p.montant, emission, echeance);
  })();
  revalidatePath('/syndic', 'layout');
  redirect('/syndic/appels?ok=' + encodeURIComponent(`Appel « ${libelle} » réparti sur ${lots.length} lots.`));
}
