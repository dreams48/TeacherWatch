# TeacherWatch — Feuille de route révisée après audit

**Établissement :** Lycée Technique de Douala Bassa  
**Application :** TeacherWatch  
**Version du document :** 1.0  
**Date :** 30 juillet 2026  
**Statut :** feuille de route de référence pour le passage du prototype à la production

---

## 1. Objet du document

Cette feuille de route remplace le premier découpage du projet. Elle tient compte :

- de l’audit fonctionnel et technique du prototype ;
- des décisions prises avec le lycée ;
- des risques liés aux imports Excel, aux connexions Internet et aux autorisations ;
- de la nécessité de livrer d’abord un MVP fiable avant les fonctions avancées.

Le projet sera réalisé par lots. Chaque lot devra être vérifié et accepté avant le démarrage du suivant.

---

## 2. Situation actuelle

Le prototype local permet déjà de démontrer :

- la gestion de cinq secteurs ;
- la consultation du personnel et de l’emploi du temps ;
- la saisie d’absences, de retards et de départs anticipés ;
- les soumissions multiples dans une journée ;
- le verrouillage des événements soumis ;
- les rapports et les premiers exports ;
- la gestion des enseignants, des surveillants et des secteurs.

Le prototype n’est toutefois pas une version de production, car :

- les données sont conservées dans le navigateur ;
- plusieurs utilisateurs ne peuvent pas travailler sur une base commune ;
- la connexion Google est simulée ;
- les autorisations sont principalement contrôlées dans l’interface ;
- les imports ne reconstruisent pas encore entièrement et sûrement les données ;
- l’envoi réel par Gmail n’est pas intégré ;
- les sauvegardes et la restauration ne sont pas opérationnelles.

---

## 3. Principes retenus après l’audit

### 3.1 Réduction du MVP

Le MVP doit permettre au lycée de réaliser correctement le travail quotidien essentiel. Les statistiques avancées, WhatsApp et certaines options d’export seront livrés après le pilote.

### 3.2 Une base de données centralisée

Tous les utilisateurs doivent consulter la même information, quel que soit l’appareil utilisé. Le stockage local du navigateur ne sera utilisé que pour protéger temporairement un brouillon non synchronisé.

### 3.3 Distinction entre données et documents

TeacherWatch distinguera :

1. les événements officiels enregistrés dans la base de données ;
2. le rapport dynamique visible à l’écran ;
3. le document Word, Excel ou PDF généré à un instant donné.

Le rapport affiché restera unique et sera mis à jour. Le journal d’audit conservera néanmoins la preuve de chaque génération et de chaque envoi.

### 3.4 Protection des anciennes données

Un enseignant, un utilisateur, un emploi du temps ou une affectation ne sera pas supprimé physiquement s’il est déjà associé à un rapport. Il sera archivé ou désactivé afin de conserver l’historique.

### 3.5 Journées sans rapport

À 18 h, si aucun des cinq secteurs n’a transmis de rapport, la journée sera classée automatiquement :

> **Journée sans cours — classement automatique**

Une notification sera envoyée au proviseur. Le proviseur et les administrateurs pourront corriger ce statut. Toute correction sera enregistrée dans le journal d’audit.

Si au moins un secteur a transmis un rapport, la journée sera considérée comme une journée avec cours et les secteurs restants seront marqués « Non soumis » dans l’état de suivi interne.

### 3.6 Autorité du proviseur

Le proviseur et les administrateurs délégués disposeront des mêmes pouvoirs opérationnels sur l’application. Le compte principal du proviseur bénéficiera cependant de protections particulières :

- personne ne pourra le désactiver ;
- seul le proviseur pourra modifier ses identifiants principaux ;
- seul le proviseur pourra transférer le compte principal à son successeur ;
- les anciennes sessions pourront être révoquées lors d’un transfert.

---

## 4. Périmètre du MVP

Le MVP comprendra uniquement les éléments nécessaires au fonctionnement quotidien.

### Inclus dans le MVP

- application web responsive pour téléphone, tablette et ordinateur ;
- interface principale en français ;
- connexion avec Google ;
- compte protégé du proviseur ;
- création et invitation des surveillants et administrateurs ;
- gestion des cinq secteurs ;
- import contrôlé du personnel ;
- import contrôlé de l’emploi du temps ;
- consultation des emplois du temps ;
- saisie guidée des absences, retards et départs anticipés ;
- soumissions multiples dans une journée ;
- verrouillage des événements soumis ;
- verrouillage journalier à 18 h ;
- rappels à 16 h ;
- rapport journalier général ;
- rapport hebdomadaire général ;
- export Word ;
- envoi Gmail au proviseur ;
- journal d’audit minimal ;
- sauvegardes automatiques ;
- protection locale des brouillons non synchronisés.

