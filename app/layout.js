import './globals.css';

export const metadata = { title: 'Gestion syndic', description: 'Espace syndic et copropriétaires' };

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
