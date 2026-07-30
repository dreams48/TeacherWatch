# TeacherWatch

Suivi quotidien des absences, retards et départs anticipés des enseignants —
**Lycée Technique de Douala Bassa**. Application web interne, en français,
utilisable sur téléphone, tablette et ordinateur.

Ce dépôt contient le **MVP** défini par la feuille de route
([`docs/feuille-de-route-v1.0.md`](docs/feuille-de-route-v1.0.md)) corrigé des
constats de l'audit ([`docs/audit-cahier-des-charges.md`](docs/audit-cahier-des-charges.md)).

---

## 1. Ce que fait l'application

| Rôle | Capacités |
|---|---|
| **Surveillant** | saisie guidée des événements de **son secteur uniquement** (pré-remplissage depuis l'emploi du temps du jour), brouillons, soumissions multiples, soumission « aucune absence », consultation de l'emploi du temps de son secteur |
| **Administrateur** | tout ce qui précède sur tous les secteurs + imports (personnel, emploi du temps), rapports et exports Word, gestion des surveillants, paramètres, corrections motivées |
| **Proviseur** | tout + gestion des administrateurs, transfert du compte principal, correction du classement des journées |

Règles clés implémentées :

- **Verrouillage** : un événement soumis est immuable pour le surveillant ; seules les corrections
  de la direction, **motivées et tracées** (avant/après), sont possibles.
- **Journée** : rappel à 16 h (bandeau + e-mail), verrouillage à 18 h, classement automatique
  « journée sans cours » si aucun secteur n'a transmis — **uniquement les jours de cours** du
  calendrier (fériés et congés déclarés dans Paramètres).
- **Statuts par secteur** : Non concerné (pas de cours ce jour) / En attente / Soumis sans absence /
  Soumis avec événements / Non soumis.
- **Instantanés** : chaque événement recopie à sa création le nom, matricule, classe, matière et
  horaire. Un réimport du personnel ou de l'emploi du temps **ne modifie jamais un rapport passé**.
- **Idempotence** : chaque événement et chaque soumission porte un UUID généré côté client ;
  un double envoi (double clic, reconnexion) ne crée jamais de doublon.
- **Classes jumelées** : détectées automatiquement (même enseignant, même tranche, plusieurs
  classes). Une absence sur un cours jumelé = **une** ligne et **une** heure pour l'enseignant,
  tandis que **chaque classe** du groupement compte comme touchée. Un groupement sur neuf est à
  cheval sur deux secteurs : le contrôle des doublons porte donc sur tous les secteurs, et le second
  surveillant voit que l'absence est déjà déclarée et par quel secteur.
- **Comptage** : une absence vaut **une heure**, quelle que soit la durée de la tranche. Les absences
  **justifiées** restent à l'historique mais sont **exclues des totaux**. Les retards et départs
  anticipés ne comptent aucune heure : ils sont qualifiés par tranche de durée (moins de 15 min,
  15 à 30 min, plus de 30 min).
- **Justification** : chaque événement porte un statut « à statuer / justifiée / non justifiée »
  (qualifié par la direction) ; un enseignant en situation couverte (mission, congé de maladie…)
  n'est pas proposé à la saisie sur la période déclarée.
- **Compte protégé** : le compte principal du proviseur ne peut pas être désactivé ; seul le
  proviseur crée des administrateurs et transfère le compte principal à son successeur.
- **Journal d'audit en ajout seul**, sauvegardes quotidiennes (rétention 30 jours),
  traçabilité des exports (empreinte SHA-256), fuseau **Africa/Douala** partout.

## 2. Installation

Prérequis : Node.js **20 ou plus** (22 LTS conseillé). Aucune base de données à installer
(SQLite est embarqué dans l'application).

> **Important** — les commandes ci-dessous se tapent dans un **terminal**, pas dans Node.js.
> Si votre fenêtre affiche « Welcome to Node.js » et une invite `>`, vous êtes dans l'interpréteur
> JavaScript : `git` et `npm` y sont refusés. Fermez-le avec **Ctrl+D**, puis ouvrez :
> - **Windows** : menu Démarrer → taper `powershell` → *Windows PowerShell*
>   (n'ouvrez pas « Node.js », qui lance l'interpréteur) ;
> - **macOS** : Applications → Utilitaires → *Terminal* ;
> - **Linux** : votre terminal habituel.

```bash
npm install
npm start          # démarre sur http://localhost:3000
```

Au premier démarrage, l'application crée :

- les 5 secteurs (renommables dans Paramètres ; découpage par niveau du lycée :
  A1-A2, A3-A4, Secondes, Premières, Terminales) ;
- les **10 tranches horaires réelles** du lycée, relevées dans son emploi du temps
  (neuf de 50 min, celle de 11h55–12h55 de 60 min) ;
- le compte proviseur : `mvondomekaully@gmail.com` / `ChangezMoi2026!`
  (changement de mot de passe **obligatoire** à la première connexion).

Variables d'environnement (toutes facultatives) :

| Variable | Rôle |
|---|---|
| `PORT` | port d'écoute (défaut 3000) |
| `DATA_DIR` | dossier des données, imports et sauvegardes (défaut `./data`) |
| `PROVISEUR_EMAIL`, `PROVISEUR_MDP` | compte initial (premier démarrage seulement) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | serveur d'envoi d'e-mails ; sans configuration, les envois sont journalisés « non_configure » et rien n'est perdu |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BASE_URL` | active le bouton « Continuer avec Google » (liste blanche : seuls les comptes créés par la direction passent) |

## 3. Mise en route au lycée (ordre conseillé)

1. **Paramètres** : vérifier les 10 tranches horaires et les jours de cours de la semaine ;
   saisir les fériés et congés connus.
2. **Import personnel** : téléverser le fichier Excel (modèle : [`docs/modeles/personnel.csv`](docs/modeles/personnel.csv)) ;
   vérifier l'aperçu et les anomalies ; publier.
3. **Import emploi du temps** : votre fichier peut être téléversé **tel quel**
   (modèle : [`docs/modeles/emploi-du-temps.csv`](docs/modeles/emploi-du-temps.csv)) ;
   publier après rapprochement complet des enseignants.
4. **Utilisateurs** : créer les surveillants (un par secteur) et le(s) administrateur(s) ;
   communiquer les mots de passe initiaux de façon sûre.
5. Chaque jour : les surveillants saisissent et soumettent **avant 18 h** ;
   la direction consulte les rapports, exporte en Word, envoie au proviseur.
6. **Sauvegardes** : télécharger régulièrement une copie et la conserver hors du serveur.

## 4. Formats d'import

**Personnel** (`.xlsx` ou `.csv`) — colonnes reconnues (Nom obligatoire) :
`Matricule`, `Nom` (ou `Noms et prénoms`), `Spécialité` (ou `Discipline`),
`Téléphone` (ou `Contact`), `Observation`.

Le fichier du lycée est accepté **tel quel** : l'application lit **toutes les
feuilles** (titulaires, vacataires, personnel hors du pays) et trouve seule la
ligne d'en-tête, où qu'elle se trouve. La colonne `Observation` alimente la
situation administrative. Un matricule valant « vacataire » est traité comme
absent. Une même personne présente sur deux feuilles est fusionnée ; seul un
matricule porté par **deux personnes différentes** bloque la publication.

**Emploi du temps** — une ligne par cours, au format du fichier du lycée :
`Heure` (ex. `07H30 – 08H20`), `Classe`, `Jour` (Lundi…Vendredi), `Matière`,
`Enseignant`. Les colonnes `Tranche`, `Secteur`, `Matricule` et `Jumelage` sont
acceptées si elles existent, mais ne sont pas nécessaires :

- l'heure est rapprochée des dix tranches officielles ; la casse et les deux
  coquilles connues (`11H45 – 12H55`, `11H55 – 12H56`) sont corrigées et signalées ;
- le secteur vient de la table classe → secteur
  ([`docs/modeles/classes-secteurs.csv`](docs/modeles/classes-secteurs.csv)), ou du
  préfixe de la classe (A1/A2, A3/A4, 2NDE, P, T) ;
- les **classes jumelées sont détectées seules** : un même enseignant sur la même
  tranche et le même jour dans plusieurs classes forme un groupement ;
- une ligne **sans enseignant** (Bibliothèque, Pause, Orientation) est conservée
  comme créneau non pédagogique et n'attend aucune déclaration d'absence.

L'import se fait toujours en deux temps : **analyse avec aperçu et anomalies**, puis
**publication atomique**. Anomalies bloquantes : matricule dupliqué, ligne sans identité,
enseignant non reconnu dans l'emploi du temps, jour/tranche invalide. Les enseignants absents
d'un nouveau fichier sont **archivés**, jamais supprimés.

## 5. Décisions à valider par le lycée (audit, Lot 0)

L'application fonctionne avec des règles provisoires **paramétrables**, à confirmer :

- **B-01** — les horaires des 10 tranches sont ceux du fichier réel ; reste à confirmer le comptage
  en « une heure par tranche » (règle en vigueur, reprise du prototype) ou en heures réelles
  (Paramètres → Règles) ;
- **secteurs** — le découpage par niveau (A1-A2, A3-A4, Secondes, Premières, Terminales) est repris du
  prototype : à confirmer, ainsi que le rattachement des surveillants (4 postes pour 5 secteurs) ;
- **B-03** — calendrier des jours de cours (Paramètres → Calendrier) ;
- **B-06** — mode d'envoi des rapports (par défaut : consolidé, e-mail à la demande) ;
- **G-02** — créer les comptes de production (hébergement, domaine, SMTP) au nom d'une adresse
  institutionnelle du lycée, pas d'une personne.

## 6. Mise en production

- Servir **derrière HTTPS** (obligatoire) : reverse proxy Caddy ou Nginx + certificat.
- Lancer avec un gestionnaire de processus (`systemd` ou `pm2`) pour le redémarrage automatique.
- `DATA_DIR` sur un disque sauvegardé ; copier régulièrement `data/sauvegardes/` hors du serveur.
- Le dossier `data/` contient **toutes** les données : le sauvegarder = sauvegarder l'application.

Exemple d'unité systemd :

```ini
[Unit]
Description=TeacherWatch
After=network.target

[Service]
WorkingDirectory=/opt/teacherwatch
ExecStart=/usr/bin/node server.js
Restart=always
Environment=PORT=3000
Environment=DATA_DIR=/var/lib/teacherwatch

[Install]
WantedBy=multi-user.target
```

## 7. Tests

Un scénario de bout en bout (38 vérifications) couvre : connexion et liste blanche, changement de
mot de passe forcé, imports avec anomalies, cloisonnement par secteur (interface **et** serveur),
idempotence, doublons, immuabilité après soumission, corrections motivées, rapport avec fusion des
classes jumelées, export Word, journalisation des envois, protection du compte principal,
révocation de session, sauvegarde et journal d'audit — voir `docs/tests-mvp.md`.

## 8. Architecture

Monolithe Node.js/Express + SQLite (`better-sqlite3`), rendu serveur (EJS), sans dépendance à un
service externe. Choix assumé pour un usage interne mono-établissement (audit I-12/I-13) : rien à
administrer, sauvegarde = copie d'un fichier. Le schéma isole les écritures dans des transactions ;
une migration vers PostgreSQL reste possible si le projet devient multi-établissements.

```
server.js               point d'entrée + tableau de bord + planificateur
src/db.js               schéma SQLite + réglages
src/helpers.js          fuseau Douala, audit, sessions, contrôle des rôles
src/seed.js             amorçage (secteurs, tranches, proviseur)
src/routes/auth.js      connexion locale + Google OAuth optionnel
src/routes/evenements.js saisie, soumissions, verrouillage, corrections
src/routes/imports.js   imports personnel et emploi du temps (aperçu → publication)
src/routes/admin.js     utilisateurs, paramètres, calendrier, audit, sauvegardes
src/routes/rapports.js  rapports, export Word, envoi, consultation EDT
src/services/           rapport.js, docx.js, mail.js, scheduler.js
views/                  gabarits EJS (interface en français)
```