### Reporté après le pilote

- interface complète en anglais ;
- rapports mensuels, trimestriels et annuels finalisés ;
- exports Excel et PDF complets ;
- tableaux statistiques avancés ;
- comparaisons entre périodes ;
- alertes de connexion sur un nouvel appareil ;
- intégration WhatsApp ;
- automatisations supplémentaires.

---

## 5. Architecture cible recommandée

### 5.1 Composants

- **Application web responsive :** interface utilisée par le proviseur, les administrateurs et les surveillants.
- **Serveur applicatif :** applique les autorisations, les verrouillages et les règles métier.
- **Base PostgreSQL :** conserve les utilisateurs, emplois du temps, événements, soumissions et audits.
- **Stockage de fichiers :** conserve les imports publiés et les modèles de rapports.
- **Google OAuth :** authentifie les utilisateurs avec leur compte Google.
- **Gmail :** envoie les invitations, notifications et rapports.
- **Service d’export :** produit les documents Word, puis Excel et PDF.
- **Sauvegardes :** copie quotidienne de la base et des fichiers importants.

### 5.2 Principes de sécurité

- connexion HTTPS obligatoire ;
- aucune conservation des mots de passe Gmail ;
- contrôle des autorisations sur le serveur ;
- séparation des environnements de test et de production ;
- journalisation des opérations sensibles ;
- révocation des sessions ;
- limitation des tentatives abusives ;
- restauration régulièrement testée.

---

## 6. Lots de réalisation

## Lot 0 — Validation fonctionnelle

**Durée estimée : 1 semaine**

### Travaux

- actualiser le cahier des charges ;
- figer les colonnes des rapports ;
- confirmer les règles des classes jumelées ;
- décrire les statuts d’une soumission ;
- définir la structure officielle des fichiers d’import ;
- faire valider les maquettes principales par le lycée ;
- désigner les personnes responsables de la validation.

### Critères d’acceptation

- aucune règle critique ne reste ambiguë ;
- les fichiers exemples d’import sont disponibles ;
- le lycée approuve le périmètre exact du MVP.

### Livrables

- cahier des charges révisé ;
- dictionnaire des données ;
- modèles Excel d’import ;
- maquettes validées.

---

## Lot 1 — Socle technique centralisé

**Durée estimée : 2 à 3 semaines**

### Travaux

- créer les environnements de développement, test et production ;
- créer la base de données ;
- créer les tables et relations principales ;
- mettre en place le serveur applicatif ;
- mettre en place les sauvegardes ;
- ajouter le journal d’audit ;
- ajouter la gestion des erreurs ;
- préparer le déploiement sécurisé.

### Données principales

- établissements ;
- années scolaires et trimestres ;
- utilisateurs et rôles ;
- secteurs et affectations ;
- enseignants ;
- classes ;
- matières et spécialités ;
- emplois du temps ;
- événements ;
- soumissions ;
- rapports ;
- imports ;
- journal d’audit.

### Critères d’acceptation

- plusieurs appareils voient les mêmes données ;
- un utilisateur ne peut pas modifier directement des données sans autorisation ;
- une sauvegarde peut être restaurée sur l’environnement de test.

---

## Lot 2 — Connexion Google et gestion des utilisateurs

**Durée estimée : 1 à 2 semaines**

### Travaux

- créer et configurer le projet Google ;
- ajouter « Continuer avec Google » ;
- utiliser `mvondomekaully@gmail.com` comme compte initial de test du proviseur ;
- permettre le remplacement futur par l’adresse officielle du lycée ;
- protéger le compte principal ;
- permettre au proviseur d’enregistrer une adresse Gmail autorisée ;
- envoyer une invitation automatique ;
- activer le compte lors de la première connexion réussie ;
- informer le proviseur de l’activation ;
- gérer la désactivation des comptes secondaires ;
- permettre la révocation des sessions.

### États d’un compte

- invité ;
- actif ;
- suspendu ;
- archivé.

### Critères d’acceptation

- une adresse non autorisée ne peut pas accéder à TeacherWatch ;
- un surveillant ne voit que son secteur ;
- le compte du proviseur ne peut pas être désactivé ;
- la première activation est enregistrée et notifiée.

---

## Lot 3 — Import fiable du personnel

**Durée estimée : 2 semaines**

### Travaux

