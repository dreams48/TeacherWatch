#!/bin/bash
# Scénario de test de bout en bout TeacherWatch
set -u
B=http://localhost:3000
J="/tmp/tw-cookies"
ok=0; ko=0
verif() { # verif <libellé> <attendu> <obtenu>
  if [[ "$3" == *"$2"* ]]; then ok=$((ok+1)); echo "OK   $1";
  else ko=$((ko+1)); echo "ÉCHEC $1 — attendu «$2», obtenu: $(echo "$3" | head -c 200)"; fi
}

rm -f $J-*

# 1. connexion proviseur + changement de mdp obligatoire
r=$(curl -s -c $J-prov -b $J-prov -d "email=mvondomekaully@gmail.com&mdp=ChangezMoi2026!" -o /dev/null -w "%{redirect_url}" $B/connexion)
verif "connexion proviseur" "http" "$r"
r=$(curl -s -c $J-prov -b $J-prov -o /dev/null -w "%{redirect_url}" $B/)
verif "redirection changement mdp" "mot-de-passe" "$r"
r=$(curl -s -c $J-prov -b $J-prov -d "actuel=ChangezMoi2026!&nouveau=MotDePasseSur99&confirmation=MotDePasseSur99" -o /dev/null -w "%{redirect_url}" $B/mot-de-passe)
verif "changement mdp" "$B/" "$r"
r=$(curl -s -b $J-prov $B/)
verif "tableau de bord proviseur" "Suivi du" "$r"

# 2. adresse non autorisée refusée
r=$(curl -s -d "email=inconnu@exemple.com&mdp=xxx" $B/connexion)
verif "adresse non autorisée refusée" "non autorisé" "$r"

# 3. création d'un surveillant (secteur 1)
r=$(curl -s -b $J-prov -c $J-prov -d "nom=Surveillant Test&email=surv1@exemple.com&role=surveillant&secteur_id=1" -o /dev/null -w "%{redirect_url}" $B/admin/utilisateurs)
verif "création surveillant" "utilisateurs" "$r"
MDP1=$(curl -s -b $J-prov "$r" | grep -o 'Mot de passe initial : [^ <]*' | head -1 | sed 's/.*: //')
echo "     mdp initial surveillant: $MDP1"

