const pool = require('./db');

const initDB = async () => {
  try {
    console.log('🗄️  Initialisation de la base de données...');

    // ENUMS — CREATE IF NOT EXISTS via DO block
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE role_enum AS ENUM ('CLIENT', 'HOTE');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE statut_reservation_enum AS ENUM ('EN_ATTENTE', 'CONFIRMEE', 'ANNULEE', 'TERMINEE', 'REFUSEE');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE mode_paiement_enum AS ENUM ('CARTE', 'MOBILE_MONEY', 'ESPECES');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // TABLE PERSONNES
    await pool.query(`
      CREATE TABLE IF NOT EXISTS personnes (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        nom VARCHAR(100) NOT NULL,
        prenom VARCHAR(100) NOT NULL,
        mot_de_passe VARCHAR(255) NOT NULL,
        role role_enum NOT NULL,
        raison_sociale VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // TABLE ANNONCES
    await pool.query(`
      CREATE TABLE IF NOT EXISTS annonces (
        id SERIAL PRIMARY KEY,
        hote_id INT NOT NULL REFERENCES personnes(id) ON DELETE CASCADE,
        titre VARCHAR(255) NOT NULL,
        description TEXT,
        ville VARCHAR(100) NOT NULL,
        quartier VARCHAR(100),
        adresse VARCHAR(255),
        prix DECIMAL(10,2) NOT NULL,
        capacite INT NOT NULL DEFAULT 1,
        disponible BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // TABLE IMAGES DES ANNONCES
    await pool.query(`
      CREATE TABLE IF NOT EXISTS annonce_images (
        id SERIAL PRIMARY KEY,
        annonce_id INT NOT NULL REFERENCES annonces(id) ON DELETE CASCADE,
        url VARCHAR(500) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // TABLE RESERVATIONS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reservations (
        id SERIAL PRIMARY KEY,
        client_id INT NOT NULL REFERENCES personnes(id) ON DELETE CASCADE,
        annonce_id INT NOT NULL REFERENCES annonces(id) ON DELETE CASCADE,
        date_debut DATE NOT NULL,
        date_fin DATE NOT NULL,
        nb_personnes INT NOT NULL DEFAULT 1,
        statut statut_reservation_enum DEFAULT 'EN_ATTENTE',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT dates_valides CHECK (date_fin > date_debut)
      );
    `);

    // TABLE PAIEMENTS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS paiements (
        id SERIAL PRIMARY KEY,
        reservation_id INT UNIQUE NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
        montant DECIMAL(10,2) NOT NULL,
        mode_paiement mode_paiement_enum NOT NULL,
        date_paiement TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // TABLE AVIS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS avis (
        id SERIAL PRIMARY KEY,
        client_id INT NOT NULL REFERENCES personnes(id) ON DELETE CASCADE,
        annonce_id INT NOT NULL REFERENCES annonces(id) ON DELETE CASCADE,
        reservation_id INT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
        note INT NOT NULL CHECK (note >= 1 AND note <= 5),
        commentaire TEXT,
        date_avis TIMESTAMP DEFAULT NOW(),
        UNIQUE(client_id, reservation_id)
      );
    `);

    // INDEX
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_annonces_hote ON annonces(hote_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_annonces_ville ON annonces(ville);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reservations_client ON reservations(client_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reservations_annonce ON reservations(annonce_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_avis_annonce ON avis(annonce_id);`);

    console.log('✅ Tables créées / vérifiées avec succès');
  } catch (err) {
    console.error('❌ Erreur initialisation BDD:', err.message);
    throw err;
  }
};

module.exports = initDB;