- importer les enseignants depuis Excel ;
- reconnaître les colonnes essentielles ;
- contrôler les matricules ;
- détecter les doublons ;
- signaler les numéros de téléphone manquants ;
- signaler les lignes incomplètes ;
- afficher un aperçu avant publication ;
- permettre les corrections de rapprochement ;
- publier l’import de manière atomique ;
- archiver les enseignants absents du nouveau fichier sans détruire leur historique ;
- permettre un retour à la version précédente.

### Critères bloquants avant publication

- matricule dupliqué non résolu ;
- ligne sans identité exploitable ;
- fichier sans colonnes obligatoires ;
- modification massive non confirmée ;
- enseignant utilisé dans l’historique qui serait supprimé.

### Critères d’acceptation

- le nombre de lignes importées, rejetées et modifiées est affiché ;
- aucun ancien rapport ne change après un nouvel import ;
- la version précédente peut être restaurée.

---

## Lot 4 — Import et consultation de l’emploi du temps

**Durée estimée : 2 à 3 semaines**

### Travaux

- importer l’emploi du temps complet ;
- utiliser les dix tranches horaires officielles ;
- rapprocher les enseignants avec le fichier du personnel ;
- détecter les enseignants ou libellés non reconnus ;
- gérer les classes jumelées ;
- construire réellement le nouvel emploi du temps après validation ;
- afficher les vues par classe, enseignant, matière, jour et secteur ;
- conserver les versions successives avec leur date d’effet.

### Critères d’acceptation

- toutes les classes importées sont consultables ;
- les données publiées correspondent à l’aperçu validé ;
- les lignes non rapprochées sont clairement signalées ;
- une modification future n’altère pas les événements passés.

---

## Lot 5 — Saisie et gestion des événements

**Durée estimée : 2 semaines**

### Événements pris en charge

- absence ;
- retard ;
- départ anticipé.

### Fonctionnement

- date du jour proposée automatiquement ;
- sélection de la tranche horaire et de la classe ;
- récupération automatique de l’enseignant, du matricule et de la matière ;
- recherche d’un enseignant par liste ou saisie progressive ;
- restriction automatique au secteur du surveillant ;
- gestion des classes jumelées ;
- contrôle des doublons ;
- sauvegarde comme brouillon ;
- modification et suppression avant soumission ;
- fermeture du formulaire sans création.

### Résilience à la connexion

- conserver localement un brouillon non envoyé ;
- afficher « Non synchronisé », « Synchronisation en cours » ou « Synchronisé » ;
- ne jamais afficher « Soumis » avant confirmation du serveur ;
- reprendre une synchronisation interrompue ;
- empêcher une double création après reconnexion.

### Critères d’acceptation

- un surveillant ne peut pas saisir pour un autre secteur ;
- la sélection depuis l’emploi du temps remplit correctement les données ;
- aucune saisie n’est perdue lors d’une courte coupure Internet ;
- les doublons sont bloqués ou explicitement confirmés.

---

## Lot 6 — Soumissions, verrouillage et suivi quotidien

**Durée estimée : 1 à 2 semaines**

### Travaux

- autoriser plusieurs soumissions par surveillant et par jour ;
- numéroter chaque soumission ;
- permettre une soumission contenant des événements ;
- permettre une soumission « aucune absence signalée » ;
- verrouiller immédiatement les événements soumis ;
- empêcher le surveillant de modifier un événement soumis ;
- permettre au proviseur et aux administrateurs d’intervenir ;
- envoyer un rappel à 16 h ;
- verrouiller la journée à 18 h ;
- appliquer la règle des journées sans rapport ;
- afficher le nombre de secteurs ayant transmis ;
- enregistrer toutes les corrections dans l’audit.

### Critères d’acceptation

- une soumission ne peut pas être perdue ou dupliquée ;
- un événement soumis est immuable pour le surveillant ;
- une correction administrative conserve l’ancienne valeur ;
- la situation des cinq secteurs est identifiable dans l’application.

---

## Lot 7 — Rapports du MVP

**Durée estimée : 2 semaines**

### Rapports inclus

- rapport journalier ;
- rapport hebdomadaire ;
- rapport intermédiaire avec dates libres.

### Présentation générale

Les cinq secteurs sont regroupés dans un seul tableau. Le nom du secteur et celui du surveillant ne figurent pas dans le tableau final.

### Rapport détaillé

| N° | Horaire | Nom de l’enseignant | Matricule | Classe | Matière |
|---:|---|---|---|---|---|

### Rapport récapitulatif par enseignant

