'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const { db, TODAY, NOW, YESTERDAY } = require('./src/db');
const PgStore = require('./src/session-store');
const { loadUser, requireAuth, requireAdmin, csrf, securityHeaders, loginRateLimit, flash } = require('./src/middleware');
const h = require('./src/helpers');

const app = express();
const PORT = process.env.PORT || 3000;
const PROD = process.env.NODE_ENV === 'production';
const SESSION_TTL = 1000 * 60 * 60 * 8; // 8 h
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 5);

let secret = process.env.SESSION_SECRET;
if (!secret) {
  if (PROD) { console.error('SESSION_SECRET est obligatoire en production.'); process.exit(1); }
  secret = crypto.randomBytes(32).toString('hex');
}
if (PROD && !process.env.DATABASE_URL) {
  console.warn('⚠️  DATABASE_URL absent : la base est stockée localement et peut être effacée par l’hébergeur.');
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.locals.h = h;
app.locals.maxUploadMb = MAX_UPLOAD_MB;

app.use(securityHeaders);
app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));
app.get('/robots.txt', (req, res) => res.type('text').send('User-agent: *\nDisallow: /\n'));
app.get('/sante', (req, res) => res.type('text').send('ok')); // vérification de l'hébergeur
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(session({
  name: 'ambre.sid',
  secret,
  store: new PgStore(db, SESSION_TTL),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: SESSION_TTL },
}));
app.use(loadUser);
app.use(csrf);

// Les documents sont conservés dans la base de données (pas de disque nécessaire chez l'hébergeur).
const ALLOWED_EXT = ['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx', '.xls', '.xlsx', '.odt', '.ods'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ALLOWED_EXT.includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Type de fichier non autorisé (PDF, image, Word, Excel uniquement).'), ok);
  },
});

const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 12);
const wrap = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res, next)).catch(next);
const intId = (v) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) && n > 0 && n < 2 ** 31 ? n : -1; };
const str = (v, max = 5000) => String(v ?? '').trim().slice(0, max);
const notFound = (res, message) => res.status(404).render('error', { title: 'Introuvable', message });

/* ------------------------------------------------------------------ */
/* Authentification                                                    */
/* ------------------------------------------------------------------ */
app.get('/connexion', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('login', { title: 'Connexion', error: null, email: '' });
});

app.post('/connexion', loginRateLimit, wrap(async (req, res, next) => {
  const email = str(req.body.email, 200).toLowerCase();
  const password = String(req.body.password || '');
  const user = await db.get('SELECT * FROM users WHERE email = ?', email);
  // Comparaison même si l'utilisateur n'existe pas, pour un temps de réponse constant.
  const ok = bcrypt.compareSync(password, user ? user.password_hash : DUMMY_HASH) && user && user.active;
  if (!ok) {
    req.registerFailedLogin();
    return res.status(401).render('login', { title: 'Connexion', error: 'Identifiants incorrects ou compte désactivé.', email });
  }
  req.clearFailedLogins();
  const returnTo = req.session.returnTo;
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.userId = user.id;
    const target = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';
    req.session.save(() => res.redirect(target));
  });
}));

app.post('/deconnexion', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('ambre.sid');
    res.redirect('/connexion');
  });
});

/* ------------------------------------------------------------------ */
/* Tout ce qui suit est réservé aux résidents connectés                */
/* ------------------------------------------------------------------ */
app.use(requireAuth);

app.get('/', wrap(async (req, res) => {
  const [announcements, events, tickets, due, nextCharge] = await Promise.all([
    db.all('SELECT * FROM announcements ORDER BY pinned DESC, created_at DESC LIMIT 4'),
    db.all(`SELECT * FROM events WHERE starts_at >= ${YESTERDAY} ORDER BY starts_at LIMIT 4`),
    db.all("SELECT * FROM tickets WHERE user_id = ? AND status != 'resolu' ORDER BY created_at DESC LIMIT 5", req.user.id),
    db.get('SELECT COALESCE(SUM(amount_cents),0)::int AS total, COUNT(*)::int AS n FROM charges WHERE user_id = ? AND paid = 0', req.user.id),
    db.get('SELECT * FROM charges WHERE user_id = ? AND paid = 0 ORDER BY due_date LIMIT 1', req.user.id),
  ]);
  res.render('dashboard', { title: 'Accueil', announcements, events, tickets, due, nextCharge });
}));

