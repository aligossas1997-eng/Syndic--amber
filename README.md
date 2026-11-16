# Site de gestion syndic – Résidence Les Tilleuls (démo)

Application web pour un syndic de copropriété, avec deux espaces :

| Rôle | Ce qu'il voit |
|---|---|
| **Syndic** | Tous les comptes copropriétaires, les arriérés (balance âgée), les modalités de paiement, les échéanciers, tous les reçus. Il enregistre les paiements, émet les appels de fonds, accorde des échéanciers. |
| **Résident** | Uniquement **son** appartement : solde, arriéré, appels de fonds, paiements, reçus PDF, échéancier, coordonnées bancaires pour payer. |

## Lancer le site sur ton ordinateur

1. Installer **Node.js 22** (ou plus récent) : https://nodejs.org (bouton « LTS »).
2. Ouvrir un terminal dans ce dossier, puis :
   ```bash
   npm install          # installe les dépendances (une seule fois)
   npm run seed         # crée la base de démo (à relancer pour tout remettre à zéro)
   npm run dev          # démarre le site
   ```
3. Ouvrir http://localhost:3000

### Comptes de démo

| Rôle | Email | Mot de passe |
|---|---|---|
| Syndic | `syndic@demo.fr` | `syndic123` |
| Résident à jour | `sophie.martin@demo.fr` | `resident123` |
| Résident en gros impayé | `pierre.dubois@demo.fr` | `resident123` |
| Résident sous échéancier | `mamadou.diallo@demo.fr` | `resident123` |

Tous les résidents : `prenom.nom@demo.fr` / `resident123` (12 lots, bâtiments A et B).

## Fonctionnalités

