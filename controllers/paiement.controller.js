const pool = require('../config/db');

// ============================================
// EFFECTUER UN PAIEMENT (Client)
// Le paiement confirme automatiquement la réservation
// ============================================
const effectuerPaiement = async (req, res) => {
  const { reservation_id, mode_paiement } = req.body;
  const client_id = req.user.id;

  if (!reservation_id || !mode_paiement) {
    return res.status(400).json({ message: 'reservation_id et mode_paiement sont obligatoires' });
  }

  const modesValides = ['CARTE', 'MOBILE_MONEY', 'ESPECES'];
  if (!modesValides.includes(mode_paiement)) {
    return res.status(400).json({ message: `Mode invalide. Choisir : ${modesValides.join(', ')}` });
  }

  try {
    // Vérifier que la réservation appartient au client et est EN_ATTENTE
    const reservation = await pool.query(
      `SELECT r.*, a.prixParNuit, a.hote_id,
              (EXTRACT(DAY FROM r.dateFin::timestamp - r.dateDebut::timestamp)) AS nb_nuits
       FROM reservations r
       JOIN annonces a ON r.annonce_id = a.id
       WHERE r.idReservation = $1 AND r.client_id = $2`,
      [reservation_id, client_id]
    );

    if (reservation.rows.length === 0) {
      return res.status(404).json({ message: 'Réservation introuvable' });
    }

    const resa = reservation.rows[0];

    if (resa.statut === 'REFUSEE') {
      return res.status(400).json({ message: 'Cette réservation a été refusée par l\'hôte' });
    }

    if (resa.statut === 'ANNULEE') {
      return res.status(400).json({ message: 'Cette réservation est annulée' });
    }

    if (resa.statut !== 'EN_ATTENTE') {
      return res.status(400).json({ message: 'Cette réservation a déjà été payée' });
    }

    // Vérifier qu'il n'y a pas déjà un paiement
    const paiementExistant = await pool.query(
      'SELECT id FROM paiements WHERE reservation_id = $1',
      [reservation_id]
    );
    if (paiementExistant.rows.length > 0) {
      return res.status(409).json({ message: 'Cette réservation a déjà été payée' });
    }

    // Calculer montant
    const nbNuits = Math.max(1, parseInt(resa.nb_nuits));
    const montant = parseFloat(resa.montanttotal);

    // Enregistrer le paiement
    const paiement = await pool.query(
      `INSERT INTO paiements (reservation_id, montant, mode_paiement)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [reservation_id, montant, mode_paiement]
    );

    // Confirmer automatiquement la réservation via le paiement
    await pool.query(
      `UPDATE reservations SET statut = 'CONFIRMEE'
       WHERE idReservation = $1`,
      [reservation_id]
    );

    // Notifier l'hôte via socket
    const io = req.app.get('io');
    if (io) {
      io.to(`hote_${resa.hote_id}`).emit('reservation_confirmee', {
        message: 'Une réservation vient d\'être payée et confirmée !',
        reservation_id,
        montant,
      });
    }

    return res.status(201).json({
      message: 'Paiement effectué. Réservation confirmée automatiquement.',
      paiement: paiement.rows[0],
      details: {
        nb_nuits: nbNuits,
        prixParNuit: resa.prixparnuit,
        montantTotal: montant,
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
      `SELECT p.*, r.dateDebut, r.dateFin, r.statut AS statut_reservation,
              a.titre AS annonce_titre, a.prixParNuit AS prix_nuit
       FROM paiements p
       JOIN reservations r ON p.reservation_id = r.idReservation
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