# 4. import personnel (CSV)
cat > /tmp/personnel.csv <<EOF
Matricule,Nom,Spécialité,Téléphone
MAT001,KAMGA Jean,Électrotechnique,690000001
MAT002,NGO BIYAGA Marie,Mécanique,690000002
MAT003,FOTSO Paul,Mathématiques,
EOF
r=$(curl -s -b $J-prov -F "fichier=@/tmp/personnel.csv" -o /dev/null -w "%{redirect_url}" $B/imports/personnel)
verif "analyse import personnel" "/imports/personnel/" "$r"
IMPID=${r##*/}
r=$(curl -s -b $J-prov "$r")
verif "aperçu personnel: téléphone manquant signalé" "Téléphone manquant" "$r"
r=$(curl -s -b $J-prov -d "" $B/imports/personnel/$IMPID/publier)
verif "publication personnel" "Import publié" "$r"

# 5. import EDT (jour = aujourd'hui pour tester la saisie)
JOUR=$(TZ=Africa/Douala date +%u)  # 1-7
[ "$JOUR" -ge 6 ] && JOUR=5
cat > /tmp/edt.csv <<EOF
Jour,Tranche,Classe,Secteur,Matricule,Matière,Jumelage
$JOUR,1,F4-1A,Secteur 1,MAT001,Électrotechnique,
$JOUR,1,F4-1B,Secteur 1,MAT001,Électrotechnique,J1
$JOUR,1,F4-1C,Secteur 1,MAT001,Électrotechnique,J1
$JOUR,2,MECA-2A,Secteur 2,MAT002,Mécanique,
$JOUR,3,F4-1A,Secteur 1,MAT003,Maths,
EOF
r=$(curl -s -b $J-prov -F "fichier=@/tmp/edt.csv" -o /dev/null -w "%{redirect_url}" $B/imports/edt)
verif "analyse import EDT" "/imports/edt/" "$r"
EDTID=${r##*/}
r=$(curl -s -b $J-prov -d "" $B/imports/edt/$EDTID/publier)
verif "publication EDT" "publié" "$r"

# 6. EDT avec enseignant inconnu -> bloquant
cat > /tmp/edt-mauvais.csv <<EOF
Jour,Tranche,Classe,Secteur,Matricule,Matière
1,1,X-1,Secteur 1,INCONNU99,Test
EOF
r=$(curl -s -b $J-prov -F "fichier=@/tmp/edt-mauvais.csv" -o /dev/null -w "%{redirect_url}" $B/imports/edt)
r=$(curl -s -b $J-prov "$r")
verif "EDT enseignant non reconnu = bloquant" "non reconnu" "$r"

# 7. connexion surveillant + activation
r=$(curl -s -c $J-surv -d "email=surv1@exemple.com&mdp=$MDP1" -o /dev/null -w "%{redirect_url}" $B/connexion)
verif "connexion surveillant (activation)" "http" "$r"
curl -s -c $J-surv -b $J-surv -d "actuel=$MDP1&nouveau=SurveillantMdp1&confirmation=SurveillantMdp1" -o /dev/null $B/mot-de-passe
r=$(curl -s -b $J-surv $B/saisie)
verif "écran de saisie surveillant" "Nouvel événement" "$r"
verif "cours du jour visibles (jumelage)" "jumelée" "$r"

# 8. le surveillant voit uniquement son secteur dans l'EDT
r=$(curl -s -b $J-surv "$B/edt?vue=classe")
verif "cloisonnement EDT: pas de secteur 2" "F4-1A" "$r"
if [[ "$r" == *"MECA-2A"* ]]; then ko=$((ko+1)); echo "ÉCHEC cloisonnement: MECA-2A visible"; else ok=$((ok+1)); echo "OK   cloisonnement EDT: secteur 2 invisible"; fi

# 9. saisie d'un événement depuis l'EDT (cours id 1 = T1 F4-1A MAT001)
AUJ=$(TZ=Africa/Douala date +%F)
COURS_ID=$(curl -s -b $J-surv $B/saisie | grep -oE "option value=\"[0-9]+\"" | head -1 | grep -oE "[0-9]+")
UUID=$(cat /proc/sys/kernel/random/uuid)
r=$(curl -s -b $J-surv -d "uuid=$UUID&date_jour=$AUJ&secteur_id=1&cours_id=$COURS_ID&type=absence" -o /dev/null -w "%{redirect_url}" $B/evenements)
verif "création événement" "saisie" "$r"
# rejeu du même uuid -> pas de doublon
curl -s -b $J-surv -d "uuid=$UUID&date_jour=$AUJ&secteur_id=1&cours_id=$COURS_ID&type=absence" -o /dev/null $B/evenements
NB=$(curl -s -b $J-surv $B/saisie | grep -c 'Supprimer')
verif "idempotence uuid (1 seul brouillon)" "1" "$NB"

# 10. doublon signalé sans confirmation
r=$(curl -s -b $J-surv -d "date_jour=$AUJ&secteur_id=1&cours_id=$COURS_ID&type=absence&uuid=$(cat /proc/sys/kernel/random/uuid)" -o /dev/null -w "%{redirect_url}" $B/evenements)
verif "doublon signalé" "Doublon" "$r"

# 11. saisie pour un autre secteur refusée
r=$(curl -s -b $J-surv -d "date_jour=$AUJ&secteur_id=1&tranche_id=1&enseignant_id=2&classe_id=4&type=absence&uuid=$(cat /proc/sys/kernel/random/uuid)" $B/evenements)
verif "classe d un autre secteur refusée" "autre secteur" "$r"

# 12. soumission
r=$(curl -s -b $J-surv -d "uuid=$(cat /proc/sys/kernel/random/uuid)&date_jour=$AUJ&secteur_id=1" -o /dev/null -w "%{redirect_url}" $B/soumissions)
verif "soumission" "saisie" "$r"
r=$(curl -s -b $J-surv $B/saisie)
verif "soumission listée" "Avec événements" "$r"

# 13. événement soumis immuable pour le surveillant
EVID=$(sqlite3 data/teacherwatch.db "SELECT id FROM evenements WHERE statut='soumis' LIMIT 1" 2>/dev/null || echo 1)
r=$(curl -s -b $J-surv -d "" $B/evenements/$EVID/supprimer)
verif "événement soumis immuable" "immuable" "$r"

# 14. correction par le proviseur avec motif
r=$(curl -s -b $J-prov -d "motif=erreur de saisie&justification=justifiee&type=absence" -o /dev/null -w "%{http_code}" $B/evenements/$EVID/corriger)
verif "correction direction (302)" "302" "$r"

# 15. soumission vide « aucune absence » (secteur sans brouillon -> confirmation requise)
r=$(curl -s -b $J-surv -d "uuid=$(cat /proc/sys/kernel/random/uuid)&date_jour=$AUJ&secteur_id=1" -o /dev/null -w "%{redirect_url}" $B/soumissions)
verif "soumission vide exige confirmation" "confirme" "$r"
r=$(curl -s -b $J-surv -d "uuid=$(cat /proc/sys/kernel/random/uuid)&date_jour=$AUJ&secteur_id=1&confirmer_vide=1" -o /dev/null -w "%{redirect_url}" $B/soumissions)
verif "soumission « aucune absence »" "saisie" "$r"

# 16. rapport journalier + jumelage sans double comptage
r=$(curl -s -b $J-prov "$B/rapports?type=journalier&du=$AUJ")
verif "rapport journalier affiché" "Récapitulatif par enseignant" "$r"

# 17. export Word
r=$(curl -s -b $J-prov -o /tmp/rapport.docx -w "%{http_code}" "$B/rapports/export.docx?type=journalier&du=$AUJ")
verif "export docx (200)" "200" "$r"
file /tmp/rapport.docx | grep -qi "Microsoft Word\|Zip" && { ok=$((ok+1)); echo "OK   docx valide"; } || { ko=$((ko+1)); echo "ÉCHEC docx invalide: $(file /tmp/rapport.docx)"; }

# 18. envoi e-mail (SMTP non configuré -> journalisé)
r=$(curl -s -b $J-prov -d "type=journalier&du=$AUJ" -o /dev/null -w "%{redirect_url}" $B/rapports/envoyer)
verif "envoi journalisé sans SMTP" "configur" "$r"

# 19. surveillant ne peut pas accéder à l'admin
r=$(curl -s -b $J-surv -o /dev/null -w "%{http_code}" $B/admin/utilisateurs)
verif "admin interdit au surveillant (403)" "403" "$r"
r=$(curl -s -b $J-surv -o /dev/null -w "%{http_code}" $B/rapports)
verif "rapports interdits au surveillant (403)" "403" "$r"

# 20. le proviseur ne peut pas être désactivé
r=$(curl -s -b $J-prov -d "statut=archive" $B/admin/utilisateurs/1/statut)
verif "compte principal indésactivable" "ne peut pas être désactivé" "$r"

# 21. révocation de session
curl -s -b $J-prov -d "" -o /dev/null $B/admin/utilisateurs/2/revoquer-sessions
r=$(curl -s -b $J-surv -o /dev/null -w "%{redirect_url}" $B/saisie)
verif "session révoquée -> reconnexion" "connexion" "$r"

# 22. sauvegarde manuelle
r=$(curl -s -b $J-prov -d "" -o /dev/null -w "%{redirect_url}" $B/admin/sauvegardes/maintenant)
sleep 1
r=$(curl -s -b $J-prov $B/admin/sauvegardes)
verif "sauvegarde créée" "teacherwatch-" "$r"

# 23. journal d'audit
r=$(curl -s -b $J-prov $B/admin/audit)
verif "audit: correction tracée" "correction_evenement" "$r"
verif "audit: soumission tracée" "soumission" "$r"

echo
echo "=== $ok OK, $ko ÉCHEC ==="
exit $ko
