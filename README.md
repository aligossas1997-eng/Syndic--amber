# Résidence Ambre — Espace résidents

Site de gestion de copropriété **privé** : aucune page n'est visible sans être connecté, il n'y a pas d'inscription publique — seuls le syndic / le conseil syndical créent les comptes.

## Fonctionnalités

| Pour les résidents | Pour le syndic / conseil syndical (rôle admin) |
|---|---|
| Tableau de bord (solde, signalements, prochains rendez-vous) | Créer / désactiver des comptes, réinitialiser un mot de passe |
| Annonces (info, travaux, urgent, vie de la résidence) | Publier / épingler / supprimer des annonces |
| Documents : PV d'AG, règlement, comptes, contrats… | Déposer des documents (PDF, Word, Excel, images — 15 Mo max) |
| Signalements d'incidents avec suivi et échanges | Voir tous les signalements, changer leur statut, répondre |
| Mes charges : appels de fonds, payé / à payer / en retard | Émettre un appel de fonds réparti **au prorata des tantièmes**, pointer les paiements |
| Agenda (AG, conseil syndical, travaux, fêtes) | Ajouter / supprimer des événements |
| Contacts utiles + numéros d'urgence | Gérer les contacts |

## Sécurité

- Connexion obligatoire sur toutes les pages, documents téléchargeables uniquement par un résident connecté (jamais servis en statique).
- Mots de passe hachés (bcrypt), mot de passe temporaire à changer à la première connexion (10 caractères min.).
- Limitation des tentatives de connexion (8 essais / 15 min), session régénérée à la connexion, expiration après 8 h d'inactivité.
- Jetons CSRF sur tous les formulaires, cookies `HttpOnly` / `SameSite` (et `Secure` en production), en-têtes de sécurité (CSP, anti-iframe…).
- Site exclu des moteurs de recherche (`robots.txt` + `noindex`).
- Un compte désactivé perd l'accès immédiatement (ses sessions sont supprimées).

## Installation

Prérequis : **Node.js 22.13 ou plus récent** (la base SQLite est intégrée à Node, rien d'autre à installer).

```bash
npm install
npm run create-admin -- syndic@exemple.fr Prénom Nom   # affiche un mot de passe temporaire
npm start                                               # http://localhost:3000
```

Pour tester avec des données fictives (base vide uniquement) :

```bash
npm run seed-demo
# admin : syndic@residence-ambre.fr / résident : marie.leroy@exemple.fr — mot de passe : demo-ambre-2026
```

Tests automatisés : `npm test`.

## Mise en production

Variables d'environnement :

| Variable | Rôle |
|---|---|
| `NODE_ENV=production` | Active les cookies sécurisés (HTTPS obligatoire) |
| `SESSION_SECRET` | **Obligatoire** en production — longue chaîne aléatoire (`openssl rand -hex 32`) |
| `PORT` | Port d'écoute (3000 par défaut) |
| `DATA_DIR` | Dossier de la base et des fichiers déposés (`./data` par défaut) |

Le site doit être servi en **HTTPS** (Render, Railway, Fly.io, un VPS derrière Caddy/Nginx…). Le dossier `DATA_DIR` doit être sur un **disque persistant** et **sauvegardé régulièrement** : il contient la base `ambre.db` et les documents.

## Structure

```
server.js            routes et configuration
src/db.js            schéma de la base SQLite
src/middleware.js    authentification, droits, CSRF, en-têtes de sécurité
src/helpers.js       formats (dates, euros), libellés
views/               pages (EJS)
public/              CSS, favicon, petit script de confirmation
scripts/             création d'admin, données de démo
test/                tests automatisés
```
