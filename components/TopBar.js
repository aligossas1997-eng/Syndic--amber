import Link from 'next/link';
import { logout } from '@/app/actions-auth';

export default function TopBar({ user, links, brand }) {
  return (
    <header className="topbar">
      <span className="brand">{brand}</span>
      <nav>{links.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</nav>
      <div className="user">
        <span>{user.nom} · {user.role === 'syndic' ? 'Syndic' : 'Copropriétaire'}</span>
        <form action={logout}><button>Déconnexion</button></form>
      </div>
    </header>
  );
}
