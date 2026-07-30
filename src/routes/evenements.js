// TeacherWatch — saisie des événements (Lot 5) et soumissions (Lot 6)
// Règles serveur (jamais seulement à l'écran, audit T-04) :
//  - un surveillant ne saisit que pour SON secteur ;
//  - un événement soumis est immuable pour le surveillant ;
//  - idempotence par UUID client (audit T-01) ;
//  - journée verrouillée = plus de saisie ni de soumission par un surveillant.
const express = require('express');
const crypto = require('crypto');
const { db } = require('./../db');
const { audit, nowDouala, jourSemaine, estJourCours, exigerConnexion, exigerRole, estDirection } = require('./../helpers');
const { statutSecteurs } = require('./../services/scheduler');
const { TYPES_FR, JUSTIF_FR, DUREES_FR } = require('./../services/rapport');

const router = express.Router();
router.use(exigerConnexion);

function secteurAutorise(req, secteurId) {
  if (estDirection(req.user)) return true;
  return Number(req.user.secteur_id) === Number(secteurId);
}

function journeeVerrouillee(dateISO) {
  const j = db.prepare('SELECT verrouillee FROM journees WHERE date_jour = ?').get(dateISO);
  return !!(j && j.verrouillee);
}

// cours du jour pour un secteur (pré-remplissage depuis l'emploi du temps)
function coursDuJour(dateISO, secteurId) {
  const version = db.prepare('SELECT id FROM edt_versions WHERE actif = 1').get();
  if (!version) return [];
  return db.prepare(`
    SELECT e.id, e.tranche_id, t.numero, t.heure_debut, t.heure_fin, t.duree_minutes,
           c.id AS classe_id, c.nom AS classe, e.matiere, e.groupe_jumelage,
           en.id AS enseignant_id, en.nom AS enseignant, en.matricule, en.specialite,
           en.situation, en.situation_debut, en.situation_fin
    FROM emploi_du_temps e
    JOIN tranches t ON t.id = e.tranche_id
    JOIN classes c ON c.id = e.classe_id AND c.secteur_id = ?
    JOIN enseignants en ON en.id = e.enseignant_id
    WHERE e.version_id = ? AND e.jour_semaine = ?
    ORDER BY t.numero, c.nom`).all(secteurId, version.id, jourSemaine(dateISO));
}

// Classes jumelées : dans les fichiers réels du lycée, le jumelage n'est pas
// déclaré par une colonne — il se déduit du fait qu'un même enseignant tient
// plusieurs classes sur la même tranche et le même jour. Un groupement sur neuf
// est à cheval sur deux secteurs : la détection et le contrôle des doublons
// doivent donc porter sur TOUS les secteurs, pas seulement celui du surveillant.
function groupeJumelage(dateISO, trancheId, enseignantId) {
  const version = db.prepare('SELECT id FROM edt_versions WHERE actif = 1').get();
  if (!version || !enseignantId) return [];
  return db.prepare(`
    SELECT DISTINCT c.nom, c.secteur_id FROM emploi_du_temps e
    JOIN classes c ON c.id = e.classe_id
    WHERE e.version_id = ? AND e.jour_semaine = ? AND e.tranche_id = ? AND e.enseignant_id = ?
    ORDER BY c.nom`).all(version.id, jourSemaine(dateISO), trancheId, enseignantId);
}

// enseignant couvert par une situation administrative ? (audit B-04)
function situationCouvre(c, dateISO) {
  if (!c.situation || c.situation === 'en_poste') return false;
  const deb = c.situation_debut || '0000-01-01', fin = c.situation_fin || '9999-12-31';
  return dateISO >= deb && dateISO <= fin;
}

