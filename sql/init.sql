-- ============================================
-- ROOM RENTING DB - Script d'initialisation
-- ============================================

-- Suppression dans l'ordre inverse des dépendances
DROP TABLE IF EXISTS avis CASCADE;
DROP TABLE IF EXISTS paiements CASCADE;
DROP TABLE IF EXISTS reservations CASCADE;
DROP TABLE IF EXISTS annonce_images CASCADE;
DROP TABLE IF EXISTS annonces CASCADE;
DROP TABLE IF EXISTS personnes CASCADE;
DROP TYPE IF EXISTS role_enum CASCADE;
DROP TYPE IF EXISTS statut_reservation_enum CASCADE;
DROP TYPE IF EXISTS mode_paiement_enum CASCADE;

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE role_enum AS ENUM ('CLIENT', 'HOTE');

CREATE TYPE statut_reservation_enum AS ENUM ('EN_ATTENTE', 'CONFIRMEE', 'ANNULEE', 'TERMINEE');

CREATE TYPE mode_paiement_enum AS ENUM ('CARTE', 'MOBILE_MONEY', 'ESPECES');

-- ============================================
-- TABLE PERSONNES (Client + Hôte)
-- ============================================

CREATE TABLE personnes (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    mot_de_passe VARCHAR(255) NOT NULL,
    role role_enum NOT NULL,
    raison_sociale VARCHAR(255),         -- spécifique Hôte
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- TABLE ANNONCES
-- ============================================

CREATE TABLE annonces (
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

-- ============================================
-- TABLE IMAGES DES ANNONCES
-- ============================================

CREATE TABLE annonce_images (
    id SERIAL PRIMARY KEY,
    annonce_id INT NOT NULL REFERENCES annonces(id) ON DELETE CASCADE,
    url VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- TABLE RESERVATIONS
-- ============================================

CREATE TABLE reservations (
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

-- ============================================
-- TABLE PAIEMENTS
-- ============================================

CREATE TABLE paiements (
    id SERIAL PRIMARY KEY,
    reservation_id INT UNIQUE NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    montant DECIMAL(10,2) NOT NULL,
    mode_paiement mode_paiement_enum NOT NULL,
    date_paiement TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- TABLE AVIS
-- ============================================

CREATE TABLE avis (
    id SERIAL PRIMARY KEY,
    client_id INT NOT NULL REFERENCES personnes(id) ON DELETE CASCADE,
    annonce_id INT NOT NULL REFERENCES annonces(id) ON DELETE CASCADE,
    reservation_id INT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    note INT NOT NULL CHECK (note >= 1 AND note <= 5),
    commentaire TEXT,
    date_avis TIMESTAMP DEFAULT NOW(),
    UNIQUE(client_id, reservation_id)   -- un avis par réservation
);

-- ============================================
-- INDEX
-- ============================================

CREATE INDEX idx_annonces_hote ON annonces(hote_id);
CREATE INDEX idx_annonces_ville ON annonces(ville);
CREATE INDEX idx_reservations_client ON reservations(client_id);
CREATE INDEX idx_reservations_annonce ON reservations(annonce_id);
CREATE INDEX idx_avis_annonce ON avis(annonce_id);

-- ============================================
-- DONNÉES DE TEST
-- ============================================

-- Hôte de test (mot de passe: password123)
INSERT INTO personnes (email, nom, prenom, mot_de_passe, role, raison_sociale)
VALUES ('hote@test.com', 'Dupont', 'Jean', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'HOTE', 'Résidences Dupont');

-- Client de test (mot de passe: password123)
INSERT INTO personnes (email, nom, prenom, mot_de_passe, role)
VALUES ('client@test.com', 'Martin', 'Sophie', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'CLIENT');

COMMIT;
