const pool = require('./db');
const bcrypt = require('bcryptjs');

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

    // ── 0. PAYS & VILLES (P1) ────────────────────────────
    // Le pays devient un paramètre : chaque annonce est rattachée à
    // un pays, qui porte sa devise. Les villes sont seedées par pays
    // pour alimenter les listes déroulantes du formulaire d'annonce.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pays (
        id SERIAL PRIMARY KEY,
        code VARCHAR(2) UNIQUE NOT NULL,      -- ISO 3166-1 alpha-2
        nom VARCHAR(100) NOT NULL,
        devise_code VARCHAR(3) NOT NULL,      -- ISO 4217 (XAF, XOF, EUR…)
        devise_symbole VARCHAR(10) NOT NULL,  -- FCFA, €, ₦…
        indicatif VARCHAR(8)                  -- +237, +221…
      );
    `);
    await pool.query(`
      INSERT INTO pays (code, nom, devise_code, devise_symbole, indicatif) VALUES
        ('CM', 'Cameroun',         'XAF', 'FCFA', '+237'),
        ('SN', 'Sénégal',          'XOF', 'FCFA', '+221'),
        ('CI', 'Côte d''Ivoire',   'XOF', 'FCFA', '+225'),
        ('GA', 'Gabon',            'XAF', 'FCFA', '+241'),
        ('CD', 'RD Congo',         'CDF', 'FC',   '+243'),
        ('NG', 'Nigéria',          'NGN', '₦',    '+234'),
        ('MA', 'Maroc',            'MAD', 'DH',   '+212'),
        ('FR', 'France',           'EUR', '€',    '+33')
      ON CONFLICT (code) DO NOTHING;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS villes (
        id SERIAL PRIMARY KEY,
        pays_id INT NOT NULL REFERENCES pays(id) ON DELETE CASCADE,
        nom VARCHAR(100) NOT NULL,
        UNIQUE (pays_id, nom)
      );
    `);
    // Villes principales par pays (liste indicative, extensible)
    await pool.query(`
      INSERT INTO villes (pays_id, nom)
      SELECT p.id, v.nom FROM pays p
      JOIN (VALUES
        ('CM','Yaoundé'), ('CM','Douala'), ('CM','Bafoussam'), ('CM','Kribi'),
        ('CM','Limbé'), ('CM','Bamenda'), ('CM','Garoua'), ('CM','Buéa'),
        ('SN','Dakar'), ('SN','Saint-Louis'), ('SN','Saly'), ('SN','Thiès'),
        ('CI','Abidjan'), ('CI','Yamoussoukro'), ('CI','Grand-Bassam'),
        ('GA','Libreville'), ('GA','Port-Gentil'),
        ('CD','Kinshasa'), ('CD','Lubumbashi'), ('CD','Goma'),
        ('NG','Lagos'), ('NG','Abuja'), ('NG','Port Harcourt'),
        ('MA','Casablanca'), ('MA','Marrakech'), ('MA','Rabat'), ('MA','Agadir'),
        ('FR','Paris'), ('FR','Lyon'), ('FR','Marseille'), ('FR','Nice')
      ) AS v(code, nom) ON v.code = p.code
      ON CONFLICT (pays_id, nom) DO NOTHING;
    `);

    // ── 0bis. TYPES DE CHAMBRE (T1) ──────────────────────
    // Catalogue fixe : l'app met en avant le TYPE de chambre
    // (et non la destination). L'hôte choisit un type à la création.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS types_chambre (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        nom VARCHAR(100) NOT NULL
      );
    `);
    await pool.query(`
      INSERT INTO types_chambre (code, nom) VALUES
        ('case_traditionnelle', 'Case / Hutte traditionnelle'),
        ('chambre_simple',      'Chambre simple'),
        ('chambre_double',      'Chambre double'),
        ('studio',              'Studio'),
        ('suite',               'Suite'),
        ('appartement',         'Appartement'),
        ('bungalow',            'Bungalow'),
        ('villa',               'Villa'),
        ('chambre_hote',        'Chambre chez l''habitant'),
        ('dortoir',             'Dortoir')
      ON CONFLICT (code) DO NOTHING;
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

    // Super-administrateur (A4) : seul un super-admin peut créer d'autres admins
    await pool.query(`ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS est_super_admin BOOLEAN DEFAULT FALSE;`);

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

    // Période de validité de l'annonce (I1) : on ne peut pas réserver hors de cet intervalle
    await pool.query(`ALTER TABLE annonces ADD COLUMN IF NOT EXISTS date_debut_validite DATE;`);
    await pool.query(`ALTER TABLE annonces ADD COLUMN IF NOT EXISTS date_fin_validite DATE;`);

    // Superficie de la chambre en m² (N1) — champ optionnel
    await pool.query(`ALTER TABLE annonces ADD COLUMN IF NOT EXISTS superficie DECIMAL(10,2);`);

    // Pays (P1) et type de chambre (T1) — rattachement de l'annonce
    await pool.query(`ALTER TABLE annonces ADD COLUMN IF NOT EXISTS pays_id INT REFERENCES pays(id);`);
    await pool.query(`ALTER TABLE annonces ADD COLUMN IF NOT EXISTS type_id INT REFERENCES types_chambre(id);`);

    // Backfill : les annonces existantes sont rattachées au Cameroun par défaut
    await pool.query(`
      UPDATE annonces SET pays_id = (SELECT id FROM pays WHERE code = 'CM')
      WHERE pays_id IS NULL;
    `);

    // ── 3. IMAGES DES ANNONCES ───────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS annonce_images (
        id SERIAL PRIMARY KEY,
        annonce_id INT NOT NULL REFERENCES annonces(id) ON DELETE CASCADE,
        url VARCHAR(500) NOT NULL
      );
    `);

    // ── 3bis. ÉQUIPEMENTS (R1) ───────────────────────────
    // Commodités FOURNIES par l'hôte (wifi, clim, petit-déj…).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS equipements (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        nom VARCHAR(100) NOT NULL
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS annonce_equipements (
        annonce_id INT NOT NULL REFERENCES annonces(id) ON DELETE CASCADE,
        equipement_id INT NOT NULL REFERENCES equipements(id) ON DELETE CASCADE,
        PRIMARY KEY (annonce_id, equipement_id)
      );
    `);
    // Liste fixe d'équipements (codes alignés sur le frontend pour le mapping icône/label)
    await pool.query(`
      INSERT INTO equipements (code, nom) VALUES
        ('wifi', 'WiFi haut débit'),
        ('ac', 'Climatisation'),
        ('breakfast', 'Petit-déjeuner'),
        ('pool', 'Piscine'),
        ('restaurant', 'Restaurant'),
        ('security', 'Sécurité 24h'),
        ('tv', 'Télévision'),
        ('shower', 'Eau chaude'),
        ('parking', 'Parking'),
        ('kitchen', 'Cuisine')
      ON CONFLICT (code) DO NOTHING;
    `);

    // ── 3ter. CARACTÉRISTIQUES (C1) ──────────────────────
    // Attributs INTRINSÈQUES du logement (≠ équipements fournis) :
    // bord de lac, douche privative, vue mer… Catalogue fixe, choisi
    // à la publication, et exploité par le modèle (terme Carac_ck).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS caracteristiques (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        nom VARCHAR(100) NOT NULL
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS annonce_caracteristiques (
        annonce_id INT NOT NULL REFERENCES annonces(id) ON DELETE CASCADE,
        caracteristique_id INT NOT NULL REFERENCES caracteristiques(id) ON DELETE CASCADE,
        PRIMARY KEY (annonce_id, caracteristique_id)
      );
    `);
    await pool.query(`
      INSERT INTO caracteristiques (code, nom) VALUES
        ('bord_lac',         'Au bord d''un lac'),
        ('bord_mer',         'En bord de mer / plage'),
        ('vue_montagne',     'Vue sur la montagne'),
        ('vue_ville',        'Vue sur la ville'),
        ('centre_ville',     'En centre-ville'),
        ('quartier_calme',   'Quartier calme'),
        ('douche_privative', 'Douche privative / interne'),
        ('balcon',           'Balcon / terrasse'),
        ('jardin',           'Jardin privatif'),
        ('etage_eleve',      'Étage élevé'),
        ('acces_handicape',  'Accès handicapé'),
        ('animaux_admis',    'Animaux admis')
      ON CONFLICT (code) DO NOTHING;
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

    // Paiement partiel (K1) : COMPLET ou PARTIEL (50%) + montant total dû de la réservation
    await pool.query(`ALTER TABLE paiements ADD COLUMN IF NOT EXISTS statut_paiement VARCHAR(20) DEFAULT 'COMPLET';`);
    await pool.query(`ALTER TABLE paiements ADD COLUMN IF NOT EXISTS montant_du DECIMAL(10,2);`);

    // Finance plateforme (O1) : commission prélevée et montant net reversé à l'hôte
    await pool.query(`ALTER TABLE paiements ADD COLUMN IF NOT EXISTS commission_plateforme DECIMAL(10,2) DEFAULT 0;`);
    await pool.query(`ALTER TABLE paiements ADD COLUMN IF NOT EXISTS montant_hote DECIMAL(10,2) DEFAULT 0;`);

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

    // ── 7. PARAMÈTRES PLATEFORME (O3) ────────────────────
    // Ligne unique (id=1) éditable par le super-admin : taux de
    // commission γ + politique de remboursement (seuils en jours).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS parametres_plateforme (
        id INT PRIMARY KEY DEFAULT 1,
        commission_pct DECIMAL(5,2) NOT NULL DEFAULT 10,   -- γ en %
        remb_full_jours INT NOT NULL DEFAULT 7,            -- >= n jours avant arrivée → 100%
        remb_partiel_jours INT NOT NULL DEFAULT 2,         -- >= n jours → remb_partiel_pct
        remb_partiel_pct DECIMAL(5,2) NOT NULL DEFAULT 50, -- sinon (< partiel_jours) → 0%
        CONSTRAINT singleton CHECK (id = 1)
      );
    `);
    await pool.query(`
      INSERT INTO parametres_plateforme (id, commission_pct, remb_full_jours, remb_partiel_jours, remb_partiel_pct)
      VALUES (1, COALESCE(NULLIF($1,'')::DECIMAL, 10), 7, 2, 50)
      ON CONFLICT (id) DO NOTHING;
    `, [process.env.COMMISSION_PLATEFORME || '']);

    // ── 8. PORTE-MONNAIE (W1) ────────────────────────────
    // Un solde par utilisateur + un registre de transactions.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wallets (
        id SERIAL PRIMARY KEY,
        utilisateur_id INT UNIQUE NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
        solde DECIMAL(12,2) NOT NULL DEFAULT 0
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id SERIAL PRIMARY KEY,
        wallet_id INT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
        montant DECIMAL(12,2) NOT NULL,                 -- signé (+ crédit / − débit)
        type VARCHAR(40) NOT NULL,                      -- GAIN_HOTE, PAIEMENT, REMBOURSEMENT, RECHARGE…
        motif VARCHAR(255),
        reservation_id INT REFERENCES reservations(idReservation) ON DELETE SET NULL,
        date_transaction TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // ── 9. REMBOURSEMENTS (W2) ───────────────────────────
    // Trace d'un remboursement partiel/total lié à une annulation,
    // avec la ventilation entre la part hôte et la part plateforme.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS remboursements (
        id SERIAL PRIMARY KEY,
        reservation_id INT NOT NULL REFERENCES reservations(idReservation) ON DELETE CASCADE,
        montant_total DECIMAL(12,2) NOT NULL,
        part_hote DECIMAL(12,2) NOT NULL DEFAULT 0,
        part_plateforme DECIMAL(12,2) NOT NULL DEFAULT 0,
        pourcentage DECIMAL(5,2) NOT NULL DEFAULT 0,
        date_remboursement TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // ── INDEX ────────────────────────────────────────────
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet ON wallet_transactions(wallet_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_remboursements_resa ON remboursements(reservation_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_annonces_hote ON annonces(hote_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_annonces_ville ON annonces(ville);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_annonces_pays ON annonces(pays_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_annonces_type ON annonces(type_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reservations_client ON reservations(client_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reservations_annonce ON reservations(annonce_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_evaluations_annonce ON evaluations(annonce_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_compte_paiement_user ON compte_paiement(utilisateur_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_utilisateurs_statut_verif ON utilisateurs(statut_verification);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_villes_pays ON villes(pays_id);`);

    console.log('✅ Tables créées / vérifiées avec succès');

    // ── SEED SUPER-ADMIN (A4) ────────────────────────────
    // Crée le 1er super-administrateur s'il n'en existe aucun.
    // Identifiants configurables via .env (valeurs par défaut sinon).
    await seedSuperAdmin();
  } catch (err) {
    console.error('❌ Erreur initialisation BDD:', err.message);
    throw err;
  }
};

// ============================================================
//  Seed du super-administrateur initial (idempotent)
// ============================================================
const seedSuperAdmin = async () => {
  try {
    const existant = await pool.query(
      `SELECT id FROM utilisateurs WHERE est_super_admin = TRUE LIMIT 1`
    );
    if (existant.rows.length > 0) return;

    const email = process.env.SUPER_ADMIN_EMAIL || 'superadmin@roomrenting.com';
    const motDePasse = process.env.SUPER_ADMIN_PASSWORD || 'superadmin123';
    const nom = process.env.SUPER_ADMIN_NOM || 'Super';
    const prenom = process.env.SUPER_ADMIN_PRENOM || 'Admin';

    // Si l'email existe déjà (ancien compte), on le promeut super-admin.
    const compteEmail = await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [email]);
    if (compteEmail.rows.length > 0) {
      await pool.query(
        `UPDATE utilisateurs
         SET est_super_admin = TRUE, typeCompte = 'ADMINISTRATEUR', statut_verification = 'APPROUVE'
         WHERE id = $1`,
        [compteEmail.rows[0].id]
      ); 
      console.log(`✅ Compte ${email} promu super-administrateur`);
      return;
    }

    const hash = await bcrypt.hash(motDePasse, 10);
    await pool.query(
      `INSERT INTO utilisateurs (email, nom, prenom, motDePasse, typeCompte, statut_verification, est_super_admin)
       VALUES ($1, $2, $3, $4, 'ADMINISTRATEUR', 'APPROUVE', TRUE)`,
      [email, nom, prenom, hash]
    );
    console.log(`✅ Super-administrateur créé : ${email} (mot de passe par défaut : ${motDePasse})`);
  } catch (err) {
    // Non bloquant : le serveur démarre même si le seed échoue
    console.error('⚠️  Seed super-admin ignoré:', err.message);
  }
};

module.exports = initDB;
