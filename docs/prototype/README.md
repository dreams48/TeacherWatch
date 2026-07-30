# TeacherWatch — démonstrateur fonctionnel

Application de suivi des absences du Lycée Technique de Douala Bassa.

## Démarrage

1. Ouvrir `index.html` dans Google Chrome ou Microsoft Edge.
2. Choisir un compte de démonstration.
3. Cliquer sur **Continuer avec Google**.

Les données de démonstration sont enregistrées dans le stockage local du navigateur. Le bouton de réinitialisation, dans le journal d’audit, remet les données initiales.

## Parcours disponibles

- Proviseur et administrateur : tableau de bord des cinq secteurs, validation des rapports, rapports et exports, enseignants, secteurs, imports et audit.
- Le répertoire contient les 316 enseignants actifs et vacataires enseignants relevés dans le fichier du personnel, avec leur matricule, spécialité et contact lorsqu’il est renseigné.
- Le bouton **Retirer** désactive un enseignant sans effacer son historique. **Afficher les retirés** permet ensuite de le retrouver et de le réactiver.
- Le bouton **Modifier** permet notamment de mettre à jour son numéro de téléphone ; l’ancienne et la nouvelle valeur sont inscrites dans l’audit.
- Dans **Secteurs & classes**, le proviseur peut rechercher une classe puis modifier son secteur avec la liste déroulante de la colonne « Nouvelle affectation ».
- Le bouton **Modifier le surveillant** ouvre un formulaire permettant de changer son nom et son adresse Gmail ; le compte de connexion du secteur est mis à jour en même temps.
- Surveillant : saisie uniquement dans son secteur, date du jour verrouillée, enseignant et matière proposés depuis l’emploi du temps, confirmation de chaque événement et soumission du rapport journalier.
- Rapports : journalier, hebdomadaire, mensuel, trimestriel, annuel ou période personnalisée ; exports réels `.xlsx`, `.pdf` et `.docx`.
- Comptage : une absence vaut une heure ; les absences justifiées sont conservées dans l’historique mais exclues des totaux et classements.
- Classes jumelées : une seule heure est comptée pour l’enseignant, tandis que chaque classe est considérée comme touchée.

## Tranches horaires de l’emploi du temps

`07:30–08:20`, `08:20–09:10`, `09:10–10:00`, `10:15–11:05`, `11:05–11:55`, `11:55–12:55`, `12:55–13:45`, `13:45–14:35`, `14:35–15:25` et `15:25–16:15`.

## Comptes de démonstration

- `mvondomekaully@gmail.com` — compte initial de test du proviseur
- `administrateur@teacherwatch.demo`
- `surveillant1@teacherwatch.demo` à `surveillant5@teacherwatch.demo`

Ces comptes simulent les rôles. Aucun mot de passe n’est demandé.

## Passage en production

Le dossier fourni est un démonstrateur autonome. Une mise en production multi-utilisateur nécessite :

- un hébergement HTTPS ;
- un identifiant OAuth Google créé pour TeacherWatch ;
- la vérification des jetons Google côté serveur ;
- une base de données centralisée avec sauvegardes ;
- un service d’envoi d’e-mails pour les rappels de 16 h et les notifications ;
- une tâche planifiée pour le verrouillage à 18 h, heure `Africa/Douala` ;
- la configuration initiale du Gmail officiel du proviseur.

TeacherWatch ne doit jamais demander ni conserver le mot de passe Gmail d’un utilisateur.

## Fichiers

- `index.html` : interface de l’application.
- `app.js` : logique métier, imports et exports.
- `styles.css` et `enhancements.css` : présentation responsive.
- `manifest.webmanifest` : métadonnées d’installation web.
