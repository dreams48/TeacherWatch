// TeacherWatch — calcul des rapports (Lot 7)
// Les rapports lisent exclusivement les champs d'instantané (snap_*) des
// événements SOUMIS : un réimport du personnel ou de l'emploi du temps ne
// modifie jamais un rapport passé (audit B-05).
const { db, getSetting } = require('./../db');
const { nowDouala, dateFr } = require('./../helpers');

// Événements soumis d'une période, dédoublonnés pour les classes jumelées :
// un même enseignant absent sur un cours jumelé (même jour, même tranche,
// même groupe) = UNE ligne, la classe affichant le groupement (audit B-02).
function evenementsPeriode(du, au) {
  const rows = db.prepare(`
    SELECT e.*, t.numero AS tranche_numero
    FROM evenements e JOIN tranches t ON t.id = e.tranche_id
    WHERE e.statut = 'soumis' AND e.date_jour BETWEEN ? AND ?
    ORDER BY e.date_jour, t.numero, e.snap_enseignant`).all(du, au);

  // La clé ne dépend pas de la colonne groupe_jumelage : dans les fichiers du
  // lycée le jumelage est implicite (même enseignant, même tranche, plusieurs
  // classes). Deux événements sur la même tranche pour le même enseignant sont
  // donc fusionnés quelle que soit leur provenance — y compris quand deux
  // secteurs différents ont déclaré la même absence.
  const vus = new Map();
  const lignes = [];
  for (const e of rows) {
    const cle = `${e.date_jour}|${e.tranche_id}|${e.enseignant_id || e.snap_matricule || e.snap_enseignant}|${e.type}`;
    const deja = vus.get(cle);
    if (deja) { // fusion : complète le libellé de classe, ne recompte pas les heures
      for (const cl of String(e.snap_classe).split(' / '))
        if (!deja.snap_classe.split(' / ').includes(cl)) deja.snap_classe += ' / ' + cl;
      continue;
    }
    vus.set(cle, e);
    lignes.push(e);
  }
  return lignes;
}

// Règle de comptage retenue par le lycée (reprise de son prototype) :
//  - une absence vaut UNE heure, quelle que soit la durée réelle de la tranche
//    (T6 dure 60 min, les neuf autres 50 : le comptage ne les distingue pas) ;
//  - une absence justifiée reste à l'historique mais est exclue des totaux ;
//  - retards et départs anticipés ne comptent aucune heure : ils sont qualifiés
//    par tranche de durée.
// Le réglage `compte_heures_reelles` permet au proviseur de basculer vers un
// comptage en heures réelles s'il le décide (décision B-01 de l'audit).
function heuresEvenement(e) {
  if (e.type !== 'absence') return 0;
  if (e.justification === 'justifiee') return 0;
  return getSetting('compte_heures_reelles', '0') === '1' ? e.snap_duree_minutes / 60 : 1;
}

// Classes touchées : sur un cours jumelé l'enseignant ne se voit imputer qu'une
// heure, mais chaque classe du groupement compte comme touchée.
function classesTouchees(lignes) {
  const s = new Set();
  for (const e of lignes) {
    if (e.type !== 'absence' || e.justification === 'justifiee') continue;
    String(e.snap_classe).split(' / ').forEach(c => s.add(c.trim()));
  }
  return s.size;
}

const TYPES_FR = { absence: 'Absence', retard: 'Retard', depart_anticipe: 'Départ anticipé' };
const JUSTIF_FR = { a_statuer: 'En attente', justifiee: 'Justifié', non_justifiee: 'Non justifié' };
const DUREES_FR = { lt15: 'moins de 15 min', '15to30': '15 à 30 min', gt30: 'plus de 30 min' };

// Construit le rapport complet d'une période.
function construireRapport(type, du, au) {
  const lignes = evenementsPeriode(du, au);

  // Rapport détaillé : N° | Horaire | Nom | Matricule | Classe | Matière
  // (+ type et justification, exigés par l'audit B-04 pour un rapport loyal)
  const detail = lignes.map((e, i) => ({
    n: i + 1, date: e.date_jour, horaire: e.snap_horaire,
    enseignant: e.snap_enseignant, matricule: e.snap_matricule || '—',
    classe: e.snap_classe, matiere: e.snap_matiere || '—',
    type: TYPES_FR[e.type], duree: e.minutes ? (DUREES_FR[e.minutes] || e.minutes) : null,
    justification: JUSTIF_FR[e.justification],
    heures: heuresEvenement(e),
  }));

  // Récapitulatif par enseignant : seuls ceux ayant ≥ 1 h d'absence.
  const parEnseignant = new Map();
  for (const e of lignes) {
    const cle = e.snap_matricule || e.snap_enseignant;
    const cur = parEnseignant.get(cle) ||
      { enseignant: e.snap_enseignant, matricule: e.snap_matricule || '—',
        specialite: e.snap_specialite || '—', heures: 0 };
    cur.heures += heuresEvenement(e);
    parEnseignant.set(cle, cur);
  }
  const recap = [...parEnseignant.values()]
    .filter(r => r.heures >= 1)
    .sort((a, b) => b.heures - a.heures)
    .map((r, i) => ({ n: i + 1, ...r, heures: Math.round(r.heures * 100) / 100 }));

  // Nombre de secteurs actifs ayant transmis sur la période (audit I-01 :
  // « sur N secteurs actifs », jamais « sur cinq » codé en dur).
  const nbActifs = db.prepare('SELECT COUNT(*) n FROM secteurs WHERE actif = 1').get().n;
  const nbTransmis = db.prepare(`SELECT COUNT(DISTINCT secteur_id) n FROM soumissions
                                 WHERE date_jour BETWEEN ? AND ?`).get(du, au).n;

  const maintenant = nowDouala();
  return {
    type, du, au, duFr: dateFr(du), auFr: dateFr(au),
    generation: maintenant.complet,
    nbTransmis, nbActifs,
    detail, recap, clsTouchees: classesTouchees(lignes),
    totalHeures: Math.round(detail.reduce((s, l) => s + l.heures, 0) * 100) / 100,
    definitif: estPeriodeVerrouillee(au),
  };
}

// Une période est définitive si son dernier jour est verrouillé.
function estPeriodeVerrouillee(au) {
  const j = db.prepare('SELECT verrouillee FROM journees WHERE date_jour = ?').get(au);
  const auj = nowDouala().date;
  return au < auj ? true : !!(j && j.verrouillee);
}

module.exports = { construireRapport, evenementsPeriode, heuresEvenement,
                   classesTouchees, TYPES_FR, JUSTIF_FR, DUREES_FR };
