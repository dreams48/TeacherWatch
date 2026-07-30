// TeacherWatch — administration (Lot 2 : utilisateurs, secteurs, tranches,
// calendrier, réglages, journal d'audit, sauvegardes)
// Protections du compte principal (§3.6) : nul ne peut le désactiver ; seul le
// proviseur modifie ses identifiants ou transfère le compte.
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { db, DATA_DIR, getSetting, setSetting } = require('./../db');
const { audit, exigerConnexion, exigerRole, revoquerSessions } = require('./../helpers');
const { envoyerEmail } = require('./../services/mail');

const router = express.Router();
// préfixes explicites : sans eux, ce contrôle de rôle s'appliquerait aussi aux
// routeurs montés après celui-ci (fuite de middleware)
router.use(['/admin', '/enseignants'], exigerConnexion, exigerRole('proviseur', 'admin'));

// --- utilisateurs ----------------------------------------------------------
router.get('/admin/utilisateurs', (req, res) => {
  const utilisateurs = db.prepare(`SELECT u.*, s.nom AS secteur FROM users u
    LEFT JOIN secteurs s ON s.id = u.secteur_id ORDER BY u.role, u.nom`).all();
  const secteurs = db.prepare('SELECT * FROM secteurs WHERE actif = 1').all();
  res.render('utilisateurs', { user: req.user, utilisateurs, secteurs,
    message: req.query.m || null });
});

router.post('/admin/utilisateurs', (req, res) => {
  const { email, nom, role, secteur_id } = req.body;
  if (!['admin', 'surveillant'].includes(role))
    return res.status(400).render('erreur', { user: req.user, message: 'Rôle invalide (admin ou surveillant).' });
  // seule la gestion des admins reste au proviseur (audit I-10)
  if (role === 'admin' && req.user.role !== 'proviseur')
    return res.status(403).render('erreur', { user: req.user,
      message: 'Seul le proviseur peut créer un compte administrateur.' });
  if (role === 'surveillant' && !secteur_id)
    return res.status(400).render('erreur', { user: req.user, message: 'Un surveillant doit être affecté à un secteur.' });
  const mdpInitial = crypto.randomBytes(6).toString('base64url');
  try {
    const r = db.prepare(`INSERT INTO users (email, password_hash, nom, role, secteur_id, statut)
      VALUES (?, ?, ?, ?, ?, 'invite')`)
      .run(String(email).trim().toLowerCase(), bcrypt.hashSync(mdpInitial, 10), nom, role,
           role === 'surveillant' ? Number(secteur_id) : null);
    audit(req.user, 'creation_utilisateur', 'user', r.lastInsertRowid, null, { email, nom, role }, null, req);
    envoyerEmail({ destinataire: email, sujet: 'Invitation TeacherWatch',
      texte: `Bonjour ${nom},\n\nUn compte TeacherWatch (${role}) a été créé pour vous.\n` +
             `Adresse : ${email}\nMot de passe initial : ${mdpInitial}\n` +
             `Vous devrez le changer à votre première connexion.`, userId: req.user.id }).catch(() => {});
    res.redirect('/admin/utilisateurs?m=' + encodeURIComponent(
      `Compte créé pour ${email}. Mot de passe initial : ${mdpInitial} — communiquez-le de façon sûre (il est aussi envoyé par e-mail si le serveur d'envoi est configuré).`));
  } catch (e) {
    res.status(400).render('erreur', { user: req.user, message: 'Création impossible : ' + e.message });
  }
});

router.post('/admin/utilisateurs/:id/statut', (req, res) => {
  const cible = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!cible) return res.redirect('/admin/utilisateurs');
  // PROTECTION ABSOLUE du compte principal (§3.6, testé Lot 9)
  if (cible.est_compte_principal)
    return res.status(403).render('erreur', { user: req.user,
      message: 'Le compte principal du proviseur ne peut pas être désactivé.' });
  if (cible.role === 'admin' && req.user.role !== 'proviseur')
    return res.status(403).render('erreur', { user: req.user,
      message: 'Seul le proviseur peut modifier le statut d’un administrateur.' });
  const statut = ['actif', 'suspendu', 'archive'].includes(req.body.statut) ? req.body.statut : cible.statut;
  db.prepare('UPDATE users SET statut = ? WHERE id = ?').run(statut, cible.id);
  if (statut !== 'actif') revoquerSessions(cible.id);
  audit(req.user, 'changement_statut_utilisateur', 'user', cible.id,
        { statut: cible.statut }, { statut }, req.body.motif || null, req);
  res.redirect('/admin/utilisateurs');
});

router.post('/admin/utilisateurs/:id/revoquer-sessions', (req, res) => {
  revoquerSessions(Number(req.params.id));
  audit(req.user, 'revocation_sessions', 'user', req.params.id, null, null, null, req);
  res.redirect('/admin/utilisateurs');
});

