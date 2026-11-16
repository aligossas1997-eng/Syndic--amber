import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'syndic.db');

// Tous les montants sont stockés en CENTIMES (entiers) pour éviter les erreurs d'arrondi.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS residence (
  id INTEGER PRIMARY KEY,
  nom TEXT NOT NULL,
  adresse TEXT,
  syndic_nom TEXT,
  iban TEXT,
  bic TEXT,
  budget_annuel INTEGER NOT NULL DEFAULT 0,
  total_tantiemes INTEGER NOT NULL DEFAULT 10000
);
CREATE TABLE IF NOT EXISTS lots (
  id INTEGER PRIMARY KEY,
  numero TEXT NOT NULL UNIQUE,
  batiment TEXT,
  etage INTEGER,
  type TEXT,
  surface REAL,
  tantiemes INTEGER NOT NULL,
  proprietaire TEXT NOT NULL,
  email TEXT,
  telephone TEXT,
  mode_paiement TEXT NOT NULL DEFAULT 'virement'
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nom TEXT,
  role TEXT NOT NULL CHECK (role IN ('syndic','resident')),
  lot_id INTEGER REFERENCES lots(id),
  CHECK ((role = 'syndic' AND lot_id IS NULL) OR (role = 'resident' AND lot_id IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS appels (
  id INTEGER PRIMARY KEY,
  lot_id INTEGER NOT NULL REFERENCES lots(id),
  libelle TEXT NOT NULL,
  categorie TEXT NOT NULL DEFAULT 'budget',
  montant INTEGER NOT NULL,
  date_emission TEXT NOT NULL,
  date_echeance TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS paiements (
  id INTEGER PRIMARY KEY,
  lot_id INTEGER NOT NULL REFERENCES lots(id),
  date TEXT NOT NULL,
  montant INTEGER NOT NULL CHECK (montant > 0),
  mode TEXT NOT NULL,
  reference TEXT,
  numero_recu TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS echeanciers (
  id INTEGER PRIMARY KEY,
  lot_id INTEGER NOT NULL REFERENCES lots(id),
  montant_total INTEGER NOT NULL,
  nb_echeances INTEGER NOT NULL,
  date_accord TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'actif',
  commentaire TEXT
);
CREATE TABLE IF NOT EXISTS echeances (
  id INTEGER PRIMARY KEY,
  echeancier_id INTEGER NOT NULL REFERENCES echeanciers(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL,
  date TEXT NOT NULL,
  montant INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appels_lot ON appels(lot_id);
CREATE INDEX IF NOT EXISTS idx_paiements_lot ON paiements(lot_id);
`;

let db;
export function getDb() {
  if (!db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA);
  }
  return db;
}

export function getResidence() {
  return getDb().prepare('SELECT * FROM residence LIMIT 1').get();
}

/** Numéro de reçu séquentiel par année : R-2026-0001 */
export function prochainNumeroRecu(dateIso) {
  const annee = dateIso.slice(0, 4);
  const row = getDb()
    .prepare("SELECT numero_recu FROM paiements WHERE numero_recu LIKE ? ORDER BY numero_recu DESC LIMIT 1")
    .get(`R-${annee}-%`);
  const n = row ? parseInt(row.numero_recu.split('-')[2], 10) + 1 : 1;
  return `R-${annee}-${String(n).padStart(4, '0')}`;
}
