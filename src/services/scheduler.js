// TeacherWatch — traitements planifiés (heure du Cameroun, audit B-10)
// 16 h : rappel aux secteurs concernés n'ayant pas soumis (jours de cours seulement, audit B-03)
// 18 h : verrouillage de la journée + classement « journée sans cours » (§3.5)
// 02 h : sauvegarde quotidienne de la base
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { db, DATA_DIR, getSetting } = require('./../db');
const { TZ, nowDouala, jourSemaine, estJourCours, audit } = require('./../helpers');
const { envoyerEmail } = require('./mail');

// Secteurs ayant des cours programmés un jour donné (audit B-09 : distinguer
// « non concerné » d'un « non soumis »).
function secteursConcernes(dateISO) {
  const js = jourSemaine(dateISO);
  if (js === 7) return [];
  const version = db.prepare('SELECT id FROM edt_versions WHERE actif = 1').get();
  if (!version) // sans emploi du temps publié : tous les secteurs actifs sont concernés
    return db.prepare('SELECT id, nom FROM secteurs WHERE actif = 1').all();
  return db.prepare(`
    SELECT DISTINCT s.id, s.nom FROM emploi_du_temps e
    JOIN classes c ON c.id = e.classe_id
    JOIN secteurs s ON s.id = c.secteur_id AND s.actif = 1
    WHERE e.version_id = ? AND e.jour_semaine = ?`).all(version.id, js);
}

// Statut de chaque secteur pour une journée (tableau de suivi §3.5 / audit B-09)
function statutSecteurs(dateISO) {
  const concernes = new Set(secteursConcernes(dateISO).map(s => s.id));
  const secteurs = db.prepare('SELECT id, nom FROM secteurs WHERE actif = 1').all();
  const jour = db.prepare('SELECT * FROM journees WHERE date_jour = ?').get(dateISO);
  return secteurs.map(s => {
    const soum = db.prepare(`SELECT COUNT(*) n, SUM(type = 'aucune_absence') sans
                             FROM soumissions WHERE secteur_id = ? AND date_jour = ?`).get(s.id, dateISO);
    let statut;
    if (!concernes.has(s.id)) statut = 'non_concerne';
    else if (soum.n === 0) statut = (jour && jour.verrouillee) ? 'non_soumis' : 'en_attente';
    else statut = soum.n === Number(soum.sans) ? 'soumis_sans_absence' : 'soumis_avec_evenements';
    return { ...s, statut, nbSoumissions: soum.n };
  });
}

function notifierProviseur(message) {
  db.prepare(`INSERT INTO notifications (destinataire_role, message) VALUES ('proviseur', ?)`).run(message);
  const prov = db.prepare(`SELECT email FROM users WHERE est_compte_principal = 1`).get();
  if (prov) envoyerEmail({ destinataire: prov.email, sujet: 'TeacherWatch — notification', texte: message })
    .catch(() => {});
}

// --- 16 h : rappel ---------------------------------------------------------
function traitementRappel() {
  const { date } = nowDouala();
  if (!estJourCours(date)) return;
  const jour = db.prepare('SELECT verrouillee FROM journees WHERE date_jour = ?').get(date);
  if (jour && jour.verrouillee) return;
  for (const s of statutSecteurs(date)) {
    if (s.statut === 'en_attente') {
      const surveillants = db.prepare(`SELECT id, email FROM users
        WHERE role = 'surveillant' AND secteur_id = ? AND statut = 'actif'`).all(s.id);
      for (const u of surveillants) {
        db.prepare('INSERT INTO notifications (user_id, message) VALUES (?, ?)')
          .run(u.id, `Rappel : le secteur « ${s.nom} » n'a pas encore transmis son rapport du jour. Verrouillage à ${getSetting('heure_verrouillage', '18:00')}.`);
        envoyerEmail({ destinataire: u.email, sujet: 'TeacherWatch — rappel de soumission',
          texte: `Le secteur « ${s.nom} » n'a pas encore transmis son rapport du ${date}.` }).catch(() => {});
      }
    }
  }
  audit(null, 'traitement_rappel_16h', 'journee', date, null, null, null, null);
}

// --- 18 h : verrouillage + classement (§3.5) -------------------------------
function traitementVerrouillage() {
  const { date } = nowDouala();
  if (!estJourCours(date)) return;
  const deja = db.prepare('SELECT verrouillee FROM journees WHERE date_jour = ?').get(date);
  if (deja && deja.verrouillee) return;

  const concernes = secteursConcernes(date);
  const nbSoumis = db.prepare(`SELECT COUNT(DISTINCT secteur_id) n FROM soumissions
                               WHERE date_jour = ?`).get(date).n;
  let classement;
  if (concernes.length === 0) classement = 'avec_cours'; // rien attendu, rien à classer
  else if (nbSoumis === 0) classement = 'sans_cours_auto';
  else classement = 'avec_cours';

  db.prepare(`INSERT INTO journees (date_jour, verrouillee, classement) VALUES (?, 1, ?)
              ON CONFLICT(date_jour) DO UPDATE SET verrouillee = 1, classement = excluded.classement`)
    .run(date, classement);
  audit(null, 'verrouillage_18h', 'journee', date, null, { classement }, null, null);

  if (classement === 'sans_cours_auto') {
    notifierProviseur(`Journée du ${date} : aucun secteur n'a transmis de rapport. ` +
      `Classement automatique « Journée sans cours ». Vous pouvez corriger ce statut dans TeacherWatch.`);
  } else if (concernes.length > 0) {
    const nonSoumis = statutSecteurs(date).filter(s => s.statut === 'non_soumis').map(s => s.nom);
    notifierProviseur(`Journée du ${date} verrouillée. Secteurs ayant transmis : ${nbSoumis}/${concernes.length}.` +
      (nonSoumis.length ? ` Non soumis : ${nonSoumis.join(', ')}.` : ''));
  }
}

// --- sauvegarde quotidienne ------------------------------------------------
function sauvegarde() {
  const { date } = nowDouala();
  const dest = path.join(DATA_DIR, 'sauvegardes', `teacherwatch-${date}.db`);
  return db.backup(dest).then(() => {
    audit(null, 'sauvegarde_quotidienne', 'base', dest, null, null, null, null);
    // rétention 30 jours
    const dir = path.join(DATA_DIR, 'sauvegardes');
    const fichiers = fs.readdirSync(dir).filter(f => f.startsWith('teacherwatch-')).sort();
    while (fichiers.length > 30) fs.unlinkSync(path.join(dir, fichiers.shift()));
  }).catch(e => console.error('Échec de sauvegarde :', e.message));
}

function demarrerPlanificateur() {
  const [hR, mR] = getSetting('heure_rappel', '16:00').split(':');
  const [hV, mV] = getSetting('heure_verrouillage', '18:00').split(':');
  cron.schedule(`${Number(mR)} ${Number(hR)} * * *`, traitementRappel, { timezone: TZ });
  cron.schedule(`${Number(mV)} ${Number(hV)} * * *`, traitementVerrouillage, { timezone: TZ });
  cron.schedule('0 2 * * *', sauvegarde, { timezone: TZ });
  console.log(`Planificateur démarré (rappel ${hR}:${mR}, verrouillage ${hV}:${mV}, fuseau ${TZ}).`);
}

module.exports = { demarrerPlanificateur, statutSecteurs, secteursConcernes,
                   traitementRappel, traitementVerrouillage, sauvegarde, notifierProviseur };