// réinitialisation de mot de passe (dépannage d'accès, audit B-08)
router.post('/admin/utilisateurs/:id/reinitialiser-mdp', (req, res) => {
  const cible = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!cible) return res.redirect('/admin/utilisateurs');
  if (cible.est_compte_principal && req.user.id !== cible.id)
    return res.status(403).render('erreur', { user: req.user,
      message: 'Seul le proviseur peut modifier les identifiants du compte principal.' });
  const mdp = crypto.randomBytes(6).toString('base64url');
  db.prepare('UPDATE users SET password_hash = ?, doit_changer_mdp = 1 WHERE id = ?')
    .run(bcrypt.hashSync(mdp, 10), cible.id);
  revoquerSessions(cible.id);
  audit(req.user, 'reinitialisation_mdp', 'user', cible.id, null, null, null, req);
  res.redirect('/admin/utilisateurs?m=' + encodeURIComponent(
    `Nouveau mot de passe initial pour ${cible.email} : ${mdp}`));
});

// transfert du compte principal au successeur (§3.6) — proviseur uniquement
router.post('/admin/transfert-compte-principal', exigerRole('proviseur'), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!u.est_compte_principal)
    return res.status(403).render('erreur', { user: req.user,
      message: 'Seul le titulaire du compte principal peut le transférer.' });
  const nouvelEmail = String(req.body.email || '').trim().toLowerCase();
  const nom = String(req.body.nom || '').trim();
  if (!nouvelEmail || !nom || !bcrypt.compareSync(String(req.body.mdp || ''), u.password_hash))
    return res.status(400).render('erreur', { user: req.user,
      message: 'Transfert refusé : e-mail, nom et mot de passe actuel sont obligatoires.' });
  const mdp = crypto.randomBytes(8).toString('base64url');
  const tx = db.transaction(() => {
    db.prepare(`UPDATE users SET est_compte_principal = 0, statut = 'archive' WHERE id = ?`).run(u.id);
    const r = db.prepare(`INSERT INTO users (email, password_hash, nom, role, statut, est_compte_principal)
      VALUES (?, ?, ?, 'proviseur', 'actif', 1)`).run(nouvelEmail, bcrypt.hashSync(mdp, 10), nom);
    return r.lastInsertRowid;
  });
  const nouveauId = tx();
  revoquerSessions(u.id); // révocation des anciennes sessions lors d'un transfert (§3.6)
  audit(req.user, 'transfert_compte_principal', 'user', nouveauId,
        { ancien: u.email }, { nouveau: nouvelEmail }, req.body.motif || null, req);
  res.render('erreur', { user: null, message:
    `Compte principal transféré à ${nouvelEmail}. Mot de passe initial : ${mdp} (changement obligatoire à la première connexion). Vos sessions ont été révoquées.` });
});

// --- secteurs, tranches, enseignants --------------------------------------
router.get('/admin/parametres', (req, res) => {
  res.render('parametres', { user: req.user,
    secteurs: db.prepare('SELECT * FROM secteurs').all(),
    tranches: db.prepare('SELECT * FROM tranches ORDER BY numero').all(),
    exceptions: db.prepare('SELECT * FROM jours_exceptions ORDER BY date_jour DESC LIMIT 40').all(),
    reglages: {
      jours_cours: getSetting('jours_cours', '1,2,3,4,5'),
      compte_retard_heures: getSetting('compte_retard_heures', '0'),
      compte_depart_heures: getSetting('compte_depart_heures', '0'),
      envoi_mode: getSetting('envoi_mode', 'consolide'),
    },
    message: req.query.m || null });
});

router.post('/admin/secteurs/:id', (req, res) => {
  const s = db.prepare('SELECT * FROM secteurs WHERE id = ?').get(req.params.id);
  if (!s) return res.redirect('/admin/parametres');
  const maj = { nom: String(req.body.nom || s.nom).trim(), actif: req.body.actif === '0' ? 0 : 1 };
  db.prepare('UPDATE secteurs SET nom = ?, actif = ? WHERE id = ?').run(maj.nom, maj.actif, s.id);
  audit(req.user, 'modification_secteur', 'secteur', s.id, { nom: s.nom, actif: s.actif }, maj, null, req);
  res.redirect('/admin/parametres');
});

router.post('/admin/tranches/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM tranches WHERE id = ?').get(req.params.id);
  if (!t) return res.redirect('/admin/parametres');
  const [deb, fin] = [req.body.heure_debut, req.body.heure_fin];
  if (!/^\d{2}:\d{2}$/.test(deb) || !/^\d{2}:\d{2}$/.test(fin))
    return res.status(400).render('erreur', { user: req.user, message: 'Format d’heure attendu : HH:MM.' });
  const min = (f => (Number(fin.slice(0, 2)) * 60 + Number(fin.slice(3))) - (Number(deb.slice(0, 2)) * 60 + Number(deb.slice(3))))();
  if (min <= 0) return res.status(400).render('erreur', { user: req.user, message: 'La fin doit suivre le début.' });
  db.prepare('UPDATE tranches SET heure_debut = ?, heure_fin = ?, duree_minutes = ? WHERE id = ?')
    .run(deb, fin, min, t.id);
  audit(req.user, 'modification_tranche', 'tranche', t.id,
        { debut: t.heure_debut, fin: t.heure_fin }, { debut: deb, fin }, null, req);
  res.redirect('/admin/parametres');
});

