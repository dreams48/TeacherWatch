# Analyse des fichiers réels du lycée

**Fichiers examinés :** `Emploi_du_temps.xlsx` (feuille `Feuil2`, 3 695 lignes de cours) et
`fichier_par_département.xlsx` (4 feuilles, 380 personnes)
**Date :** 30 juillet 2026

Ce document complète l'audit du cahier des charges. Plusieurs questions que l'audit laissait ouvertes
trouvent ici une réponse tirée des données ; d'autres problèmes, invisibles sur le papier,
apparaissent.

---

## 1. Réponses apportées par les fichiers

### 1.1 Les dix tranches horaires (question B-01 de l'audit)

Après normalisation de la casse et correction de deux coquilles, l'emploi du temps comporte
**exactement dix tranches**, ce qui confirme le cahier des charges :

| | Horaire | Durée |
|---|---|---:|
| T1 | 07h30 – 08h20 | 50 min |
| T2 | 08h20 – 09h10 | 50 min |
| T3 | 09h10 – 10h00 | 50 min |
| T4 | 10h15 – 11h05 | 50 min |
| T5 | 11h05 – 11h55 | 50 min |
| **T6** | **11h55 – 12h55** | **60 min** |
| T7 | 12h55 – 13h45 | 50 min |
| T8 | 13h45 – 14h35 | 50 min |
| T9 | 14h35 – 15h25 | 50 min |
| T10 | 15h25 – 16h15 | 50 min |

> **Point important.** Les tranches **ne sont pas toutes de même durée** : T6 dure une heure, les
> neuf autres cinquante minutes. Une absence ne vaut donc pas toujours la même chose. La règle de
> comptage doit être écrite en conséquence — l'application calcule aujourd'hui `durée de la tranche
> ÷ 60`, ce qui donne 0,83 h pour une tranche ordinaire et 1 h pour T6. **À confirmer par le
> proviseur :** faut-il compter en heures réelles, ou compter 1 « heure de cours » par tranche quelle
> que soit sa durée ? Les deux sont défendables et donnent des totaux différents.

### 1.2 Situations administratives (question B-04)

La colonne **OBSERVATION** du fichier du personnel porte déjà des situations, pour 26 personnes :
`CONGE MATERNITE`, `STAGE`, `HORS DU PAYS`, `RETOUR SUR TITRE`. Deux feuilles entières y sont même
consacrées : `PERSONNEL N'AYANT PAS PRIS SERVICE` et `PERSONNEL HORS DU PAYS`.

Le besoin d'exclure ces enseignants de la saisie est donc réel et déjà suivi à la main. L'application
reprend cette colonne.

### 1.3 Les rôles réels (question B-11)

La colonne **FONCTION OCCUPEE** donne l'organisation effective :

