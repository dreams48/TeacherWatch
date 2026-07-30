// TeacherWatch — imports Excel (Lots 3 et 4)
// Déroulement en deux temps : téléversement → APERÇU avec anomalies →
// PUBLICATION atomique (transaction). Les enseignants absents du nouveau
// fichier sont ARCHIVÉS, jamais supprimés (§3.4). Contrôles de sécurité :
// taille bornée, extensions contrôlées, aucune évaluation de formule (T-05).
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { db, DATA_DIR, getSetting } = require('./../db');
const { audit, exigerConnexion, exigerRole, nowDouala } = require('./../helpers');

const router = express.Router();
// préfixe explicite : sans lui, ce contrôle de rôle s'appliquerait aussi aux
// routeurs montés après celui-ci (fuite de middleware)
router.use('/imports', exigerConnexion, exigerRole('proviseur', 'admin'));

const upload = multer({
  dest: path.join(DATA_DIR, 'imports'),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 Mo max (audit T-05)
  fileFilter: (req, f, cb) => {
    const ok = ['.xlsx', '.xls', '.csv'].includes(path.extname(f.originalname).toLowerCase());
    cb(ok ? null : new Error('Format accepté : .xlsx, .xls ou .csv'), ok);
  },
});

function lireFeuille(chemin) {
  const wb = XLSX.readFile(chemin, { cellFormula: false, cellHTML: false }); // pas de formules
  const feuille = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(feuille, { defval: '', raw: false });
}

// reconnaissance souple des noms de colonnes
function colonne(ligne, ...noms) {
  const cles = Object.keys(ligne);
  for (const n of noms) {
    const c = cles.find(k => k.trim().toLowerCase().replace(/[éèê]/g, 'e') === n);
    if (c !== undefined) return String(ligne[c]).trim();
  }
  return '';
}

// ============================== PERSONNEL (Lot 3) ==========================
router.get('/imports/personnel', (req, res) => {
  const historique = db.prepare(`SELECT i.*, u.nom AS auteur FROM imports i
    JOIN users u ON u.id = i.user_id WHERE i.type = 'personnel'
    ORDER BY i.id DESC LIMIT 20`).all();
  res.render('import_personnel', { user: req.user, historique, apercu: null, erreur: null });
});

router.post('/imports/personnel', upload.single('fichier'), (req, res) => {
  let lignes;
  try { lignes = lireFeuille(req.file.path); }
  catch (e) { return res.render('import_personnel', { user: req.user, historique: [], apercu: null,
    erreur: 'Fichier illisible : ' + e.message }); }

  const donnees = [], anomalies = [];
  const matricules = new Set();
  lignes.forEach((l, i) => {
    const n = i + 2; // ligne Excel (après l'en-tête)
    const row = {
      matricule: colonne(l, 'matricule'),
      nom: colonne(l, 'nom', 'nom et prenom', 'noms et prenoms', 'nom de l\'enseignant'),
      specialite: colonne(l, 'specialite', 'discipline', 'matiere'),
      telephone: colonne(l, 'telephone', 'tel', 'numero de telephone', 'contact'),
    };
    if (!row.nom) { anomalies.push({ ligne: n, niveau: 'bloquant', message: 'Ligne sans identité exploitable (nom vide).' }); return; }
    if (row.matricule && matricules.has(row.matricule))
      anomalies.push({ ligne: n, niveau: 'bloquant', message: `Matricule dupliqué dans le fichier : ${row.matricule}.` });
    if (row.matricule) matricules.add(row.matricule);
    if (!row.matricule) anomalies.push({ ligne: n, niveau: 'avertissement', message: `« ${row.nom} » sans matricule (identifiant interne utilisé).` });
    if (!row.telephone) anomalies.push({ ligne: n, niveau: 'avertissement', message: `Téléphone manquant pour « ${row.nom} ».` });
    donnees.push(row);
  });
  if (!donnees.length) anomalies.push({ ligne: 0, niveau: 'bloquant', message: 'Fichier sans colonnes obligatoires (au minimum : Nom).' });

  // détection de modification massive (audit I-06) : >= 20 % des actifs archivés
  const actifs = db.prepare(`SELECT COUNT(*) n FROM enseignants WHERE statut = 'actif'`).get().n;
  const conserves = new Set(donnees.map(d => d.matricule || d.nom.toLowerCase()));
  const archives = db.prepare(`SELECT matricule, nom FROM enseignants WHERE statut = 'actif'`).all()
    .filter(e => !conserves.has(e.matricule || e.nom.toLowerCase()));
  if (actifs > 0 && archives.length / actifs >= 0.2)
    anomalies.push({ ligne: 0, niveau: 'confirmation',
      message: `Modification massive : ${archives.length} enseignant(s) sur ${actifs} seraient archivés. Confirmation explicite requise.` });

  const imp = db.prepare(`INSERT INTO imports (type, fichier, donnees, anomalies, user_id)
    VALUES ('personnel', ?, ?, ?, ?)`)
    .run(req.file.originalname, JSON.stringify(donnees), JSON.stringify(anomalies), req.user.id);
  fs.unlink(req.file.path, () => {});
  res.redirect(`/imports/personnel/${imp.lastInsertRowid}`);
});

