# Données personnelles volontairement non versionnées

Le prototype fourni par le lycée contenait deux fichiers de données qui **ne sont pas versionnés
ici** :

| Fichier | Contenu | Pourquoi il est exclu |
|---|---|---|
| `teachers-data.js` | 380 agents : nom, matricule, spécialité et **numéro de téléphone personnel** | Un dépôt Git conserve l'historique indéfiniment et se duplique à chaque clone. Y verser les coordonnées personnelles de tout le personnel les diffuserait bien au-delà du besoin. |
| `schedule-data.js` | 3 695 lignes de cours, avec le nom de l'enseignant sur chacune | Volumineux et entièrement régénérable depuis le fichier Excel officiel. |

C'est l'application du constat **G-03** de l'audit : les données nominatives du personnel ne doivent
circuler que là où elles sont nécessaires.

## Pour faire fonctionner le prototype

Reprendre les deux fichiers depuis l'archive d'origine (`TeacherWatchApp.zip`) et les replacer dans ce
dossier. Ils se régénèrent aussi depuis les fichiers Excel du lycée.

## Ce qui a été retenu du prototype

Le code (`app.js`, `index.html`, `styles.css`, `enhancements.css`) est conservé comme **référence des
règles métier** décidées par le lycée. Les conventions qui en ont été reprises dans l'application sont
documentées dans [`../analyse-fichiers-reels.md`](../analyse-fichiers-reels.md) :

- une absence vaut **une heure**, quelle que soit la durée réelle de la tranche ;
- les absences **justifiées** restent à l'historique mais sont **exclues des totaux** ;
- les retards et départs anticipés sont qualifiés par **tranche de durée** (moins de 15 min,
  15 à 30 min, plus de 30 min) et ne comptent aucune heure ;
- sur un cours **jumelé**, l'enseignant ne se voit imputer qu'une heure, mais **chaque classe** du
  groupement compte comme touchée ;
- les cinq secteurs sont découpés **par niveau** : A1-A2, A3-A4, Secondes, Premières, Terminales
  (table complète dans [`../modeles/classes-secteurs.csv`](../modeles/classes-secteurs.csv)) ;
- les dix tranches horaires officielles, dont celle de 11h55–12h55 qui dure 60 minutes.
