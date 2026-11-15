# Résidence Ambre — Espace résidents

Site de gestion de copropriété **privé** : aucune page n'est visible sans être connecté, il n'y a pas d'inscription publique — seuls le syndic / le conseil syndical créent les comptes.

## Fonctionnalités

| Pour les résidents | Pour le syndic / conseil syndical (rôle admin) |
|---|---|
| Tableau de bord (solde, signalements, prochains rendez-vous) | Créer / désactiver des comptes, réinitialiser un mot de passe |
| Annonces (info, travaux, urgent, vie de la résidence) | Publier / épingler / supprimer des annonces |
| Documents : PV d'AG, règlement, comptes, contrats… | Déposer des documents (PDF, Word, Excel, images — 5 Mo max par défaut) |
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

## Installation (sur ton ordinateur, pour tester)

Prérequis : **Node.js 20 ou plus récent**. Sans configuration, le site utilise une base PostgreSQL embarquée (dossier `data/`), rien d'autre à installer.

```bash
npm install
npm run seed-demo        # données fictives (optionnel)
npm start                # http://localhost:3000
```

Comptes de démo : `syndic@residence-ambre.fr` (admin) et `marie.leroy@exemple.fr` (résident), mot de passe `demo-ambre-2026`.

Tests automatisés : `npm test` (ou `TEST_DATABASE_URL=postgres://… npm test` pour tester contre un vrai serveur PostgreSQL vide).

## Mise en ligne gratuite (Render + Neon)

Les données (comptes, charges, signalements **et documents**) sont stockées dans une base **PostgreSQL hébergée**, par exemple chez [Neon](https://neon.tech) (offre gratuite). L'hébergeur du site (ex. [Render](https://render.com), offre Free) n'a donc besoin d'aucun disque : il peut se mettre en veille ou redémarrer sans rien perdre.

1. **Neon** : créer un projet, copier la *connection string* (`postgresql://…?sslmode=require`).
2. **Render** : New → Web Service → ce dépôt, Build `npm install`, Start `npm start`, offre **Free**, puis les variables :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | la connection string Neon (**secrète**) |
| `SESSION_SECRET` | longue chaîne aléatoire (**secrète**) |
| `NODE_ENV` | `production` (cookies sécurisés, HTTPS obligatoire) |
| `ADMIN_EMAIL` | email du premier compte syndic |
| `ADMIN_PASSWORD` | son mot de passe provisoire (10 caractères min., à changer à la 1re connexion) |
| `MAX_UPLOAD_MB` | optionnel, taille max d'un document (5 par défaut) |

3. Au premier démarrage, si aucun administrateur n'existe, le compte syndic est créé avec `ADMIN_EMAIL` / `ADMIN_PASSWORD` (ces variables sont ensuite ignorées ; vous pouvez les supprimer). Alternative depuis un ordinateur, avec la même `DATABASE_URL` :

```bash
DATABASE_URL="postgresql://…" npm run create-admin -- email@exemple.ma Prénom Nom
```

(Sous Windows PowerShell : `$env:DATABASE_URL="postgresql://…"; npm run create-admin -- email@exemple.ma Prénom Nom`.)

Limites de l'offre gratuite : le site s'endort après 15 min sans visite (premier chargement ≈ 30 à 60 s) et Neon offre ≈ 0,5 Go. Pour plus de confort, passer Render en offre Starter : rien d'autre à changer.

## Structure

```
server.js            routes et configuration
src/db.js            base PostgreSQL (Neon en ligne, PGlite en local)
src/middleware.js    authentification, droits, CSRF, en-têtes de sécurité
src/helpers.js       formats (dates, euros), libellés
views/               pages (EJS)
public/              CSS, favicon, petit script de confirmation
scripts/             création d'admin, données de démo
test/                tests automatisés
```
