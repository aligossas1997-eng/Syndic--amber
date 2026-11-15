'use strict';
// Crée (ou réinitialise) un compte administrateur.
// Usage : npm run create-admin -- email@exemple.fr Prénom Nom
const bcrypt = require('bcryptjs');
const { db } = require('../src/db');
const { generatePassword } = require('../src/helpers');

const [email, first = 'Syndic', last = 'Ambre'] = process.argv.slice(2);
if (!email) { console.error('Usage : npm run create-admin -- email@exemple.fr Prénom Nom'); process.exit(1); }

const password = generatePassword();
const hash = bcrypt.hashSync(password, 12);
const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
if (existing) {
  db.prepare("UPDATE users SET password_hash = ?, role = 'admin', active = 1, must_change_password = 1 WHERE id = ?").run(hash, existing.id);
} else {
  db.prepare("INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES (?, ?, ?, ?, 'admin')").run(email.toLowerCase(), hash, first, last);
}
console.log(`\nCompte administrateur prêt :\n  Email : ${email}\n  Mot de passe temporaire : ${password}\n(à changer à la première connexion)\n`);
