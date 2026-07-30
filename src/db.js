// TeacherWatch — base de données SQLite (schéma + accès)
// Invariant fuseau horaire (audit B-10) : toute date/heure métier est en heure
// du Cameroun (Africa/Douala, UTC+1 sans heure d'été). Les horodatages
// techniques (created_at) sont stockés en ISO UTC ; les dates métier
// (date_jour) sont des chaînes YYYY-MM-DD calculées en heure de Douala.
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'sauvegardes'), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'imports'), { recursive: true });

const db = new Database(path.join(DATA_DIR, 'teacherwatch.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT,
  nom TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('proviseur','admin','surveillant')),
  secteur_id INTEGER REFERENCES secteurs(id),
  statut TEXT NOT NULL DEFAULT 'invite' CHECK (statut IN ('invite','actif','suspendu','archive')),
  est_compte_principal INTEGER NOT NULL DEFAULT 0, -- compte protégé du proviseur (§3.6)
  doit_changer_mdp INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS secteurs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL UNIQUE,
  actif INTEGER NOT NULL DEFAULT 1
);

-- Les 10 tranches horaires officielles. Les horaires par défaut sont des
-- valeurs provisoires : le lycée doit les confirmer (audit B-01) — écran Admin.
CREATE TABLE IF NOT EXISTS tranches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero INTEGER NOT NULL UNIQUE,
  heure_debut TEXT NOT NULL,
  heure_fin TEXT NOT NULL,
  duree_minutes INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS enseignants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  matricule TEXT UNIQUE,
  nom TEXT NOT NULL,
  specialite TEXT,
  telephone TEXT,
  statut TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif','archive')),
  -- situation administrative (audit B-04) : en_poste, mission, conge_maladie...
  situation TEXT NOT NULL DEFAULT 'en_poste',
  situation_debut TEXT, situation_fin TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL UNIQUE,
  secteur_id INTEGER REFERENCES secteurs(id),
  actif INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS edt_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  libelle TEXT,
  date_effet TEXT NOT NULL,
  actif INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Une ligne = un cours. Les classes jumelées partagent un groupe_jumelage :
-- même enseignant, même jour, même tranche → une seule heure comptée (audit B-02).
CREATE TABLE IF NOT EXISTS emploi_du_temps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version_id INTEGER NOT NULL REFERENCES edt_versions(id),
  jour_semaine INTEGER NOT NULL CHECK (jour_semaine BETWEEN 1 AND 6), -- 1=lundi
  tranche_id INTEGER NOT NULL REFERENCES tranches(id),
  classe_id INTEGER NOT NULL REFERENCES classes(id),
  enseignant_id INTEGER NOT NULL REFERENCES enseignants(id),
  matiere TEXT,
  groupe_jumelage TEXT
);

CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('personnel','edt')),
  fichier TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'apercu' CHECK (statut IN ('apercu','publie','annule')),
  donnees TEXT NOT NULL,      -- lignes analysées (JSON)
  anomalies TEXT NOT NULL,    -- anomalies détectées (JSON)
  stats TEXT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Événement : absence, retard, départ anticipé.
-- Principe d'instantané (audit B-05) : les champs snap_* recopient les valeurs
-- au moment de la saisie ; les rapports lisent l'instantané, jamais les
-- références. Un réimport ne modifie donc jamais un rapport passé.
CREATE TABLE IF NOT EXISTS evenements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,  -- idempotence (audit T-01)
  type TEXT NOT NULL CHECK (type IN ('absence','retard','depart_anticipe')),
  date_jour TEXT NOT NULL,
  tranche_id INTEGER NOT NULL REFERENCES tranches(id),
  classe_id INTEGER REFERENCES classes(id),
  enseignant_id INTEGER REFERENCES enseignants(id),
  secteur_id INTEGER NOT NULL REFERENCES secteurs(id),
  snap_enseignant TEXT NOT NULL,
  snap_matricule TEXT,
  snap_specialite TEXT,
  snap_classe TEXT NOT NULL,
  snap_matiere TEXT,
  snap_horaire TEXT NOT NULL,
  snap_duree_minutes INTEGER NOT NULL,
  groupe_jumelage TEXT,
  minutes TEXT,               -- pour retard / départ anticipé (facultatif)
  justification TEXT NOT NULL DEFAULT 'a_statuer'
    CHECK (justification IN ('a_statuer','justifiee','non_justifiee')),
  motif TEXT,
  statut TEXT NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon','soumis')),
  soumission_id INTEGER REFERENCES soumissions(id),
  cree_par INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS soumissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  secteur_id INTEGER NOT NULL REFERENCES secteurs(id),
  date_jour TEXT NOT NULL,
  numero INTEGER NOT NULL,    -- n° de soumission du secteur pour la journée
  type TEXT NOT NULL CHECK (type IN ('avec_evenements','aucune_absence')),
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Statut d'une journée (§3.5) : ouverte / verrouillée à 18 h ;
-- sans_cours_auto si aucun secteur n'a transmis, corrigeable par proviseur/admin.
CREATE TABLE IF NOT EXISTS journees (
  date_jour TEXT PRIMARY KEY,
  verrouillee INTEGER NOT NULL DEFAULT 0,
  classement TEXT NOT NULL DEFAULT 'ouverte'
    CHECK (classement IN ('ouverte','avec_cours','sans_cours_auto','sans_cours_corrige'))
);

-- Calendrier des jours de cours (audit B-03) : les traitements 16 h / 18 h ne
-- s'exécutent que les jours de cours. jours_cours (réglage) = jours de semaine ;
-- exceptions = fériés, congés, journées banalisées.
CREATE TABLE IF NOT EXISTS jours_exceptions (
  date_jour TEXT PRIMARY KEY,
  est_jour_cours INTEGER NOT NULL,
  motif TEXT
);

-- Journal d'audit en ajout seul (audit I-08) : aucune route ne le modifie.
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  user_id INTEGER,
  role TEXT,
  action TEXT NOT NULL,
  objet_type TEXT,
  objet_id TEXT,
  avant TEXT,
  apres TEXT,
  motif TEXT,
  ip TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  destinataire_role TEXT,      -- 'proviseur' ou NULL si user précis
  user_id INTEGER REFERENCES users(id),
  message TEXT NOT NULL,
  lu INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS envois_email (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  destinataire TEXT NOT NULL,
  sujet TEXT NOT NULL,
  periode TEXT,
  format TEXT,
  nb_lignes INTEGER,
  empreinte TEXT,             -- SHA-256 du fichier généré (traçabilité Lot 8)
  resultat TEXT NOT NULL,     -- 'succes' | 'echec: ...' | 'non_configure'
  user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_evt_jour ON evenements(date_jour);
CREATE INDEX IF NOT EXISTS idx_evt_soumission ON evenements(soumission_id);
CREATE INDEX IF NOT EXISTS idx_edt_lookup ON emploi_du_temps(version_id, jour_semaine, tranche_id);
CREATE INDEX IF NOT EXISTS idx_soum_jour ON soumissions(date_jour, secteur_id);
`);

// --- réglages -------------------------------------------------------------
function getSetting(cle, defaut) {
  const r = db.prepare('SELECT valeur FROM settings WHERE cle = ?').get(cle);
  return r ? r.valeur : defaut;
}
function setSetting(cle, valeur) {
  db.prepare('INSERT INTO settings (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur')
    .run(cle, String(valeur));
}

module.exports = { db, DATA_DIR, getSetting, setSetting };
