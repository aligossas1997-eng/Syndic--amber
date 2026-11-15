'use strict';
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const { db, DATA_DIR } = require('./src/db');
const SqliteStore = require('./src/session-store');
const { loadUser, requireAuth, requireAdmin, csrf, securityHeaders, loginRateLimit, flash } = require('./src/middleware');
const h = require('./src/helpers');

const app = express();
const PORT = process.env.PORT || 3000;
const PROD = process.env.NODE_ENV === 'production';
const SESSION_TTL = 1000 * 60 * 60 * 8; // 8 h
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

let secret = process.env.SESSION_SECRET;
if (!secret) {
  if (PROD) { console.error('SESSION_SECRET est obligatoire en production.'); process.exit(1); }
  secret = crypto.randomBytes(32).toString('hex');
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.locals.h = h;

app.use(securityHeaders);
app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));
app.get('/robots.txt', (req, res) => res.type('text').send('User-agent: *\nDisallow: /\n'));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(session({
  name: 'ambre.sid',
  secret,
  store: new SqliteStore(db, SESSION_TTL),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: SESSION_TTL },
}));
app.use(loadUser);
app.use(csrf);

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx', '.xls', '.xlsx', '.odt', '.ods'].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Type de fichier non autorisé'), ok);
  },
});

const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 12);
const wrap = (fn) => (req, res, next) => { try { fn(req, res, next); } catch (e) { next(e); } };
const intId = (v) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? n : -1; };
const str = (v, max = 5000) => String(v ?? '').trim().slice(0, max);

/* ------------------------------------------------------------------ */
/* Authentification                                                    */
/* ------------------------------------------------------------------ */
app.get('/connexion', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('login', { title: 'Connexion', error: null, email: '' });
});

app.post('/connexion', loginRateLimit, wrap((req, res, next) => {
  const email = str(req.body.email, 200).toLowerCase();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  // Comparaison même si l'utilisateur n'existe pas, pour un temps de réponse constant.
  const hash = user ? user.password_hash : DUMMY_HASH;
  const ok = bcrypt.compareSync(password, hash) && user && user.active;
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
    res.redirect(target);
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

app.get('/', wrap((req, res) => {
  const announcements = db.prepare('SELECT * FROM announcements ORDER BY pinned DESC, created_at DESC LIMIT 4').all();
  const events = db.prepare("SELECT * FROM events WHERE starts_at >= datetime('now', '-1 day') ORDER BY starts_at LIMIT 4").all();
  const tickets = db.prepare("SELECT * FROM tickets WHERE user_id = ? AND status != 'resolu' ORDER BY created_at DESC LIMIT 5").all(req.user.id);
  const due = db.prepare('SELECT COALESCE(SUM(amount_cents),0) AS total, COUNT(*) AS n FROM charges WHERE user_id = ? AND paid = 0').get(req.user.id);
  const nextCharge = db.prepare('SELECT * FROM charges WHERE user_id = ? AND paid = 0 ORDER BY due_date LIMIT 1').get(req.user.id);
  res.render('dashboard', { title: 'Accueil', announcements, events, tickets, due, nextCharge });
}));

/* Annonces ---------------------------------------------------------- */
app.get('/annonces', wrap((req, res) => {
  const cat = h.ANNOUNCEMENT_CATEGORIES[req.query.cat] ? req.query.cat : null;
  const list = cat
    ? db.prepare('SELECT a.*, u.first_name, u.last_name FROM announcements a LEFT JOIN users u ON u.id = a.author_id WHERE category = ? ORDER BY pinned DESC, a.created_at DESC').all(cat)
    : db.prepare('SELECT a.*, u.first_name, u.last_name FROM announcements a LEFT JOIN users u ON u.id = a.author_id ORDER BY pinned DESC, a.created_at DESC').all();
  res.render('announcements', { title: 'Annonces', list, cat });
}));

app.post('/annonces', requireAdmin, wrap((req, res) => {
  const title = str(req.body.title, 200);
  const body = str(req.body.body, 10000);
  const category = h.ANNOUNCEMENT_CATEGORIES[req.body.category] ? req.body.category : 'info';
  if (!title || !body) { flash(req, 'error', 'Titre et contenu obligatoires.'); return res.redirect('/annonces'); }
  db.prepare('INSERT INTO announcements (title, body, category, pinned, author_id) VALUES (?, ?, ?, ?, ?)')
    .run(title, body, category, req.body.pinned ? 1 : 0, req.user.id);
  flash(req, 'success', 'Annonce publiée.');
  res.redirect('/annonces');
}));

app.post('/annonces/:id/supprimer', requireAdmin, wrap((req, res) => {
  db.prepare('DELETE FROM announcements WHERE id = ?').run(intId(req.params.id));
  flash(req, 'success', 'Annonce supprimée.');
  res.redirect('/annonces');
}));

/* Documents --------------------------------------------------------- */
app.get('/documents', wrap((req, res) => {
  const docs = db.prepare('SELECT * FROM documents ORDER BY category, created_at DESC').all();
  const grouped = {};
  for (const d of docs) (grouped[d.category] ||= []).push(d);
  res.render('documents', { title: 'Documents', grouped });
}));

app.get('/documents/:id/telecharger', wrap((req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(intId(req.params.id));
  if (!doc) return res.status(404).render('error', { title: 'Introuvable', message: "Ce document n'existe plus." });
  const file = path.join(UPLOAD_DIR, path.basename(doc.filename));
  if (!fs.existsSync(file)) return res.status(404).render('error', { title: 'Introuvable', message: 'Fichier manquant sur le serveur.' });
  res.set('Cache-Control', 'private, no-store');
  res.download(file, doc.original_name);
}));

app.post('/documents', requireAdmin, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) { flash(req, 'error', err.message); return res.redirect('/documents'); }
    try {
      const title = str(req.body.title, 200);
      const category = h.DOCUMENT_CATEGORIES[req.body.category] ? req.body.category : 'divers';
      if (!req.file || !title) {
        if (req.file) fs.unlinkSync(req.file.path);
        flash(req, 'error', 'Titre et fichier obligatoires.');
        return res.redirect('/documents');
      }
      db.prepare('INSERT INTO documents (title, category, filename, original_name, mime, size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(title, category, req.file.filename, req.file.originalname.slice(0, 200), req.file.mimetype, req.file.size, req.user.id);
      flash(req, 'success', 'Document ajouté.');
      res.redirect('/documents');
    } catch (e) { next(e); }
  });
});

