import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getUser } from '@/lib/auth';
import { getDb, getResidence } from '@/lib/db';
import { eur, dateFr, MODES_PAIEMENT } from '@/lib/format';

export const dynamic = 'force-dynamic';

// Les polices PDF standard ne connaissent pas les espaces fines insécables du format français
const txt = (s) => String(s ?? '').replace(/[  ]/g, ' ').replace(/[–—]/g, '-').replace(/[’]/g, "'");

export async function GET(_req, { params }) {
  const user = await getUser();
  if (!user) return new Response('Non connecté', { status: 401 });
  const { id } = await params;
  const p = getDb().prepare('SELECT p.*, l.numero, l.proprietaire, l.batiment, l.etage, l.type FROM paiements p JOIN lots l ON l.id = p.lot_id WHERE p.id = ?').get(Number(id));
  // Contrôle d'accès : un résident ne peut télécharger que les reçus de SON lot.
  // On répond 404 (et pas 403) pour ne même pas révéler que le reçu existe.
  if (!p || (user.role !== 'syndic' && p.lot_id !== user.lot_id)) return new Response('Reçu introuvable', { status: 404 });

  const r = getResidence();
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  const fb = await pdf.embedFont(StandardFonts.HelveticaBold);
  const bleu = rgb(0.12, 0.31, 0.47);
  let y = 790;
  const w = (s, x, size = 11, font = f, color = rgb(0.1, 0.1, 0.1)) => page.drawText(txt(s), { x, y, size, font, color });

  w(r.syndic_nom, 50, 12, fb, bleu); y -= 16;
  w(`Syndic de la ${r.nom}`, 50, 10); y -= 14; w(r.adresse, 50, 10);
  y = 790; w(`REÇU N° ${p.numero_recu}`, 360, 14, fb, bleu); y -= 18; w(`Émis le ${dateFr(p.created_at || p.date)}`, 360, 10);

  y = 680;
  page.drawRectangle({ x: 50, y: y - 10, width: 495, height: 30, color: rgb(0.91, 0.94, 0.97) });
  w('REÇU DE PAIEMENT DE CHARGES DE COPROPRIÉTÉ', 60, 12, fb, bleu);

  y = 630;
  const ligne = (label, val) => { w(label, 60, 11, f, rgb(0.4, 0.4, 0.4)); w(val, 230, 11, fb); y -= 24; };
  ligne('Reçu de', p.proprietaire);
  ligne('Lot', `${p.numero} - Bâtiment ${p.batiment}, étage ${p.etage} (${p.type})`);
  ligne('Date du paiement', dateFr(p.date));
  ligne('Mode de paiement', MODES_PAIEMENT[p.mode] || p.mode);
  if (p.reference) ligne('Référence', p.reference);
  y -= 10;
  page.drawRectangle({ x: 50, y: y - 14, width: 495, height: 40, borderColor: bleu, borderWidth: 1.5 });
  w('MONTANT REÇU', 60, 12, fb, bleu); w(eur(p.montant), 400, 16, fb, bleu);

  y -= 70;
  w(`Le syndic reconnaît avoir reçu la somme de ${eur(p.montant)} au titre des charges de copropriété`, 50, 10);
  y -= 14; w('du lot désigné ci-dessus. Ce montant est imputé sur les appels de fonds les plus anciens restant dus.', 50, 10);
  y -= 50; w(`Fait le ${dateFr(p.date)}`, 330, 10); y -= 16; w(`Pour le syndic, ${r.syndic_nom}`, 330, 10);
  y = 60; w('Document généré automatiquement - à conserver. Ce reçu ne vaut pas quitus pour les sommes restant dues.', 50, 8, f, rgb(0.5, 0.5, 0.5));

  const bytes = await pdf.save();
  return new Response(bytes, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${p.numero_recu}.pdf"`, 'Cache-Control': 'private, no-store' },
  });
}