| N° | Nom de l’enseignant | Matricule | Spécialité | Heures d’absence |
|---:|---|---|---|---:|

Seuls les enseignants ayant au moins une heure d’absence apparaissent.

### Informations du document

- Lycée Technique de Douala Bassa ;
- type de rapport ;
- période couverte ;
- date et heure de génération en heure du Cameroun ;
- nombre de rapports reçus sur cinq ;
- emplacement de l’en-tête officiel ;
- emplacement du logo ;
- espace de signature du proviseur.

### Critères d’acceptation

- le rapport affiché se met à jour après chaque modification autorisée ;
- les classes jumelées ne produisent pas de double comptage ;
- les totaux peuvent être recalculés à partir des événements ;
- un rapport intermédiaire indique clairement qu’il n’est pas définitif.

---

## Lot 8 — Word et notifications Gmail

**Durée estimée : 1 à 2 semaines**

### Travaux

- produire un document Word modifiable ;
- envoyer une invitation lors de la création d’un compte ;
- informer le proviseur lors de la première activation ;
- envoyer au proviseur le rapport journalier complet après chaque soumission ;
- intégrer les données disponibles des cinq secteurs ;
- remplacer la pièce jointe précédente par un nouveau document actualisé dans chaque nouvel e-mail ;
- envoyer au proviseur tout rapport généré par un administrateur ;
- journaliser les succès et échecs d’envoi ;
- prévoir une nouvelle tentative en cas d’échec.

### Traçabilité minimale d’un export

- période ;
- format ;
- date et heure ;
- utilisateur ayant déclenché la génération ;
- destinataire ;
- nombre de lignes ;
- résultat de l’envoi ;
- empreinte numérique du fichier.

L’identité de la personne ayant généré le rapport reste dans l’audit et n’apparaît pas dans le document.

### Critères d’acceptation

- le document Word s’ouvre correctement dans Microsoft Word ;
- les tableaux restent modifiables ;
- les données correspondent au rapport affiché ;
- l’échec d’un e-mail n’entraîne pas la perte de la soumission.

---

## Lot 9 — Tests et sécurisation du MVP

**Durée estimée : 2 semaines**

### Tests fonctionnels

- cinq secteurs actifs ;
- soumission avec événements ;
- soumission sans événement ;
- soumissions multiples ;
- verrouillage après soumission ;
- rappel à 16 h ;
- verrouillage à 18 h ;
- journée sans rapport ;
- correction par un administrateur ;
- import successif du personnel ;
- import successif de l’emploi du temps ;
- export Word ;
- envoi Gmail ;
- coupure et reprise de connexion.

### Tests de sécurité

- connexion avec une adresse non autorisée ;
- accès d’un surveillant à un autre secteur ;
- modification d’un événement soumis ;
- tentative de désactivation du proviseur ;
- utilisation d’une session révoquée ;
- manipulation directe d’une requête ;
- contrôle des fichiers importés.

### Tests de restauration

- restauration d’une sauvegarde récente ;
- vérification des événements et soumissions ;
- vérification des affectations et audits ;
- mesure du temps nécessaire au rétablissement.

### Critères d’acceptation

- aucun défaut bloquant ;
- aucun défaut critique de sécurité ;
- aucune perte de données lors des scénarios testés ;
- validation formelle du proviseur avant le pilote.

---

## Lot 10 — Projet pilote

**Durée estimée : 2 à 4 semaines**

### Étape 1

- utiliser TeacherWatch dans un seul secteur ;
- maintenir temporairement le registre habituel comme référence ;
- comparer chaque jour les résultats ;
- corriger les anomalies bloquantes.

### Étape 2

- étendre progressivement aux cinq secteurs ;
- tester les rapports consolidés ;
- vérifier les notifications ;
- mesurer le temps réel de saisie ;
- recueillir les observations des utilisateurs.

### Indicateurs du pilote

- pourcentage de rapports transmis avant 18 h ;
- nombre de doublons ;
- nombre de corrections administratives ;
- nombre d’échecs de synchronisation ;
- nombre d’échecs d’envoi Gmail ;
- écart entre TeacherWatch et le registre de contrôle ;
- temps moyen nécessaire pour une saisie.

### Décision de fin de pilote

La mise en production générale sera autorisée si :

- aucune donnée n’est perdue ;
- les rapports correspondent aux données validées ;
- les autorisations sont respectées ;
- les cinq secteurs peuvent travailler simultanément ;
- les sauvegardes et la restauration sont opérationnelles.

---

## Lot 11 — Version 1 complète