// --- écran de saisie -------------------------------------------------------
router.get('/saisie', (req, res) => {
  const { date } = nowDouala();
  const dateJour = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : date;
  const secteurId = estDirection(req.user)
    ? Number(req.query.secteur || 0) || null : req.user.secteur_id;
  const secteurs = db.prepare('SELECT * FROM secteurs WHERE actif = 1').all();
  if (!secteurId) return res.render('saisie', { user: req.user, dateJour, secteurs, secteurId: null,
    cours: [], brouillons: [], soumissions: [], verrouillee: journeeVerrouillee(dateJour),
    jourCours: estJourCours(dateJour), TYPES_FR, JUSTIF_FR, DUREES_FR, erreur: req.query.e || null });

  if (!secteurAutorise(req, secteurId)) return res.status(403).render('erreur',
    { user: req.user, message: 'Vous ne pouvez pas saisir pour un autre secteur.' });

  const cours = coursDuJour(dateJour, secteurId).map(c => ({ ...c, couvert: situationCouvre(c, dateJour) }));
  const brouillons = db.prepare(`SELECT e.*, t.numero FROM evenements e JOIN tranches t ON t.id = e.tranche_id
    WHERE e.date_jour = ? AND e.secteur_id = ? AND e.statut = 'brouillon' ORDER BY t.numero`).all(dateJour, secteurId);
  const soumissions = db.prepare(`SELECT s.*, u.nom AS auteur,
      (SELECT COUNT(*) FROM evenements ev WHERE ev.soumission_id = s.id) AS nb
    FROM soumissions s JOIN users u ON u.id = s.user_id
    WHERE s.date_jour = ? AND s.secteur_id = ? ORDER BY s.numero`).all(dateJour, secteurId);

  res.render('saisie', { user: req.user, dateJour, secteurs, secteurId, cours, brouillons,
    soumissions, verrouillee: journeeVerrouillee(dateJour), jourCours: estJourCours(dateJour),
    TYPES_FR, JUSTIF_FR, DUREES_FR, erreur: req.query.e || null });
});

