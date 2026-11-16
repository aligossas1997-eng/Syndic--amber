import { randomInt } from 'node:crypto';
// Sans caractères ambigus (0/O, 1/l/I) pour qu'un mot de passe imprimé se recopie sans erreur.
const MAJ = 'ABCDEFGHJKLMNPQRSTUVWXYZ', MIN = 'abcdefghijkmnpqrstuvwxyz', CHI = '23456789';
const pick = (s) => s[randomInt(s.length)];
/** Ex. "Kp7m-Xq4r-Tz9" : 3 blocs de 4 caractères, facile à taper. */
export function motDePasseProvisoire() {
  const bloc = () => pick(MAJ) + pick(MIN) + pick(CHI) + pick(MIN);
  return `${bloc()}-${bloc()}-${bloc()}`;
}
export const MDP_MIN = 10;
