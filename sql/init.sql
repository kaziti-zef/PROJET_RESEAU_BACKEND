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

