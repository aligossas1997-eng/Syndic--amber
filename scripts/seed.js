// Crée (ou recrée) la base de démonstration : node scripts/seed.js
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'syndic.db');
for (const f of [dbPath, dbPath + '-wal', dbPath + '-shm']) if (fs.existsSync(f)) fs.rmSync(f);

const { getDb, prochainNumeroRecu } = await import('../lib/db.js');
const { repartirParTantiemes } = await import('../lib/finance.js');
const db = getDb();

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const addMonths = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return iso(d); };
const today = iso(new Date());

// --- Résidence ---
const BUDGET = 52_000_00; // 52 000 € / an
db.prepare(`INSERT INTO residence (nom, adresse, syndic_nom, iban, bic, budget_annuel, total_tantiemes)
  VALUES (?,?,?,?,?,?,?)`).run('Résidence Les Tilleuls', '12 rue des Tilleuls, 69003 Lyon', 'Cabinet Démo Syndic',
  'FR76 3000 4000 0500 0012 3456 789', 'BNPAFRPPXXX', BUDGET, 10000);

// --- Lots (tantièmes = quote-part des charges, total 10 000) ---
const lots = [
  ['A01', 'A', 0, 'T2', 45, 620, 'Sophie Martin', 'virement', 'bon'],
  ['A02', 'A', 0, 'T3', 64, 860, 'Karim Benali', 'prelevement', 'bon'],
  ['A11', 'A', 1, 'T3', 66, 880, 'Julie Moreau', 'virement', 'retard_leger'],
  ['A12', 'A', 1, 'T4', 82, 1080, 'Thomas Lefèvre', 'cheque', 'partiel'],
  ['A21', 'A', 2, 'T2', 47, 640, 'Nadia Haddad', 'prelevement', 'bon'],
  ['A22', 'A', 2, 'T5', 105, 1350, 'Pierre Dubois', 'virement', 'gros_impaye'],
  ['B01', 'B', 0, 'Studio', 28, 380, 'Léa Garnier', 'virement', 'avance'],
  ['B02', 'B', 0, 'T3', 63, 840, 'Mamadou Diallo', 'virement', 'echeancier'],
  ['B11', 'B', 1, 'T3', 65, 860, 'Claire Fontaine', 'prelevement', 'bon'],
  ['B12', 'B', 1, 'T4', 80, 1040, 'Antoine Roux', 'cheque', 'retard_leger'],
  ['B21', 'B', 2, 'T2', 46, 610, 'Inès Lambert', 'virement', 'bon'],
  ['B22', 'B', 2, 'T3', 62, 840, 'Hugo Mercier', 'carte', 'partiel'],
];
const insLot = db.prepare(`INSERT INTO lots (numero,batiment,etage,type,surface,tantiemes,proprietaire,email,telephone,mode_paiement)
  VALUES (?,?,?,?,?,?,?,?,?,?)`);
const insUser = db.prepare('INSERT INTO users (email,password_hash,nom,role,lot_id) VALUES (?,?,?,?,?)');
const hashRes = bcrypt.hashSync('resident123', 10);
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '.');
const lotRows = [];
for (const [numero, bat, etage, type, surface, t, nom, mode, profil] of lots) {
  const email = `${slug(nom)}@demo.fr`;
  const id = insLot.run(numero, bat, etage, type, surface, t, nom, email, '06 00 00 00 ' + numero.slice(1), mode).lastInsertRowid;
  insUser.run(email, hashRes, nom, 'resident', id);
  lotRows.push({ id: Number(id), numero, tantiemes: t, mode, profil });
}
insUser.run('syndic@demo.fr', bcrypt.hashSync('syndic123', 10), 'Gestionnaire Syndic', 'syndic', null);

