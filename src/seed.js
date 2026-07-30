// TeacherWatch — amorçage : compte proviseur, 5 secteurs, 10 tranches, réglages.
// Relançable sans risque (n'écrase rien d'existant).
const bcrypt = require('bcryptjs');
const { db, getSetting, setSetting } = require('./db');

const PROVISEUR_EMAIL = process.env.PROVISEUR_EMAIL || 'mvondomekaully@gmail.com';
const PROVISEUR_MDP = process.env.PROVISEUR_MDP || 'ChangezMoi2026!';

// 5 secteurs (à renommer dans Admin selon l'organisation réelle du lycée)
const SECTEURS = ['Secteur 1', 'Secteur 2', 'Secteur 3', 'Secteur 4', 'Secteur 5'];

// 10 tranches horaires PROVISOIRES — à confirmer par le lycée (audit B-01),
// modifiables dans Admin → Tranches horaires.
const TRANCHES = [
  ['07:30', '08:25'], ['08:25', '09:20'], ['09:20', '10:15'], ['10:30', '11:25'],
  ['11:25', '12:20'], ['12:30', '13:25'], ['13:25', '14:20'], ['14:30', '15:25'],
  ['15:25', '16:20'], ['16:20', '17:15'],
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
  // Règle de comptage PROVISOIRE (audit B-01) — à valider par le proviseur :
  // absence = durée de la tranche ; retard et départ anticipé listés mais
  // comptés 0 h par défaut (modifiable dans Admin → Règles).
  if (!getSetting('compte_retard_heures')) setSetting('compte_retard_heures', '0');
  if (!getSetting('compte_depart_heures')) setSetting('compte_depart_heures', '0');
  if (!getSetting('heure_rappel')) setSetting('heure_rappel', '16:00');
  if (!getSetting('heure_verrouillage')) setSetting('heure_verrouillage', '18:00');
  if (!getSetting('envoi_mode')) setSetting('envoi_mode', 'consolide'); // audit B-06b
});
tx();
console.log('Amorçage terminé.');
