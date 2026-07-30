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
- **Classes jumelées** : une absence sur un cours jumelé = **une** ligne, **une** heure
  (colonne Jumelage du fichier d'emploi du temps).
- **Justification** : chaque événement porte un statut « à statuer / justifiée / non justifiée »
  (qualifié par la direction) ; un enseignant en situation couverte (mission, congé de maladie…)
  n'est pas proposé à la saisie sur la période déclarée.
- **Compte protégé** : le compte principal du proviseur ne peut pas être désactivé ; seul le
  proviseur crée des administrateurs et transfère le compte principal à son successeur.
- **Journal d'audit en ajout seul**, sauvegardes quotidiennes (rétention 30 jours),
  traçabilité des exports (empreinte SHA-256), fuseau **Africa/Douala** partout.

## 2. Installation

Prérequis : Node.js ≥ 18. Aucune base de données à installer (SQLite embarqué).

```bash
npm install
npm start          # démarre sur http://localhost:3000
```

Au premier démarrage, l'application crée :

- les 5 secteurs (renommables dans Paramètres) ;
- les 10 tranches horaires **provisoires** (à confirmer dans Paramètres — décision B-01 de l'audit) ;
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

1. **Paramètres** : confirmer les 10 tranches horaires, les jours de cours de la semaine,
   renommer les secteurs ; saisir les fériés et congés connus.
2. **Import personnel** : téléverser le fichier Excel (modèle : [`docs/modeles/personnel.csv`](docs/modeles/personnel.csv)) ;
   vérifier l'aperçu et les anomalies ; publier.
3. **Import emploi du temps** : modèle [`docs/modeles/emploi-du-temps.csv`](docs/modeles/emploi-du-temps.csv) —
   une ligne par cours ; publier après rapprochement complet.
4. **Utilisateurs** : créer les surveillants (un par secteur) et le(s) administrateur(s) ;
   communiquer les mots de passe initiaux de façon sûre.
5. Chaque jour : les surveillants saisissent et soumettent **avant 18 h** ;
   la direction consulte les rapports, exporte en Word, envoie au proviseur.
6. **Sauvegardes** : télécharger régulièrement une copie et la conserver hors du serveur.

## 4. Formats d'import

**Personnel** (`.xlsx` ou `.csv`) — colonnes reconnues (Nom obligatoire) :
`Matricule, Nom, Spécialité, Téléphone`

**Emploi du temps** — une ligne par cours :
`Jour` (lundi…samedi ou 1…6), `Tranche` (1 à 10), `Classe`, `Secteur`,
`Matricule` (ou `Enseignant`), `Matière`, `Jumelage` (même code sur les lignes
des classes jumelées d'un même cours).

L'import se fait toujours en deux temps : **analyse avec aperçu et anomalies**, puis
**publication atomique**. Anomalies bloquantes : matricule dupliqué, ligne sans identité,
enseignant non reconnu dans l'emploi du temps, jour/tranche invalide. Les enseignants absents
d'un nouveau fichier sont **archivés**, jamais supprimés.

## 5. Décisions à valider par le lycée (audit, Lot 0)

L'application fonctionne avec des règles provisoires **paramétrables**, à confirmer :

- **B-01** — horaires exacts des 10 tranches (Paramètres → Tranches) et comptage des retards /
  départs anticipés dans les heures d'absence (Paramètres → Règles ; par défaut : non comptés) ;
- **B-02** — définition des classes jumelées (colonne Jumelage de l'import) ;
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
