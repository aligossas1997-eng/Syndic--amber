// Au démarrage en ligne : crée les données de démo si la base est vide (sinon ne touche à rien).
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'syndic.db');
let vide = true;
if (fs.existsSync(dbPath)) {
  try { vide = new Database(dbPath, { readonly: true }).prepare('SELECT COUNT(*) n FROM users').get().n === 0; } catch { vide = true; }
}
if (vide) await import('./seed.js');
else console.log('Base existante conservée :', dbPath);