**Durée estimée : 3 à 4 semaines après le pilote**

### Fonctions

- rapport mensuel ;
- rapport trimestriel ;
- rapport annuel par année scolaire ;
- découpage de l’année fourni par le proviseur ;
- export Excel ;
- export PDF ;
- statistiques des enseignants les plus absents ;
- statistiques des classes les plus touchées ;
- classements hebdomadaires, mensuels et trimestriels ;
- interface anglaise ;
- amélioration du tableau de bord ;
- gestion avancée des modèles de rapports.

---

## Lot 12 — Évolutions ultérieures

Ces fonctions ne doivent pas retarder la version opérationnelle :

- intégration WhatsApp avec un numéro dédié ;
- notifications sur les nouveaux appareils ;
- tableaux comparatifs avancés ;
- archivage externe des rapports ;
- notifications personnalisables ;
- fonctionnement hors ligne étendu ;
- application mobile native si le besoin est confirmé.

---

## 7. Calendrier révisé

| Lot | Durée estimée |
|---|---:|
| Validation fonctionnelle | 1 semaine |
| Socle centralisé | 2 à 3 semaines |
| Google et utilisateurs | 1 à 2 semaines |
| Import du personnel | 2 semaines |
| Import de l’emploi du temps | 2 à 3 semaines |
| Saisie des événements | 2 semaines |
| Soumissions et verrouillage | 1 à 2 semaines |
| Rapports du MVP | 2 semaines |
| Word et Gmail | 1 à 2 semaines |
| Tests et sécurisation | 2 semaines |
| Projet pilote | 2 à 4 semaines |

### Estimation du MVP avec pilote

- **Petite équipe expérimentée : 15 à 22 semaines**
- **Développeur seul : environ 5 à 8 mois**

La durée dépendra surtout :

- de la qualité des fichiers d’import ;
- de la disponibilité du lycée pour les validations ;
- du nombre d’anomalies dans les rapprochements ;
- des délais de configuration Google ;
- des résultats du pilote.

---

## 8. Gouvernance du projet

### Responsabilités du lycée

- fournir le découpage de l’année scolaire ;
- fournir les fichiers officiels du personnel et de l’emploi du temps ;
- confirmer l’adresse Gmail institutionnelle ;
- valider les rapprochements problématiques ;
- désigner les utilisateurs du pilote ;
- valider chaque lot.

### Responsabilités de l’équipe de développement

- réaliser les fonctions approuvées ;
- documenter les règles et changements ;
- protéger les données ;
- tester les sauvegardes ;
- signaler les risques ;
- fournir les guides d’utilisation ;
- accompagner le pilote.

### Rythme recommandé

- démonstration à la fin de chaque lot ;
- procès-verbal court de validation ;
- liste des anomalies avec priorité ;
- aucune nouvelle fonction importante ajoutée au lot en cours sans réévaluation du calendrier.

---

## 9. Priorisation des anomalies

### Critique

- perte ou mélange de données ;
- accès à un secteur non autorisé ;
- impossibilité de soumettre ;
- rapport contenant des totaux faux ;
- désactivation possible du proviseur ;
- restauration impossible.

### Élevée

- enseignant ou classe manquant après import ;
- événement soumis encore modifiable par un surveillant ;
- double comptage d’une classe jumelée ;
- document Word différent du rapport affiché ;
- échec d’envoi non signalé.

### Moyenne

- erreur de présentation ;
- filtre incomplet ;
- traduction manquante ;
- problème non bloquant dans un export.

### Faible

- ajustement esthétique ;
- amélioration de confort sans impact métier.

---

## 10. Coûts d’exploitation à prévoir

Le budget final devra distinguer :

- développement initial ;
- hébergement de l’application ;
- base de données ;
- stockage des fichiers ;
- nom de domaine ;
- sauvegardes ;
- envoi d’e-mails ;
- maintenance corrective ;
- assistance aux utilisateurs ;
- évolutions futures.

Les offres gratuites peuvent convenir aux tests, mais la production ne doit pas dépendre d’une capacité insuffisante ou d’un service sans garantie de restauration.

---

## 11. Prochaine action

La prochaine étape est le **Lot 0 — Validation fonctionnelle**.

Il faudra produire et faire approuver :

1. le cahier des charges révisé ;
2. le modèle officiel du fichier du personnel ;
3. le modèle officiel de l’emploi du temps ;
4. la matrice définitive des droits ;
5. les maquettes des écrans du MVP ;
6. les critères d’acceptation du pilote.

Le développement du socle de production pourra commencer dès validation de ces six éléments.

