'use strict';
const session = require('express-session');

// Store de sessions persistant dans SQLite (évite le MemoryStore, inadapté en production).
class SqliteStore extends session.Store {
  constructor(db, ttlMs) {
    super();
    this.db = db;
    this.ttlMs = ttlMs;
    this.getStmt = db.prepare('SELECT data, expires FROM sessions WHERE sid = ?');
    this.setStmt = db.prepare(
      'INSERT INTO sessions (sid, data, expires) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires = excluded.expires'
    );
    this.delStmt = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.touchStmt = db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?');
    this.cleanStmt = db.prepare('DELETE FROM sessions WHERE expires < ?');
    setInterval(() => this.cleanStmt.run(Date.now()), 60 * 60 * 1000).unref();
  }

  expiry(sess) {
    return sess && sess.cookie && sess.cookie.expires
      ? new Date(sess.cookie.expires).getTime()
      : Date.now() + this.ttlMs;
  }

  get(sid, cb) {
    try {
      const row = this.getStmt.get(sid);
      if (!row || row.expires < Date.now()) return cb(null, null);
      cb(null, JSON.parse(row.data));
    } catch (e) { cb(e); }
  }

  set(sid, sess, cb) {
    try { this.setStmt.run(sid, JSON.stringify(sess), this.expiry(sess)); cb && cb(null); } catch (e) { cb && cb(e); }
  }

  destroy(sid, cb) {
    try { this.delStmt.run(sid); cb && cb(null); } catch (e) { cb && cb(e); }
  }

  touch(sid, sess, cb) {
    try { this.touchStmt.run(this.expiry(sess), sid); cb && cb(null); } catch (e) { cb && cb(e); }
  }
}

module.exports = SqliteStore;
