// TeacherWatch — amorçage : compte proviseur, 5 secteurs, 10 tranches, réglages.
// Relançable sans risque (n'écrase rien d'existant).
const bcrypt = require('bcryptjs');
const { db, getSetting, setSetting } = require('./db');

const PROVISEUR_EMAIL = process.env.PROVISEUR_EMAIL || 'mvondomekaully@gmail.com';
const PROVISEUR_MDP = process.env.PROVISEUR_MDP || 'ChangezMoi2026!';

// 5 secteurs (à renommer dans Admin selon l'organisation réelle du lycée)
const SECTEURS = ['Secteur 1', 'Secteur 2', 'Secteur 3', 'Secteur 4', 'Secteur 5'];

// Les dix tranches horaires réelles du lycée, relevées dans son emploi du temps
// et confirmées par son prototype. Neuf tranches de 50 minutes ; celle de
// 11h55–12h55 en dure 60. Modifiables dans Admin → Tranches horaires.
const TRANCHES = [
  ['07:30', '08:20'], ['08:20', '09:10'], ['09:10', '10:00'], ['10:15', '11:05'],
  ['11:05', '11:55'], ['11:55', '12:55'], ['12:55', '13:45'], ['13:45', '14:35'],
  ['14:35', '15:25'], ['15:25', '16:15'],
];

function minutes(deb, fin) {
  const [h1, m1] = deb.split(':').map(Number), [h2, m2] = fin.split(':').map(Number);
  return (h2 * 60 + m2) - (h1 * 60 + m1);
}

const tx = db.transaction(() => {
  for (const nom of SECTEURS)
    db.prepare('INSERT OR IGNORE INTO secteurs (nom) VALUES (?)').run(nom);

  TRANCHES.forEach(([deb, fin], i) => {
    db.prepare(`INSERT OR IGNORE INTO tranches (numero, heure_debut, heure_fin, duree_minutes)
                VALUES (?, ?, ?, ?)`).run(i + 1, deb, fin, minutes(deb, fin));
  });

  if (!db.prepare('SELECT 1 FROM users WHERE est_compte_principal = 1').get()) {
    db.prepare(`INSERT INTO users (email, password_hash, nom, role, statut, est_compte_principal, doit_changer_mdp)
                VALUES (?, ?, ?, 'proviseur', 'actif', 1, 1)`)
      .run(PROVISEUR_EMAIL, bcrypt.hashSync(PROVISEUR_MDP, 10), 'Proviseur');
    console.log(`Compte proviseur créé : ${PROVISEUR_EMAIL}`);
    console.log(`Mot de passe initial : ${PROVISEUR_MDP} (changement obligatoire à la première connexion)`);
  }

  // Réglages par défaut
  if (!getSetting('jours_cours')) setSetting('jours_cours', '1,2,3,4,5');
  // Règle de comptage retenue par le lycée (reprise de son prototype) :
  // une absence vaut UNE heure quelle que soit la durée de la tranche, les
  // absences justifiées sont exclues des totaux, les retards et départs
  // anticipés ne comptent aucune heure. Le proviseur peut basculer vers un
  // comptage en heures réelles dans Admin → Règles.
  if (!getSetting('compte_heures_reelles')) setSetting('compte_heures_reelles', '0');
  if (!getSetting('heure_rappel')) setSetting('heure_rappel', '16:00');
  if (!getSetting('heure_verrouillage')) setSetting('heure_verrouillage', '18:00');
  if (!getSetting('envoi_mode')) setSetting('envoi_mode', 'consolide'); // audit B-06b
});
tx();
console.log('Amorçage terminé.');
