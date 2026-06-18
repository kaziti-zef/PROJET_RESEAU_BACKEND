-- ============================================
-- ROOM RENTING DB - Script d'initialisation
-- ============================================

-- Suppression dans l'ordre inverse des dépendances
DROP TABLE IF EXISTS evaluations CASCADE;
DROP TABLE IF EXISTS paiements CASCADE;
DROP TABLE IF EXISTS compte_paiement CASCADE;
DROP TABLE IF EXISTS reservations CASCADE;
DROP TABLE IF EXISTS annonce_images CASCADE;
DROP TABLE IF EXISTS annonces CASCADE;
DROP TABLE IF EXISTS utilisateurs CASCADE;
DROP TYPE IF EXISTS typecompte_enum CASCADE;
DROP TYPE IF EXISTS typestatutr_enum CASCADE;
DROP TYPE IF EXISTS typestatuta_enum CASCADE;

-- Création des ENUMS
CREATE TYPE typecompte_enum AS ENUM ('CLIENT', 'HOTE', 'ADMINISTRATEUR');
CREATE TYPE typestatutr_enum AS ENUM ('EN_ATTENTE', 'CONFIRMEE', 'ANNULEE', 'TERMINEE');
CREATE TYPE typestatuta_enum AS ENUM ('DISPONIBLE', 'OCCUPEE', 'EN_RENOVATION', 'SUSPENDUE');

-- 1. Table Utilisateur
CREATE TABLE utilisateurs (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  nom VARCHAR(100) NOT NULL,
  prenom VARCHAR(100) NOT NULL,
  motDePasse VARCHAR(255) NOT NULL,
  typeCompte typecompte_enum NOT NULL,
  dateVerification TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Table ComptePaiement
CREATE TABLE compte_paiement (
  IdComptePaiement SERIAL PRIMARY KEY,
  utilisateur_id INT REFERENCES utilisateurs(id) ON DELETE CASCADE,
  Fournisseur VARCHAR(100) NOT NULL,
  Identifiant VARCHAR(255) NOT NULL
);

-- 3. Table Annonce
CREATE TABLE annonces (
  id SERIAL PRIMARY KEY,
  hote_id INT REFERENCES utilisateurs(id) ON DELETE CASCADE,
  titre VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  prixParNuit DECIMAL(10,2) NOT NULL,
  capacite INT NOT NULL,
  adresse VARCHAR(255) NOT NULL,
  ville VARCHAR(100) NOT NULL,
  quartier VARCHAR(100),
  datePublication TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  statut typestatuta_enum DEFAULT 'DISPONIBLE'
);

CREATE TABLE annonce_images (
  id SERIAL PRIMARY KEY,
  annonce_id INT REFERENCES annonces(id) ON DELETE CASCADE,
  url VARCHAR(500) NOT NULL
);

-- 4. Table Reservation
CREATE TABLE reservations (
  idReservation SERIAL PRIMARY KEY,
  client_id INT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  annonce_id INT REFERENCES annonces(id) ON DELETE CASCADE,
  dateDebut DATE NOT NULL,
  dateFin DATE NOT NULL,
  statut typestatutr_enum DEFAULT 'EN_ATTENTE',
  nombrePersonnes INT NOT NULL,
  montantTotal DECIMAL(10,2) NOT NULL
);

-- 5. Table Paiement
CREATE TABLE paiements (
  id SERIAL PRIMARY KEY,
  reservation_id INT REFERENCES reservations(idReservation) ON DELETE CASCADE,
  datePaiement TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  montant DECIMAL(10,2) NOT NULL,
  modePaiement VARCHAR(100) NOT NULL,
  transaction_id VARCHAR(255)
);

-- 6. Table Evaluation
CREATE TABLE evaluations (
  id SERIAL PRIMARY KEY,
  reservation_id INT REFERENCES reservations(idReservation) ON DELETE CASCADE,
  annonce_id INT REFERENCES annonces(id) ON DELETE CASCADE,
  client_id INT REFERENCES utilisateurs(id) ON DELETE CASCADE,
  note INT CHECK (note >= 1 AND note <= 5),
  commentaire TEXT,
  dateEvaluation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);