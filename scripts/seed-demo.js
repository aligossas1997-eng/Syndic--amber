'use strict';
// Remplit la base avec des données de démonstration (NE PAS utiliser en production).
const bcrypt = require('bcryptjs');
const { db } = require('../src/db');

(async () => {
if ((await db.get('SELECT COUNT(*)::int AS n FROM users')).n > 0) {
  console.log('La base contient déjà des comptes : démo non chargée.'); await db.close(); return;
}
const pw = bcrypt.hashSync('demo-ambre-2026', 10);
const addUser = async (...a) => (await db.get(`INSERT INTO users (email, password_hash, first_name, last_name, phone, building, apartment, lot_number, tantiemes, status, role, must_change_password)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0) RETURNING id`, ...a)).id;
const admin = await addUser('syndic@residence-ambre.fr', pw, 'Claire', 'Dumont', '05 22 00 00 00', '', '', '', 0, 'proprietaire', 'admin');
const residents = [];
for (const r of [
  ['marie.leroy@exemple.fr', 'Marie', 'Leroy', 'A', '12', '012', 85],
  ['karim.benali@exemple.fr', 'Karim', 'Benali', 'A', '21', '021', 112],
  ['sophie.martin@exemple.fr', 'Sophie', 'Martin', 'B', '03', '103', 64],
  ['julien.petit@exemple.fr', 'Julien', 'Petit', 'B', '14', '114', 97],
]) { const [e, f, l, b, a, lot, t] = r; residents.push(await addUser(e, pw, f, l, '06 00 00 00 00', b, a, lot, t, 'proprietaire', 'resident')); }

const ann = { run: (...a) => db.get('INSERT INTO announcements (title, body, category, pinned, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id', ...a) };
await ann.run('Assemblée générale ordinaire 2027', "L'AG annuelle se tiendra le jeudi 4 mars 2027 à 18h30 dans la salle commune du bâtiment A.\n\nLa convocation et l'ordre du jour vous seront envoyés par courrier recommandé au moins 21 jours avant. Pensez à donner pouvoir si vous ne pouvez pas être présent.", 'info', 1, admin, '2026-11-10 09:00:00');
await ann.run('Ravalement de façade – bâtiment B', "Les échafaudages seront installés à partir du 1er décembre pour une durée estimée de 8 semaines. Merci de libérer les balcons côté rue.", 'travaux', 0, admin, '2026-11-05 14:30:00');
await ann.run('Coupure d’eau chaude mardi matin', "Intervention sur la chaudière collective mardi 18 novembre de 8h à 12h. L'eau chaude sera coupée dans les deux bâtiments.", 'urgent', 0, admin, '2026-11-14 17:00:00');
await ann.run('Fête des voisins de fin d’année', "Rendez-vous le samedi 13 décembre à 17h dans le jardin autour d'un thé ! Chacun apporte un petit quelque chose.", 'vie', 0, admin, '2026-11-12 10:00:00');

const ev = { run: (...a) => db.get('INSERT INTO events (title, description, location, starts_at, kind) VALUES (?, ?, ?, ?, ?) RETURNING id', ...a) };
await ev.run('Intervention chaudière', "Coupure d'eau chaude.", 'Chaufferie', '2026-11-18 08:00:00', 'travaux');
await ev.run('Réunion du conseil syndical', 'Préparation du budget prévisionnel 2027.', 'Salle commune bât. A', '2026-11-27 19:00:00', 'conseil');
await ev.run('Fête de fin d’année', 'Thé et pâtisseries offerts.', 'Jardin', '2026-12-13 17:00:00', 'vie');
await ev.run('Assemblée générale ordinaire', 'Approbation des comptes 2026, vote du budget 2027.', 'Salle commune bât. A', '2027-03-04 18:30:00', 'ag');

const ct = { run: (...a) => db.get('INSERT INTO contacts (name, role, phone, email, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?) RETURNING id', ...a) };
await ct.run('Cabinet Dumont Gestion', 'Syndic', '05 22 00 00 00', 'syndic@residence-ambre.fr', 'Du lundi au vendredi, 9h–12h / 14h–17h', 1);
await ct.run('M. Ferreira', 'Gardien', '06 11 22 33 44', '', 'Loge bât. A — présent 7h–12h et 15h–19h', 2);
await ct.run('Ascenseurs Plus', 'Dépannage ascenseur (24h/24)', '05 22 11 11 11', '', 'Contrat n° AP-2291', 3);
await ct.run('Plomberie Express', 'Plombier d’astreinte', '06 98 76 54 32', '', 'Fuites sur parties communes uniquement', 4);

const ch = { run: (...a) => db.get('INSERT INTO charges (user_id, label, period, amount_cents, due_date, paid, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id', ...a) };
for (const [i, id] of residents.entries()) {
  await ch.run(id, 'Provision charges courantes', 'T3 2026', 150000 + i * 20000, '2026-07-01', 1, '2026-07-03 10:00:00');
  await ch.run(id, 'Provision charges courantes', 'T4 2026', 150000 + i * 20000, '2026-10-01', i === 1 ? 0 : 1, i === 1 ? null : '2026-10-02 10:00:00');
  await ch.run(id, 'Travaux ravalement (AG 2026 – 1/2)', '2026', 900000 + i * 100000, '2026-12-15', 0, null);
}

const tk = { run: (...a) => db.get('INSERT INTO tickets (user_id, title, description, location, category, priority, status) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id', ...a) };
const t1 = (await tk.run(residents[0], 'Lumière du hall A en panne', "L'éclairage du hall ne s'allume plus depuis hier soir.", 'Hall bât. A', 'electricite', 'normale', 'en_cours')).id;
await db.run('INSERT INTO ticket_comments (ticket_id, user_id, body) VALUES (?, ?, ?)', t1, admin, "Merci, l'électricien passe jeudi matin.");
await tk.run(residents[0], 'Interphone qui grésille', 'Impossible de comprendre les visiteurs.', 'Appt A-12', 'acces', 'basse', 'ouvert');

console.log('Données de démo chargées. Comptes (mot de passe : demo-ambre-2026) :\n  admin    : syndic@residence-ambre.fr\n  résident : marie.leroy@exemple.fr');
await db.close();
})().catch((e) => { console.error(e); process.exit(1); });