router.post('/admin/reglages', (req, res) => {
  const avant = { jours_cours: getSetting('jours_cours', ''), retard: getSetting('compte_retard_heures', '0') };
  if (req.body.jours_cours) {
    const jours = String(req.body.jours_cours).split(',').map(s => Number(s.trim()))
      .filter(n => n >= 1 && n <= 6);
    if (jours.length) setSetting('jours_cours', jours.join(','));
  }
  setSetting('compte_retard_heures', req.body.compte_retard_heures === '1' ? '1' : '0');
  setSetting('compte_depart_heures', req.body.compte_depart_heures === '1' ? '1' : '0');
  setSetting('envoi_mode', req.body.envoi_mode === 'chaque_soumission' ? 'chaque_soumission' : 'consolide');
  audit(req.user, 'modification_reglages', 'settings', null, avant, req.body, null, req);
  res.redirect('/admin/parametres?m=' + encodeURIComponent('Réglages enregistrés.'));
});

// calendrier : exceptions (fériés, congés, journées banalisées — audit B-03)
router.post('/admin/calendrier', (req, res) => {
  const { date_jour, est_jour_cours, motif } = req.body;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date_jour || ''))
    return res.status(400).render('erreur', { user: req.user, message: 'Date invalide.' });
  db.prepare(`INSERT INTO jours_exceptions (date_jour, est_jour_cours, motif) VALUES (?, ?, ?)
    ON CONFLICT(date_jour) DO UPDATE SET est_jour_cours = excluded.est_jour_cours, motif = excluded.motif`)
    .run(date_jour, est_jour_cours === '1' ? 1 : 0, motif || null);
  audit(req.user, 'exception_calendrier', 'jour', date_jour, null,
        { est_jour_cours: est_jour_cours === '1', motif }, null, req);
  res.redirect('/admin/parametres');
});
router.post('/admin/calendrier/:date/supprimer', (req, res) => {
  db.prepare('DELETE FROM jours_exceptions WHERE date_jour = ?').run(req.params.date);
  audit(req.user, 'suppression_exception_calendrier', 'jour', req.params.date, null, null, null, req);
  res.redirect('/admin/parametres');
});

// --- enseignants (consultation + situation administrative, audit B-04) -----
router.get('/enseignants', (req, res) => {
  const filtre = req.query.statut === 'archive' ? 'archive' : 'actif';
  const enseignants = db.prepare('SELECT * FROM enseignants WHERE statut = ? ORDER BY nom').all(filtre);
  res.render('enseignants', { user: req.user, enseignants, filtre });
});

router.post('/enseignants/:id/situation', (req, res) => {
  const e = db.prepare('SELECT * FROM enseignants WHERE id = ?').get(req.params.id);
  if (!e) return res.redirect('/enseignants');
  const situations = ['en_poste', 'mission', 'conge_maladie', 'conge_maternite', 'formation', 'detache'];
  const situation = situations.includes(req.body.situation) ? req.body.situation : 'en_poste';
  db.prepare('UPDATE enseignants SET situation = ?, situation_debut = ?, situation_fin = ? WHERE id = ?')
    .run(situation, req.body.debut || null, req.body.fin || null, e.id);
  audit(req.user, 'situation_enseignant', 'enseignant', e.id,
        { situation: e.situation }, { situation, debut: req.body.debut, fin: req.body.fin }, null, req);
  res.redirect('/enseignants');
});

// --- journal d'audit (consultation seule — table en ajout seul) ------------
router.get('/admin/audit', (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const lignes = db.prepare(`SELECT a.*, u.nom AS auteur FROM audit_log a
    LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.id DESC LIMIT 50 OFFSET ?`).all((page - 1) * 50);
  res.render('audit', { user: req.user, lignes, page });
});

// --- sauvegardes -----------------------------------------------------------
router.get('/admin/sauvegardes', (req, res) => {
  const dir = path.join(DATA_DIR, 'sauvegardes');
  const fichiers = fs.readdirSync(dir).filter(f => f.endsWith('.db')).sort().reverse()
    .map(f => ({ nom: f, taille: fs.statSync(path.join(dir, f)).size }));
  const envois = db.prepare('SELECT * FROM envois_email ORDER BY id DESC LIMIT 30').all();
  res.render('sauvegardes', { user: req.user, fichiers, envois });
});

router.post('/admin/sauvegardes/maintenant', (req, res) => {
  const { sauvegarde } = require('./../services/scheduler');
  sauvegarde().then(() => res.redirect('/admin/sauvegardes'));
});

router.get('/admin/sauvegardes/:nom', (req, res) => {
  const nom = path.basename(req.params.nom); // pas de traversée de chemin
  const chemin = path.join(DATA_DIR, 'sauvegardes', nom);
  if (!fs.existsSync(chemin) || !nom.endsWith('.db')) return res.status(404).end();
  audit(req.user, 'telechargement_sauvegarde', 'base', nom, null, null, null, req);
  res.download(chemin);
});

module.exports = router;
