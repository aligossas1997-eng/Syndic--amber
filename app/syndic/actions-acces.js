'use server';
import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSyndic } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { motDePasseProvisoire } from '@/lib/motdepasse';
import { parseMontant } from '@/lib/format';

/** Identifiant de connexion d'un lot : son email s'il est libre, sinon le numéro du lot (ex. "a01"). */
function identifiantPour(db, lot) {
  const email = (lot.email || '').trim().toLowerCase();
  if (email && !db.prepare('SELECT 1 FROM users WHERE lower(email) = ?').get(email)) return email;
  let base = 'lot-' + lot.numero.toLowerCase().replace(/[^a-z0-9]/g, ''), id = base, i = 2;
  while (db.prepare('SELECT 1 FROM users WHERE lower(email) = ?').get(id)) id = `${base}-${i++}`;
  return id;
}

/**
 * Crée les accès manquants (mode "creer") ou génère un nouveau mot de passe provisoire (mode "reinit")
 * pour les lots demandés. Renvoie les identifiants en clair UNE SEULE FOIS, pour impression :
 * en base on ne garde que le hash.
 */
export async function genererAcces(_prev, formData) {
  await requireSyndic();
  const db = getDb();
  const mode = formData.get('mode') === 'reinit' ? 'reinit' : 'creer';
  const ids = formData.getAll('lot_id').map(Number).filter(Boolean);
  const fiches = [];
  db.transaction(() => {
    for (const id of ids) {
      const lot = db.prepare('SELECT * FROM lots WHERE id = ?').get(id);
      if (!lot) continue;
      const user = db.prepare('SELECT * FROM users WHERE lot_id = ?').get(id);
      const mdp = motDePasseProvisoire();
      const hash = bcrypt.hashSync(mdp, 10);
      if (!user && mode === 'creer') {
        const identifiant = identifiantPour(db, lot);
        db.prepare("INSERT INTO users (email,password_hash,nom,role,lot_id,doit_changer_mdp,actif,mdp_cree_le) VALUES (?,?,?,'resident',?,1,1,datetime('now'))")
          .run(identifiant, hash, lot.proprietaire, lot.id);
        fiches.push({ numero: lot.numero, proprietaire: lot.proprietaire, identifiant, mdp });
      } else if (user && mode === 'reinit') {
        db.prepare("UPDATE users SET password_hash = ?, doit_changer_mdp = 1, actif = 1, mdp_cree_le = datetime('now') WHERE id = ?").run(hash, user.id);
        fiches.push({ numero: lot.numero, proprietaire: lot.proprietaire, identifiant: user.email, mdp });
      }
    }
  })();
  revalidatePath('/syndic/acces');
  if (!fiches.length) return { error: 'Aucun accès à générer.', fiches: [] };
  return { fiches, mode };
}

export async function basculerActif(formData) {
  await requireSyndic();
  getDb().prepare('UPDATE users SET actif = 1 - actif WHERE lot_id = ?').run(Number(formData.get('lot_id')));
  revalidatePath('/syndic/acces');
}

// ---------- Lots ----------
const COLONNES = ['numero', 'batiment', 'etage', 'type', 'surface', 'tantiemes', 'proprietaire', 'email', 'telephone'];

