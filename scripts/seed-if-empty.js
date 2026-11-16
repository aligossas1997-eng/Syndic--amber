// Au démarrage en ligne :
//  - DEMO=true  : crée les données de démo si la base est vide ;
//  - sinon      : crée une résidence vide + un compte syndic (ADMIN_EMAIL / ADMIN_PASSWORD) si la base est vide.
// Une base qui contient déjà des comptes n'est JAMAIS modifiée.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'syndic.db');
let vide = true;
if (fs.existsSync(dbPath)) {
  try { const d = new Database(dbPath, { readonly: true }); vide = d.prepare('SELECT COUNT(*) n FROM users').get().n === 0; d.close(); } catch { vide = true; }
}
if (!vide) console.log('Base existante conservée :', dbPath);
else if (process.env.DEMO === 'true') await import('./seed.js');
else {
  const bcrypt = (await import('bcryptjs')).default;
  const { getDb } = await import('../lib/db.js');
  const { motDePasseProvisoire } = await import('../lib/motdepasse.js');
  const db = getDb();
  if (!db.prepare('SELECT 1 FROM residence').get())
    db.prepare("INSERT INTO residence (nom, budget_annuel, total_tantiemes) VALUES (?, 0, 10000)").run(process.env.RESIDENCE_NOM || 'Ma résidence');
  const email = (process.env.ADMIN_EMAIL || 'syndic').trim().toLowerCase();
  const mdp = process.env.ADMIN_PASSWORD || motDePasseProvisoire();
  db.prepare("INSERT INTO users (email,password_hash,nom,role,lot_id,doit_changer_mdp) VALUES (?,?,?,'syndic',NULL,1)").run(email, bcrypt.hashSync(mdp, 10), 'Syndic');
  console.log('Nouvelle résidence vide créée. Compte syndic :', email, process.env.ADMIN_PASSWORD ? '(mot de passe = ADMIN_PASSWORD)' : `/ mot de passe provisoire : ${mdp}`);
}