**Espace syndic**
- *Tableau de bord* : appelé échu, encaissé, arriérés, taux de recouvrement, avances, balance âgée, principaux débiteurs.
- *Comptes copropriétaires* : un tableau de tous les lots (tantièmes, appelé, payé, solde, arriéré, retard, mode de paiement, statut).
- *Fiche lot* : relevé de compte avec solde cumulé, imputation des paiements sur les appels (les plus anciens d'abord), enregistrement d'un paiement (génère un reçu numéroté R-AAAA-NNNN), changement du mode de paiement, création/clôture d'un échéancier, ajout d'un appel individuel (frais, régularisation).
- *Impayés* : balance âgée par lot (non échu, 1–30 j, 31–90 j, 91–180 j, > 180 j) + export CSV qui s'ouvre directement dans Excel.
- *Encaissements* : journal de tous les paiements, totaux par mode de paiement.
- *Appels de fonds* : émission d'un appel global réparti au prorata des tantièmes (l'écart d'arrondi est corrigé pour que la somme tombe juste au centime).

**Accès des résidents** (menu *Accès résidents*)
- Un bouton crée d'un coup les accès de tous les appartements qui n'en ont pas. L'identifiant est l'email du copropriétaire, ou `lot-a01` s'il n'a pas d'email.
- Le site génère un **mot de passe provisoire** et affiche des **fiches imprimables** (une par appartement) à remettre en main propre ou par courrier. Ces mots de passe ne s'affichent qu'une fois.
- À la **première connexion**, le résident doit choisir son propre mot de passe (10 caractères min.) : le syndic ne le connaît jamais.
- Mot de passe oublié : bouton *Nouveau mot de passe*, qui génère une nouvelle fiche et coupe les anciennes sessions. Déménagement : bouton *Désactiver*.
- 8 essais ratés en 15 min bloquent temporairement la connexion.

**Lots** (menu *Comptes copropriétaires*, en bas) : ajout d'un lot, ou **import depuis Excel** par copier-coller des colonnes
`Numéro | Bâtiment | Étage | Type | Surface | Tantièmes | Propriétaire | Email | Téléphone`. Chaque fiche lot a aussi un bloc *Modifier les informations du lot*.
**Paramètres** : nom de la résidence, adresse, nom du syndic, IBAN/BIC affichés aux résidents, budget annuel.

**Espace résident** : son solde, ses arriérés, sa prochaine échéance, ses appels, ses paiements et reçus PDF, son échéancier, l'IBAN et la référence à indiquer pour payer.

## Sécurité (cloisonnement des données)

- Mots de passe hachés (bcrypt), session dans un cookie signé `httpOnly` valable 8 h.
- Le rôle et l'appartement d'un utilisateur sont **toujours relus en base** côté serveur, jamais pris dans l'URL ou le navigateur.
- La page résident n'a pas d'identifiant d'appartement dans l'URL : elle affiche le lot de la personne connectée, point.
- Chaque page et chaque action du syndic revérifie le rôle côté serveur.
- Un reçu PDF d'un autre lot renvoie « introuvable » (404) pour un résident.
- Test automatique : lancer le site, puis `npm run test:securite` (17 vérifications).

## Choix techniques (par défaut)

- **Next.js 16** (React) pour le site, **SQLite** (un simple fichier `data/syndic.db`) pour la base, **pdf-lib** pour les reçus.
- Montants stockés en centimes pour éviter les erreurs d'arrondi.
- **Pas de paiement en ligne** : le syndic enregistre les paiements reçus (virement, prélèvement, chèque, CB, espèces). Un paiement par carte (Stripe) ou par prélèvement SEPA pourra être ajouté plus tard.

## Mise en ligne (Render, gratuit)

Le fichier `render.yaml` décrit tout : il suffit de cliquer sur
[Deploy to Render](https://render.com/deploy?repo=https://github.com/aligossas1997-eng/Syndic--amber/tree/site-syndic),
de se connecter avec GitHub puis de cliquer sur **Deploy Blueprint**. Render installe, construit et démarre le site,
génère tout seul la clé secrète `SESSION_SECRET` et crée les données de démo au premier démarrage.

Limite de l'offre gratuite : le site s'endort après 15 min sans visite (premier chargement ≈ 1 min) et la base SQLite
n'est pas conservée quand il redémarre (on repart des données de démo). Pour un usage réel avec des données durables,
il faudra une base hébergée (PostgreSQL) ou un disque persistant (offre payante).

## Passer en offre payante et garder les données

Le code est déjà prêt : il suffit de dire au site d'écrire sa base sur un **disque persistant**.
Au premier démarrage sur ce disque, les données de démo sont créées une fois, puis **plus jamais écrasées**.

Dans le tableau de bord Render, sur le service `site-syndic` :

1. **Settings → Instance Type** : choisir **Starter** (environ 7 $/mois). Le site ne s'endort plus.
2. **Disks → Add Disk** : nom `donnees`, *Mount Path* `/var/data`, taille **1 GB** (environ 0,25 $/mois).
3. **Environment → Add Environment Variable** : `DATABASE_PATH` = `/var/data/syndic.db`, puis **Save Changes**.
4. Render redéploie tout seul (2–3 min). Les paiements, appels et échéanciers saisis sont désormais conservés.

### Démarrer avec ta vraie copro (sans les données de démo)

À faire **en même temps** que l'ajout du disque (étape 3 ci-dessus), dans *Environment* :

| Variable | Valeur |
|---|---|
| `DEMO` | `false` |
| `ADMIN_EMAIL` | ton email (ce sera ton identifiant syndic) |
| `ADMIN_PASSWORD` | un mot de passe provisoire, que le site te fera changer à la 1re connexion |
| `RESIDENCE_NOM` | le nom de la résidence (modifiable ensuite dans *Paramètres*) |

Au démarrage, le site crée une résidence **vide** avec ton compte syndic. Ensuite :
1. *Paramètres* : adresse, IBAN, budget annuel.
2. *Comptes copropriétaires* → **Importer depuis Excel** tes 20 appartements.
3. *Appels de fonds* : émets le premier appel (réparti aux tantièmes).
4. *Accès résidents* → **Créer les accès manquants** → **Imprimer les fiches**, puis distribue-les.

Une base qui contient déjà des comptes n'est jamais écrasée au redémarrage.
Sauvegarde : Render fait un instantané quotidien du disque (onglet *Disks*).
