import { eur } from '@/lib/format';
export const TRANCHES = [['nonEchu', 'Non échu'], ['j0_30', '1–30 j'], ['j31_90', '31–90 j'], ['j91_180', '91–180 j'], ['j180p', '> 180 j']];
export function BalanceTotaux({ b }) {
  const total = TRANCHES.slice(1).reduce((s, [k]) => s + b[k], 0);
  return (
    <div className="table-wrap"><table>
      <thead><tr>{TRANCHES.map(([k, l]) => <th key={k} className="num">{l}</th>)}<th className="num">Total échu</th></tr></thead>
      <tbody><tr>{TRANCHES.map(([k]) => <td key={k} className={`num ${k !== 'nonEchu' && b[k] ? 'neg' : ''}`}>{eur(b[k])}</td>)}<td className="num"><strong>{eur(total)}</strong></td></tr></tbody>
    </table></div>
  );
}