/* Annonces ---------------------------------------------------------- */
app.get('/annonces', wrap(async (req, res) => {
  const cat = h.ANNOUNCEMENT_CATEGORIES[req.query.cat] ? req.query.cat : null;
  const base = 'SELECT a.*, u.first_name, u.last_name FROM announcements a LEFT JOIN users u ON u.id = a.author_id';
  const list = cat
    ? await db.all(`${base} WHERE category = ? ORDER BY pinned DESC, a.created_at DESC`, cat)
    : await db.all(`${base} ORDER BY pinned DESC, a.created_at DESC`);
  res.render('announcements', { title: 'Annonces', list, cat });
}));

app.post('/annonces', requireAdmin, wrap(async (req, res) => {
  const title = str(req.body.title, 200);
  const body = str(req.body.body, 10000);
  const category = h.ANNOUNCEMENT_CATEGORIES[req.body.category] ? req.body.category : 'info';
  if (!title || !body) { flash(req, 'error', 'Titre et contenu obligatoires.'); return res.redirect('/annonces'); }
  await db.run('INSERT INTO announcements (title, body, category, pinned, author_id) VALUES (?, ?, ?, ?, ?)',
    title, body, category, req.body.pinned ? 1 : 0, req.user.id);
  flash(req, 'success', 'Annonce publiée.');
  res.redirect('/annonces');
}));

app.post('/annonces/:id/supprimer', requireAdmin, wrap(async (req, res) => {
  await db.run('DELETE FROM announcements WHERE id = ?', intId(req.params.id));
  flash(req, 'success', 'Annonce supprimée.');
  res.redirect('/annonces');
}));

/* Documents --------------------------------------------------------- */
app.get('/documents', wrap(async (req, res) => {
  const docs = await db.all('SELECT id, title, category, original_name, size, created_at FROM documents ORDER BY category, created_at DESC');
  const grouped = {};
  for (const d of docs) (grouped[d.category] ||= []).push(d);
  res.render('documents', { title: 'Documents', grouped });
}));

app.get('/documents/:id/telecharger', wrap(async (req, res) => {
  const doc = await db.get('SELECT * FROM documents WHERE id = ?', intId(req.params.id));
  if (!doc) return notFound(res, "Ce document n'existe plus.");
  res.set('Cache-Control', 'private, no-store');
  res.attachment(doc.original_name);
  res.type(doc.mime || 'application/octet-stream');
  res.send(Buffer.from(doc.content));
}));

app.post('/documents', requireAdmin, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      flash(req, 'error', err.code === 'LIMIT_FILE_SIZE' ? `Fichier trop lourd (${MAX_UPLOAD_MB} Mo maximum). Compressez le PDF et réessayez.` : err.message);
      return res.redirect('/documents');
    }
    (async () => {
      const title = str(req.body.title, 200);
      const category = h.DOCUMENT_CATEGORIES[req.body.category] ? req.body.category : 'divers';
      if (!req.file || !title) { flash(req, 'error', 'Titre et fichier obligatoires.'); return res.redirect('/documents'); }
      await db.run('INSERT INTO documents (title, category, original_name, mime, size, content, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        title, category, req.file.originalname.slice(0, 200), req.file.mimetype, req.file.size, req.file.buffer, req.user.id);
      flash(req, 'success', 'Document ajouté.');
      res.redirect('/documents');
    })().catch(next);
  });
});

app.post('/documents/:id/supprimer', requireAdmin, wrap(async (req, res) => {
  await db.run('DELETE FROM documents WHERE id = ?', intId(req.params.id));
  flash(req, 'success', 'Document supprimé.');
  res.redirect('/documents');
}));

