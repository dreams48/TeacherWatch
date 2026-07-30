// TeacherWatch — authentification (Lot 2)
// Mode principal : e-mail + mot de passe (liste blanche : seuls les comptes
// créés par la direction existent). « Continuer avec Google » s'active si
// GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET sont configurés — la connexion
// locale reste le repli (audit B-08). Limitation des tentatives (§5.2).
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db } = require('./../db');
const { audit, creerSession, revoquerSessions } = require('./../helpers');

const router = express.Router();

// Limitation des tentatives : 5 échecs / 15 min par e-mail+IP.
const tentatives = new Map();
function tropDeTentatives(cle) {
  const t = tentatives.get(cle) || [];
  const recent = t.filter(x => Date.now() - x < 15 * 60 * 1000);
  tentatives.set(cle, recent);
  return recent.length >= 5;
}
function noterEchec(cle) { (tentatives.get(cle) || tentatives.set(cle, []).get(cle)).push(Date.now()); }

const googleActif = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

router.get('/connexion', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('connexion', { user: null, erreur: null, googleActif: googleActif() });
});

router.post('/connexion', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const mdp = String(req.body.mdp || '');
  const cle = email + '|' + req.ip;
  if (tropDeTentatives(cle)) {
    audit(null, 'connexion_bloquee_tentatives', 'user', email, null, null, null, req);
    return res.status(429).render('connexion', { user: null, googleActif: googleActif(),
      erreur: 'Trop de tentatives. Réessayez dans 15 minutes.' });
  }
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const ok = u && u.password_hash && bcrypt.compareSync(mdp, u.password_hash);
  if (!ok || (u.statut !== 'actif' && u.statut !== 'invite')) {
    noterEchec(cle);
    audit(null, 'connexion_echec', 'user', email, null, null, null, req);
    return res.status(401).render('connexion', { user: null, googleActif: googleActif(),
      erreur: 'Adresse ou mot de passe incorrect, ou compte non autorisé.' });
  }
  finaliserConnexion(req, res, u);
});

function finaliserConnexion(req, res, u) {
  // première activation d'un compte invité (Lot 2) : notification au proviseur
  if (u.statut === 'invite') {
    db.prepare(`UPDATE users SET statut = 'actif' WHERE id = ?`).run(u.id);
    audit({ id: u.id, role: u.role }, 'premiere_activation', 'user', u.id, { statut: 'invite' }, { statut: 'actif' }, null, req);
    db.prepare(`INSERT INTO notifications (destinataire_role, message) VALUES ('proviseur', ?)`)
      .run(`Le compte de ${u.nom} (${u.email}) vient d'être activé (première connexion).`);
  }
  const token = creerSession(u.id);
  audit({ id: u.id, role: u.role }, 'connexion', 'user', u.id, null, null, null, req);
  res.setHeader('Set-Cookie', `tw_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${12 * 3600}`);
  res.redirect('/');
}

router.post('/deconnexion', (req, res) => {
  if (req.sessionToken)
    db.prepare('UPDATE sessions SET revoked = 1 WHERE token = ?').run(req.sessionToken);
  res.setHeader('Set-Cookie', 'tw_session=; Path=/; Max-Age=0');
  res.redirect('/connexion');
});

// changement de mot de passe (obligatoire à la première connexion)
router.get('/mot-de-passe', (req, res) => {
  if (!req.user) return res.redirect('/connexion');
  res.render('mot_de_passe', { user: req.user, erreur: null });
});
router.post('/mot-de-passe', (req, res) => {
  if (!req.user) return res.redirect('/connexion');
  const { actuel, nouveau, confirmation } = req.body;
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(String(actuel || ''), u.password_hash))
    return res.render('mot_de_passe', { user: req.user, erreur: 'Mot de passe actuel incorrect.' });
  if (String(nouveau).length < 10 || nouveau !== confirmation)
    return res.render('mot_de_passe', { user: req.user,
      erreur: 'Le nouveau mot de passe doit compter au moins 10 caractères et être confirmé à l’identique.' });
  db.prepare('UPDATE users SET password_hash = ?, doit_changer_mdp = 0 WHERE id = ?')
    .run(bcrypt.hashSync(String(nouveau), 10), u.id);
  revoquerSessions(u.id); // révocation des autres sessions (§5.2)
  audit(req.user, 'changement_mdp', 'user', u.id, null, null, null, req);
  const token = creerSession(u.id);
  res.setHeader('Set-Cookie', `tw_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${12 * 3600}`);
  res.redirect('/');
});

// --- Google OAuth (optionnel) ---------------------------------------------
const etatsOAuth = new Map();
router.get('/auth/google', (req, res) => {
  if (!googleActif()) return res.redirect('/connexion');
  const etat = crypto.randomBytes(16).toString('hex');
  etatsOAuth.set(etat, Date.now());
  const cb = `${process.env.BASE_URL || 'http://localhost:3000'}/auth/google/retour`;
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: cb, response_type: 'code',
    scope: 'openid email profile', state: etat });
  res.redirect(url);
});
router.get('/auth/google/retour', async (req, res) => {
  try {
    if (!etatsOAuth.delete(req.query.state)) throw new Error('état invalide');
    const cb = `${process.env.BASE_URL || 'http://localhost:3000'}/auth/google/retour`;
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: req.query.code, client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: cb, grant_type: 'authorization_code' }) });
    const tok = await r.json();
    const info = await (await fetch('https://openidconnect.googleapis.com/v1/userinfo',
      { headers: { Authorization: `Bearer ${tok.access_token}` } })).json();
    const email = String(info.email || '').toLowerCase();
    // Liste blanche : seul un compte déjà créé par la direction peut entrer.
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!u || (u.statut !== 'actif' && u.statut !== 'invite')) {
      audit(null, 'connexion_google_refusee', 'user', email, null, null, null, req);
      return res.status(403).render('connexion', { user: null, googleActif: true,
        erreur: `L'adresse ${email} n'est pas autorisée sur TeacherWatch.` });
    }
    finaliserConnexion(req, res, u);
  } catch (e) {
    res.status(400).render('connexion', { user: null, googleActif: googleActif(),
      erreur: 'Échec de la connexion Google : ' + e.message });
  }
});

module.exports = router;
