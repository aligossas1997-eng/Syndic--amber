import { requireResident } from '@/lib/auth';
import { getResidence } from '@/lib/db';
import TopBar from '@/components/TopBar';

export const dynamic = 'force-dynamic';

export default async function ResidentLayout({ children }) {
  const user = await requireResident();
  const r = getResidence();
  return (
    <>
      <TopBar user={user} brand={r?.nom || 'Mon espace'} links={[['/resident', 'Mon compte']]} />
      <main>{children}</main>
    </>
  );
}
