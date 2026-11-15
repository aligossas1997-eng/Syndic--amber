'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ambre-test-'));
process.env.DATA_DIR = tmp;
// Par défaut : PostgreSQL embarqué en mémoire. TEST_DATABASE_URL permet de tester contre un vrai serveur (base vide).
process.env.PGLITE_DIR = 'memory://';
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else delete process.env.DATABASE_URL;

const bcrypt = require('bcryptjs');
const app = require('../server');
const { db } = require('../src/db');

let server, base;
before(async () => {
  const add = (...a) => db.run(`INSERT INTO users (email, password_hash, first_name, last_name, building, apartment, tantiemes, role, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`, ...a);
  const pw = bcrypt.hashSync('motdepasse-test', 4);
  await add('admin@test.fr', pw, 'Ad', 'Min', '', '', 0, 'admin');
  await add('a@test.fr', pw, 'Alice', 'A', 'A', '1', 333, 'resident');
  await add('b@test.fr', pw, 'Bob', 'B', 'A', '2', 333, 'resident');
  await add('c@test.fr', pw, 'Chloé', 'C', 'B', '3', 334, 'resident');
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

// Petit client HTTP avec gestion du cookie de session et du jeton CSRF.
function client() {
  let cookie = '';
  const req = async (method, url, form) => {
    const res = await fetch(base + url, {
      method, redirect: 'manual',
      headers: { cookie, ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      body: form ? new URLSearchParams(form).toString() : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, location: res.headers.get('location'), text: await res.text() };
  };
  const token = async (url = '/connexion') => (await req('GET', url)).text.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
  return {
    get: (u) => req('GET', u),
    rawPost: (u, form) => req('POST', u, form),
    post: async (u, form, from) => req('POST', u, { _csrf: await token(from), ...form }),
    cookie: () => cookie,
    login: async (email) => req('POST', '/connexion', { _csrf: await token(), email, password: 'motdepasse-test' }),
  };
}

test('toutes les pages privées redirigent vers la connexion sans session', async () => {
  const c = client();
  for (const url of ['/', '/annonces', '/documents', '/documents/1/telecharger', '/signalements', '/charges', '/agenda', '/contacts', '/admin', '/mon-compte']) {
    const r = await c.get(url);
    assert.strictEqual(r.status, 302, url);
    assert.strictEqual(r.location, '/connexion', url);
  }
});

test('documents : dépôt par le syndic, téléchargement réservé aux connectés', async () => {
  const adm = client(); await adm.login('admin@test.fr');
  const page = await adm.get('/documents');
  const token = page.text.match(/_csrf=([a-f0-9]+)/)[1];
  const fd = new FormData();
  fd.append('title', 'PV AG 2026'); fd.append('category', 'ag');
  fd.append('file', new Blob(['%PDF-1.4 contenu secret']), 'pv.pdf');
  const up = await fetch(`${base}/documents?_csrf=${token}`, { method: 'POST', body: fd, redirect: 'manual', headers: { cookie: adm.cookie() } });
  assert.strictEqual(up.status, 302);
  const { id } = await db.get("SELECT id FROM documents WHERE title = 'PV AG 2026'");
  const a = client(); await a.login('a@test.fr');
  const dl = await a.get(`/documents/${id}/telecharger`);
  assert.strictEqual(dl.status, 200);
  assert.ok(dl.text.includes('contenu secret'));
  const anon = client();
  const r = await anon.get(`/documents/${id}/telecharger`);
  assert.strictEqual(r.status, 302);
  assert.ok(!r.text.includes('contenu secret'));
});

test('mauvais mot de passe refusé, bon mot de passe accepté', async () => {
  const c = client();
  const bad = await c.post('/connexion', { email: 'a@test.fr', password: 'faux' });
  assert.strictEqual(bad.status, 401);
  const ok = await c.login('a@test.fr');
  assert.strictEqual(ok.status, 302);
  assert.strictEqual((await c.get('/')).status, 200);
});

test('POST sans jeton CSRF refusé', async () => {
  const c = client();
  await c.login('a@test.fr');
  const r = await c.rawPost('/signalements', { title: 'x', description: 'y', _csrf: 'mauvais' });
  assert.strictEqual(r.status, 403);
  assert.strictEqual((await db.get("SELECT COUNT(*)::int AS n FROM tickets WHERE title = 'x'")).n, 0);
});

test('un résident ne peut pas accéder à l\'administration', async () => {
  const c = client();
  await c.login('a@test.fr');
  assert.strictEqual((await c.get('/admin')).status, 403);
  assert.strictEqual((await c.post('/annonces', { title: 'x', body: 'y' }, '/')).status, 403);
});

test('un résident ne voit pas les signalements des autres', async () => {
  const a = client(); await a.login('a@test.fr');
  const r = await a.post('/signalements', { title: 'Fuite', description: 'Dans la cave' }, '/signalements');
  const id = r.location.split('/').pop();
  assert.strictEqual((await a.get(`/signalements/${id}`)).status, 200);
  const b = client(); await b.login('b@test.fr');
  assert.strictEqual((await b.get(`/signalements/${id}`)).status, 404);
  assert.ok(!(await b.get('/signalements')).text.includes('Fuite'));
});

test('appel de fonds réparti au prorata des tantièmes, au centime près', async () => {
  const c = client(); await c.login('admin@test.fr');
  const r = await c.post('/admin/charges', { label: 'Test', amount: '1000,00', due_date: '2027-01-01', target: 'all' }, '/admin/charges');
  assert.strictEqual(r.status, 302);
  const rows = (await db.all("SELECT amount_cents FROM charges WHERE label = 'Test'")).map((x) => x.amount_cents);
  assert.strictEqual(rows.length, 3);
  assert.strictEqual(rows.reduce((s, x) => s + x, 0), 100000);
  assert.deepStrictEqual(rows.sort(), [33300, 33300, 33400]);
});

test('compte désactivé = accès coupé immédiatement', async () => {
  const b = client(); await b.login('b@test.fr');
  assert.strictEqual((await b.get('/')).status, 200);
  const admin = client(); await admin.login('admin@test.fr');
  const { id } = await db.get("SELECT id FROM users WHERE email = 'b@test.fr'");
  await admin.post(`/admin/residents/${id}/activer`, {}, '/admin');
  assert.strictEqual((await b.get('/')).status, 302);
});
