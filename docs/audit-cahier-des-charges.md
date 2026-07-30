# TeacherWatch — Audit du cahier des charges

**Document audité :** « TeacherWatch — Feuille de route révisée après audit », version 1.0 du 30 juillet 2026
(copie de référence : [`docs/feuille-de-route-v1.0.md`](./feuille-de-route-v1.0.md))
**Établissement :** Lycée Technique de Douala Bassa
**Date de l'audit :** 30 juillet 2026
**Nature :** audit documentaire (contrôle de complétude, de cohérence et de testabilité)

---

## 1. Périmètre et méthode

### 1.1 Ce qui a été audité

Le document a été examiné section par section selon six axes :

1. **Cohérence interne** — les règles énoncées se contredisent-elles ?
2. **Complétude fonctionnelle** — le MVP décrit permet-il réellement le travail quotidien ?
3. **Testabilité** — chaque critère d'acceptation peut-il être vérifié objectivement ?
4. **Robustesse technique et sécurité** — les invariants critiques sont-ils spécifiés côté serveur ?
5. **Réalisme du calendrier** — l'estimation est-elle arithmétiquement et opérationnellement tenable ?
6. **Gouvernance, données personnelles et continuité** — le lycée reste-t-il maître de son outil ?

### 1.2 Limite importante de cet audit

Le dépôt `dreams48/TeacherWatch` est **entièrement vide** : aucune branche, aucun commit, aucun fichier
source. Le prototype décrit en § 2 du cahier des charges **n'est pas versionné**.

Cet audit n'a donc **pas pu confronter la spécification au code existant**. Tout ce qui concerne l'état
réel du prototype est repris du document sur déclaration, sans vérification.

> **Constat G-01 (Élevé)** — Le prototype n'existe que sur le poste de son auteur. Il n'est ni sauvegardé,
> ni relisible, ni reprenable par un tiers. Avant toute chose : verser le prototype dans le dépôt Git,
> même imparfait, même s'il doit être réécrit au Lot 1. Un prototype qui a servi à valider les règles
> métier est une pièce du dossier, pas un brouillon jetable.

### 1.3 Verdict d'ensemble

Le document est **de bonne qualité et nettement au-dessus de la moyenne** pour un projet de cette taille :
découpage en lots avec recette, critères d'acceptation explicites, refus assumé du tout-en-une-fois,
distinction données / rapport / document, protection de l'historique, pilote avec double saisie de
contrôle. Ces choix sont justes et il ne faut pas les défaire.

Il n'est cependant **pas encore suffisant pour lancer le Lot 1**. Trois familles de problèmes :

| Famille | Nature | Conséquence |
|---|---|---|
| **Règles de comptage non définies** | La notion d'« heure d'absence », les classes jumelées, les 10 tranches horaires ne sont jamais définies | Le critère « rapport contenant des totaux faux = anomalie critique » est **invérifiable** |
| **Angle mort fonctionnel majeur** | Aucune notion de justification d'absence, ni de calendrier scolaire | Le rapport quotidien risque d'être **injuste envers les enseignants** et le classement automatique de 18 h se déclenchera **tous les dimanches et pendant les congés** |
| **Instantané non spécifié** | Les rapports rejouent-ils l'emploi du temps actuel ou celui du jour de l'événement ? | Contradiction directe avec « une modification future n'altère pas les événements passés » |

**Recommandation principale :** conserver la structure en lots, mais **élargir le Lot 0** aux 11 points
bloquants listés en § 7 et le faire passer de 1 à **2 – 3 semaines**. Un Lot 0 sous-dimensionné est la
cause la plus fréquente de dérive sur ce type de projet.

---

## 2. Points forts à préserver

Ils sont cités explicitement parce qu'un audit ne doit pas conduire à réécrire ce qui va bien.

- **§ 3.3 — Distinction données / rapport affiché / document généré.** C'est la bonne abstraction. Elle
  évite le piège classique du « rapport figé » qu'on ne peut plus corriger.
- **§ 3.4 — Aucune suppression physique de ce qui est référencé par un rapport.** Correct, et rare
  d'être posé aussi tôt.
- **Lot 3 — Critères bloquants avant publication de l'import.** L'idée d'un import en deux temps
  (aperçu, puis publication atomique) avec liste de blocages est exactement ce qu'il faut. C'est la
  section la plus mûre du document.
- **Lot 5 — États de synchronisation explicites**, et surtout « ne jamais afficher *Soumis* avant
  confirmation du serveur ». C'est la bonne règle, énoncée au bon endroit.
- **Lot 10 — Pilote avec maintien du registre papier comme référence et mesure de l'écart.** C'est la
  seule façon honnête de valider un outil de saisie. À ne pas raccourcir sous pression de calendrier.
- **§ 9 — Grille de priorisation des anomalies** définie *avant* d'en avoir. Excellent réflexe.

---

## 3. Anomalies bloquantes — à résoudre avant le Lot 1

Chaque anomalie est présentée sous la forme *constat → risque → recommandation*.

---

### B-01 — La notion d'« heure d'absence » n'est jamais définie

**Constat.** Le rapport récapitulatif (Lot 7) comporte une colonne **« Heures d'absence »**. Or le
document ne dit jamais :

- combien de temps dure une tranche horaire, ni si les dix tranches sont de durée égale ;
- comment un **retard** se convertit en heures (un retard de 10 min compte-t-il ? pour combien ?) ;
- comment un **départ anticipé** se convertit en heures ;
- si une absence sur un bloc de deux tranches consécutives est **un** événement ou **deux** ;
- si les retards et départs anticipés entrent dans le total ou font l'objet de colonnes séparées.

**Risque.** § 9 classe « rapport contenant des totaux faux » en anomalie **critique**, et le Lot 7 exige
que « les totaux puissent être recalculés à partir des événements ». Ces deux exigences sont
**intestables** tant que la formule n'est pas écrite. Concrètement : le développeur choisira une
convention, le proviseur en attendait une autre, et le désaccord n'apparaîtra qu'au Lot 10 — après le
développement des rapports, des exports et des envois.

