const pool = require('./db');

// ============================================================
//  Initialisation de la base de données
//  Le schéma ci-dessous correspond EXACTEMENT aux requêtes des
//  controllers (tables utilisateurs / annonces / reservations /
//  paiements / evaluations). CREATE IF NOT EXISTS : non destructif.
// ============================================================

const initDB = async () => {
  try {
    console.log('🗄️  Initialisation de la base de données...');

    // ── ENUMS (idempotents) ──────────────────────────────
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE typecompte_enum AS ENUM ('CLIENT', 'HOTE', 'ADMINISTRATEUR');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE typestatutr_enum AS ENUM ('EN_ATTENTE', 'CONFIRMEE', 'ANNULEE', 'TERMINEE', 'REFUSEE');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // Au cas où l'enum existait déjà sans REFUSEE (utilisé par refuserReservation)
    await pool.query(`
      DO $$ BEGIN
        ALTER TYPE typestatutr_enum ADD VALUE IF NOT EXISTS 'REFUSEE';
      EXCEPTION WHEN undefined_object THEN NULL;
      END $$;
    `);

    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE typestatuta_enum AS ENUM ('DISPONIBLE', 'OCCUPEE', 'EN_RENOVATION', 'SUSPENDUE');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // Statut de vérification de la demande "devenir hôte" (RG : approbation admin)
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE typestatutverif_enum AS ENUM ('NON_DEMANDE', 'EN_ATTENTE', 'APPROUVE', 'REJETE');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // ── 1. UTILISATEURS ──────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS utilisateurs (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        nom VARCHAR(100) NOT NULL,
        prenom VARCHAR(100) NOT NULL,
        motDePasse VARCHAR(255) NOT NULL,
        typeCompte typecompte_enum NOT NULL,
        dateVerification TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // raison_sociale supprimée (E2) : plus de notion de raison sociale, idempotent sur base existante
    await pool.query(`ALTER TABLE utilisateurs DROP COLUMN IF EXISTS raison_sociale;`);

    // Colonnes ajoutées pour la demande "devenir hôte" (idempotent sur base existante)
    await pool.query(`ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS telephone VARCHAR(30);`);
    await pool.query(`ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS photo_cni VARCHAR(500);`);
    await pool.query(`
      ALTER TABLE utilisateurs
      ADD COLUMN IF NOT EXISTS statut_verification typestatutverif_enum DEFAULT 'NON_DEMANDE';
    `);

    // ── 1bis. COMPTE PAIEMENT (un hôte peut avoir un compte de réception) ──
    await pool.query(`
      CREATE TABLE IF NOT EXISTS compte_paiement (
        idComptePaiement SERIAL PRIMARY KEY,
        utilisateur_id INT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
        fournisseur VARCHAR(100) NOT NULL,
        identifiant VARCHAR(255) NOT NULL
      );
    `);

    // ── 2. ANNONCES ──────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS annonces (
        id SERIAL PRIMARY KEY,
        hote_id INT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
        titre VARCHAR(255) NOT NULL,
        description TEXT,
        ville VARCHAR(100) NOT NULL,
        quartier VARCHAR(100),
        adresse VARCHAR(255),
        prixParNuit DECIMAL(10,2) NOT NULL,
        capacite INT NOT NULL DEFAULT 1,
        statut typestatuta_enum DEFAULT 'DISPONIBLE',
        datePublication TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // ── 3. IMAGES DES ANNONCES ───────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS annonce_images (
        id SERIAL PRIMARY KEY,
        annonce_id INT NOT NULL REFERENCES annonces(id) ON DELETE CASCADE,
        url VARCHAR(500) NOT NULL
      );
    `);

    // ── 4. RESERVATIONS ──────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reservations (
        idReservation SERIAL PRIMARY KEY,
        client_id INT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
        annonce_id INT NOT NULL REFERENCES annonces(id) ON DELETE CASCADE,
        dateDebut DATE NOT NULL,
        dateFin DATE NOT NULL,
        nombrePersonnes INT NOT NULL DEFAULT 1,
        montantTotal DECIMAL(10,2) NOT NULL,
        statut typestatutr_enum DEFAULT 'EN_ATTENTE',
        CONSTRAINT dates_valides CHECK (dateFin > dateDebut)
      );
    `);

    // ── 5. PAIEMENTS ─────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS paiements (
        id SERIAL PRIMARY KEY,
        reservation_id INT UNIQUE NOT NULL REFERENCES reservations(idReservation) ON DELETE CASCADE,
        montant DECIMAL(10,2) NOT NULL,
        mode_paiement VARCHAR(50) NOT NULL,
        date_paiement TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // ── 6. EVALUATIONS (avis) ────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS evaluations (
        id SERIAL PRIMARY KEY,
        client_id INT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
        annonce_id INT NOT NULL REFERENCES annonces(id) ON DELETE CASCADE,
        reservation_id INT NOT NULL REFERENCES reservations(idReservation) ON DELETE CASCADE,
        note INT NOT NULL CHECK (note >= 1 AND note <= 5),
        commentaire TEXT,
        dateEvaluation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(reservation_id)
      );
    `);

    // ── INDEX ────────────────────────────────────────────
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_annonces_hote ON annonces(hote_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_annonces_ville ON annonces(ville);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reservations_client ON reservations(client_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reservations_annonce ON reservations(annonce_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_evaluations_annonce ON evaluations(annonce_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_compte_paiement_user ON compte_paiement(utilisateur_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_utilisateurs_statut_verif ON utilisateurs(statut_verification);`);

    console.log('✅ Tables créées / vérifiées avec succès');
  } catch (err) {
    console.error('❌ Erreur initialisation BDD:', err.message);
    throw err;
  }
};

module.exports = initDB;