// --- Appels de fonds : 4 trimestres glissants (le dernier = trimestre en cours) ---
const now = new Date();
const qStart = iso(new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1)));
const trimestres = [-9, -6, -3, 0].map((m) => addMonths(qStart, m));
const insAppel = db.prepare('INSERT INTO appels (lot_id,libelle,categorie,montant,date_emission,date_echeance) VALUES (?,?,?,?,?,?)');
const appelsParLot = Object.fromEntries(lotRows.map((l) => [l.id, []]));
for (const debut of trimestres) {
  const d = new Date(debut + 'T00:00:00Z');
  const libelle = `Appel provisionnel T${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
  for (const p of repartirParTantiemes(BUDGET / 4, lotRows)) {
    insAppel.run(p.lot.id, libelle, 'budget', p.montant, addDays(debut, -30), debut);
    appelsParLot[p.lot.id].push({ montant: p.montant, echeance: debut });
  }
}
// Appel travaux (ravalement), exigible 15 jours après le début du trimestre précédent
const echTravaux = addDays(trimestres[2], 15);
for (const p of repartirParTantiemes(30_000_00, lotRows)) {
  insAppel.run(p.lot.id, 'Travaux ravalement façade – 1re tranche', 'travaux', p.montant, addDays(echTravaux, -45), echTravaux);
  appelsParLot[p.lot.id].push({ montant: p.montant, echeance: echTravaux });
}
for (const id in appelsParLot) appelsParLot[id].sort((a, b) => (a.echeance < b.echeance ? -1 : 1));

// --- Paiements selon le profil de chaque copropriétaire ---
const insPaiement = db.prepare('INSERT INTO paiements (lot_id,date,montant,mode,reference,numero_recu) VALUES (?,?,?,?,?,?)');
const payer = (lot, date, montant, ref) => {
  if (date > today) return;
  insPaiement.run(lot.id, date, montant, lot.mode, ref, prochainNumeroRecu(date));
};
// on insère dans l'ordre chronologique pour que les numéros de reçus suivent les dates
const ops = [];
for (const lot of lotRows) {
  const a = appelsParLot[lot.id];
  const ref = (i) => `Lot ${lot.numero} – appel ${i + 1}`;
  switch (lot.profil) {
    case 'bon': a.forEach((x, i) => ops.push([lot, addDays(x.echeance, -3), x.montant, ref(i)])); break;
    case 'avance': a.forEach((x, i) => ops.push([lot, addDays(x.echeance, -10), x.montant, ref(i)]));
      ops.push([lot, addDays(today, -5), 400_00, 'Avance sur appels futurs']); break;
    case 'retard_leger': a.slice(0, -1).forEach((x, i) => ops.push([lot, addDays(x.echeance, 12), x.montant, ref(i)])); break;
    case 'partiel': a.forEach((x, i) => ops.push([lot, addDays(x.echeance, 5), i >= a.length - 3 ? Math.round(x.montant / 2) : x.montant, ref(i)])); break;
    case 'gros_impaye': ops.push([lot, addDays(a[0].echeance, 20), a[0].montant, ref(0)]); break;
    case 'echeancier': ops.push([lot, addDays(a[0].echeance, 2), a[0].montant, ref(0)]); break;
  }
}
ops.sort((x, y) => (x[1] < y[1] ? -1 : 1)).forEach((o) => payer(...o));

// --- Échéancier pour le lot B02 : dette apurée en 6 mensualités ---
const b02 = lotRows.find((l) => l.profil === 'echeancier');
const dateAccord = addDays(today, -50);
const dette = appelsParLot[b02.id].filter((x) => x.echeance <= dateAccord).slice(1).reduce((s, x) => s + x.montant, 0);
const eId = db.prepare("INSERT INTO echeanciers (lot_id,montant_total,nb_echeances,date_accord,statut,commentaire) VALUES (?,?,?,?, 'actif', ?)")
  .run(b02.id, dette, 6, dateAccord, 'Accord amiable suite à perte d\'emploi – 6 mensualités').lastInsertRowid;
const mensualite = Math.floor(dette / 6);
for (let i = 0; i < 6; i++) {
  const d = addMonths(addDays(dateAccord, 10), i);
  const m = i === 5 ? dette - mensualite * 5 : mensualite;
  db.prepare('INSERT INTO echeances (echeancier_id,numero,date,montant) VALUES (?,?,?,?)').run(eId, i + 1, d, m);
  if (d <= today) insPaiement.run(b02.id, d, m, 'virement', `Échéancier – mensualité ${i + 1}/6`, prochainNumeroRecu(d));
}

console.log('Base de démo créée :', dbPath);
console.log('  Syndic   : syndic@demo.fr / syndic123');
console.log('  Résident : sophie.martin@demo.fr / resident123 (et tous les autres prenom.nom@demo.fr)');
