const nf = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
export const eur = (cents) => nf.format((cents || 0) / 100);
export const pct = (x) => `${(x * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
export const dateFr = (iso) => (iso ? new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('fr-FR') : '');

/** "1 234,56" ou "1234.56" -> 123456 centimes. Renvoie NaN si invalide. */
export function parseMontant(str) {
  const s = String(str ?? '').replace(/[\s  €]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(parseFloat(s) * 100);
}

export const MODES_PAIEMENT = {
  virement: 'Virement',
  prelevement: 'Prélèvement automatique',
  cheque: 'Chèque',
  carte: 'Carte bancaire',
  especes: 'Espèces',
};
export const CATEGORIES = {
  budget: 'Budget prévisionnel',
  travaux: 'Travaux (hors budget)',
  regularisation: 'Régularisation de charges',
  frais: 'Frais de recouvrement',
};
