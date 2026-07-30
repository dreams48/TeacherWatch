// TeacherWatch — serveur principal
// Monolithe Express + SQLite : application web responsive en français,
// contrôle des autorisations côté serveur, traitements planifiés en heure
// du Cameroun, sauvegardes quotidiennes.
require('./src/seed'); // amorçage idempotent (secteurs, tranches, proviseur)
const express = require('express');
const path = require('path');
const { db } = require('./src/db');
const { chargerUtilisateur, exigerConnexion, estDirection, nowDouala, dateFr, estJourCours } = require('./src/helpers');
const { demarrerPlanificateur, statutSecteurs, secteursConcernes } = require('./src/services/scheduler');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(chargerUtilisateur);

// routes
app.use(require('./src/routes/auth'));
app.use(require('./src/routes/evenements').router);
app.use(require('./src/routes/imports'));
app.use(require('./src/routes/admin'));
app.use(require('./src/routes/rapports'));

// --- tableau de bord -------------------------------------------------------
app.get('/', exigerConnexion, (req, res) => {
  const { date, heure } = nowDouala();
  const dateJour = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : date;
  const jour = db.prepare('SELECT * FROM journees WHERE date_jour = ?').get(dateJour);
  const secteurs = statutSecteurs(dateJour);
  const notifications = estDirection(req.user)
    ? db.prepare(`SELECT * FROM notifications WHERE (destinataire_role = 'proviseur' OR user_id = ?)
                  AND lu = 0 ORDER BY id DESC LIMIT 15`).all(req.user.id)
    : db.prepare('SELECT * FROM notifications WHERE user_id = ? AND lu = 0 ORDER BY id DESC LIMIT 15').all(req.user.id);
  // bandeau de rappel persistant (audit B-07) : après 16 h, secteur non soumis
  const monSecteur = secteurs.find(s => s.id === req.user.secteur_id);
  const rappel = !estDirection(req.user) && monSecteur && monSecteur.statut === 'en_attente'
    && heure >= '16:00' && estJourCours(dateJour) && dateJour === date;
  res.render('tableau_de_bord', { user: req.user, dateJour, dateFr: dateFr(dateJour),
    heure, jour, secteurs, notifications, rappel, estDirection: estDirection(req.user),
    jourCours: estJourCours(dateJour) });
});

app.post('/notifications/:id/lu', exigerConnexion, (req, res) => {
  db.prepare('UPDATE notifications SET lu = 1 WHERE id = ?').run(req.params.id);
  res.redirect('/');
});

// gestion d'erreurs
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('erreur', { user: req.user || null,
    message: 'Erreur interne. Aucune donnée soumise n’a été perdue. Détail : ' + err.message });
});
app.use((req, res) => res.status(404).render('erreur', { user: req.user || null, message: 'Page introuvable.' }));

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`TeacherWatch démarré sur http://localhost:${PORT}`);
  demarrerPlanificateur();
});
