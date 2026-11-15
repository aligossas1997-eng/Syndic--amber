'use strict';
const crypto = require('node:crypto');
const { db } = require('./db');

const getUser = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1');

// Charge l'utilisateur connecté et expose des helpers aux vues.
function loadUser(req, res, next) {
  res.locals.user = null;
  if (req.session.userId) {
    const user = getUser.get(req.session.userId);
    if (user) {
      req.user = user;
      res.locals.user = user;
    } else {
      delete req.session.userId;
    }
  }
  res.locals.path = req.path;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
}

// Toute page (sauf connexion) exige un résident authentifié.
function requireAuth(req, res, next) {
  if (!req.user) {
    if (req.method === 'GET') req.session.returnTo = req.originalUrl;
    return res.redirect('/connexion');
  }
  if (req.user.must_change_password && !['/mon-compte/mot-de-passe', '/deconnexion'].includes(req.path)) {
    return res.redirect('/mon-compte/mot-de-passe');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).render('error', { title: 'Accès refusé', message: "Cette section est réservée au conseil syndical / syndic." });
  }
  next();
}

// Protection CSRF par jeton de synchronisation stocké en session.
function csrf(req, res, next) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  res.locals.csrfToken = req.session.csrfToken;
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    // multer remplit req.body après ce middleware pour les formulaires multipart : on accepte aussi l'en-tête / query.
    const token = (req.body && req.body._csrf) || req.get('x-csrf-token') || req.query._csrf;
    const a = Buffer.from(String(token || ''));
    const b = Buffer.from(req.session.csrfToken);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(403).render('error', { title: 'Session expirée', message: 'Le formulaire a expiré. Rechargez la page et réessayez.' });
    }
  }
  next();
}

function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'X-Robots-Tag': 'noindex, nofollow',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'",
  });
  next();
}

// Limiteur simple des tentatives de connexion (par IP + email).
const attempts = new Map();
function loginRateLimit(req, res, next) {
  const key = `${req.ip}|${String((req.body && req.body.email) || '').toLowerCase()}`;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const entry = attempts.get(key) || { count: 0, first: now };
  if (now - entry.first > windowMs) { entry.count = 0; entry.first = now; }
  if (entry.count >= 8) {
    return res.status(429).render('login', { title: 'Connexion', error: 'Trop de tentatives. Réessayez dans 15 minutes.', email: req.body.email || '' });
  }
  req.registerFailedLogin = () => { entry.count += 1; attempts.set(key, entry); };
  req.clearFailedLogins = () => attempts.delete(key);
  next();
}

function flash(req, type, message) {
  req.session.flash = { type, message };
}

module.exports = { loadUser, requireAuth, requireAdmin, csrf, securityHeaders, loginRateLimit, flash };