/* Signalements ------------------------------------------------------ */
app.get('/signalements', wrap(async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const status = h.TICKET_STATUSES[req.query.statut] ? req.query.statut : null;
  let sql = `SELECT t.*, u.first_name, u.last_name, u.building, u.apartment,
             (SELECT COUNT(*) FROM ticket_comments c WHERE c.ticket_id = t.id)::int AS comments
             FROM tickets t JOIN users u ON u.id = t.user_id WHERE 1=1`;
  const params = [];
  if (!isAdmin) { sql += ' AND t.user_id = ?'; params.push(req.user.id); }
  if (status) { sql += ' AND t.status = ?'; params.push(status); }
  sql += " ORDER BY CASE t.status WHEN 'ouvert' THEN 0 WHEN 'en_cours' THEN 1 ELSE 2 END, t.created_at DESC";
  const list = await db.all(sql, ...params);
  res.render('tickets', { title: 'Signalements', list, status });
}));

app.post('/signalements', wrap(async (req, res) => {
  const title = str(req.body.title, 200);
  const description = str(req.body.description, 5000);
  if (!title || !description) { flash(req, 'error', 'Merci de renseigner un titre et une description.'); return res.redirect('/signalements'); }
  const category = h.TICKET_CATEGORIES[req.body.category] ? req.body.category : 'autre';
  const priority = h.PRIORITIES[req.body.priority] ? req.body.priority : 'normale';
  const r = await db.get('INSERT INTO tickets (user_id, title, description, location, category, priority) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
    req.user.id, title, description, str(req.body.location, 200), category, priority);
  flash(req, 'success', 'Signalement envoyé au syndic. Vous serez tenu informé de son avancement.');
  res.redirect(`/signalements/${r.id}`);
}));

async function loadTicket(req) {
  const t = await db.get(`SELECT t.*, u.first_name, u.last_name, u.building, u.apartment, u.phone, u.email
                          FROM tickets t JOIN users u ON u.id = t.user_id WHERE t.id = ?`, intId(req.params.id));
  if (!t) return null;
  if (req.user.role !== 'admin' && t.user_id !== req.user.id) return null;
  return t;
}

app.get('/signalements/:id', wrap(async (req, res) => {
  const ticket = await loadTicket(req);
  if (!ticket) return notFound(res, 'Signalement introuvable.');
  const comments = await db.all(`SELECT c.*, u.first_name, u.last_name, u.role FROM ticket_comments c
                                 LEFT JOIN users u ON u.id = c.user_id WHERE ticket_id = ? ORDER BY c.created_at, c.id`, ticket.id);
  res.render('ticket', { title: ticket.title, ticket, comments });
}));

app.post('/signalements/:id/commentaires', wrap(async (req, res) => {
  const ticket = await loadTicket(req);
  if (!ticket) return notFound(res, 'Signalement introuvable.');
  const body = str(req.body.body, 3000);
  if (body) {
    await db.run('INSERT INTO ticket_comments (ticket_id, user_id, body) VALUES (?, ?, ?)', ticket.id, req.user.id, body);
    await db.run(`UPDATE tickets SET updated_at = ${NOW} WHERE id = ?`, ticket.id);
  }
  res.redirect(`/signalements/${ticket.id}`);
}));

app.post('/signalements/:id/statut', requireAdmin, wrap(async (req, res) => {
  const id = intId(req.params.id);
  const status = h.TICKET_STATUSES[req.body.status] ? req.body.status : null;
  if (status && (await db.get('SELECT 1 FROM tickets WHERE id = ?', id))) {
    await db.run(`UPDATE tickets SET status = ?, updated_at = ${NOW} WHERE id = ?`, status, id);
    await db.run('INSERT INTO ticket_comments (ticket_id, user_id, body) VALUES (?, ?, ?)', id, req.user.id, `Statut mis à jour : ${h.TICKET_STATUSES[status]}`);
    flash(req, 'success', 'Statut mis à jour.');
  }
  res.redirect(`/signalements/${id}`);
}));

/* Charges ----------------------------------------------------------- */
app.get('/charges', wrap(async (req, res) => {
  const [list, totals] = await Promise.all([
    db.all('SELECT * FROM charges WHERE user_id = ? ORDER BY due_date DESC', req.user.id),
    db.get(`SELECT COALESCE(SUM(CASE WHEN paid = 0 THEN amount_cents END),0)::int AS due,
            COALESCE(SUM(CASE WHEN paid = 1 THEN amount_cents END),0)::int AS paid FROM charges WHERE user_id = ?`, req.user.id),
  ]);
  res.render('charges', { title: 'Mes charges', list, totals });
}));

