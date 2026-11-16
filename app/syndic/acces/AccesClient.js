'use client';
import { useActionState } from 'react';
import { genererAcces, basculerActif } from '../actions-acces';

const etat = (r) => !r.identifiant ? ['Pas de compte', 'b-warn'] : !r.actif ? ['Désactivé', 'b-bad'] : r.doit_changer_mdp ? ['Provisoire (en attente 1re connexion)', 'b-info'] : ['Actif', 'b-ok'];
const dt = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export default function AccesClient({ rows, siteUrl, residence }) {
  const [state, action, pending] = useActionState(genererAcces, null);
  const sansCompte = rows.filter((r) => !r.identifiant);
  const confirmer = (msg) => (e) => { if (!window.confirm(msg)) e.preventDefault(); };

  return (
    <>
      <div className="no-print">
        <div className="header-line">
          <div><h1>Accès résidents</h1>
            <p className="muted small">Chaque appartement reçoit un identifiant et un mot de passe provisoire. À sa première connexion, le résident choisit son propre mot de passe : tu ne le connais jamais.</p></div>
          {sansCompte.length > 0 && (
            <form action={action}>
              <input type="hidden" name="mode" value="creer" />
              {sansCompte.map((r) => <input key={r.id} type="hidden" name="lot_id" value={r.id} />)}
              <button className="primary" disabled={pending}>Créer les {sansCompte.length} accès manquants</button>
            </form>
          )}
        </div>
        {state?.error && <div className="alert bad">{state.error}</div>}
      </div>

      {state?.fiches?.length > 0 && (
        <div className="card fiches-zone">
          <div className="no-print header-line">
            <div><h2>{state.fiches.length} fiche(s) d’accès prête(s)</h2>
              <p className="small neg"><strong>Ces mots de passe ne s’affichent qu’une seule fois.</strong> Imprime-les (ou « Enregistrer en PDF ») maintenant, puis remets chaque fiche à son appartement.</p></div>
            <button className="primary" onClick={() => window.print()}>Imprimer les fiches</button>
          </div>
          <div className="fiches">
            {state.fiches.map((f) => (
              <div key={f.numero} className="fiche">
                <div className="fiche-titre">{residence?.nom}</div>
                <div className="small muted">Votre espace copropriétaire en ligne</div>
                <p><strong>{f.proprietaire}</strong> · Lot {f.numero}</p>
                <dl className="info">
                  <dt>Site</dt><dd><code>{siteUrl}</code></dd>
                  <dt>Identifiant</dt><dd><code className="gros">{f.identifiant}</code></dd>
                  <dt>Mot de passe provisoire</dt><dd><code className="gros">{f.mdp}</code></dd>
                </dl>
                <p className="small">À la première connexion, vous choisirez votre propre mot de passe. Vous y retrouverez votre solde, vos appels de fonds, vos paiements et vos reçus. Contact : {residence?.syndic_nom}.</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card table-wrap no-print"><table>
        <thead><tr><th>Lot</th><th>Copropriétaire</th><th>Identifiant</th><th>État</th><th>Dernière connexion</th><th>Actions</th></tr></thead>
        <tbody>{rows.map((r) => {
          const [lib, cls] = etat(r);
          return (
            <tr key={r.id}>
              <td>{r.numero}</td><td>{r.proprietaire}</td>
              <td>{r.identifiant || <span className="muted small">{r.lot_email ? `sera : ${r.lot_email}` : `sera : lot-${r.numero.toLowerCase()}`}</span>}</td>
              <td><span className={`badge ${cls}`}>{lib}</span></td>
              <td>{dt(r.derniere_connexion)}</td>
              <td style={{ display: 'flex', gap: '.4rem' }}>
                <form action={action}>
                  <input type="hidden" name="lot_id" value={r.id} />
                  <input type="hidden" name="mode" value={r.identifiant ? 'reinit' : 'creer'} />
                  <button className="primary small" disabled={pending}
                    onClick={r.identifiant ? confirmer(`Générer un nouveau mot de passe provisoire pour le lot ${r.numero} ? L'ancien ne marchera plus.`) : undefined}>
                    {r.identifiant ? 'Nouveau mot de passe' : 'Créer l’accès'}
                  </button>
                </form>
                {r.identifiant && (
                  <form action={basculerActif}>
                    <input type="hidden" name="lot_id" value={r.id} />
                    <button className="primary small" style={{ background: r.actif ? 'var(--bad)' : 'var(--ok)' }}
                      onClick={r.actif ? confirmer(`Désactiver l'accès du lot ${r.numero} ? Le résident ne pourra plus se connecter.`) : undefined}>
                      {r.actif ? 'Désactiver' : 'Réactiver'}
                    </button>
                  </form>
                )}
              </td>
            </tr>
          );
        })}</tbody>
      </table></div>
    </>
  );
}
