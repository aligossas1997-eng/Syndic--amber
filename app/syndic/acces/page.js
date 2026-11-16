import { headers } from 'next/headers';
import { requireSyndic } from '@/lib/auth';
import { getDb, getResidence } from '@/lib/db';
import AccesClient from './AccesClient';

export default async function Acces() {
  await requireSyndic();
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host');
  const proto = h.get('x-forwarded-proto') || (host?.startsWith('localhost') ? 'http' : 'https');
  const rows = getDb().prepare(`SELECT l.id, l.numero, l.proprietaire, l.email lot_email, u.email identifiant, u.actif, u.doit_changer_mdp, u.derniere_connexion
    FROM lots l LEFT JOIN users u ON u.lot_id = l.id ORDER BY l.numero`).all();
  return <AccesClient rows={rows} siteUrl={`${proto}://${host}`} residence={getResidence()} />;
}