**Recommandation.** Produire au Lot 0 une **règle de comptage** d'une page, en toutes lettres, validée
par le proviseur, contenant :

1. la liste exhaustive des 10 tranches avec heure de début, heure de fin et durée ;
2. la formule de conversion de chaque type d'événement en heures ;
3. la décision sur les blocs multi-tranches (recommandation : **un événement par tranche**, plus simple
   à recalculer et à corriger, quitte à proposer une saisie groupée dans l'interface) ;
4. deux exemples chiffrés complets servant de **jeu de test de référence** au Lot 9.

---

### B-02 — Les classes jumelées sont citées cinq fois et définies zéro fois

**Constat.** Les « classes jumelées » apparaissent au Lot 0 (« confirmer les règles »), au Lot 4
(« gérer »), au Lot 5 (« gestion »), au Lot 7 (« ne produisent pas de double comptage ») et en § 9
(« double comptage d'une classe jumelée » = anomalie **élevée**). Le document ne dit jamais **ce
qu'est** une classe jumelée dans cet établissement, ni quelle règle de comptage s'y applique.

**Risque.** C'est le principal facteur de faux totaux, et il est identifié comme tel — mais sans règle,
le Lot 7 ne peut pas être recetté.

**Recommandation.** Trancher au Lot 0, et l'écrire sous cette forme (à valider, à adapter) :

> Une classe jumelée est un regroupement de deux classes ou plus suivant simultanément le même cours,
> avec le même enseignant, sur la même tranche horaire.
> **Comptage :** une absence sur un cours jumelé produit **un seul événement** et **une seule heure**
> d'absence pour l'enseignant. Le rapport détaillé affiche **une seule ligne**, la colonne *Classe*
> portant le libellé du groupement (ex. `1re G1 + 1re G2`).
> **Statistiques par classe** (Lot 11) : chaque classe du groupement est comptée individuellement comme
> touchée, sans multiplier les heures de l'enseignant.

Le point important est que la règle **diffère selon l'axe d'agrégation** (par enseignant vs par classe).
C'est précisément là que naissent les doubles comptages.

---

### B-03 — Aucune notion de calendrier scolaire : le classement automatique de 18 h se déclenchera les dimanches et pendant les congés

**Constat.** § 3.5 prévoit qu'à 18 h, si aucun secteur n'a transmis, la journée est classée
automatiquement « Journée sans cours » **avec notification au proviseur**. Le Lot 6 prévoit en plus un
rappel à 16 h. Or rien dans le document ne définit :

- les jours de cours de la semaine (samedi ? samedi matin ?) ;
- les jours fériés camerounais ;
- les périodes de congés et de vacances ;
- les périodes d'examens, pendant lesquelles l'emploi du temps normal ne s'applique pas.

Le § 8 demande bien au lycée de « fournir le découpage de l'année scolaire », mais le Lot 1 ne le range
que dans « années scolaires et trimestres », et le § 11 ne le liste pas parmi les six livrables du
Lot 0.

**Risque.**

- Le proviseur reçoit une notification « Journée sans cours » **chaque dimanche et chaque jour de
  congé**, soit plusieurs dizaines de notifications inutiles par trimestre. Les notifications inutiles
  ne sont pas un défaut cosmétique : elles entraînent l'abandon du canal, et donc la perte des
  notifications utiles.
- Les rappels de 16 h partent également hors jours de cours, ce qui décrédibilise le dispositif auprès
  des surveillants — les seules personnes dont l'adhésion conditionne le projet.
- Les rapports hebdomadaires divisent par un nombre de jours faux.

**Recommandation.** Ajouter au MVP un **calendrier des jours de cours** (table `jours_scolaires` ou
équivalent), alimenté au Lot 0 par le lycée et modifiable par le proviseur en cours d'année. Les
traitements de 16 h et 18 h ne s'exécutent **que** sur un jour marqué « jour de cours ». Un jour
exceptionnellement banalisé (grève, événement, intempérie) doit pouvoir être requalifié par le
proviseur, avec trace à l'audit.

---

### B-04 — Aucune distinction entre absence justifiée et absence non justifiée

**Constat.** Les événements pris en charge (Lot 5) sont : absence, retard, départ anticipé. Aucun champ
ne permet d'indiquer qu'une absence est **couverte** : mission officielle, convocation, formation,
congé de maladie, autorisation d'absence, maternité, décès dans la famille.

**Risque.** C'est, de l'avis de cet audit, **le risque le plus sérieux du projet — et il n'est pas
technique**. Un rapport quotidien nominatif transmis au proviseur, listant les absences sans distinguer
celles qui sont régulières, est un document **inexact dans son sens** même si chaque ligne est
factuellement vraie. Conséquences prévisibles :

- un enseignant en mission commandée par le lycée apparaît dans le rapport d'absence du jour ;
- un enseignant en congé de maladie de trois semaines génère un événement par tranche et par jour, et
  finit en tête du classement « enseignants les plus absents » du Lot 11 ;
- le corps enseignant identifie l'outil comme un instrument de sanction injuste et le rejette. À ce
  stade, aucune qualité technique ne sauve le produit.

**Recommandation.** Deux ajouts, tous deux peu coûteux, à intégrer au MVP :

1. **Au niveau de l'événement** — un champ `statut_justification` à trois valeurs : `à statuer`
   (défaut), `justifiée`, `non justifiée`, accompagné d'un motif libre. Le surveillant **constate** et
   laisse `à statuer` ; seuls le proviseur et les administrateurs qualifient. Le rapport présente les
   deux colonnes séparément et porte la mention « les absences non encore qualifiées sont signalées
   *à statuer* ».
2. **Au niveau de l'enseignant** — une **situation administrative** avec période (`en poste`,
   `en mission`, `congé de maladie`, `congé de maternité`, `détaché`). Pendant une période couverte,
   l'outil n'exige plus de saisie pour cet enseignant et ne l'inscrit pas au rapport d'absence.

Sans le point 2, les absences de longue durée pollueront durablement toutes les statistiques du Lot 11.

---

### B-05 — Les rapports du passé changeront si l'emploi du temps est modifié

**Constat.** Deux exigences se contredisent :

- Lot 4 : « conserver les versions successives avec leur date d'effet » et « une modification future
  n'altère pas les événements passés » ;
- Lot 7 : « les totaux peuvent être recalculés à partir des événements ».

Le Lot 5 précise que la saisie fait la « récupération automatique de l'enseignant, du matricule et de la
matière » depuis l'emploi du temps. Si l'événement ne stocke qu'une **référence** vers la ligne
d'emploi du temps, alors tout réimport de l'emploi du temps — ou toute correction du fichier du
personnel au Lot 3 — **réécrit rétroactivement les rapports déjà transmis et signés**.

**Risque.** Anomalie **critique** au sens du § 9 (« rapport contenant des totaux faux », « document Word
différent du rapport affiché »), et perte de valeur probante de tout l'historique.

**Recommandation.** Poser explicitement dans le modèle de données du Lot 1 le principe de
**l'instantané** : au moment de sa création, un événement **recopie** (et ne référence pas seulement)
les valeurs qui l'identifient métier — nom de l'enseignant, matricule, classe, matière, libellé et
bornes de la tranche horaire, version de l'emploi du temps applicable. Les rapports lisent l'instantané.
Les références servent aux statistiques et aux filtres, jamais à la restitution d'un rapport passé.

C'est une décision d'architecture, pas un détail d'implémentation : prise au Lot 7, elle coûte une
réécriture.

---

### B-06 — L'envoi Gmail tel que spécifié est irréalisable ou inexploitable

Trois problèmes distincts sur la même fonction.

**B-06a — « Remplacer la pièce jointe précédente » est techniquement impossible.**
Le Lot 8 demande de « remplacer la pièce jointe précédente par un nouveau document actualisé dans chaque
nouvel e-mail ». Un e-mail expédié est immuable : on ne remplace jamais la pièce jointe d'un message
déjà remis. L'intention est probablement « chaque nouvel e-mail annule et remplace le précédent », ce
qui est légitime — mais alors le **document doit se dater et se numéroter lui-même**, sinon le proviseur
ne saura pas lequel des huit fichiers `rapport-journalier.docx` de son téléphone est le bon.
→ Ajouter aux « Informations du document » (§ Lot 7) un **numéro de génération** et la mention
« annule et remplace la génération n° N−1 du JJ/MM à HH:MM ».

**B-06b — Le volume d'e-mails rendra la fonction contre-productive.**
« Envoyer au proviseur le rapport journalier complet **après chaque soumission** », avec 5 secteurs
autorisés à faire des soumissions multiples, produit un ordre de grandeur de **15 à 30 e-mails avec
pièce jointe par jour**, dont un seul a de la valeur. C'est en contradiction pratique avec le principe
§ 3.3 du rapport unique.
→ Recommandation : **un envoi consolidé au verrouillage de 18 h**, plus un envoi à la demande, plus une
alerte immédiate uniquement pour les cas qui la justifient (à définir avec le proviseur : par exemple
un seuil d'absences dépassé). Rendre la fréquence paramétrable.

**B-06c — Le canal d'envoi est un risque de calendrier sous-estimé.**
Envoyer au nom d'un compte Google via l'API Gmail exige un périmètre d'autorisation dit *sensible* et
donc une **procédure de validation Google** (page de confidentialité, domaine vérifié, délai de
plusieurs semaines, issue non garantie). Le Lot 2 est estimé à 1 – 2 semaines et le § 7 ne mentionne les
« délais de configuration Google » qu'en note de bas de liste.
S'ajoute le fait que le compte prévu est une **adresse personnelle `@gmail.com`** : on n'y contrôle ni
SPF, ni DKIM, ni DMARC, les quotas d'envoi sont bas, et un rapport institutionnel expédié depuis une
adresse personnelle est fragile sur le plan de la crédibilité comme de la délivrabilité.
→ Recommandation : dissocier **l'authentification** (Google OAuth pour la connexion — à conserver) de
**l'expédition** (service d'envoi transactionnel avec le domaine du lycée, ou Google Workspace du lycée
s'il existe). Décider au Lot 0, car cela conditionne l'achat du nom de domaine et le § 10.

---

### B-07 — Le rappel de 16 h n'a pas de canal, alors que tout le dispositif en dépend

**Constat.** Le MVP inclut « rappels à 16 h » et « verrouillage journalier à 18 h ». Le canal du rappel
n'est jamais indiqué. Le seul canal du MVP est Gmail ; WhatsApp est reporté au Lot 12 ; aucune
notification *push* n'est prévue.

**Risque.** Les surveillants travaillent sur téléphone, en établissement, et ne consultent pas
nécessairement leur boîte Gmail. Un rappel non lu est un rappel inexistant : la discipline 16 h / 18 h,
qui est le cœur du fonctionnement, ne s'installe pas. L'indicateur du Lot 10 « pourcentage de rapports
transmis avant 18 h » restera bas sans que l'on sache si la cause est l'outil ou le rappel.

**Recommandation.** Pour le MVP : rappel **dans l'application** (bandeau persistant tant que le secteur
n'a pas soumis) **+ e-mail**. Et évaluer au Lot 0 le **SMS** via un agrégateur camerounais : coût
faible, lecture quasi universelle, aucune dépendance à WhatsApp. Ne pas attendre le Lot 12 pour traiter
la question du canal.

---

### B-08 — La connexion Google est le seul mode d'accès, sans repli

**Constat.** Le MVP prévoit uniquement « connexion avec Google », avec liste blanche d'adresses
autorisées. Aucun mode de repli.

**Risque.** Si un seul des cinq surveillants n'a pas de compte Google utilisable — ou l'a perdu, ou en a
oublié le mot de passe le jour du pilote — son secteur ne peut pas saisir, et il n'existe aucune
solution de contournement. Le critère du Lot 10 « les cinq secteurs peuvent travailler simultanément »
devient impossible à satisfaire pour une raison étrangère au logiciel.

**Recommandation.** Vérifier **au Lot 0** que les cinq surveillants désignés disposent d'un compte
Google fonctionnel et savent s'en servir. Si ce n'est pas le cas pour un seul d'entre eux, prévoir au
MVP un second mode d'accès — lien de connexion à usage unique par e-mail, le plus simple à sécuriser.
Prévoir dans tous les cas une procédure écrite de dépannage d'accès faisant intervenir le proviseur.

---

### B-09 — Un secteur sans cours et un secteur négligent sont traités de la même façon

**Constat.** § 3.5 : dès qu'un secteur a transmis, « les secteurs restants seront marqués *Non soumis* ».
Le Lot 6 prévoit par ailleurs une soumission « aucune absence signalée ». Mais rien ne distingue :

1. un secteur qui **avait cours** et n'a rien transmis (défaut à signaler) ;
2. un secteur qui **avait cours**, a tout vérifié, et déclare zéro absence (travail fait) ;
3. un secteur qui **n'avait aucun cours programmé** ce jour-là (rien à faire).

**Risque.** Le cas 3 est mécaniquement rangé avec le cas 1. Le suivi affiche un secteur en faute alors
qu'il n'avait pas de cours, et l'indicateur du pilote « pourcentage de rapports transmis avant 18 h »
est faux à la baisse.

**Recommandation.** Dériver de l'emploi du temps, pour chaque secteur et chaque jour de cours, la
présence ou non de cours programmés. Statuts distincts et affichés distinctement : `Non concerné`,
`En attente`, `Soumis — sans absence`, `Soumis — avec événements`, `Non soumis`. Seul `Non soumis`
déclenche rappel et alerte.

---

### B-10 — Le fuseau horaire n'est jamais posé comme invariant

**Constat.** Le Lot 7 mentionne « date et heure de génération en heure du Cameroun ». C'est la seule
occurrence. Ni le Lot 1, ni le Lot 6 ne précisent le fuseau dans lequel sont calculés le rappel de 16 h,
le verrouillage de 18 h, la frontière d'une « journée » et le regroupement hebdomadaire.

**Risque.** Un serveur en UTC verrouille à 19 h locale ; les événements saisis en soirée basculent au
mauvais jour ; le rapport hebdomadaire perd ou double un jour à la frontière. Ces défauts sont discrets
et n'apparaissent qu'en production.

**Recommandation.** Écrire l'invariant au Lot 1 : *toute date et heure métier de TeacherWatch est
exprimée dans le fuseau `Africa/Douala` (UTC+1, sans heure d'été) ; le stockage est en UTC ; la
conversion est explicite et unique.* Préciser en outre le sort d'un événement saisi **après 18 h** pour
la journée en cours : refusé, ou accepté mais soumis à intervention administrative avec trace.

---

### B-11 — La matrice des droits et les critères du pilote sont exigés en § 11 mais absents du Lot 0

**Constat.** Le § 11 exige six livrables avant démarrage du socle, dont « la matrice définitive des
droits » et « les critères d'acceptation du pilote ». Or les livrables du Lot 0 (§ 6) n'en listent que
quatre : cahier des charges, dictionnaire des données, modèles Excel, maquettes. Les deux plus
structurants manquent.

**Risque.** § 5.2 exige le « contrôle des autorisations sur le serveur » et le § 9 classe « accès à un
secteur non autorisé » en critique. On ne peut ni développer ni tester une autorisation qui n'a pas été
écrite ligne par ligne.

**Recommandation.** Aligner § 6 et § 11. Produire au Lot 0 une **matrice droits × actions** au format
tableau, une ligne par action sensible (créer un compte, désactiver un compte, saisir un événement,
modifier un événement soumis, corriger après 18 h, requalifier une journée, publier un import, revenir
à une version, générer un rapport, déclencher un envoi, consulter l'audit), une colonne par rôle. Les
rôles doivent être arrêtés à cette occasion : le document n'en connaît que trois — proviseur,
administrateur, surveillant — et ne dit rien du censeur, du chef de travaux, du surveillant général, ni
d'un éventuel accès en lecture seule pour le secrétariat.

---

## 4. Incohérences internes et imprécisions

| Réf. | Constat | Recommandation |
|---|---|---|
| I-01 | Lot 7 et § 4 fixent « nombre de rapports reçus sur **cinq** », alors que le Lot 1 modélise une table `secteurs`. Le jour où un secteur est ajouté, fusionné ou archivé, tous les rapports mentent. | Formuler « reçus sur **N secteurs actifs à la date du rapport** », N étant calculé. |
| I-02 | § 3.5 place le classement automatique **à 18 h** et le Lot 6 le verrouillage **à 18 h**, sans ordre d'exécution ni marge. | Séquencer explicitement : verrouillage à 18 h 00, évaluation du classement à 18 h 05, notification ensuite. Définir le sort d'une soumission arrivant pendant la fenêtre. |
| I-03 | § 4 liste « rapport journalier » et « rapport hebdomadaire » ; le Lot 7 en livre **trois**, dont le rapport intermédiaire à dates libres. | Ajouter le rapport intermédiaire au § 4, ou le sortir du Lot 7. |
| I-04 | Le Lot 3 traite le matricule dupliqué et l'absence d'identité, mais **jamais le matricule manquant** — cas courant des vacataires et contractuels. | Décider : le matricule est-il obligatoire ? Si non, prévoir un identifiant interne stable et une règle de rapprochement dégradée pour l'emploi du temps (Lot 4). |
| I-05 | Lot 3 « retour à la version précédente » et Lot 4 « versions successives » ne disent pas ce qu'il advient des **événements déjà rattachés** à la version que l'on abandonne. | Règle : le retour arrière est refusé si des événements dépendent de lignes propres à la version récente ; dans ce cas, correction par nouvel import uniquement. (Le principe d'instantané B-05 rend ce cas rare mais pas nul.) |
| I-06 | Lot 3 : « modification massive non confirmée » est bloquant, sans **seuil**. | Quantifier, par exemple : ≥ 10 % des enseignants archivés, ou ≥ 20 % des lignes modifiées, exige une confirmation explicite avec motif, tracée à l'audit. |
| I-07 | Lot 8 exige un Word « modifiable » et une « empreinte numérique du fichier ». Dès que le proviseur retouche le document, l'empreinte ne correspond plus. | Assumer et écrire la portée : l'empreinte certifie **le fichier tel que généré**, pas ses versions retouchées. Le PDF (Lot 11) sera la version d'archive. |
| I-08 | « Journal d'audit minimal » (§ 4) n'est jamais défini par ses champs, alors que la traçabilité des exports (Lot 8) l'est très bien. | Lister les champs obligatoires : horodatage `Africa/Douala`, auteur, rôle au moment de l'acte, action, objet, **valeur avant / valeur après**, motif si correction, appareil ou adresse IP. Préciser que l'audit est en **ajout seul** — ni modifiable ni supprimable, y compris par le proviseur. Le § 9 devrait d'ailleurs classer la falsification de l'audit en anomalie critique. |
| I-09 | Le Lot 6 autorise le proviseur et les administrateurs à « intervenir » sur les événements, **sans limite de temps**. | Prévoir un **gel définitif** : passé la génération du rapport de la période (ou N jours), toute correction devient une opération réservée au proviseur, motivée, et signalée dans les rapports concernés. |
| I-10 | § 3.6 donne aux administrateurs délégués « les mêmes pouvoirs opérationnels » que le proviseur. Peuvent-ils créer d'autres administrateurs ? En désactiver un ? | Trancher dans la matrice B-11. Recommandation : la **gestion des comptes administrateurs** reste au proviseur seul. |
| I-11 | Le Lot 1 modélise des « établissements » au pluriel pour un projet mono-établissement. | Décider : soit c'est une ambition assumée (produit réutilisable par d'autres lycées) et il faut la budgéter, soit c'est de la complexité gratuite à retirer du MVP. Une simple colonne `etablissement_id` sans logique multi-locataire est un compromis raisonnable. |
| I-12 | § 5.1 présente un « service d'export » comme composant à part. | Pour un MVP produisant du `.docx`, c'est une bibliothèque dans l'application, pas un service. Éviter d'imposer une architecture distribuée à un développeur seul : un monolithe + PostgreSQL managé + un hébergeur est le bon choix ici, et le document devrait le dire. |
| I-13 | Aucun choix technologique n'est arrêté hors PostgreSQL. | C'est le premier facteur de coût pour un développeur seul. Arrêter la pile au Lot 0 et la justifier en deux lignes. |
| I-14 | Rien n'est dit de la reprise des données du prototype (aujourd'hui dans le navigateur). | Si rien n'est à reprendre, l'écrire. Une reprise découverte au Lot 5 est un lot imprévu. |

---

## 5. Lacunes techniques et sécurité

| Réf. | Sévérité | Constat et recommandation |
|---|---|---|
| T-01 | Élevée | **Idempotence non spécifiée.** Le Lot 5 exige d'« empêcher une double création après reconnexion », mais le Lot 1 ne prévoit rien pour y parvenir. → Le client génère un identifiant unique (UUID) par événement et par soumission dès la saisie ; le serveur rejette tout rejeu du même identifiant. À inscrire dans le modèle de données, pas dans le comportement d'écran. |
| T-02 | Élevée | **Aucun objectif de sauvegarde chiffré.** « Copie quotidienne » signifie jusqu'à 24 h de données perdues — soit, pour cette application, la totalité du travail d'une journée. → Fixer RPO ≤ 15 min (restauration à un instant donné, offerte par tout PostgreSQL managé), RTO ≤ 4 h, rétention 30 jours, sauvegardes chiffrées et stockées hors du serveur applicatif. Le critère du Lot 9 « mesure du temps nécessaire au rétablissement » n'a de sens que comparé à une cible. |
| T-03 | Élevée | **Les tests sont concentrés dans un seul lot final.** Sur 12 lots et 5 à 8 mois en solo, la régression est certaine. → Écrire des tests automatisés **dans le lot qui introduit la règle**, en priorité sur les invariants que le § 9 juge critiques : cloisonnement par secteur, immuabilité après soumission, non-double-comptage des jumelées, recalcul des totaux, refus d'accès d'une adresse non autorisée, refus d'une session révoquée. Mettre en place l'intégration continue au Lot 1. Le Lot 9 devient alors une recette et non un rattrapage. |
| T-04 | Élevée | **Le cloisonnement par secteur n'est testé qu'au niveau de l'interface.** § 2 relève à juste titre que le prototype contrôle les droits dans l'interface. Le Lot 9 prévoit une « manipulation directe d'une requête » : c'est le bon test, mais il doit être **automatisé et permanent**, pour chaque route et chaque champ, sinon il ne survivra pas au premier refactoring. |
| T-05 | Moyenne | **Surface d'attaque des imports Excel non traitée.** Le Lot 9 dit « contrôle des fichiers importés » sans préciser. → Taille maximale, extensions autorisées, analyse côté serveur dans un traitement borné en mémoire et en temps, aucune évaluation de formule, protection contre les archives piégées. Et à l'export : neutraliser les cellules commençant par `=`, `+`, `-`, `@` (injection de formule). |
| T-06 | Moyenne | **Sessions et appareils partagés.** La révocation est prévue, mais ni la durée de session, ni l'expiration par inactivité. Si un secteur partage une tablette, une session persistante annule le cloisonnement par secteur. → Session courte, déconnexion explicite bien visible, et réauthentification légère si l'appareil est déclaré partagé. |
| T-07 | Moyenne | **Aucun élément d'exploitation courante.** Ni supervision, ni alerte en cas d'échec des traitements de 16 h / 18 h, ni suivi des erreurs. Si le traitement de 18 h tombe en panne un lundi, personne ne le saura avant la réclamation du proviseur. → Prévoir au Lot 1 une supervision minimale : journal centralisé, alerte à l'administrateur technique si un traitement planifié n'a pas abouti, page d'état interne. |
| T-08 | Moyenne | **« Courte coupure » n'est pas quantifié** (Lot 5), alors que le fonctionnement hors ligne étendu est repoussé au Lot 12. → Fixer une cible explicite (par exemple : brouillons conservés localement 72 h, synchronisation automatique au retour du réseau) et l'annoncer aux utilisateurs à l'écran. À Douala, une coupure n'est pas toujours courte : mieux vaut une promesse tenue et modeste. |
| T-09 | Faible | **Aucune exigence d'ergonomie mesurable.** Le Lot 10 mesure le temps de saisie, mais aucune cible n'est fixée. → Poser au Lot 0 une exigence testable, par exemple : saisie d'un événement en moins de 30 secondes et 5 interactions sur téléphone, depuis l'emploi du temps du jour. |

---

## 6. Gouvernance, données personnelles, continuité

| Réf. | Sévérité | Constat et recommandation |
|---|---|---|
| G-01 | Élevée | **Prototype non versionné** (voir § 1.2). Verser le code au dépôt avant le Lot 1. |
| G-02 | **Bloquante** | **Propriété des comptes techniques.** Rien ne dit à qui appartiennent le projet Google, le nom de domaine, l'hébergement, la base et les sauvegardes. Le compte de test prévu est une adresse personnelle. Si ces ressources sont créées sur les comptes personnels du développeur, **le lycée perd son application** le jour où la collaboration s'arrête — et il ne s'en apercevra qu'à ce moment-là. → Tous les comptes de production sont créés au nom d'une **adresse institutionnelle du lycée**, dont le proviseur détient l'accès. Le développeur reçoit une délégation, non la propriété. À faire au Lot 0 : le § 8 mentionne « confirmer l'adresse Gmail institutionnelle » sans échéance ; c'en est le préalable. |
| G-03 | Élevée | **Données personnelles absentes du document.** TeacherWatch constitue un fichier nominatif de comportement professionnel, potentiellement mobilisable dans une procédure disciplinaire. Le document ne dit rien de : finalité déclarée, durée de conservation, personnes habilitées à consulter, information des enseignants, droit de contester une mention. Le contexte camerounais (loi n° 2010/012 relative à la cybersécurité et à la cybercriminalité, missions de l'ANTIC) et le simple devoir de loyauté envers le personnel imposent d'y répondre. → Ajouter une section « Données personnelles » : finalité, durée de conservation et sort des données au-delà, table des habilitations, **note d'information au personnel** remise avant le pilote, et **procédure de contestation** (l'enseignant saisit le proviseur ; la correction éventuelle est tracée avec motif). Le mécanisme de correction du Lot 6 suffit techniquement — ce qui manque est la règle écrite. Ajouter aussi au § 9 une anomalie critique « divulgation de données à une personne non habilitée ». |
| G-04 | Élevée | **Continuité si le développeur unique est indisponible.** Le § 7 envisage explicitement le scénario « développeur seul » et le § 8 ne prévoit aucune mesure de continuité. → Exiger comme livrable de chaque lot : procédure de déploiement écrite et rejouable, inventaire des accès, remise des identifiants de production au proviseur sous pli scellé ou dans un coffre partagé. Sans cela, l'établissement dépend d'une personne. |
| G-05 | Moyenne | **Formation des utilisateurs non planifiée.** Le § 8 promet des « guides d'utilisation » ; aucune séance de formation n'apparaît au calendrier. → Inscrire au Lot 10, étape 1 : une demi-journée de formation des cinq surveillants et du proviseur, et une fiche d'une page par rôle. Le pilote ne mesure rien de fiable si les utilisateurs découvrent l'outil en le testant. |
| G-06 | Moyenne | **Assistance après mise en production non définie.** Le § 10 liste l'assistance comme un coût, sans canal de signalement, sans délai de réponse, sans définition de l'incident bloquant. → Formaliser en une demi-page : canal unique, délais indicatifs par niveau du § 9, personne référente au lycée. |
| G-07 | Moyenne | **Le § 10 est trop vague pour décider.** Il énumère des postes de coût sans un seul montant, sans devise, sans périodicité, et sans dire **qui paie et par quel moyen**. Un hébergement suspendu pour défaut de paiement est une panne totale. → Produire au Lot 0 une estimation chiffrée en FCFA, mensuelle et annuelle, avec moyen de paiement identifié et titulaire nommé. |

---

## 7. Calendrier : vérification

### 7.1 L'estimation annoncée est inférieure à la somme de son propre tableau

Somme des durées du tableau § 7 (Lots 0 à 10) :

| | Minimum | Maximum |
|---|---:|---:|
| Lots 0 à 9 | 16 semaines | 21 semaines |
| Lot 10 — pilote | 2 | 4 |
| **Total** | **18 semaines** | **25 semaines** |

Le document annonce « **15 à 22 semaines** » pour une petite équipe expérimentée : **3 semaines de moins
que son propre tableau**, aux deux bornes.

L'écart ne peut se justifier que par du travail mené en parallèle. Or la chaîne
**Lot 1 → Lot 3 → Lot 4 → Lot 5 → Lot 6 → Lot 7 → Lot 8** est presque strictement séquentielle : on ne
saisit pas d'événements avant d'avoir l'emploi du temps, on ne produit pas de rapports avant d'avoir des
soumissions. Seuls le Lot 2 (indépendant du Lot 3) et une partie du Lot 8 se parallélisent réellement.
→ **Recommandation :** afficher 18 – 25 semaines, en indiquant l'hypothèse d'effectif, et ajouter une
**réserve de 20 à 30 %** pour les aléas — soit une fourchette réaliste de **22 à 32 semaines** en petite
équipe. L'estimation « 5 à 8 mois » pour un développeur seul (22 – 35 semaines) suppose une productivité
équivalente à celle d'une équipe sur l'essentiel du parcours : elle est **optimiste** et devrait être
portée à 8 – 11 mois, réserve incluse.

### 7.2 Risque de calendrier scolaire — le point le plus concret

Le document est daté du **30 juillet 2026**, en pleine fermeture de l'établissement, et le Lot 0 repose
entièrement sur la disponibilité du lycée : validation du périmètre, fourniture des fichiers officiels,
désignation des responsables. Ces travaux **ne peuvent pas commencer avant la rentrée**.

Deux conséquences à intégrer :

1. **Le Lot 0 démarre à la rentrée**, pas maintenant. Ce qui peut être fait en août est le travail
   ne nécessitant pas le lycée : choix de la pile technique, modèles de fichiers d'import à proposer,
   maquettes, chiffrage du § 10, mise en place du dépôt. À faire, mais sans compter ces semaines comme
   du Lot 0 validé.
2. **Le pilote doit se dérouler pendant une période de cours normale.** Il faut donc éviter les périodes
   d'examens (probatoire, baccalauréat, CAP) et les fins d'année, pendant lesquelles l'emploi du temps
   normal ne s'applique plus — ce qui rendrait sans valeur la comparaison avec le registre de contrôle,
   qui est la finalité même du Lot 10.
   → Cible recommandée : **pilote au 2ᵉ trimestre**, mise en production générale à une **rentrée**, la
   seule date où l'on peut changer les habitudes d'un établissement sans les casser en cours d'année.

### 7.3 Le Lot 0 est sous-dimensionné

Une semaine ne suffit pas pour produire et faire valider : cahier des charges révisé, dictionnaire des
données, deux modèles Excel, maquettes, matrice des droits, critères du pilote, règle de comptage
(B-01), règle des jumelées (B-02), calendrier scolaire (B-03), règles de justification (B-04), choix du
canal d'envoi (B-06c), vérification des comptes Google (B-08), chiffrage (G-07) et attribution des
comptes institutionnels (G-02) — le tout en dépendant des délais de réponse d'un établissement en
activité.
→ **Porter le Lot 0 à 2 – 3 semaines** et en faire une véritable barrière : le Lot 1 ne démarre pas
avant sa validation écrite. C'est la seule semaine supplémentaire du projet qui en économise plusieurs.

### 7.4 Le pilote n'a pas de seuil de décision

Le Lot 10 définit sept indicateurs pertinents, puis une décision de fin de pilote reposant sur cinq
conditions **entièrement qualitatives**. « Les rapports correspondent aux données validées » se discute ;
« écart ≤ 2 % sur dix jours consécutifs » se constate.
→ Chiffrer les seuils au Lot 0, par exemple : ≥ 90 % des jours-secteurs soumis avant 18 h sur les dix
derniers jours de cours ; écart avec le registre ≤ 2 % ; **zéro** soumission perdue ou dupliquée ; zéro
accès hors secteur ; une restauration réussie sous 4 h ; temps médian de saisie ≤ 30 s.

---

## 8. Récapitulatif priorisé

### 8.1 Bloquant — à résoudre au Lot 0, avant tout développement du socle

| Réf. | Sujet |
|---|---|
| B-01 | Définir la règle de comptage des heures d'absence (tranches, retards, départs anticipés, blocs) |
| B-02 | Définir les classes jumelées et leur comptage selon l'axe d'agrégation |
| B-03 | Créer un calendrier des jours de cours conditionnant les traitements de 16 h et 18 h |
| B-04 | Introduire la justification des absences et la situation administrative des enseignants |
| B-05 | Poser le principe d'instantané des événements dans le modèle de données |
| B-06 | Revoir l'envoi : numérotation des générations, volume consolidé, canal d'expédition |
| B-07 | Choisir le canal du rappel de 16 h (application + e-mail, évaluer le SMS) |
| B-08 | Vérifier les comptes Google des cinq surveillants, prévoir un accès de repli |
| B-09 | Distinguer « non concerné », « soumis sans absence » et « non soumis » |
| B-10 | Poser `Africa/Douala` comme invariant, et le sort des saisies après 18 h |
| B-11 | Produire la matrice des droits et arrêter la liste des rôles |
| G-02 | Créer tous les comptes de production au nom du lycée, pas d'une personne |

### 8.2 Élevé — à traiter dans le lot concerné, avant le pilote

G-01 (versionner le prototype) · G-03 (données personnelles et contestation) · G-04 (continuité) ·
T-01 (idempotence) · T-02 (RPO / RTO) · T-03 (tests automatisés dès chaque lot) · T-04 (cloisonnement
testé côté serveur) · I-01 (« sur cinq » codé en dur) · I-05 (retour arrière et événements) ·
I-06 (seuil de modification massive) · I-08 (champs et inaltérabilité de l'audit) · I-09 (gel des
corrections) · § 7.1 (corriger l'estimation et ajouter une réserve) · § 7.3 (Lot 0 à 2 – 3 semaines) ·
§ 7.4 (seuils chiffrés du pilote)

### 8.3 Moyen — à intégrer sans bloquer

I-02, I-03, I-04, I-07, I-10, I-11, I-12, I-13, I-14 · T-05 à T-08 · G-05, G-06, G-07 · § 7.2 (ancrer le
calendrier sur l'année scolaire)

### 8.4 Faible

T-09 (cible d'ergonomie mesurable — recommandée malgré tout, car peu coûteuse et utile au pilote)

---

## 9. Lot 0 révisé — livrables proposés

Remplacer la liste de quatre livrables du § 6 (Lot 0) et les six points du § 11 par la liste suivante,
**durée 2 – 3 semaines**, démarrage à la rentrée scolaire.

1. **Cahier des charges révisé**, intégrant les décisions B-01 à B-11.
2. **Règle de comptage** — une page : les 10 tranches horaires détaillées, la conversion de chaque type
   d'événement en heures, le traitement des jumelées et des blocs, deux exemples chiffrés servant de jeu
   de test de référence.
3. **Calendrier scolaire 2026-2027** — jours de cours, fériés, congés, périodes d'examens, découpage en
   trimestres.
4. **Nomenclature des absences** — types de justification, situations administratives, et qui a le droit
   de qualifier quoi.
5. **Matrice des droits** — actions sensibles × rôles, rôles arrêtés.
6. **Dictionnaire des données**, incluant explicitement les champs d'instantané des événements (B-05) et
   les identifiants d'idempotence (T-01).
7. **Modèle officiel du fichier du personnel** + un fichier réel d'exemple anonymisé.
8. **Modèle officiel de l'emploi du temps** + un fichier réel d'exemple, comportant au moins un cas de
   classe jumelée et un cas d'enseignant sans matricule.
9. **Maquettes validées** des écrans du MVP, dont l'écran de saisie sur téléphone.
10. **Critères d'acceptation du pilote chiffrés** (§ 7.4).
11. **Décisions techniques** — pile applicative, hébergeur, canal d'expédition des e-mails, canal du
    rappel de 16 h.
12. **Note de gouvernance** — comptes institutionnels et leur titulaire (G-02), estimation chiffrée en
    FCFA avec moyen de paiement (G-07), note d'information au personnel et procédure de contestation
    (G-03), procédure de continuité (G-04).
13. **Dépôt Git opérationnel** contenant le prototype existant (G-01) et l'intégration continue (T-03).

**Barrière de sortie :** validation écrite du proviseur sur les points 1 à 12, et aucune règle critique
restée ambiguë. Le Lot 1 ne démarre pas avant.

---

## 10. Questions à poser au lycée

Ces questions n'ont pas de réponse dans le document et conditionnent le développement. Elles gagnent à
être traitées en une seule séance de travail avec le proviseur.

**Comptage et emploi du temps**

1. Quelles sont les dix tranches horaires exactes, et sont-elles toutes de même durée ?
2. Un retard doit-il compter en heures d'absence ? Un départ anticipé ?
3. Une absence sur un cours de deux tranches consécutives : une ligne ou deux dans le rapport ?
4. Qu'est-ce précisément qu'une classe jumelée ici, et combien d'heures faut-il compter ?
5. Y a-t-il cours le samedi ? Sur quelles tranches ?

**Absences et personnel**

6. Le rapport doit-il distinguer les absences justifiées ? Qui décide de la qualification ?
7. Comment traiter un enseignant en mission, en congé de maladie ou en formation ?
8. Un enseignant remplacé sur son cours : est-ce une absence ?
9. Un cours non tenu pour une cause étrangère à l'enseignant (salle, examen, intempérie) doit-il
   apparaître, et sous quelle mention ?
10. Tous les enseignants ont-ils un matricule ? Sinon, comment identifier les autres ?

**Rôles et accès**

11. Combien d'administrateurs délégués, et qui ? Peuvent-ils gérer d'autres administrateurs ?
12. Faut-il un accès en lecture seule pour le censeur, le chef de travaux ou le secrétariat ?
13. Les cinq surveillants désignés ont-ils tous un compte Google fonctionnel ?
14. Un enseignant peut-il consulter son propre relevé ? (Question sensible, à trancher sciemment.)

**Envois et calendrier**

15. Le proviseur veut-il un e-mail après chaque soumission, ou un seul envoi consolidé à 18 h ?
16. Quelle adresse institutionnelle sera propriétaire des comptes de production ?
17. Le lycée dispose-t-il d'un Google Workspace et d'un nom de domaine ?
18. Sur quel trimestre viser le pilote ?

**Exploitation**

19. Qui, au lycée, est le référent en cas de panne, et par quel canal le signale-t-on ?
20. Qui paie l'hébergement, par quel moyen, et qui est prévenu avant l'échéance ?

---

## 11. Conclusion

La feuille de route est solide dans sa méthode : le découpage en lots, les critères d'acceptation, la
protection de l'historique et le pilote en double saisie sont les bons choix, et l'audit recommande de
les conserver tels quels.

Ce qui manque n'est pas de la structure mais **des décisions métier**, et elles sont peu nombreuses :
comment on compte une heure d'absence, ce qu'est une classe jumelée, quels jours sont des jours de
cours, ce qu'est une absence justifiée, et à quel instant un événement fige ses données. Cinq réponses
que seul le lycée peut donner, et dont dépend la validité de tout le reste — y compris de critères que
le document lui-même qualifie de critiques.

S'y ajoutent deux points de gouvernance qui ne coûtent presque rien maintenant et beaucoup plus tard :
les comptes de production doivent appartenir au lycée, et le personnel doit être informé de l'existence
du fichier qui le concerne.

**Action recommandée :** ouvrir le Lot 0 révisé (§ 9) dès la rentrée, sur 2 à 3 semaines, en commençant
par la séance de décision du § 10. Le développement du socle ne devrait pas démarrer avant.
