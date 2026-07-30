// TeacherWatch — envoi d'e-mails (Lot 8)
// SMTP configurable par variables d'environnement (.env non requis : variables
// système). Sans configuration, l'envoi est journalisé « non_configure » et
// l'application continue de fonctionner : l'échec d'un e-mail n'entraîne
// jamais la perte d'une soumission (critère Lot 8).
const nodemailer = require('nodemailer');
const { db } = require('./../db');

function transporteur() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST, port: Number(SMTP_PORT || 587), secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

// Journalise toujours ; tente l'envoi si configuré ; une nouvelle tentative
// en cas d'échec (critère Lot 8 « prévoir une nouvelle tentative »).
async function envoyerEmail({ destinataire, sujet, texte, pieceJointe, periode, format, nbLignes, empreinte, userId }) {
  const t = transporteur();
  let resultat = 'non_configure';
  if (t) {
    const message = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: destinataire, subject: sujet, text: texte,
      attachments: pieceJointe ? [{ filename: pieceJointe.nom, content: pieceJointe.buffer }] : [],
    };
    for (let essai = 1; essai <= 2; essai++) {
      try { await t.sendMail(message); resultat = 'succes'; break; }
      catch (e) { resultat = 'echec: ' + e.message.slice(0, 200); }
    }
  }
  db.prepare(`INSERT INTO envois_email (destinataire, sujet, periode, format, nb_lignes, empreinte, resultat, user_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(destinataire, sujet, periode || null, format || null, nbLignes ?? null,
         empreinte || null, resultat, userId || null);
  return resultat;
}

module.exports = { envoyerEmail };
