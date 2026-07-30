# Tests du MVP

Scénario de bout en bout : `docs/tests-mvp.sh` (38 vérifications).

Exécution : démarrer l'application sur une **base vierge** (`rm -rf data && npm start`),
puis dans un autre terminal : `bash docs/tests-mvp.sh`.

Couverture (croisée avec le Lot 9 de la feuille de route) :
connexion / liste blanche / limitation des tentatives ; changement de mot de passe forcé ;
création et activation d'un surveillant ; import personnel (anomalies, publication) ;
import EDT (rapprochement, enseignant non reconnu bloquant) ; cloisonnement par secteur
(vue EDT et saisie, contrôle serveur) ; idempotence UUID ; doublon signalé ; classe d'un
autre secteur refusée ; soumission avec événements et « aucune absence » ; immuabilité
après soumission ; correction motivée par la direction ; rapport journalier ; fusion des
classes jumelées sans double comptage ; export Word valide ; journalisation d'un envoi
sans SMTP ; 403 sur l'admin et les rapports pour un surveillant ; compte principal
indésactivable ; révocation de session ; sauvegarde manuelle ; journal d'audit.

Dernière exécution : 38 OK, 0 échec (plus vérification manuelle du jumelage :
une ligne « F4-1B + F4-1C », 0,92 h comptée une fois).


---

## Tests de la démonstration

`docs/tests-demo.js` (Playwright, 21 vérifications) couvre l'écran **Comptes et surveillants** et le
sélecteur de rôle : noms réels issus du fichier du personnel, secteur sans titulaire signalé, création
d'un compte à l'état « Invité », protection du compte principal, motif obligatoire pour suspendre,
restrictions de l'administrateur délégué (ni création d'administrateur, ni action sur le compte du
proviseur, ni transfert), traçabilité à l'audit, et absence de débordement horizontal sur mobile.

Exécution : `npm install --no-save playwright` puis `node docs/tests-demo.js`.