app.post('/documents/:id/supprimer', requireAdmin, wrap((req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(intId(req.params.id));
  if (doc) {
    db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id);
    fs.rm(path.join(UPLOAD_DIR, path.basename(doc.filename)), { force: true }, () => {});
  }
  flash(req, 'success', 'Document supprimé.');
  res.redirect('/documents');
}));

/* Signalements ------------------------------------------------------ */
app.get('/signalements', wrap((req, res) => {
  const isAdmin = req.user.role === 'admin';
  const status = h.TICKET_STATUSES[req.query.statut] ? req.query.statut : null;
  let sql = `SELECT t.*, u.first_name, u.last_name, u.building, u.apartment,
             (SELECT COUNT(*) FROM ticket_comments c WHERE c.ticket_id = t.id) AS comments
             FROM tickets t JOIN users u ON u.id = t.user_id WHERE 1=1`;
  const params = [];
  if (!isAdmin) { sql += ' AND t.user_id = ?'; params.push(req.user.id); }
  if (status) { sql += ' AND t.status = ?'; params.push(status); }
  sql += " ORDER BY CASE t.status WHEN 'ouvert' THEN 0 WHEN 'en_cours' THEN 1 ELSE 2 END, t.created_at DESC";
  const list = db.prepare(sql).all(...params);
  res.render('tickets', { title: 'Signalements', list, status });
}));

