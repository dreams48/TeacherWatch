// TeacherWatch — génération du document Word (Lot 8)
// Le document reproduit le rapport affiché : en-tête officiel, tableaux
// modifiables, espace de signature. Numéro de génération + mention
// « annule et remplace » (audit B-06a).
const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun,
        HeadingLevel, AlignmentType, WidthType, BorderStyle } = require('docx');
const crypto = require('crypto');
const { db } = require('./../db');

const TITRES = { journalier: 'Rapport journalier', hebdomadaire: 'Rapport hebdomadaire',
                 intermediaire: 'Rapport intermédiaire' };

function celluleTexte(texte, opts = {}) {
  return new TableCell({
    children: [new Paragraph({ alignment: opts.droite ? AlignmentType.RIGHT : AlignmentType.LEFT,
      children: [new TextRun({ text: String(texte), bold: !!opts.gras, size: 20 })] })],
    width: opts.largeur ? { size: opts.largeur, type: WidthType.PERCENTAGE } : undefined,
  });
}

function tableau(entetes, lignes) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: entetes.map(h => celluleTexte(h, { gras: true })) }),
      ...lignes.map(l => new TableRow({ children: l.map((v, i) => celluleTexte(v, { droite: i === 0 })) })),
    ],
  });
}

async function genererDocx(rapport) {
  // numéro de génération séquentiel pour ce type + période
  const nGen = 1 + db.prepare(`SELECT COUNT(*) n FROM envois_email
    WHERE periode = ? AND format = 'docx'`).get(`${rapport.du}→${rapport.au}`).n;

  const p = (t, opts = {}) => new Paragraph({
    alignment: opts.centre ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { after: opts.apres ?? 120 },
    children: [new TextRun({ text: t, bold: !!opts.gras, size: opts.taille || 22, italics: !!opts.italique })],
  });

  const enfants = [
    p('RÉPUBLIQUE DU CAMEROUN — Paix • Travail • Patrie', { centre: true, taille: 18 }),
    p('LYCÉE TECHNIQUE DE DOUALA BASSA', { centre: true, gras: true, taille: 26 }),
    p('[Emplacement de l’en-tête officiel et du logo]', { centre: true, italique: true, taille: 16, apres: 240 }),
    new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `${TITRES[rapport.type] || 'Rapport'} des absences des enseignants`, bold: true, size: 28 })] }),
    p(`Période couverte : du ${rapport.duFr} au ${rapport.auFr}`, { apres: 40 }),
    p(`Génération n° ${nGen} — le ${rapport.generation} (heure du Cameroun)`, { apres: 40 }),
    ...(nGen > 1 ? [p(`Ce document annule et remplace la génération n° ${nGen - 1}.`, { italique: true, apres: 40 })] : []),
    p(`Rapports reçus : ${rapport.nbTransmis} secteur(s) sur ${rapport.nbActifs} actifs`, { apres: 40 }),
    p(`Heures d’absence comptées : ${rapport.totalHeures} — classes touchées : ${rapport.clsTouchees}`, { apres: 40 }),
    ...(rapport.definitif ? [] : [p('RAPPORT INTERMÉDIAIRE — NON DÉFINITIF : la période n’est pas encore verrouillée.', { gras: true, apres: 120 })]),
    p(' ', { apres: 60 }),
    p('1. Rapport détaillé', { gras: true, taille: 24 }),
  ];

  if (rapport.detail.length) {
    enfants.push(tableau(
      ['N°', 'Date', 'Horaire', 'Nom de l’enseignant', 'Matricule', 'Classe', 'Matière', 'Type', 'Durée', 'Justification'],
      rapport.detail.map(l => [l.n, l.date, l.horaire, l.enseignant, l.matricule, l.classe, l.matiere,
                               l.type, l.duree || '—', l.justification])));
  } else {
    enfants.push(p('Aucun événement soumis sur la période.', { italique: true }));
  }

  enfants.push(p(' ', { apres: 120 }), p('2. Récapitulatif par enseignant', { gras: true, taille: 24 }),
    p('Seuls les enseignants totalisant au moins une heure d’absence non justifiée apparaissent.',
      { italique: true, taille: 18 }));
  if (rapport.recap.length) {
    enfants.push(tableau(
      ['N°', 'Nom de l’enseignant', 'Matricule', 'Spécialité', 'Heures d’absence'],
      rapport.recap.map(l => [l.n, l.enseignant, l.matricule, l.specialite, l.heures])));
  } else {
    enfants.push(p('Aucun enseignant ne totalise une heure d’absence sur la période.', { italique: true }));
  }

  enfants.push(
    p(' ', { apres: 240 }),
    p('Une absence vaut une heure. Les absences justifiées sont conservées à l’historique mais exclues '
      + 'des totaux. Les absences non encore qualifiées sont signalées « En attente ».',
      { taille: 18, italique: true }),
    p(' ', { apres: 360 }),
    p('Le Proviseur', { gras: true }),
    p('Signature : ______________________________', { apres: 240 }),
  );

  const doc = new Document({ sections: [{ children: enfants }] });
  const buffer = await Packer.toBuffer(doc);
  const empreinte = crypto.createHash('sha256').update(buffer).digest('hex');
  return { buffer, empreinte, nGen };
}

module.exports = { genererDocx };
