// Vérifie le cloisonnement des données. Lancer le site (npm start) puis : npm run test:securite
import Database from 'better-sqlite3';
import path from 'node:path';
import { signSession, COOKIE_NAME } from '../lib/token.js';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const db = new Database(process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'syndic.db'), { readonly: true });
let ok = 0, ko = 0;
const check = (nom, cond) => { cond ? ok++ : ko++; console.log(`${cond ? '✅' : '❌'} ${nom}`); };
const get = async (url, uid) => fetch(BASE + url, { redirect: 'manual', headers: uid === undefined ? {} : { cookie: `${COOKIE_NAME}=${typeof uid === 'string' ? uid : await signSession({ uid, v: db.prepare('SELECT password_hash h FROM users WHERE id = ?').get(uid).h.slice(-10) })}` } });

const res = db.prepare("SELECT u.id, u.lot_id, l.numero, l.proprietaire FROM users u JOIN lots l ON l.id = u.lot_id WHERE u.email = 'sophie.martin@demo.fr'").get();
const autre = db.prepare("SELECT l.id, l.numero, l.proprietaire FROM lots l WHERE l.id <> ? LIMIT 1").get(res.lot_id);
const syndic = db.prepare("SELECT id FROM users WHERE role = 'syndic'").get();
const recuAutre = db.prepare('SELECT id FROM paiements WHERE lot_id <> ? LIMIT 1').get(res.lot_id);
const recuPropre = db.prepare('SELECT id FROM paiements WHERE lot_id = ? LIMIT 1').get(res.lot_id);

let r = await get('/resident');
check('Sans connexion : /resident renvoie vers /login', r.status === 307 && r.headers.get('location').includes('/login'));
r = await get('/syndic', 'jeton.falsifie.xyz');
check('Jeton falsifié : /syndic renvoie vers /login', r.status === 307 && r.headers.get('location').includes('/login'));

r = await get('/resident', res.id); const html = await r.text();
check(`Résident : voit son lot ${res.numero}`, r.status === 200 && html.includes(`Lot ${res.numero}`));
check(`Résident : ne voit pas ${autre.proprietaire}`, !html.includes(autre.proprietaire));
for (const url of ['/syndic', '/syndic/lots', `/syndic/lots/${autre.id}`, '/syndic/impayes', '/syndic/paiements', '/syndic/appels']) {
  r = await get(url, res.id);
  check(`Résident : ${url} interdit (renvoi vers /resident)`, r.status === 307 && r.headers.get('location').includes('/resident'));
}
r = await get(`/api/recus/${recuAutre.id}`, res.id);
check("Résident : reçu d'un autre lot introuvable (404)", r.status === 404);
r = await get(`/api/recus/${recuPropre.id}`, res.id);
check('Résident : son propre reçu PDF OK', r.status === 200 && r.headers.get('content-type') === 'application/pdf');
r = await get('/api/export/balance-agee', res.id);
check('Résident : export balance âgée refusé (403)', r.status === 403);
r = await get(`/api/recus/${recuAutre.id}`);
check('Sans connexion : reçu refusé (401)', r.status === 401);

r = await get(`/syndic/lots/${autre.id}`, syndic.id);
check('Syndic : accès à la fiche de n’importe quel lot', r.status === 200 && (await r.text()).includes(autre.proprietaire));
r = await get(`/api/recus/${recuAutre.id}`, syndic.id);
check('Syndic : accès à tous les reçus', r.status === 200);
r = await get('/resident', syndic.id);
check('Syndic : /resident renvoie vers /syndic', r.status === 307);

console.log(`\n${ok} réussis, ${ko} échoués`);
process.exit(ko ? 1 : 0);