| Fonction | Effectif |
|---|---:|
| ENSEIGNANT | 305 |
| CENSEUR | 13 |
| SURVEILLANT GENERAL | 13 |
| CHEF DE TRAVAUX | 8 |
| CO (conseiller d'orientation) | 7 |
| **SURVEILLANT DE SECTEUR** | **4** |
| PROVISEUR | 1 |
| INTENDANT, comptable, chefs de service | 5 |

> **Deux constats.** D'abord, le cahier des charges parle de **cinq secteurs** mais le fichier ne
> compte que **quatre surveillants de secteur** : soit un poste est vacant, soit un surveillant en
> couvre deux, soit le découpage a changé. À trancher avant le pilote — c'est le socle du
> cloisonnement.
> Ensuite, les trois rôles de l'application (proviseur, administrateur, surveillant) ne couvrent pas
> une organisation qui compte 13 censeurs, 13 surveillants généraux et 8 chefs de travaux. La matrice
> des droits doit dire lesquels ont besoin d'un accès, et lequel.

---

## 2. Problèmes révélés par les données

### 2.1 Les classes jumelées sont implicites, nombreuses, et traversent les secteurs

L'emploi du temps **n'a pas de colonne « jumelage »**. Le jumelage se déduit : un même enseignant
tient plusieurs classes sur la même tranche et le même jour.

| Mesure | Valeur |
|---|---:|
| Créneaux jumelés par semaine | **303** |
| dont groupements de 2 classes | 300 |
| dont groupements de 3 classes | 3 |
| **dont à cheval sur plusieurs secteurs** | **113 (37 %)** |

Exemples réels :

| Jour · tranche | Enseignant | Classes | Secteurs concernés |
|---|---|---|---|
| Jeudi T1 | DJAM BAHEL Jean Marc | A1 GELB + A1 GMA | Génie Électrique \| Génie Mécanique |
| Lundi T1 | NZODIA Ines | A1 GELA + A1 GMB | Génie Électrique \| Génie Mécanique |
| Mercredi T6 | TATIAZEU TSAFACK Ariane G. | A1 GMA + A3 ELNI + A3 FRCL | Mécanique \| Électrique \| Civil |

> **Conséquence, et c'est la plus lourde de l'analyse.** Plus d'un tiers des cours jumelés concernent
> deux secteurs différents. **Deux surveillants peuvent donc déclarer de bonne foi la même absence.**
> Sans garde-fou, le rapport la compterait deux fois — précisément l'anomalie que le cahier des
> charges classe en priorité élevée.
>
> L'application a été corrigée en conséquence : une déclaration sur un cours jumelé enregistre le
> **groupement complet** (« A1 GELB + A1 GMA »), compte **une seule heure**, et le contrôle des
> doublons porte sur **tous les secteurs** — pas seulement celui du surveillant qui saisit. Le
> second surveillant voit que l'absence est déjà déclarée et par quel secteur.

### 2.2 Plusieurs enseignants dans une même cellule

Le rapprochement des 314 noms de l'emploi du temps avec le fichier du personnel donne :

| Résultat | Nombre |
|---|---:|
| Correspondance exacte | 197 |
| Correspondance partielle (accents, « épse », espaces) | 74 |
| Approchante, à valider à la main | 9 |
| **Aucune correspondance** | **34 (11 %)** |

Les non-rapprochés révèlent un problème de modèle, pas de saisie :

```
HAROUNA / KAMDEM
TAFOTIE / MEPOUO / YEP
MEPOUOK(METRO), NGANKAM(FRAIS), ZEDONG(TOURN)
TCHUENKAM / KEMFO
FEUTSEU / TCHUENKAM
```

> Ces cellules contiennent **deux ou trois enseignants pour un même cours** — vraisemblablement des
> travaux pratiques encadrés à plusieurs, avec rotation d'ateliers (métrologie, fraisage, tournage
> pour la dernière). Le cahier des charges suppose **un enseignant par cours** : ni la saisie, ni le
> rapport, ni le comptage ne savent traiter ce cas.
>
> **Question à trancher au Lot 0 :** sur un TP encadré par trois enseignants, si l'un manque,
> qu'enregistre-t-on ? Une absence sur le cours, ou une absence par enseignant ? Et le cours est-il
> considéré comme tenu ? Tant que la réponse n'est pas écrite, ces créneaux ne peuvent pas être
> suivis.

Autres cas à corriger dans le fichier : des noms réduits au patronyme (`ZIEM`, `NIPA`, `KANA`,
`ZOLEKO`) qui ne permettent pas d'identifier une personne parmi 380, et un préfixe parasite
(`PROF NOUMEDEM`).

### 2.3 Un nom d'enseignant dans la colonne « Matière »

Le libellé **« MSEE Jolie Marie Fleur »** — et sa variante « TP MSEE Jolie Marie Fleur » — apparaît
comme *matière*. C'est un nom de personne placé dans la mauvaise colonne. À corriger à la source.

### 2.4 Coquilles sur les horaires

| Valeur trouvée | Lignes | Lecture retenue |
|---|---:|---|
| `11H45 – 12H55` | 5 | coquille pour `11H55 – 12H55` |
| `11H55 – 12H56` | 5 | coquille pour `11H55 – 12H55` |

S'y ajoute l'écriture aléatoire de la casse (`07H30` et `07h30` coexistent), qui faisait apparaître
**22 tranches distinctes** au lieu de 10. L'import normalise la casse ; les deux coquilles ont été
corrigées à la lecture, mais **il faut les corriger dans le fichier source**.

### 2.5 286 libellés de matière pour une centaine de matières réelles

55 groupes de libellés désignent la même matière écrite de plusieurs façons :