router.get('/imports/personnel/:id', (req, res) => {
  const imp = db.prepare(`SELECT * FROM imports WHERE id = ? AND type = 'personnel'`).get(req.params.id);
  if (!imp) return res.redirect('/imports/personnel');
  res.render('import_personnel', { user: req.user, historique: [], erreur: null,
    apercu: { ...imp, donnees: JSON.parse(imp.donnees), anomalies: JSON.parse(imp.anomalies) } });
});

router.post('/imports/personnel/:id/publier', (req, res) => {
  const imp = db.prepare(`SELECT * FROM imports WHERE id = ? AND type = 'personnel' AND statut = 'apercu'`).get(req.params.id);
  if (!imp) return res.redirect('/imports/personnel');
  const donnees = JSON.parse(imp.donnees), anomalies = JSON.parse(imp.anomalies);
  const bloquants = anomalies.filter(a => a.niveau === 'bloquant');
  const confirmations = anomalies.filter(a => a.niveau === 'confirmation');
  if (bloquants.length)
    return res.status(400).render('erreur', { user: req.user,
      message: 'Publication refusée : anomalies bloquantes non résolues. Corrigez le fichier puis téléversez-le de nouveau.' });
  if (confirmations.length && req.body.confirmer_massif !== '1')
    return res.status(400).render('erreur', { user: req.user,
      message: 'Modification massive détectée : cochez la case de confirmation pour publier.' });

  const stats = { crees: 0, modifies: 0, archives: 0 };
  const tx = db.transaction(() => {
    const conserves = new Set();
    for (const d of donnees) {
      const existant = d.matricule
        ? db.prepare('SELECT * FROM enseignants WHERE matricule = ?').get(d.matricule)
        : db.prepare('SELECT * FROM enseignants WHERE matricule IS NULL AND lower(nom) = lower(?)').get(d.nom);
      if (existant) {
        db.prepare(`UPDATE enseignants SET nom = ?, specialite = ?, telephone = ?, statut = 'actif' WHERE id = ?`)
          .run(d.nom, d.specialite || null, d.telephone || null, existant.id);
        stats.modifies++; conserves.add(existant.id);
      } else {
        const r = db.prepare(`INSERT INTO enseignants (matricule, nom, specialite, telephone)
          VALUES (?, ?, ?, ?)`).run(d.matricule || null, d.nom, d.specialite || null, d.telephone || null);
        stats.crees++; conserves.add(r.lastInsertRowid);
      }
    }
    // archivage (jamais de suppression : l'historique et les rapports passés
    // sont protégés par les instantanés — §3.4 / audit B-05)
    for (const e of db.prepare(`SELECT id FROM enseignants WHERE statut = 'actif'`).all()) {
      if (!conserves.has(e.id)) {
        db.prepare(`UPDATE enseignants SET statut = 'archive' WHERE id = ?`).run(e.id);
        stats.archives++;
      }
    }
    db.prepare(`UPDATE imports SET statut = 'publie', stats = ? WHERE id = ?`)
      .run(JSON.stringify(stats), imp.id);
  });
  tx();
  audit(req.user, 'publication_import_personnel', 'import', imp.id, null, stats,
        confirmations.length ? 'modification massive confirmée' : null, req);
  res.render('erreur', { user: req.user, message:
    `Import publié : ${stats.crees} créé(s), ${stats.modifies} mis à jour, ${stats.archives} archivé(s). ` +
    `Aucun rapport passé n'est modifié (instantanés).` });
});

