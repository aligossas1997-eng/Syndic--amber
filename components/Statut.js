const CLASSES = {
  'À jour': 'b-ok', 'En avance': 'b-ok', 'Payé': 'b-ok', 'Payée': 'b-ok',
  'Sous échéancier': 'b-info', 'À venir': 'b-info', 'Partielle': 'b-warn',
  'Retard < 30 j': 'b-warn', 'Partiel': 'b-warn',
  'Retard 31–90 j': 'b-bad', 'Retard > 90 j': 'b-bad', 'Impayé': 'b-bad', 'En retard': 'b-bad',
};
export default function Statut({ s }) {
  return <span className={`badge ${CLASSES[s] || 'b-info'}`}>{s}</span>;
}