```
Mathématiques / Maths / MATHS / MATHEMATIQUES
Informatique / INFORMATIQUE / Info / INFO / Informarique / Infonformatique
Français / FRANÇAIS / Francais
Bibliothèque / BIBLIOTHÈQUE / Bibliotheque
Métier et Formation / Métier et Form. / Métier et Form
```

`Informarique` et `Infonformatique` sont des fautes de frappe. Sans normalisation, tout regroupement
statistique par matière (Lot 11) sera faux. La matière n'entrant pas dans le calcul des heures, ce
n'est pas bloquant pour le MVP — mais c'est à nettoyer avant les statistiques.

### 2.6 885 lignes sans enseignant — et c'est normal

885 des 3 695 lignes n'ont pas d'enseignant : `Bibliothèque`, `PAUSE`, `Orientation`, `-`. Ce sont
des créneaux non pédagogiques. Ils **ne doivent pas** attendre de déclaration d'absence, ni entrer
dans le calcul des taux. L'application les affiche en grisé, non saisissables.

### 2.7 Les vacataires n'ont pas de matricule

Dans la feuille `PERSONNEL VACATAIRE`, la colonne MATRICULE contient littéralement le mot
« vacataire » pour les 23 personnes concernées. Combiné aux 34 noms non rapprochés, cela fait
**57 enseignants sur 249** présents à l'emploi du temps sans matricule exploitable.

Le matricule figurant dans les deux tableaux du rapport officiel, il faut décider : identifiant
interne de remplacement, ou mention « vacataire » assumée dans le rapport ?

### 2.8 Pas de colonne « Secteur »

L'emploi du temps ne rattache pas les classes à un secteur. Les 74 classes ont été réparties par
famille de filière, **à titre de proposition à valider** :

| Secteur proposé | Classes | Filières regroupées |
|---|---:|---|
| Génie Électrique | 14 | GEL, ELME, ELNI, F3 |
| Génie Mécanique | 23 | GM, MACO, MARE, MEFA, MEFE, F1, CMA/MVT |
| Génie Civil et Bois | 14 | GCI, F4/BA, AIBC, AICI, FRCL |
| Génie Chimique et Biologie | 17 | GCH, F6, F7, CH/TI |
| Tertiaire et Santé | 6 | F8 |

Ce découpage n'a aucune valeur officielle : il fallait bien un rattachement pour faire fonctionner le
cloisonnement. **Le lycée doit fournir le vrai.** Il conditionne qui voit quoi, et le rattachement
des quatre (ou cinq) surveillants de secteur.

### 2.9 La colonne « Absence » est vide

La dernière colonne de l'emploi du temps s'appelle `Absence` et n'est renseignée sur aucune des
3 695 lignes. Le suivi était prévu dans ce fichier mais n'a pas été tenu — ce qui est exactement le
besoin auquel l'application répond.

---

## 3. À corriger dans les fichiers avant la mise en service

Par ordre d'importance :

1. **Éclater les cellules à plusieurs enseignants** (5 cas au moins) ou décider de la règle de
   comptage des TP co-encadrés.
2. **Compléter les noms réduits au patronyme** (`ZIEM`, `NIPA`, `KANA`, `ZOLEKO`, `TEMNGHAH`…) pour
   permettre l'identification.
3. **Corriger les deux horaires fautifs** `11H45 – 12H55` et `11H55 – 12H56`.
4. **Déplacer « MSEE Jolie Marie Fleur »** de la colonne Matière vers la colonne Enseignant.
5. **Ajouter une colonne Secteur** à l'emploi du temps, ou fournir la table de correspondance
   classe → secteur.
6. **Uniformiser les libellés de matière** (avant les statistiques, pas avant le MVP).
7. **Trancher l'identification des vacataires** sans matricule.

## 4. Décisions attendues du proviseur

1. Heures réelles (T6 = 1 h, les autres 0,83 h) ou une « heure de cours » par tranche ?
2. Les retards et départs anticipés entrent-ils dans les heures d'absence ?
3. Sur un cours jumelé à cheval sur deux secteurs, quel surveillant déclare ?
4. Sur un TP co-encadré, que compte-t-on si un seul enseignant manque ?
5. Cinq secteurs pour quatre surveillants : quel est le découpage réel et qui couvre quoi ?
6. Quel rattachement officiel des 74 classes aux secteurs ?
7. Les censeurs, surveillants généraux et chefs de travaux ont-ils besoin d'un accès, et lequel ?