// ========================= EMPLOI DU TEMPS (Lot 4) =========================
// Colonnes attendues : Jour (1-6 ou nom), Tranche (1-10), Classe, Secteur,
// Matricule (ou Enseignant), Matière, Jumelage (facultatif).
router.get('/imports/edt', (req, res) => {
  const versions = db.prepare('SELECT * FROM edt_versions ORDER BY id DESC').all();
  res.render('import_edt', { user: req.user, versions, apercu: null, erreur: null });
});

const JOURS_NOMS = { lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6 };

router.post('/imports/edt', upload.single('fichier'), (req, res) => {
  let lignes;
  try { lignes = lireFeuille(req.file.path); }
  catch (e) { return res.render('import_edt', { user: req.user, versions: [], apercu: null,
    erreur: 'Fichier illisible : ' + e.message }); }

  const donnees = [], anomalies = [];
  const secteurs = db.prepare('SELECT * FROM secteurs').all();
  lignes.forEach((l, i) => {
    const n = i + 2;
    const jourBrut = colonne(l, 'jour').toLowerCase();
    const jour = JOURS_NOMS[jourBrut] || Number(jourBrut) || 0;
    const tranche = Number(colonne(l, 'tranche', 'tranche horaire', 'periode', 'heure')) || 0;
    const classe = colonne(l, 'classe');
    const secteurNom = colonne(l, 'secteur');
    const matricule = colonne(l, 'matricule');
    const enseignantNom = colonne(l, 'enseignant', 'nom de l\'enseignant', 'nom');
    const matiere = colonne(l, 'matiere', 'discipline');
    const jumelage = colonne(l, 'jumelage', 'groupe', 'classes jumelees');

    if (!jour || jour < 1 || jour > 6) { anomalies.push({ ligne: n, niveau: 'bloquant', message: `Jour invalide : « ${jourBrut} » (attendu : lundi…samedi ou 1…6).` }); return; }
    if (!tranche || tranche < 1 || tranche > 10) { anomalies.push({ ligne: n, niveau: 'bloquant', message: `Tranche invalide : « ${tranche} » (attendu : 1 à 10).` }); return; }
    if (!classe) { anomalies.push({ ligne: n, niveau: 'bloquant', message: 'Classe manquante.' }); return; }

    // rapprochement avec le fichier du personnel (Lot 4)
    let enseignant = null;
    if (matricule) enseignant = db.prepare(`SELECT * FROM enseignants WHERE matricule = ? AND statut = 'actif'`).get(matricule);
    if (!enseignant && enseignantNom)
      enseignant = db.prepare(`SELECT * FROM enseignants WHERE lower(nom) = lower(?) AND statut = 'actif'`).get(enseignantNom);
    if (!enseignant) {
      anomalies.push({ ligne: n, niveau: 'bloquant',
        message: `Enseignant non reconnu : « ${matricule || enseignantNom || '(vide)'} ». Importez d'abord le personnel ou corrigez le libellé.` });
      return;
    }
    const secteur = secteurs.find(s => s.nom.toLowerCase() === secteurNom.toLowerCase());
    if (secteurNom && !secteur)
      anomalies.push({ ligne: n, niveau: 'avertissement', message: `Secteur inconnu « ${secteurNom} » (ligne conservée, classe sans secteur).` });

    donnees.push({ jour, tranche, classe, secteur_id: secteur ? secteur.id : null,
                   enseignant_id: enseignant.id, enseignant: enseignant.nom,
                   matiere, jumelage: jumelage || null });
  });
  if (!donnees.length) anomalies.push({ ligne: 0, niveau: 'bloquant', message: 'Aucune ligne exploitable.' });

  const imp = db.prepare(`INSERT INTO imports (type, fichier, donnees, anomalies, user_id)
    VALUES ('edt', ?, ?, ?, ?)`)
    .run(req.file.originalname, JSON.stringify(donnees), JSON.stringify(anomalies), req.user.id);
  fs.unlink(req.file.path, () => {});
  res.redirect(`/imports/edt/${imp.lastInsertRowid}`);
});

