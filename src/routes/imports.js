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

// La colonne OBSERVATION du fichier du lycée porte déjà les situations
// administratives : on les reprend telles quelles (audit B-04).
function situationDepuis(observation) {
  const o = String(observation || '').toUpperCase();
  if (/MATERNIT/.test(o)) return 'conge_maternite';
  if (/MALADIE/.test(o)) return 'conge_maladie';
  if (/STAGE|FORMATION/.test(o)) return 'formation';
  if (/HORS DU PAYS|ETRANGER/.test(o)) return 'detache';
  if (/MISSION/.test(o)) return 'mission';
  return 'en_poste';
}

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

// Le fichier du personnel du lycée compte plusieurs feuilles (titulaires,
// vacataires, personnel n'ayant pas pris service, personnel hors du pays) et son
// en-tête ne se trouve pas en première ligne. On cherche donc la ligne d'en-tête
// dans CHAQUE feuille, et on lit toutes celles qui en ont une.
function lireToutesFeuillesPersonnel(chemin) {
  const wb = XLSX.readFile(chemin, { cellFormula: false, cellHTML: false });
  const out = [];
  for (const nomFeuille of wb.SheetNames) {
    const brut = XLSX.utils.sheet_to_json(wb.Sheets[nomFeuille], { header: 1, defval: '', raw: false });
    let ligneEntete = -1;
    for (let i = 0; i < Math.min(brut.length, 40); i++) {
      const cellules = brut[i].map(c => String(c).toUpperCase());
      const aNom = cellules.some(c => /NOMS?\b|NOMS ET PRENOMS/.test(c));
      const aMat = cellules.some(c => /MATRICULE/.test(c));
      if (aNom && aMat) { ligneEntete = i; break; }
    }
    if (ligneEntete < 0) continue;
    const entetes = brut[ligneEntete].map(c => String(c).trim());
    for (let i = ligneEntete + 1; i < brut.length; i++) {
      const ligne = {};
      entetes.forEach((h, j) => { if (h) ligne[h] = brut[i][j] != null ? brut[i][j] : ''; });
      if (Object.values(ligne).some(v => String(v).trim() !== '')) { ligne.__feuille = nomFeuille; out.push(ligne); }
    }
  }
  return out;
}

// Rapprochement d'un nom d'enseignant : exact d'abord, puis par recouvrement de
// mots. Une correspondance ambiguë (plusieurs candidats) est signalée, jamais
// devinée.
const normNom = v => String(v).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\b(EPSE|EPOUSE|NEE|PROF|MME|MLLE|MR|M)\b/g, ' ')
  .replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();

