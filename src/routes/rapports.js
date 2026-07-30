// TeacherWatch — rapports (Lot 7), export Word et envoi Gmail (Lot 8),
// consultation de l'emploi du temps (Lot 4)
const express = require('express');
const { db } = require('./../db');
const { audit, nowDouala, dateFr, JOURS_FR, exigerConnexion, exigerRole, estDirection } = require('./../helpers');
const { construireRapport } = require('./../services/rapport');
const { genererDocx } = require('./../services/docx');
const { envoyerEmail } = require('./../services/mail');

const router = express.Router();
router.use(exigerConnexion);

function bornes(req) {
  const { date } = nowDouala();
  const type = ['journalier', 'hebdomadaire', 'intermediaire'].includes(req.query.type)
    ? req.query.type : 'journalier';
  let du = req.query.du, au = req.query.au;
  if (type === 'journalier') { du = au = /^\d{4}-\d{2}-\d{2}$/.test(du || '') ? du : date; }
  else if (type === 'hebdomadaire') {
    const ref = /^\d{4}-\d{2}-\d{2}$/.test(du || '') ? du : date;
    const d = new Date(ref + 'T12:00:00Z');
    const js = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    const lundi = new Date(d); lundi.setUTCDate(d.getUTCDate() - (js - 1));
    const samedi = new Date(lundi); samedi.setUTCDate(lundi.getUTCDate() + 5);
    du = lundi.toISOString().slice(0, 10); au = samedi.toISOString().slice(0, 10);
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(du || '')) du = date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(au || '')) au = date;
    if (au < du) [du, au] = [au, du];
  }
  return { type, du, au };
}

router.get('/rapports', exigerRole('proviseur', 'admin'), (req, res) => {
  const { type, du, au } = bornes(req);
  const rapport = construireRapport(type, du, au);
  res.render('rapports', { user: req.user, rapport, message: req.query.m || null });
});

// export Word (Lot 8)
router.get('/rapports/export.docx', exigerRole('proviseur', 'admin'), async (req, res) => {
  const { type, du, au } = bornes(req);
  const rapport = construireRapport(type, du, au);
  const { buffer, empreinte, nGen } = await genererDocx(rapport);
  // traçabilité minimale d'un export (Lot 8) — l'identité reste dans l'audit,
  // jamais dans le document lui-même.
  db.prepare(`INSERT INTO envois_email (destinataire, sujet, periode, format, nb_lignes, empreinte, resultat, user_id)
              VALUES ('téléchargement', ?, ?, 'docx', ?, ?, 'succes', ?)`)
    .run(`Export Word ${type}`, `${du}→${au}`, rapport.detail.length, empreinte, req.user.id);
  audit(req.user, 'export_docx', 'rapport', `${type} ${du}→${au}`,
        null, { empreinte, generation: nGen }, null, req);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="rapport-${type}-${du}-g${nGen}.docx"`);
  res.send(buffer);
});

// envoi au proviseur (Lot 8)
router.post('/rapports/envoyer', exigerRole('proviseur', 'admin'), async (req, res) => {
  const { type, du, au } = bornes({ query: req.body });
  const rapport = construireRapport(type, du, au);
  const { buffer, empreinte, nGen } = await genererDocx(rapport);
  const prov = db.prepare('SELECT email FROM users WHERE est_compte_principal = 1').get();
  const resultat = await envoyerEmail({
    destinataire: prov.email,
    sujet: `TeacherWatch — rapport ${type} du ${rapport.duFr} au ${rapport.auFr} (génération n° ${nGen})`,
    texte: `Rapport ${type} en pièce jointe.\nCe document annule et remplace toute génération précédente de la même période.\n` +
           `Secteurs ayant transmis : ${rapport.nbTransmis}/${rapport.nbActifs}. Total : ${rapport.totalHeures} h d'absence.`,
    pieceJointe: { nom: `rapport-${type}-${du}-g${nGen}.docx`, buffer },
    periode: `${du}→${au}`, format: 'docx', nbLignes: rapport.detail.length,
    empreinte, userId: req.user.id });
  audit(req.user, 'envoi_rapport_email', 'rapport', `${type} ${du}→${au}`, null, { resultat }, null, req);
  const msg = resultat === 'succes' ? 'Rapport envoyé au proviseur.'
    : resultat === 'non_configure' ? 'Serveur d’envoi non configuré : l’envoi a été journalisé mais aucun e-mail n’est parti (voir Admin → Sauvegardes & envois).'
    : 'Échec de l’envoi (journalisé) : ' + resultat;
  res.redirect(`/rapports?type=${type}&du=${du}&au=${au}&m=` + encodeURIComponent(msg));
});

// --- consultation de l'emploi du temps (Lot 4) -----------------------------
router.get('/edt', (req, res) => {
  const version = db.prepare('SELECT * FROM edt_versions WHERE actif = 1').get();
  const vue = ['classe', 'enseignant', 'jour', 'secteur'].includes(req.query.vue) ? req.query.vue : 'classe';
  let lignes = [];
  if (version) {
    let sql = `
      SELECT e.jour_semaine, t.numero, t.heure_debut, t.heure_fin, c.nom AS classe,
             s.nom AS secteur, en.nom AS enseignant, en.matricule, e.matiere, e.groupe_jumelage
      FROM emploi_du_temps e
      JOIN tranches t ON t.id = e.tranche_id
      JOIN classes c ON c.id = e.classe_id
      LEFT JOIN secteurs s ON s.id = c.secteur_id
      JOIN enseignants en ON en.id = e.enseignant_id
      WHERE e.version_id = ?`;
    const params = [version.id];
    // un surveillant ne consulte que son secteur (contrôle serveur, T-04)
    if (!estDirection(req.user)) { sql += ' AND c.secteur_id = ?'; params.push(req.user.secteur_id); }
    if (req.query.q) {
      sql += ' AND (c.nom LIKE ? OR en.nom LIKE ? OR e.matiere LIKE ?)';
      const q = `%${req.query.q}%`; params.push(q, q, q);
    }
    sql += ' ORDER BY ' + (vue === 'enseignant' ? 'en.nom, e.jour_semaine, t.numero'
      : vue === 'jour' ? 'e.jour_semaine, t.numero, c.nom'
      : vue === 'secteur' ? 's.nom, c.nom, e.jour_semaine, t.numero'
      : 'c.nom, e.jour_semaine, t.numero');
    lignes = db.prepare(sql).all(...params);
  }
  res.render('edt', { user: req.user, version, vue, lignes, q: req.query.q || '', JOURS_FR });
});

module.exports = router;