router.get('/imports/edt/:id', (req, res) => {
  const imp = db.prepare(`SELECT * FROM imports WHERE id = ? AND type = 'edt'`).get(req.params.id);
  if (!imp) return res.redirect('/imports/edt');
  res.render('import_edt', { user: req.user, versions: [], erreur: null,
    apercu: { ...imp, donnees: JSON.parse(imp.donnees), anomalies: JSON.parse(imp.anomalies) } });
});

router.post('/imports/edt/:id/publier', (req, res) => {
  const imp = db.prepare(`SELECT * FROM imports WHERE id = ? AND type = 'edt' AND statut = 'apercu'`).get(req.params.id);
  if (!imp) return res.redirect('/imports/edt');
  const donnees = JSON.parse(imp.donnees), anomalies = JSON.parse(imp.anomalies);
  if (anomalies.some(a => a.niveau === 'bloquant'))
    return res.status(400).render('erreur', { user: req.user,
      message: 'Publication refusée : lignes non rapprochées ou invalides. Corrigez le fichier puis recommencez.' });

  const tx = db.transaction(() => {
    // nouvelle version ; les anciennes restent conservées avec leur date d'effet
    db.prepare('UPDATE edt_versions SET actif = 0').run();
    const v = db.prepare(`INSERT INTO edt_versions (libelle, date_effet, actif) VALUES (?, ?, 1)`)
      .run(imp.fichier, req.body.date_effet || nowDouala().date);
    const tranches = Object.fromEntries(db.prepare('SELECT numero, id FROM tranches').all().map(t => [t.numero, t.id]));
    for (const d of donnees) {
      let classe = db.prepare('SELECT * FROM classes WHERE lower(nom) = lower(?)').get(d.classe);
      if (!classe) {
        const r = db.prepare('INSERT INTO classes (nom, secteur_id) VALUES (?, ?)').run(d.classe, d.secteur_id);
        classe = { id: r.lastInsertRowid };
      } else if (d.secteur_id && classe.secteur_id !== d.secteur_id) {
        db.prepare('UPDATE classes SET secteur_id = ? WHERE id = ?').run(d.secteur_id, classe.id);
      }
      db.prepare(`INSERT INTO emploi_du_temps (version_id, jour_semaine, tranche_id, classe_id, enseignant_id, matiere, groupe_jumelage)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(v.lastInsertRowid, d.jour, tranches[d.tranche], classe.id, d.enseignant_id, d.matiere || null, d.jumelage);
    }
    db.prepare(`UPDATE imports SET statut = 'publie', stats = ? WHERE id = ?`)
      .run(JSON.stringify({ lignes: donnees.length }), imp.id);
    return v.lastInsertRowid;
  });
  const versionId = tx();
  audit(req.user, 'publication_import_edt', 'edt_version', versionId, null,
        { lignes: donnees.length, fichier: imp.fichier }, null, req);
  res.render('erreur', { user: req.user, message:
    `Emploi du temps publié (${donnees.length} lignes). Les événements passés conservent leurs instantanés : aucun rapport antérieur n'est modifié.` });
});

// retour à une version précédente (Lot 4) — les instantanés protègent l'historique (I-05)
router.post('/imports/edt/version/:id/activer', (req, res) => {
  const v = db.prepare('SELECT * FROM edt_versions WHERE id = ?').get(req.params.id);
  if (!v) return res.redirect('/imports/edt');
  db.prepare('UPDATE edt_versions SET actif = 0').run();
  db.prepare('UPDATE edt_versions SET actif = 1 WHERE id = ?').run(v.id);
  audit(req.user, 'retour_version_edt', 'edt_version', v.id, null, { libelle: v.libelle },
        req.body.motif || null, req);
  res.redirect('/imports/edt');
});

module.exports = router;