function rapprocherEnseignant(nomEdt, candidats) {
  const cle = normNom(nomEdt);
  if (!cle) return { statut: 'vide' };
  const exact = candidats.filter(c => c.cle === cle);
  if (exact.length === 1) return { statut: 'ok', enseignant: exact[0] };
  if (exact.length > 1) return { statut: 'ambigu', choix: exact };
  const mots = cle.split(' ').filter(m => m.length > 2);
  if (!mots.length) return { statut: 'aucun' };
  // tous les mots du libellé de l'emploi du temps doivent figurer dans le nom officiel
  const inclus = candidats.filter(c => mots.every(m => c.mots.has(m)));
  if (inclus.length === 1) return { statut: 'ok', enseignant: inclus[0], approche: true };
  if (inclus.length > 1) return { statut: 'ambigu', choix: inclus };
  return { statut: 'aucun' };
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
  try { lignes = lireToutesFeuillesPersonnel(req.file.path);
        if (!lignes.length) lignes = lireFeuille(req.file.path); }
  catch (e) { return res.render('import_personnel', { user: req.user, historique: [], apercu: null,
    erreur: 'Fichier illisible : ' + e.message }); }

  const donnees = [], anomalies = [];
  const matricules = new Map();
  const feuilles = new Set();
  lignes.forEach((l, i) => {
    const n = i + 2; // ligne Excel (après l'en-tête)
    if (l.__feuille) feuilles.add(l.__feuille);
    const matBrut = colonne(l, 'matricule');
    const row = {
      // « vacataire », « / » ou « - » dans la colonne matricule = pas de matricule
      matricule: /^(vacataire|\/|-|n\/a)$/i.test(matBrut) ? '' : matBrut,
      nom: colonne(l, 'nom', 'noms', 'nom et prenom', 'noms et prenoms', 'nom de l\'enseignant'),
      specialite: colonne(l, 'specialite', 'discipline', 'matiere', 'discipline specialite'),
      telephone: colonne(l, 'telephone', 'tel', 'numero de telephone', 'contact'),
      situation: colonne(l, 'observation'),
    };
    if (!row.nom) {
      // Une ligne de séparation ou de sous-total n'est pas une erreur : on ne la
      // signale que si elle porte des données par ailleurs (matricule, contact…).
      if (row.matricule || row.telephone || row.specialite)
        anomalies.push({ ligne: n, niveau: 'bloquant',
          message: `Ligne sans nom mais avec des données (matricule « ${row.matricule || '—'} ») : identité à compléter.` });
      return;
    }
    if (row.matricule && matricules.has(row.matricule)) {
      const precedent = matricules.get(row.matricule);
      if (normNom(precedent.nom) === normNom(row.nom)) {
        // Même personne présente sur deux feuilles (par exemple aussi dans
        // « PERSONNEL HORS DU PAYS ») : on fusionne au lieu de bloquer, et la
        // situation déclarée sur la feuille spécialisée est conservée.
        if (row.situation && !precedent.situation) precedent.situation = row.situation;
        if (!precedent.situation && /HORS DU PAYS/i.test(l.__feuille || '')) precedent.situation = 'HORS DU PAYS';
        anomalies.push({ ligne: n, niveau: 'avertissement',
          message: `« ${row.nom} » figure sur deux feuilles (${precedent.feuille} et ${l.__feuille || '?'}) : les lignes ont été fusionnées.` });
        return;
      }
      anomalies.push({ ligne: n, niveau: 'bloquant',
        message: `Matricule ${row.matricule} porté par deux personnes différentes : « ${precedent.nom} » et « ${row.nom} ». À corriger dans le fichier.` });
    }
    if (row.matricule) matricules.set(row.matricule, { nom: row.nom, situation: row.situation, feuille: l.__feuille || '?' });
    if (!row.situation && /HORS DU PAYS/i.test(l.__feuille || '')) row.situation = 'HORS DU PAYS';
    if (!row.matricule) anomalies.push({ ligne: n, niveau: 'avertissement', message: `« ${row.nom} » sans matricule (identifiant interne utilisé).` });
    if (!row.telephone) anomalies.push({ ligne: n, niveau: 'avertissement', message: `Téléphone manquant pour « ${row.nom} ».` });
    donnees.push(row);
  });
  if (!donnees.length) anomalies.push({ ligne: 0, niveau: 'bloquant', message: 'Fichier sans colonnes obligatoires (au minimum : Nom).' });
  if (feuilles.size > 1) anomalies.push({ ligne: 0, niveau: 'avertissement',
    message: `${feuilles.size} feuilles lues : ${[...feuilles].join(', ')}.` });

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
        db.prepare(`UPDATE enseignants SET nom = ?, specialite = ?, telephone = ?, statut = 'actif',
                    situation = ? WHERE id = ?`)
          .run(d.nom, d.specialite || null, d.telephone || null, situationDepuis(d.situation), existant.id);
        stats.modifies++; conserves.add(existant.id);
      } else {
        const r = db.prepare(`INSERT INTO enseignants (matricule, nom, specialite, telephone, situation)
          VALUES (?, ?, ?, ?, ?)`).run(d.matricule || null, d.nom, d.specialite || null,
                                       d.telephone || null, situationDepuis(d.situation));
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

// --- lecture du format réel du lycée -------------------------------------
// L'emploi du temps fourni par le lycée porte une colonne « Heure » sous la
// forme « 07H30 – 08H20 », pas un numéro de tranche. La casse varie et deux
// coquilles sont connues. On rapproche donc l'heure des tranches enregistrées.
const CORRECTIONS_HEURE = { '11H45-12H55': '11H55-12H55', '11H55-12H56': '11H55-12H55' };
const cleHeure = v => String(v).toUpperCase().replace(/[–—]/g, '-')
  .replace(/H/g, 'H').replace(/\s+/g, '').replace(/:/g, 'H');

function indexTranches() {
  const idx = new Map();
  for (const t of db.prepare('SELECT id, numero, heure_debut, heure_fin FROM tranches').all()) {
    idx.set(cleHeure(`${t.heure_debut}-${t.heure_fin}`), t);
    idx.set(String(t.numero), t);
  }
  return idx;
}

// Secteur déduit du préfixe de classe, selon le découpage par niveau du lycée
// (A1/A2 → 1, A3/A4 → 2, 2NDE → 3, P → 4, T → 5).
function secteurParNiveau(nomClasse) {
  const u = String(nomClasse).trim().toUpperCase();
  if (/^A[12][ -]/.test(u)) return 1;
  if (/^A[34][ -]/.test(u)) return 2;
  if (/^2NDE/.test(u)) return 3;
  if (/^P[ -]/.test(u)) return 4;
  if (/^T[ -]/.test(u)) return 5;
  return null;
}

router.post('/imports/edt', upload.single('fichier'), (req, res) => {
  let lignes;
  try { lignes = lireFeuille(req.file.path); }
  catch (e) { return res.render('import_edt', { user: req.user, versions: [], apercu: null,
    erreur: 'Fichier illisible : ' + e.message }); }

  const donnees = [], anomalies = [];
  const secteurs = db.prepare('SELECT * FROM secteurs').all();
  const tranches = indexTranches();
  // candidats préparés une fois : nom normalisé + jeu de mots pour le rapprochement
  const candidats = db.prepare(`SELECT id, nom, matricule FROM enseignants WHERE statut = 'actif'`)
    .all().map(e => { const cle = normNom(e.nom);
      return { ...e, cle, mots: new Set(cle.split(' ').filter(m => m.length > 2)) }; });
  let coquilles = 0, sansEnseignant = 0, nonRapproches = 0, approches = 0, ambigus = 0;

  lignes.forEach((l, i) => {
    const n = i + 2;
    const jourBrut = colonne(l, 'jour').toLowerCase();
    const jour = JOURS_NOMS[jourBrut] || Number(jourBrut) || 0;

    // tranche : soit un numéro, soit un horaire « 07H30 – 08H20 »
    const heureBrute = colonne(l, 'heure', 'horaire', 'tranche', 'tranche horaire', 'periode');
    let cle = cleHeure(heureBrute);
    if (CORRECTIONS_HEURE[cle]) { cle = CORRECTIONS_HEURE[cle]; coquilles++; }
    const tr = tranches.get(cle) || tranches.get(String(Number(heureBrute) || ''));

    const classe = colonne(l, 'classe');
    const secteurNom = colonne(l, 'secteur');
    const matricule = colonne(l, 'matricule');
    const enseignantNom = colonne(l, 'enseignant', "nom de l'enseignant", 'nom');
    const matiere = colonne(l, 'matiere', 'discipline');
    const jumelage = colonne(l, 'jumelage', 'groupe', 'classes jumelees');

    if (!jour || jour < 1 || jour > 6) {
      anomalies.push({ ligne: n, niveau: 'bloquant', message: `Jour non reconnu : « ${jourBrut} » (attendu : Lundi…Samedi ou 1…6).` });
      return;
    }
    if (!tr) {
      anomalies.push({ ligne: n, niveau: 'bloquant', message: `Horaire non rapproché d'une tranche : « ${heureBrute} ».` });
      return;
    }
    if (!classe) { anomalies.push({ ligne: n, niveau: 'bloquant', message: 'Classe manquante.' }); return; }

    // secteur : colonne explicite, sinon déduction par niveau
    let secteur = secteurNom ? secteurs.find(s => s.nom.toLowerCase() === secteurNom.toLowerCase()) : null;
    if (!secteur) {
      const num = secteurParNiveau(classe);
      if (num) secteur = secteurs.find(s => s.id === num) || secteurs[num - 1] || null;
      if (!secteur) anomalies.push({ ligne: n, niveau: 'avertissement',
        message: `Secteur indéterminé pour la classe « ${classe} » : à rattacher à la main.` });
    }

    // Ligne sans enseignant : créneau non pédagogique (Bibliothèque, Pause,
    // Orientation…). Conservé, mais il n'attend aucune déclaration d'absence.
    if (!matricule && !enseignantNom) {
      sansEnseignant++;
      donnees.push({ jour, tranche: tr.numero, classe, secteur_id: secteur ? secteur.id : null,
                     enseignant_id: null, enseignant: null, matiere, jumelage: jumelage || null });
      return;
    }

    let enseignant = null;
    if (matricule) enseignant = candidats.find(c => c.matricule === matricule) || null;
    if (!enseignant && enseignantNom) {
      const r = rapprocherEnseignant(enseignantNom, candidats);
      if (r.statut === 'ok') { enseignant = r.enseignant; if (r.approche) approches++; }
      else if (r.statut === 'ambigu') {
        ambigus++;
        anomalies.push({ ligne: n, niveau: 'bloquant',
          message: `« ${enseignantNom} » correspond à plusieurs enseignants (${r.choix.slice(0, 3).map(c => c.nom).join(' ; ')}${r.choix.length > 3 ? ' …' : ''}). Précisez le nom ou renseignez le matricule.` });
        return;
      }
    }
    if (!enseignant) {
      nonRapproches++;
      const plusieurs = /[\/,]/.test(enseignantNom);
      anomalies.push({ ligne: n, niveau: 'bloquant',
        message: plusieurs
          ? `Plusieurs enseignants dans une même cellule : « ${enseignantNom} ». Éclatez la ligne, ou décidez de la règle de comptage des TP co-encadrés.`
          : `Enseignant non reconnu : « ${matricule || enseignantNom} ». Complétez le nom dans l'emploi du temps ou importez-le au fichier du personnel.` });
      return;
    }

    donnees.push({ jour, tranche: tr.numero, classe, secteur_id: secteur ? secteur.id : null,
                   enseignant_id: enseignant.id, enseignant: enseignant.nom,
                   matiere, jumelage: jumelage || null });
  });

  if (coquilles) anomalies.push({ ligne: 0, niveau: 'avertissement',
    message: `${coquilles} ligne(s) portaient un horaire fautif corrigé automatiquement — à corriger dans le fichier source.` });
  if (sansEnseignant) anomalies.push({ ligne: 0, niveau: 'avertissement',
    message: `${sansEnseignant} créneau(x) sans enseignant (Bibliothèque, Pause, Orientation…) : conservés, sans déclaration d'absence attendue.` });
  if (approches) anomalies.push({ ligne: 0, niveau: 'avertissement',
    message: `${approches} nom(s) rapproché(s) de façon approchante (accents, « épse », patronyme seul) : à vérifier dans l'aperçu.` });
  if (ambigus) anomalies.push({ ligne: 0, niveau: 'bloquant',
    message: `${ambigus} nom(s) ambigu(s) : plusieurs enseignants possibles.` });
  if (nonRapproches) anomalies.push({ ligne: 0, niveau: 'bloquant',
    message: `${nonRapproches} nom(s) d'enseignant non rapproché(s) : la publication est impossible tant qu'ils subsistent.` });
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
      // les créneaux non pédagogiques sont conservés sans enseignant
      db.prepare(`INSERT INTO emploi_du_temps (version_id, jour_semaine, tranche_id, classe_id, enseignant_id, matiere, groupe_jumelage)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(v.lastInsertRowid, d.jour, tranches[d.tranche], classe.id, d.enseignant_id || null,
             d.matiere || null, d.jumelage);
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