function valider(l) {
  const err = [];
  if (!l.numero) err.push('numéro manquant');
  if (!l.proprietaire) err.push('propriétaire manquant');
  if (!(Number.isInteger(l.tantiemes) && l.tantiemes > 0)) err.push('tantièmes invalides');
  if (l.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l.email)) err.push('email invalide');
  return err;
}
function normaliser(o) {
  const num = (v) => { const x = parseFloat(String(v ?? '').replace(',', '.').replace(/\s/g, '')); return Number.isFinite(x) ? x : null; };
  return {
    numero: String(o.numero ?? '').trim().toUpperCase().slice(0, 20),
    batiment: String(o.batiment ?? '').trim().slice(0, 30),
    etage: num(o.etage) === null ? null : Math.round(num(o.etage)),
    type: String(o.type ?? '').trim().slice(0, 30),
    surface: num(o.surface),
    tantiemes: num(o.tantiemes) === null ? NaN : Math.round(num(o.tantiemes)),
    proprietaire: String(o.proprietaire ?? '').trim().slice(0, 100),
    email: String(o.email ?? '').trim().toLowerCase().slice(0, 120),
    telephone: String(o.telephone ?? '').trim().slice(0, 30),
  };
}
function enregistrerLot(db, l) {
  const existant = db.prepare('SELECT id FROM lots WHERE numero = ?').get(l.numero);
  if (existant) {
    db.prepare('UPDATE lots SET batiment=?,etage=?,type=?,surface=?,tantiemes=?,proprietaire=?,email=?,telephone=? WHERE id=?')
      .run(l.batiment, l.etage, l.type, l.surface, l.tantiemes, l.proprietaire, l.email, l.telephone, existant.id);
    db.prepare("UPDATE users SET nom = ? WHERE lot_id = ?").run(l.proprietaire, existant.id);
    return 'maj';
  }
  db.prepare('INSERT INTO lots (numero,batiment,etage,type,surface,tantiemes,proprietaire,email,telephone) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(l.numero, l.batiment, l.etage, l.type, l.surface, l.tantiemes, l.proprietaire, l.email, l.telephone);
  return 'cree';
}

export async function importerLots(formData) {
  await requireSyndic();
  const texte = String(formData.get('donnees') || '');
  const lignes = texte.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const lots = [], erreurs = [];
  lignes.forEach((ligne, i) => {
    const cells = ligne.split(ligne.includes('\t') ? '\t' : ';').map((c) => c.trim());
    if (i === 0 && /num|lot/i.test(cells[0]) && !/\d/.test(cells[5] || '')) return; // ligne d'en-tête
    const l = normaliser(Object.fromEntries(COLONNES.map((k, j) => [k, cells[j]])));
    const e = valider(l);
    if (e.length) erreurs.push(`Ligne ${i + 1} (${cells[0] || '?'}) : ${e.join(', ')}`);
    else lots.push(l);
  });
  if (!lots.length && !erreurs.length) erreurs.push('Aucune ligne à importer.');
  if (erreurs.length) redirect('/syndic/lots?erreur=' + encodeURIComponent('Rien n’a été importé. ' + erreurs.slice(0, 8).join(' · ')));
  const db = getDb();
  const res = { cree: 0, maj: 0 };
  db.transaction(() => { for (const l of lots) res[enregistrerLot(db, l)]++; })();
  revalidatePath('/syndic', 'layout');
  redirect('/syndic/lots?ok=' + encodeURIComponent(`${res.cree} lot(s) créé(s), ${res.maj} mis à jour. Pense à créer leurs accès dans « Accès résidents ».`));
}

export async function ajouterLot(formData) {
  await requireSyndic();
  const l = normaliser(Object.fromEntries(COLONNES.map((k) => [k, formData.get(k)])));
  const e = valider(l);
  if (e.length) redirect('/syndic/lots?erreur=' + encodeURIComponent('Lot invalide : ' + e.join(', ')));
  const db = getDb();
  if (db.prepare('SELECT 1 FROM lots WHERE numero = ?').get(l.numero)) redirect('/syndic/lots?erreur=' + encodeURIComponent(`Le lot ${l.numero} existe déjà.`));
  enregistrerLot(db, l);
  revalidatePath('/syndic', 'layout');
  redirect('/syndic/lots?ok=' + encodeURIComponent(`Lot ${l.numero} ajouté.`));
}

export async function modifierLot(formData) {
  await requireSyndic();
  const db = getDb();
  const id = Number(formData.get('lot_id'));
  const ancien = db.prepare('SELECT * FROM lots WHERE id = ?').get(id);
  if (!ancien) redirect('/syndic/lots');
  const l = normaliser({ ...Object.fromEntries(COLONNES.map((k) => [k, formData.get(k)])), numero: ancien.numero });
  const e = valider(l);
  if (e.length) redirect(`/syndic/lots/${id}?erreur=` + encodeURIComponent('Modification refusée : ' + e.join(', ')));
  let note = '';
  db.transaction(() => {
    enregistrerLot(db, l);
    // si l'identifiant de connexion était l'ancien email, on le fait suivre
    const u = db.prepare('SELECT * FROM users WHERE lot_id = ?').get(id);
    if (u && l.email && l.email !== (ancien.email || '').toLowerCase() && u.email === (ancien.email || '').toLowerCase()) {
      if (db.prepare('SELECT 1 FROM users WHERE lower(email) = ? AND id <> ?').get(l.email, u.id)) note = ' (identifiant inchangé : email déjà utilisé par un autre compte)';
      else { db.prepare('UPDATE users SET email = ? WHERE id = ?').run(l.email, u.id); note = ` Nouvel identifiant de connexion : ${l.email}.`; }
    }
  })();
  revalidatePath('/syndic', 'layout');
  redirect(`/syndic/lots/${id}?ok=` + encodeURIComponent('Lot mis à jour.' + note));
}

export async function modifierResidence(formData) {
  await requireSyndic();
  const s = (k, n = 150) => String(formData.get(k) || '').trim().slice(0, n);
  const budget = parseMontant(formData.get('budget_annuel') || '0');
  if (!s('nom') || !(budget >= 0)) redirect('/syndic/parametres?erreur=' + encodeURIComponent('Nom et budget obligatoires.'));
  getDb().prepare('UPDATE residence SET nom=?, adresse=?, syndic_nom=?, iban=?, bic=?, budget_annuel=?').run(s('nom'), s('adresse'), s('syndic_nom'), s('iban', 40).toUpperCase(), s('bic', 15).toUpperCase(), budget);
  revalidatePath('/', 'layout');
  redirect('/syndic/parametres?ok=' + encodeURIComponent('Paramètres enregistrés.'));
}
