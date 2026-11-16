import { requireSyndic } from '@/lib/auth';
import { getResidence } from '@/lib/db';
import TopBar from '@/components/TopBar';

export const dynamic = 'force-dynamic';

export default async function SyndicLayout({ children }) {
  const user = await requireSyndic();
  const r = getResidence();
  return (
    <>
      <TopBar user={user} brand={r?.nom || 'Syndic'} links={[
        ['/syndic', 'Tableau de bord'], ['/syndic/lots', 'Comptes copropriétaires'], ['/syndic/impayes', 'Impayés'],
        ['/syndic/paiements', 'Encaissements'], ['/syndic/appels', 'Appels de fonds'],
      ]} />
      <main>{children}</main>
    </>
  );
}
