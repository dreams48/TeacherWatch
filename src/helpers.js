// TeacherWatch — utilitaires : heure de Douala, audit, authentification
const crypto = require('crypto');
const { db, getSetting } = require('./db');

const TZ = 'Africa/Douala'; // invariant (audit B-10)

// Date/heure courante en heure du Cameroun.
function nowDouala() {
  const parts = new Intl.DateTimeFormat('fr-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,          // YYYY-MM-DD
    heure: `${p.hour}:${p.minute}`,                  // HH:MM
    complet: `${p.day}/${p.month}/${p.year} à ${p.hour}:${p.minute}`,
  };
}

// jour de semaine 1=lundi … 7=dimanche pour une date YYYY-MM-DD
function jourSemaine(dateISO) {
  const d = new Date(dateISO + 'T12:00:00Z');
  const j = d.getUTCDay();
  return j === 0 ? 7 : j;
}

const JOURS_FR = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

function dateFr(dateISO) {
  const [a, m, j] = dateISO.split('-');
  return `${JOURS_FR[jourSemaine(dateISO)].toLowerCase()} ${j}/${m}/${a}`;
}

// Jour de cours ? Réglage jours_cours (ex. "1,2,3,4,5") + table d'exceptions (audit B-03).
function estJourCours(dateISO) {
  const exc = db.prepare('SELECT est_jour_cours FROM jours_exceptions WHERE date_jour = ?').get(dateISO);
  if (exc) return !!exc.est_jour_cours;
  const jours = (getSetting('jours_cours', '1,2,3,4,5')).split(',').map(Number);
  return jours.includes(jourSemaine(dateISO));
}

// --- journal d'audit (ajout seul) ----------------------------------------
function audit(user, action, objetType, objetId, avant, apres, motif, req) {
  db.prepare(`INSERT INTO audit_log (user_id, role, action, objet_type, objet_id, avant, apres, motif, ip)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(user ? user.id : null, user ? user.role : null, action, objetType || null,
         objetId != null ? String(objetId) : null,
         avant != null ? JSON.stringify(avant) : null,
         apres != null ? JSON.stringify(apres) : null,
         motif || null, req ? (req.ip || null) : null);
}

// --- sessions -------------------------------------------------------------
const DUREE_SESSION_H = 12; // session courte, appareils partagés (audit T-06)

function creerSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare(`INSERT INTO sessions (token, user_id, expires_at)
              VALUES (?, ?, datetime('now', '+${DUREE_SESSION_H} hours'))`).run(token, userId);
  return token;
}

function revoquerSessions(userId) {
  db.prepare('UPDATE sessions SET revoked = 1 WHERE user_id = ?').run(userId);
}

// Middleware : charge l'utilisateur depuis le cookie de session.
function chargerUtilisateur(req, res, next) {
  req.user = null;
  const token = (req.headers.cookie || '').split(';').map(s => s.trim())
    .find(s => s.startsWith('tw_session='));
  if (token) {
    const s = db.prepare(`SELECT s.*, u.id AS uid, u.email, u.nom, u.role, u.secteur_id,
                                 u.statut, u.est_compte_principal, u.doit_changer_mdp
                          FROM sessions s JOIN users u ON u.id = s.user_id
                          WHERE s.token = ? AND s.revoked = 0
                            AND s.expires_at > datetime('now')`).get(token.slice('tw_session='.length));
    if (s && s.statut === 'actif') {
      req.user = { id: s.uid, email: s.email, nom: s.nom, role: s.role,
                   secteur_id: s.secteur_id, est_compte_principal: !!s.est_compte_principal,
                   doit_changer_mdp: !!s.doit_changer_mdp };
      req.sessionToken = token.slice('tw_session='.length);
    }
  }
  next();
}

function exigerConnexion(req, res, next) {
  if (!req.user) return res.redirect('/connexion');
  if (req.user.doit_changer_mdp && req.path !== '/mot-de-passe' && req.method === 'GET')
    return res.redirect('/mot-de-passe');
  next();
}

// Contrôle des rôles côté serveur (audit T-04) — jamais seulement dans l'interface.
function exigerRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.redirect('/connexion');
    if (!roles.includes(req.user.role)) return res.status(403).render('erreur', {
      user: req.user, message: 'Accès refusé : cette action ne correspond pas à votre rôle.' });
    next();
  };
}

const estDirection = (u) => u && (u.role === 'proviseur' || u.role === 'admin');

module.exports = { TZ, nowDouala, jourSemaine, JOURS_FR, dateFr, estJourCours, audit,
                   creerSession, revoquerSessions, chargerUtilisateur, exigerConnexion,
                   exigerRole, estDirection };
