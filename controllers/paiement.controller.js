const pool = require('../config/db');

// ============================================
// EFFECTUER UN PAIEMENT (Client)
// ============================================
const effectuerPaiement = async (req, res) => {
  const { reservation_id, mode_paiement } = req.body;
  const client_id = req.user.id;

  if (!reservation_id || !mode_paiement) {
    return res.status(400).json({ message: 'reservation_id et mode_paiement sont obligatoires' });
  }

  const modesValides = ['CARTE', 'MOBILE_MONEY', 'ESPECES'];
  if (!modesValides.includes(mode_paiement)) {
    return res.status(400).json({ message: `Mode de paiement invalide. Choisir : ${modesValides.join(', ')}` });
  }

  try {
    // Vérifier que la réservation appartient au client et est confirmée
    const reservation = await pool.query(
      `SELECT r.*, a.prix,
              (EXTRACT(DAY FROM r.date_fin::timestamp - r.date_debut::timestamp)) AS nb_nuits
       FROM reservations r
       JOIN annonces a ON r.annonce_id = a.id
       WHERE r.id = $1 AND r.client_id = $2`,
      [reservation_id, client_id]
    );

    if (reservation.rows.length === 0) {
      return res.status(404).json({ message: 'Réservation introuvable' });
    }

    const resa = reservation.rows[0];

    if (resa.statut !== 'CONFIRMEE') {
      return res.status(400).json({ message: 'Le paiement n\'est possible que pour une réservation CONFIRMEE' });
    }

    // Vérifier qu'il n'y a pas déjà un paiement
    const paiementExistant = await pool.query(
      'SELECT id FROM paiements WHERE reservation_id = $1',
      [reservation_id]
    );
    if (paiementExistant.rows.length > 0) {
      return res.status(409).json({ message: 'Cette réservation a déjà été payée' });
    }

    // Calculer le montant total
    const nbNuits = Math.max(1, parseInt(resa.nb_nuits));
    const montant = nbNuits * parseFloat(resa.prix);

    const result = await pool.query(
      `INSERT INTO paiements (reservation_id, montant, mode_paiement)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [reservation_id, montant, mode_paiement]
    );

    return res.status(201).json({
      message: 'Paiement effectué avec succès',
      paiement: result.rows[0],
      details: {
        nb_nuits: nbNuits,
        prix_par_nuit: resa.prix,
        montant_total: montant,
      },
    });
  } catch (err) {
    console.error('Erreur paiement:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ============================================
// DÉTAIL PAIEMENT D'UNE RÉSERVATION
// ============================================
const getPaiement = async (req, res) => {
  const { reservation_id } = req.params;
  const user = req.user;

  try {
    const result = await pool.query(
      `SELECT p.*, r.date_debut, r.date_fin, r.statut AS statut_reservation,
              a.titre AS annonce_titre, a.prix AS prix_nuit
       FROM paiements p
       JOIN reservations r ON p.reservation_id = r.id
       JOIN annonces a ON r.annonce_id = a.id
       WHERE p.reservation_id = $1
       AND (r.client_id = $2 OR a.hote_id = $2)`,
      [reservation_id, user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Paiement introuvable' });
    }

    return res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('Erreur récupération paiement:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { effectuerPaiement, getPaiement };
