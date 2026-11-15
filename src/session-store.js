'use strict';
const session = require('express-session');

// Store de sessions dans PostgreSQL (les connexions survivent aux redémarrages / mises en veille du site).
class PgStore extends session.Store {
  constructor(db, ttlMs) {
    super();
    this.db = db;
    this.ttlMs = ttlMs;
    setInterval(() => { this.db.run('DELETE FROM sessions WHERE expires < ?', Date.now()).catch(() => {}); }, 60 * 60 * 1000).unref();
  }

  expiry(sess) {
    return sess && sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + this.ttlMs;
  }

  get(sid, cb) {
    this.db.get('SELECT data, expires FROM sessions WHERE sid = ?', sid)
      .then((row) => cb(null, row && Number(row.expires) >= Date.now() ? JSON.parse(row.data) : null), cb);
  }

  set(sid, sess, cb) {
    this.db.run(
      `INSERT INTO sessions (sid, data, user_id, expires) VALUES (?, ?, ?, ?)
       ON CONFLICT (sid) DO UPDATE SET data = excluded.data, user_id = excluded.user_id, expires = excluded.expires`,
      sid, JSON.stringify(sess), sess.userId || null, this.expiry(sess)
    ).then(() => cb && cb(null), (e) => cb && cb(e));
  }

  destroy(sid, cb) {
    this.db.run('DELETE FROM sessions WHERE sid = ?', sid).then(() => cb && cb(null), (e) => cb && cb(e));
  }

  touch(sid, sess, cb) {
    this.db.run('UPDATE sessions SET expires = ? WHERE sid = ?', this.expiry(sess), sid).then(() => cb && cb(null), (e) => cb && cb(e));
  }
}

module.exports = PgStore;