/* Agenda ------------------------------------------------------------ */
app.get('/agenda', wrap(async (req, res) => {
  const [upcoming, past] = await Promise.all([
    db.all(`SELECT * FROM events WHERE starts_at >= ${YESTERDAY} ORDER BY starts_at`),
    db.all(`SELECT * FROM events WHERE starts_at < ${YESTERDAY} ORDER BY starts_at DESC LIMIT 10`),
  ]);
  res.render('agenda', { title: 'Agenda', upcoming, past });
}));

app.post('/agenda', requireAdmin, wrap(async (req, res) => {
  const title = str(req.body.title, 200);
  const startsAt = str(req.body.starts_at, 20).replace('T', ' ');
  if (!title || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(startsAt)) { flash(req, 'error', 'Titre et date valides obligatoires.'); return res.redirect('/agenda'); }
  const kind = h.EVENT_KINDS[req.body.kind] ? req.body.kind : 'autre';
  await db.run('INSERT INTO events (title, description, location, starts_at, kind) VALUES (?, ?, ?, ?, ?)',
    title, str(req.body.description, 3000), str(req.body.location, 200), startsAt + ':00', kind);
  flash(req, 'success', 'Événement ajouté.');
  res.redirect('/agenda');
}));

app.post('/agenda/:id/supprimer', requireAdmin, wrap(async (req, res) => {
  await db.run('DELETE FROM events WHERE id = ?', intId(req.params.id));
  res.redirect('/agenda');
}));

/* Contacts ---------------------------------------------------------- */
app.get('/contacts', wrap(async (req, res) => {
  const list = await db.all('SELECT * FROM contacts ORDER BY sort_order, name');
  res.render('contacts', { title: 'Contacts utiles', list });
}));

app.post('/contacts', requireAdmin, wrap(async (req, res) => {
  const name = str(req.body.name, 200);
  const role = str(req.body.role, 200);
  if (!name || !role) { flash(req, 'error', 'Nom et fonction obligatoires.'); return res.redirect('/contacts'); }
  await db.run('INSERT INTO contacts (name, role, phone, email, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
    name, role, str(req.body.phone, 50), str(req.body.email, 200), str(req.body.notes, 500), Math.max(0, intId(req.body.sort_order)));
  res.redirect('/contacts');
}));

app.post('/contacts/:id/supprimer', requireAdmin, wrap(async (req, res) => {
  await db.run('DELETE FROM contacts WHERE id = ?', intId(req.params.id));
  res.redirect('/contacts');
}));

/* Mon compte -------------------------------------------------------- */
app.get('/mon-compte', (req, res) => res.render('account', { title: 'Mon compte' }));

app.post('/mon-compte', wrap(async (req, res) => {
  await db.run('UPDATE users SET phone = ? WHERE id = ?', str(req.body.phone, 50), req.user.id);
  flash(req, 'success', 'Coordonnées mises à jour.');
  res.redirect('/mon-compte');
}));

app.get('/mon-compte/mot-de-passe', (req, res) => res.render('password', { title: 'Mot de passe', error: null }));

app.post('/mon-compte/mot-de-passe', wrap(async (req, res) => {
  const { current, password, confirm } = req.body;
  const render = (error) => res.status(400).render('password', { title: 'Mot de passe', error });
  if (!bcrypt.compareSync(String(current || ''), req.user.password_hash)) return render('Mot de passe actuel incorrect.');
  if (String(password || '').length < 10) return render('Le nouveau mot de passe doit contenir au moins 10 caractères.');
  if (password !== confirm) return render('Les deux mots de passe ne correspondent pas.');
  if (password === current) return render("Le nouveau mot de passe doit être différent de l'actuel.");
  await db.run('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', bcrypt.hashSync(password, 12), req.user.id);
  flash(req, 'success', 'Mot de passe modifié.');
  res.redirect('/');
}));