app.post('/signalements', wrap((req, res) => {
  const title = str(req.body.title, 200);
  const description = str(req.body.description, 5000);
  if (!title || !description) { flash(req, 'error', 'Merci de renseigner un titre et une description.'); return res.redirect('/signalements'); }
  const category = h.TICKET_CATEGORIES[req.body.category] ? req.body.category : 'autre';
  const priority = h.PRIORITIES[req.body.priority] ? req.body.priority : 'normale';
  const r = db.prepare('INSERT INTO tickets (user_id, title, description, location, category, priority) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.user.id, title, description, str(req.body.location, 200), category, priority);
  flash(req, 'success', 'Signalement envoyé au syndic. Vous serez tenu informé de son avancement.');
  res.redirect(`/signalements/${r.lastInsertRowid}`);
}));

function loadTicket(req) {
  const t = db.prepare(`SELECT t.*, u.first_name, u.last_name, u.building, u.apartment, u.phone, u.email
                        FROM tickets t JOIN users u ON u.id = t.user_id WHERE t.id = ?`).get(intId(req.params.id));
  if (!t) return null;
  if (req.user.role !== 'admin' && t.user_id !== req.user.id) return null;
  return t;
}

app.get('/signalements/:id', wrap((req, res) => {
  const ticket = loadTicket(req);
  if (!ticket) return res.status(404).render('error', { title: 'Introuvable', message: 'Signalement introuvable.' });
  const comments = db.prepare(`SELECT c.*, u.first_name, u.last_name, u.role FROM ticket_comments c
                               LEFT JOIN users u ON u.id = c.user_id WHERE ticket_id = ? ORDER BY c.created_at`).all(ticket.id);
  res.render('ticket', { title: ticket.title, ticket, comments });
}));

app.post('/signalements/:id/commentaires', wrap((req, res) => {
  const ticket = loadTicket(req);
  if (!ticket) return res.status(404).render('error', { title: 'Introuvable', message: 'Signalement introuvable.' });
  const body = str(req.body.body, 3000);
  if (body) {
    db.prepare('INSERT INTO ticket_comments (ticket_id, user_id, body) VALUES (?, ?, ?)').run(ticket.id, req.user.id, body);
    db.prepare("UPDATE tickets SET updated_at = datetime('now') WHERE id = ?").run(ticket.id);
  }
  res.redirect(`/signalements/${ticket.id}`);
}));

app.post('/signalements/:id/statut', requireAdmin, wrap((req, res) => {
  const status = h.TICKET_STATUSES[req.body.status] ? req.body.status : null;
  if (status) {
    db.prepare("UPDATE tickets SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, intId(req.params.id));
    db.prepare('INSERT INTO ticket_comments (ticket_id, user_id, body) VALUES (?, ?, ?)')
      .run(intId(req.params.id), req.user.id, `Statut mis à jour : ${h.TICKET_STATUSES[status]}`);
    flash(req, 'success', 'Statut mis à jour.');
  }
  res.redirect(`/signalements/${intId(req.params.id)}`);
}));

/* Charges ----------------------------------------------------------- */
app.get('/charges', wrap((req, res) => {
  const list = db.prepare('SELECT * FROM charges WHERE user_id = ? ORDER BY due_date DESC').all(req.user.id);
  const totals = db.prepare(`SELECT COALESCE(SUM(CASE WHEN paid = 0 THEN amount_cents END),0) AS due,
                             COALESCE(SUM(CASE WHEN paid = 1 THEN amount_cents END),0) AS paid FROM charges WHERE user_id = ?`).get(req.user.id);
  res.render('charges', { title: 'Mes charges', list, totals });
}));

/* Agenda ------------------------------------------------------------ */
app.get('/agenda', wrap((req, res) => {
  const upcoming = db.prepare("SELECT * FROM events WHERE starts_at >= datetime('now', '-1 day') ORDER BY starts_at").all();
  const past = db.prepare("SELECT * FROM events WHERE starts_at < datetime('now', '-1 day') ORDER BY starts_at DESC LIMIT 10").all();
  res.render('agenda', { title: 'Agenda', upcoming, past });
}));

app.post('/agenda', requireAdmin, wrap((req, res) => {
  const title = str(req.body.title, 200);
  const startsAt = str(req.body.starts_at, 20).replace('T', ' ');
  if (!title || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(startsAt)) { flash(req, 'error', 'Titre et date valides obligatoires.'); return res.redirect('/agenda'); }
  const kind = h.EVENT_KINDS[req.body.kind] ? req.body.kind : 'autre';
  db.prepare('INSERT INTO events (title, description, location, starts_at, kind) VALUES (?, ?, ?, ?, ?)')
    .run(title, str(req.body.description, 3000), str(req.body.location, 200), startsAt + ':00', kind);
  flash(req, 'success', 'Événement ajouté.');
  res.redirect('/agenda');
}));

app.post('/agenda/:id/supprimer', requireAdmin, wrap((req, res) => {
  db.prepare('DELETE FROM events WHERE id = ?').run(intId(req.params.id));
  res.redirect('/agenda');
}));

/* Contacts ---------------------------------------------------------- */
app.get('/contacts', wrap((req, res) => {
  const list = db.prepare('SELECT * FROM contacts ORDER BY sort_order, name').all();
  res.render('contacts', { title: 'Contacts utiles', list });
}));

app.post('/contacts', requireAdmin, wrap((req, res) => {
  const name = str(req.body.name, 200);
  const role = str(req.body.role, 200);
  if (!name || !role) { flash(req, 'error', 'Nom et fonction obligatoires.'); return res.redirect('/contacts'); }
  db.prepare('INSERT INTO contacts (name, role, phone, email, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    .run(name, role, str(req.body.phone, 50), str(req.body.email, 200), str(req.body.notes, 500), intId(req.body.sort_order) < 0 ? 0 : intId(req.body.sort_order));
  res.redirect('/contacts');
}));

app.post('/contacts/:id/supprimer', requireAdmin, wrap((req, res) => {
  db.prepare('DELETE FROM contacts WHERE id = ?').run(intId(req.params.id));
  res.redirect('/contacts');
}));

/* Mon compte -------------------------------------------------------- */
app.get('/mon-compte', (req, res) => res.render('account', { title: 'Mon compte' }));

app.post('/mon-compte', wrap((req, res) => {
  db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(str(req.body.phone, 50), req.user.id);
  flash(req, 'success', 'Coordonnées mises à jour.');
  res.redirect('/mon-compte');
}));

app.get('/mon-compte/mot-de-passe', (req, res) => res.render('password', { title: 'Mot de passe', error: null }));

app.post('/mon-compte/mot-de-passe', wrap((req, res) => {
  const { current, password, confirm } = req.body;
  const render = (error) => res.status(400).render('password', { title: 'Mot de passe', error });
  if (!bcrypt.compareSync(String(current || ''), req.user.password_hash)) return render('Mot de passe actuel incorrect.');
  if (String(password || '').length < 10) return render('Le nouveau mot de passe doit contenir au moins 10 caractères.');
  if (password !== confirm) return render('Les deux mots de passe ne correspondent pas.');
  if (password === current) return render("Le nouveau mot de passe doit être différent de l'actuel.");
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(bcrypt.hashSync(password, 12), req.user.id);
  flash(req, 'success', 'Mot de passe modifié.');
  res.redirect('/');
}));

/* ------------------------------------------------------------------ */
/* Administration (syndic / conseil syndical)                          */
/* ------------------------------------------------------------------ */
app.get('/admin', requireAdmin, wrap((req, res) => {
  const residents = db.prepare('SELECT * FROM users ORDER BY active DESC, building, apartment, last_name').all();
  const stats = {
    residents: db.prepare('SELECT COUNT(*) AS n FROM users WHERE active = 1').get().n,
    openTickets: db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE status != 'resolu'").get().n,
    unpaid: db.prepare('SELECT COALESCE(SUM(amount_cents),0) AS s FROM charges WHERE paid = 0').get().s,
    overdue: db.prepare("SELECT COALESCE(SUM(amount_cents),0) AS s FROM charges WHERE paid = 0 AND due_date < date('now')").get().s,
  };
  const newPassword = req.session.newPassword || null;
  delete req.session.newPassword;
  res.render('admin/index', { title: 'Administration', residents, stats, newPassword });
}));

app.post('/admin/residents', requireAdmin, wrap((req, res) => {
  const email = str(req.body.email, 200).toLowerCase();
  const first = str(req.body.first_name, 100);
  const last = str(req.body.last_name, 100);
  if (!email || !first || !last || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    flash(req, 'error', 'Prénom, nom et email valide obligatoires.');
    return res.redirect('/admin');
  }
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    flash(req, 'error', 'Un compte existe déjà avec cet email.');
    return res.redirect('/admin');
  }
  const tmp = h.generatePassword();
  db.prepare(`INSERT INTO users (email, password_hash, first_name, last_name, phone, building, apartment, lot_number, tantiemes, status, role)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(email, bcrypt.hashSync(tmp, 12), first, last, str(req.body.phone, 50), str(req.body.building, 20), str(req.body.apartment, 20),
      str(req.body.lot_number, 20), Math.max(0, intId(req.body.tantiemes)), req.body.status === 'locataire' ? 'locataire' : 'proprietaire',
      req.body.role === 'admin' ? 'admin' : 'resident');
  req.session.newPassword = { email, password: tmp };
  flash(req, 'success', `Compte créé pour ${first} ${last}.`);
  res.redirect('/admin');
}));

app.post('/admin/residents/:id/reinitialiser', requireAdmin, wrap((req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(intId(req.params.id));
  if (!u) return res.redirect('/admin');
  const tmp = h.generatePassword();
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(bcrypt.hashSync(tmp, 12), u.id);
  db.prepare("DELETE FROM sessions WHERE json_extract(data, '$.userId') = ?").run(u.id);
  req.session.newPassword = { email: u.email, password: tmp };
  res.redirect('/admin');
}));

app.post('/admin/residents/:id/activer', requireAdmin, wrap((req, res) => {
  const id = intId(req.params.id);
  if (id === req.user.id) { flash(req, 'error', 'Vous ne pouvez pas désactiver votre propre compte.'); return res.redirect('/admin'); }
  db.prepare('UPDATE users SET active = 1 - active WHERE id = ?').run(id);
  db.prepare("DELETE FROM sessions WHERE json_extract(data, '$.userId') = ?").run(id);
  res.redirect('/admin');
}));

app.get('/admin/charges', requireAdmin, wrap((req, res) => {
  const residents = db.prepare("SELECT id, first_name, last_name, building, apartment, tantiemes FROM users WHERE active = 1 AND (role = 'resident' OR tantiemes > 0) ORDER BY building, apartment").all();
  const list = db.prepare(`SELECT c.*, u.first_name, u.last_name, u.building, u.apartment FROM charges c
                           JOIN users u ON u.id = c.user_id ORDER BY c.paid, c.due_date DESC LIMIT 300`).all();
  const totalTantiemes = db.prepare("SELECT COALESCE(SUM(tantiemes),0) AS t FROM users WHERE active = 1 AND status = 'proprietaire'").get().t;
  res.render('admin/charges', { title: 'Appels de fonds', residents, list, totalTantiemes });
}));

// Appel de fonds : soit pour un résident, soit réparti sur tous selon les tantièmes.
app.post('/admin/charges', requireAdmin, wrap((req, res) => {
  const label = str(req.body.label, 200);
  const period = str(req.body.period, 50);
  const due = str(req.body.due_date, 10);
  const amount = Math.round(Number.parseFloat(String(req.body.amount || '').replace(',', '.')) * 100);
  if (!label || !/^\d{4}-\d{2}-\d{2}$/.test(due) || !(amount > 0)) {
    flash(req, 'error', 'Libellé, montant et échéance valides obligatoires.');
    return res.redirect('/admin/charges');
  }
  const insert = db.prepare('INSERT INTO charges (user_id, label, period, amount_cents, due_date) VALUES (?, ?, ?, ?, ?)');
  if (req.body.target === 'all') {
    const residents = db.prepare("SELECT id, tantiemes FROM users WHERE active = 1 AND status = 'proprietaire' AND tantiemes > 0").all();
    const total = residents.reduce((s, r) => s + r.tantiemes, 0);
    if (!total) { flash(req, 'error', 'Aucun copropriétaire avec des tantièmes renseignés.'); return res.redirect('/admin/charges'); }
    // Répartition au prorata, le reliquat d'arrondi est affecté aux plus gros restes (méthode du plus fort reste).
    const shares = residents.map((r) => { const exact = (amount * r.tantiemes) / total; return { id: r.id, cents: Math.floor(exact), rest: exact % 1 }; });
    let remainder = amount - shares.reduce((s, x) => s + x.cents, 0);
    shares.sort((a, b) => b.rest - a.rest).forEach((s) => { if (remainder > 0) { s.cents += 1; remainder -= 1; } });
    db.exec('BEGIN');
    try { for (const s of shares) insert.run(s.id, label, period, s.cents, due); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    flash(req, 'success', `Appel de fonds réparti sur ${shares.length} copropriétaires.`);
  } else {
    const uid = intId(req.body.user_id);
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(uid)) { flash(req, 'error', 'Résident introuvable.'); return res.redirect('/admin/charges'); }
    insert.run(uid, label, period, amount, due);
    flash(req, 'success', 'Charge ajoutée.');
  }
  res.redirect('/admin/charges');
}));

app.post('/admin/charges/:id/payee', requireAdmin, wrap((req, res) => {
  db.prepare("UPDATE charges SET paid = 1 - paid, paid_at = CASE WHEN paid = 0 THEN datetime('now') ELSE NULL END WHERE id = ?").run(intId(req.params.id));
  res.redirect('/admin/charges');
}));

app.post('/admin/charges/:id/supprimer', requireAdmin, wrap((req, res) => {
  db.prepare('DELETE FROM charges WHERE id = ?').run(intId(req.params.id));
  res.redirect('/admin/charges');
}));

/* Erreurs ----------------------------------------------------------- */
app.use((req, res) => res.status(404).render('error', { title: 'Page introuvable', message: "Cette page n'existe pas." }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Erreur', message: 'Une erreur est survenue. Réessayez plus tard.' });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Résidence Ambre — espace résidents sur http://localhost:${PORT}`));
}

module.exports = app;
