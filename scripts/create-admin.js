'use strict';
// Crée (ou réinitialise) un compte administrateur.
// Usage : npm run create-admin -- email@exemple.fr Prénom Nom
const bcrypt = require('bcryptjs');
const { db } = require('../src/db');
const { generatePassword } = require('../src/helpers');

(async () => {
  const [rawEmail, first = 'Syndic', last = 'Ambre'] = process.argv.slice(2);
  if (!rawEmail) { console.error('Usage : npm run create-admin -- email@exemple.fr Prénom Nom'); process.exit(1); }
  const email = rawEmail.toLowerCase();
  const password = generatePassword();
  const hash = bcrypt.hashSync(password, 12);
  const existing = await db.get('SELECT id FROM users WHERE email = ?', email);
  if (existing) {
    await db.run("UPDATE users SET password_hash = ?, role = 'admin', active = 1, must_change_password = 1 WHERE id = ?", hash, existing.id);
  } else {
    await db.run("INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES (?, ?, ?, ?, 'admin')", email, hash, first, last);
  }
  console.log(`\nCompte administrateur prêt :\n  Email : ${email}\n  Mot de passe temporaire : ${password}\n(à changer à la première connexion)\n`);
  await db.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
