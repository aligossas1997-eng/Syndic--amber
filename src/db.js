'use strict';
// Base de données PostgreSQL.
// - En ligne : DATABASE_URL pointe vers une base hébergée (ex. Neon, gratuit) → les données ne sont jamais effacées.
// - En local / tests : sans DATABASE_URL, on utilise PGlite (PostgreSQL embarqué) stocké dans DATA_DIR/pgdata.
const path = require('node:path');
const fs = require('node:fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

// Horodatages stockés en texte UTC « AAAA-MM-JJ HH:MM:SS » (simple à comparer et à afficher).
const NOW = "to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')";
const TODAY = "to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD')";
const YESTERDAY = "to_char((now() - interval '1 day') AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  building TEXT,
  apartment TEXT,
  lot_number TEXT,
  tantiemes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'proprietaire',
  role TEXT NOT NULL DEFAULT 'resident',
  active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  user_id INTEGER,
  expires BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'info',
  pinned INTEGER NOT NULL DEFAULT 0,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  content BYTEA NOT NULL,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  location TEXT,
  category TEXT NOT NULL DEFAULT 'autre',
  priority TEXT NOT NULL DEFAULT 'normale',
  status TEXT NOT NULL DEFAULT 'ouvert',
  created_at TEXT NOT NULL DEFAULT ${NOW},
  updated_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE TABLE IF NOT EXISTS ticket_comments (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE TABLE IF NOT EXISTS charges (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  period TEXT,
  amount_cents INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  paid INTEGER NOT NULL DEFAULT 0,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  starts_at TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'autre',
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_charges_user ON charges(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);
`;

// Permet d'écrire les requêtes avec « ? » : converti en $1, $2… pour PostgreSQL.
const toPg = (sql) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };

let backend;
function makeBackend() {
  if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 30000 });
    pool.on('error', (e) => console.error('Erreur base de données :', e.message));
    return {
      query: (sql, params) => pool.query(toPg(sql), params),
      exec: (sql) => pool.query(sql),
      async tx(fn) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const r = await fn({ query: (sql, params) => client.query(toPg(sql), params) });
          await client.query('COMMIT');
          return r;
        } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
      },
      close: () => pool.end(),
    };
  }
  const { PGlite } = require('@electric-sql/pglite');
  const dir = process.env.PGLITE_DIR || path.join(DATA_DIR, 'pgdata');
  if (dir !== 'memory://') fs.mkdirSync(dir, { recursive: true });
  const pg = new PGlite(dir);
  return {
    query: (sql, params) => pg.query(toPg(sql), params),
    exec: (sql) => pg.exec(sql),
    tx: (fn) => pg.transaction((t) => fn({ query: (sql, params) => t.query(toPg(sql), params) })),
    close: () => pg.close(),
  };
}

let ready;
function init() {
  if (!ready) {
    backend = makeBackend();
    ready = backend.exec(SCHEMA).then(() => backend);
  }
  return ready;
}

const db = {
  init,
  async all(sql, ...params) { const b = await init(); return (await b.query(sql, params)).rows; },
  async get(sql, ...params) { const b = await init(); return (await b.query(sql, params)).rows[0]; },
  async run(sql, ...params) { const b = await init(); const r = await b.query(sql, params); return { rows: r.rows, changes: r.rowCount ?? r.affectedRows }; },
  async tx(fn) { const b = await init(); return b.tx(fn); },
  async close() { if (ready) { const b = await ready; ready = null; await b.close(); } },
};

module.exports = { db, DATA_DIR, NOW, TODAY, YESTERDAY };