/* ------------------------------------------------------------------ */
/* Administration (syndic / conseil syndical)                          */
/* ------------------------------------------------------------------ */
app.get('/admin', requireAdmin, wrap(async (req, res) => {
  const [residents, a, b, c, d] = await Promise.all([
    db.all('SELECT * FROM users ORDER BY active DESC, building, apartment, last_name'),
    db.get('SELECT COUNT(*)::int AS n FROM users WHERE active = 1'),
    db.get("SELECT COUNT(*)::int AS n FROM tickets WHERE status != 'resolu'"),
    db.get('SELECT COALESCE(SUM(amount_cents),0)::int AS s FROM charges WHERE paid = 0'),
    db.get(`SELECT COALESCE(SUM(amount_cents),0)::int AS s FROM charges WHERE paid = 0 AND due_date < ${TODAY}`),
  ]);
  const stats = { residents: a.n, openTickets: b.n, unpaid: c.s, overdue: d.s };
  const newPassword = req.session.newPassword || null;
  delete req.session.newPassword;
  res.render('admin/index', { title: 'Administration', residents, stats, newPassword });
}));

app.post('/admin/residents', requireAdmin, wrap(async (req, res) => {
  const email = str(req.body.email, 200).toLowerCase();
  const first = str(req.body.first_name, 100);
  const last = str(req.body.last_name, 100);
  if (!email || !first || !last || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    flash(req, 'error', 'Prénom, nom et email valide obligatoires.');
    return res.redirect('/admin');
  }
  if (await db.get('SELECT 1 FROM users WHERE email = ?', email)) {
    flash(req, 'error', 'Un compte existe déjà avec cet email.');
    return res.redirect('/admin');
  }
  const tmp = h.generatePassword();
  await db.run(`INSERT INTO users (email, password_hash, first_name, last_name, phone, building, apartment, lot_number, tantiemes, status, role)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    email, bcrypt.hashSync(tmp, 12), first, last, str(req.body.phone, 50), str(req.body.building, 20), str(req.body.apartment, 20),
    str(req.body.lot_number, 20), Math.max(0, intId(req.body.tantiemes)), req.body.status === 'locataire' ? 'locataire' : 'proprietaire',
    req.body.role === 'admin' ? 'admin' : 'resident');
  req.session.newPassword = { email, password: tmp };
  flash(req, 'success', `Compte créé pour ${first} ${last}.`);
  res.redirect('/admin');
}));

app.post('/admin/residents/:id/reinitialiser', requireAdmin, wrap(async (req, res) => {
  const u = await db.get('SELECT * FROM users WHERE id = ?', intId(req.params.id));
  if (!u) return res.redirect('/admin');
  const tmp = h.generatePassword();
  await db.run('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?', bcrypt.hashSync(tmp, 12), u.id);
  await db.run('DELETE FROM sessions WHERE user_id = ?', u.id);
  req.session.newPassword = { email: u.email, password: tmp };
  res.redirect('/admin');
}));

app.post('/admin/residents/:id/activer', requireAdmin, wrap(async (req, res) => {
  const id = intId(req.params.id);
  if (id === req.user.id) { flash(req, 'error', 'Vous ne pouvez pas désactiver votre propre compte.'); return res.redirect('/admin'); }
  await db.run('UPDATE users SET active = 1 - active WHERE id = ?', id);
  await db.run('DELETE FROM sessions WHERE user_id = ?', id);
  res.redirect('/admin');
}));

app.get('/admin/charges', requireAdmin, wrap(async (req, res) => {
  const [residents, list, tot] = await Promise.all([
    db.all("SELECT id, first_name, last_name, building, apartment, tantiemes FROM users WHERE active = 1 AND (role = 'resident' OR tantiemes > 0) ORDER BY building, apartment"),
    db.all(`SELECT c.*, u.first_name, u.last_name, u.building, u.apartment FROM charges c
            JOIN users u ON u.id = c.user_id ORDER BY c.paid, c.due_date DESC, u.building, u.apartment LIMIT 300`),
    db.get("SELECT COALESCE(SUM(tantiemes),0)::int AS t FROM users WHERE active = 1 AND status = 'proprietaire'"),
  ]);
  res.render('admin/charges', { title: 'Appels de fonds', residents, list, totalTantiemes: tot.t });
}));

// Appel de fonds : soit pour un résident, soit réparti sur tous selon les tantièmes.
app.post('/admin/charges', requireAdmin, wrap(async (req, res) => {
  const label = str(req.body.label, 200);
  const period = str(req.body.period, 50);
  const due = str(req.body.due_date, 10);
  const amount = Math.round(Number.parseFloat(String(req.body.amount || '').replace(/\s/g, '').replace(',', '.')) * 100);
  if (!label || !/^\d{4}-\d{2}-\d{2}$/.test(due) || !(amount > 0) || amount > 2 ** 31 - 1) {
    flash(req, 'error', 'Libellé, montant et échéance valides obligatoires.');
    return res.redirect('/admin/charges');
  }
  const insertSql = 'INSERT INTO charges (user_id, label, period, amount_cents, due_date) VALUES (?, ?, ?, ?, ?)';
  if (req.body.target === 'all') {
    const residents = await db.all("SELECT id, tantiemes FROM users WHERE active = 1 AND status = 'proprietaire' AND tantiemes > 0");
    const total = residents.reduce((s, r) => s + r.tantiemes, 0);
    if (!total) { flash(req, 'error', 'Aucun copropriétaire avec des tantièmes renseignés.'); return res.redirect('/admin/charges'); }
    // Répartition au prorata, le reliquat d'arrondi est affecté aux plus gros restes (méthode du plus fort reste).
    const shares = residents.map((r) => { const exact = (amount * r.tantiemes) / total; return { id: r.id, cents: Math.floor(exact), rest: exact % 1 }; });
    let remainder = amount - shares.reduce((s, x) => s + x.cents, 0);
    shares.sort((x, y) => y.rest - x.rest).forEach((s) => { if (remainder > 0) { s.cents += 1; remainder -= 1; } });
    await db.tx(async (t) => { for (const s of shares) await t.query(insertSql, [s.id, label, period, s.cents, due]); });
    flash(req, 'success', `Appel de fonds réparti sur ${shares.length} copropriétaires.`);
  } else {
    const uid = intId(req.body.user_id);
    if (!(await db.get('SELECT 1 FROM users WHERE id = ?', uid))) { flash(req, 'error', 'Résident introuvable.'); return res.redirect('/admin/charges'); }
    await db.run(insertSql, uid, label, period, amount, due);
    flash(req, 'success', 'Charge ajoutée.');
  }
  res.redirect('/admin/charges');
}));

app.post('/admin/charges/:id/payee', requireAdmin, wrap(async (req, res) => {
  await db.run(`UPDATE charges SET paid = 1 - paid, paid_at = CASE WHEN paid = 0 THEN ${NOW} ELSE NULL END WHERE id = ?`, intId(req.params.id));
  res.redirect('/admin/charges');
}));

app.post('/admin/charges/:id/supprimer', requireAdmin, wrap(async (req, res) => {
  await db.run('DELETE FROM charges WHERE id = ?', intId(req.params.id));
  res.redirect('/admin/charges');
}));

/* Erreurs ----------------------------------------------------------- */
app.use((req, res) => res.status(404).render('error', { title: 'Page introuvable', message: "Cette page n'existe pas." }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Erreur', message: 'Une erreur est survenue. Réessayez plus tard.' });
});

// Premier démarrage : crée le compte syndic à partir de ADMIN_EMAIL / ADMIN_PASSWORD
// si aucun administrateur n'existe encore (utile chez les hébergeurs sans terminal).
async function bootstrapAdmin() {
  const email = str(process.env.ADMIN_EMAIL, 200).toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!email || !password) return;
  if (await db.get("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1")) return;
  if (password.length < 10) { console.warn('ADMIN_PASSWORD doit contenir au moins 10 caractères : compte syndic non créé.'); return; }
  const existing = await db.get('SELECT id FROM users WHERE email = ?', email);
  if (existing) {
    await db.run("UPDATE users SET role = 'admin', active = 1, password_hash = ?, must_change_password = 1 WHERE id = ?", bcrypt.hashSync(password, 12), existing.id);
  } else {
    await db.run("INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES (?, ?, 'Syndic', 'Résidence Ambre', 'admin')", email, bcrypt.hashSync(password, 12));
  }
  console.log(`Compte syndic créé pour ${email} (mot de passe à changer à la première connexion).`);
}

if (require.main === module) {
  db.init()
    .then(bootstrapAdmin)
    .then(() => app.listen(PORT, () => console.log(`Résidence Ambre — espace résidents sur le port ${PORT}`)))
    .catch((e) => { console.error('Impossible de se connecter à la base de données :', e.message); process.exit(1); });
}

module.exports = app;
