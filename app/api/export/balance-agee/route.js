import { getUser } from '@/lib/auth';
import { vueGlobale } from '@/lib/finance';

export const dynamic = 'force-dynamic';

const n = (c) => (c / 100).toFixed(2).replace('.', ','); // format Excel français
export async function GET() {
  const user = await getUser();
  if (!user || user.role !== 'syndic') return new Response('Accès refusé', { status: 403 });
  const v = vueGlobale();
  const lignes = [['Lot', 'Copropriétaire', 'Tantièmes', 'Mode paiement', 'Appelé', 'Payé', 'Solde', 'Non échu', '1-30 j', '31-90 j', '91-180 j', '>180 j', 'Arriéré total', 'Retard max (j)', 'Statut']];
  for (const c of v.comptes) {
    const b = c.balance;
    lignes.push([c.lot.numero, c.lot.proprietaire, c.lot.tantiemes, c.lot.mode_paiement, n(c.totalAppele), n(c.totalPaye), n(c.solde), n(b.nonEchu), n(b.j0_30), n(b.j31_90), n(b.j91_180), n(b.j180p), n(c.arriere), c.retardMax, c.statut]);
  }
  const csv = '﻿' + lignes.map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="balance-agee-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