// --- création d'un événement (brouillon) ----------------------------------
router.post('/evenements', (req, res) => {
  const b = req.body;
  const uuid = b.uuid && /^[0-9a-f-]{36}$/.test(b.uuid) ? b.uuid : crypto.randomUUID();
  // idempotence : un rejeu du même UUID ne crée rien (audit T-01)
  if (db.prepare('SELECT id FROM evenements WHERE uuid = ?').get(uuid))
    return res.redirect(`/saisie?date=${b.date_jour}&secteur=${b.secteur_id}`);

  const secteurId = estDirection(req.user) ? Number(b.secteur_id) : req.user.secteur_id;
  if (!secteurAutorise(req, secteurId))
    return res.status(403).render('erreur', { user: req.user, message: 'Secteur non autorisé.' });
  const dateJour = b.date_jour;
  if (journeeVerrouillee(dateJour) && !estDirection(req.user))
    return res.status(403).render('erreur', { user: req.user,
      message: 'Journée verrouillée : seule la direction peut encore intervenir.' });
  if (!['absence', 'retard', 'depart_anticipe'].includes(b.type))
    return res.status(400).render('erreur', { user: req.user, message: 'Type d’événement invalide.' });

  // instantané depuis l'emploi du temps (ligne de cours) ou saisie manuelle
  let snap;
  if (b.cours_id) {
    const c = coursDuJour(dateJour, secteurId).find(x => String(x.id) === String(b.cours_id));
    if (!c) return res.status(400).render('erreur', { user: req.user, message: 'Cours introuvable pour ce secteur.' });
    snap = { tranche_id: c.tranche_id, classe_id: c.classe_id, enseignant_id: c.enseignant_id,
             enseignant: c.enseignant, matricule: c.matricule, specialite: c.specialite,
             classe: c.classe, matiere: c.matiere, horaire: `${c.heure_debut}–${c.heure_fin}`,
             duree: c.duree_minutes, jumelage: c.groupe_jumelage };
  } else {
    const t = db.prepare('SELECT * FROM tranches WHERE id = ?').get(b.tranche_id);
    const en = db.prepare('SELECT * FROM enseignants WHERE id = ?').get(b.enseignant_id);
    const cl = b.classe_id ? db.prepare('SELECT * FROM classes WHERE id = ?').get(b.classe_id) : null;
    if (!t || !en) return res.status(400).render('erreur', { user: req.user,
      message: 'Tranche horaire et enseignant sont obligatoires.' });
    if (cl && !secteurAutorise(req, cl.secteur_id)) return res.status(403).render('erreur',
      { user: req.user, message: 'Cette classe appartient à un autre secteur.' });
    snap = { tranche_id: t.id, classe_id: cl ? cl.id : null, enseignant_id: en.id,
             enseignant: en.nom, matricule: en.matricule, specialite: en.specialite,
             classe: cl ? cl.nom : (b.classe_libre || '—'), matiere: b.matiere || null,
             horaire: `${t.heure_debut}–${t.heure_fin}`, duree: t.duree_minutes, jumelage: null };
  }

  // Retards et départs anticipés sont qualifiés par tranche de durée
  // (convention du lycée) ; une absence n'a pas de durée à saisir.
  const dureeBucket = b.type === 'absence' ? null
    : (['lt15', '15to30', 'gt30'].includes(b.duree) ? b.duree : null);
  if (b.type !== 'absence' && !dureeBucket)
    return res.redirect(`/saisie?date=${dateJour}&secteur=${secteurId}&e=` +
      encodeURIComponent('Indiquez la tranche de durée du retard ou du départ anticipé.'));

  // Sur un cours jumelé, l'événement porte le groupement complet et ne compte
  // qu'une heure : c'est ce qui empêche le double comptage (audit B-02).
  const groupe = groupeJumelage(dateJour, snap.tranche_id, snap.enseignant_id);
  if (groupe.length > 1) {
    snap.classe = groupe.map(g => g.nom).join(' / ');
    snap.jumelage = snap.jumelage || 'auto:' + snap.tranche_id + ':' + snap.enseignant_id;
  }

  // Contrôle des doublons, tous secteurs confondus : un enseignant n'a qu'un
  // seul événement par tranche, quel que soit le secteur qui l'a déclaré.
  const doublon = db.prepare(`SELECT e.id, e.type, e.secteur_id, s.nom AS secteur
    FROM evenements e LEFT JOIN secteurs s ON s.id = e.secteur_id
    WHERE e.date_jour = ? AND e.tranche_id = ?
      AND (e.enseignant_id = ? OR e.snap_enseignant = ?)`)
    .get(dateJour, snap.tranche_id, snap.enseignant_id, snap.enseignant);
  if (doublon && b.confirmer_doublon !== '1') {
    const ailleurs = doublon.secteur_id && Number(doublon.secteur_id) !== Number(secteurId)
      ? ` Elle a été déclarée par le secteur « ${doublon.secteur} » : ce cours est à cheval sur plusieurs secteurs et ne doit être compté qu'une fois.` : '';
    return res.redirect(`/saisie?date=${dateJour}&secteur=${secteurId}&e=` +
      encodeURIComponent(`Doublon : ${snap.enseignant} a déjà un ${TYPES_FR[doublon.type].toLowerCase()} enregistré sur cette tranche.${ailleurs}`
        + (ailleurs ? '' : ' Cochez « confirmer malgré le doublon » pour forcer.')));
  }

  const r = db.prepare(`INSERT INTO evenements
    (uuid, type, date_jour, tranche_id, classe_id, enseignant_id, secteur_id,
     snap_enseignant, snap_matricule, snap_specialite, snap_classe, snap_matiere,
     snap_horaire, snap_duree_minutes, groupe_jumelage, minutes, motif, cree_par)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(uuid, b.type, dateJour, snap.tranche_id, snap.classe_id, snap.enseignant_id, secteurId,
         snap.enseignant, snap.matricule, snap.specialite, snap.classe, snap.matiere,
         snap.horaire, snap.duree, snap.jumelage, dureeBucket, b.motif || null, req.user.id);
  audit(req.user, 'creation_evenement', 'evenement', r.lastInsertRowid, null,
        { type: b.type, enseignant: snap.enseignant, date: dateJour }, null, req);
  res.redirect(`/saisie?date=${dateJour}&secteur=${secteurId}`);
});

// --- modification / suppression d'un brouillon ----------------------------
router.post('/evenements/:id/supprimer', (req, res) => {
  const e = db.prepare('SELECT * FROM evenements WHERE id = ?').get(req.params.id);
  if (!e) return res.redirect('/saisie');
  if (!secteurAutorise(req, e.secteur_id)) return res.status(403).render('erreur',
    { user: req.user, message: 'Secteur non autorisé.' });
  if (e.statut !== 'brouillon') return res.status(403).render('erreur', { user: req.user,
    message: 'Événement soumis : immuable pour le surveillant. Contactez la direction.' });
  db.prepare('DELETE FROM evenements WHERE id = ?').run(e.id);
  audit(req.user, 'suppression_brouillon', 'evenement', e.id, e, null, null, req);
  res.redirect(`/saisie?date=${e.date_jour}&secteur=${e.secteur_id}`);
});

// --- correction par la direction (événement soumis, Lot 6) -----------------
router.post('/evenements/:id/corriger', exigerRole('proviseur', 'admin'), (req, res) => {
  const e = db.prepare('SELECT * FROM evenements WHERE id = ?').get(req.params.id);
  if (!e) return res.status(404).render('erreur', { user: req.user, message: 'Événement introuvable.' });
  const motif = String(req.body.motif || '').trim();
  if (!motif) return res.status(400).render('erreur', { user: req.user,
    message: 'Un motif est obligatoire pour toute correction administrative.' });
  const avant = { type: e.type, justification: e.justification, motif: e.motif };
  const maj = {
    justification: ['a_statuer', 'justifiee', 'non_justifiee'].includes(req.body.justification)
      ? req.body.justification : e.justification,
    type: ['absence', 'retard', 'depart_anticipe'].includes(req.body.type) ? req.body.type : e.type,
  };
  if (req.body.supprimer === '1') {
    db.prepare('DELETE FROM evenements WHERE id = ?').run(e.id);
    audit(req.user, 'correction_suppression', 'evenement', e.id, e, null, motif, req);
  } else {
    db.prepare('UPDATE evenements SET type = ?, justification = ?, motif = ? WHERE id = ?')
      .run(maj.type, maj.justification, req.body.motif_evenement || e.motif, e.id);
    audit(req.user, 'correction_evenement', 'evenement', e.id, avant, maj, motif, req);
  }
  res.redirect(req.get('referer') || '/');
});

// --- soumission (Lot 6) ----------------------------------------------------
router.post('/soumissions', (req, res) => {
  const b = req.body;
  const uuid = b.uuid && /^[0-9a-f-]{36}$/.test(b.uuid) ? b.uuid : crypto.randomUUID();
  if (db.prepare('SELECT id FROM soumissions WHERE uuid = ?').get(uuid))
    return res.redirect(`/saisie?date=${b.date_jour}&secteur=${b.secteur_id}`); // rejeu ignoré
  const secteurId = estDirection(req.user) ? Number(b.secteur_id) : req.user.secteur_id;
  if (!secteurAutorise(req, secteurId))
    return res.status(403).render('erreur', { user: req.user, message: 'Secteur non autorisé.' });
  const dateJour = b.date_jour;
  if (journeeVerrouillee(dateJour) && !estDirection(req.user))
    return res.status(403).render('erreur', { user: req.user, message: 'Journée verrouillée.' });

  const tx = db.transaction(() => {
    const brouillons = db.prepare(`SELECT id FROM evenements
      WHERE date_jour = ? AND secteur_id = ? AND statut = 'brouillon'`).all(dateJour, secteurId);
    const type = brouillons.length ? 'avec_evenements' : 'aucune_absence';
    if (type === 'aucune_absence' && b.confirmer_vide !== '1')
      throw Object.assign(new Error('vide'), { code: 'VIDE' });
    const numero = 1 + db.prepare(`SELECT COUNT(*) n FROM soumissions
      WHERE date_jour = ? AND secteur_id = ?`).get(dateJour, secteurId).n;
    const s = db.prepare(`INSERT INTO soumissions (uuid, secteur_id, date_jour, numero, type, user_id)
      VALUES (?, ?, ?, ?, ?, ?)`).run(uuid, secteurId, dateJour, numero, type, req.user.id);
    // verrouillage immédiat des événements soumis
    for (const ev of brouillons)
      db.prepare(`UPDATE evenements SET statut = 'soumis', soumission_id = ? WHERE id = ?`)
        .run(s.lastInsertRowid, ev.id);
    audit(req.user, 'soumission', 'soumission', s.lastInsertRowid, null,
          { secteur: secteurId, date: dateJour, numero, type, nb: brouillons.length }, null, req);
    return { id: s.lastInsertRowid, numero, type, nb: brouillons.length };
  });
  let resultat;
  try { resultat = tx(); }
  catch (e) {
    if (e.code === 'VIDE')
      return res.redirect(`/saisie?date=${dateJour}&secteur=${secteurId}&e=` +
        encodeURIComponent('Aucun brouillon : cochez « je confirme : aucune absence signalée » pour soumettre un rapport vide.'));
    throw e;
  }

  // notification (mode consolidé par défaut, audit B-06b : l'e-mail complet part à 18 h)
  db.prepare(`INSERT INTO notifications (destinataire_role, message) VALUES ('proviseur', ?)`)
    .run(`Soumission n° ${resultat.numero} du secteur ${secteurId} (${dateJour}) : ` +
         (resultat.type === 'aucune_absence' ? 'aucune absence signalée.' : `${resultat.nb} événement(s).`));
  res.redirect(`/saisie?date=${dateJour}&secteur=${secteurId}`);
});

// --- correction du classement d'une journée (§3.5) ------------------------
router.post('/journees/:date/classement', exigerRole('proviseur', 'admin'), (req, res) => {
  const dateJour = req.params.date;
  const j = db.prepare('SELECT * FROM journees WHERE date_jour = ?').get(dateJour);
  const nouveau = ['avec_cours', 'sans_cours_corrige'].includes(req.body.classement)
    ? req.body.classement : 'avec_cours';
  db.prepare(`INSERT INTO journees (date_jour, verrouillee, classement) VALUES (?, ?, ?)
    ON CONFLICT(date_jour) DO UPDATE SET classement = excluded.classement`)
    .run(dateJour, j ? j.verrouillee : 0, nouveau);
  audit(req.user, 'correction_classement_journee', 'journee', dateJour,
        j ? { classement: j.classement } : null, { classement: nouveau },
        req.body.motif || null, req);
  res.redirect(req.get('referer') || '/');
});

// déverrouillage exceptionnel d'une journée (direction, motif obligatoire)
router.post('/journees/:date/deverrouiller', exigerRole('proviseur', 'admin'), (req, res) => {
  const motif = String(req.body.motif || '').trim();
  if (!motif) return res.status(400).render('erreur', { user: req.user, message: 'Motif obligatoire.' });
  db.prepare('UPDATE journees SET verrouillee = 0 WHERE date_jour = ?').run(req.params.date);
  audit(req.user, 'deverrouillage_journee', 'journee', req.params.date,
        { verrouillee: 1 }, { verrouillee: 0 }, motif, req);
  res.redirect(req.get('referer') || '/');
});

module.exports = { router, statutSecteurs };
