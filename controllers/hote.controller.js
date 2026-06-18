const pool = require('../config/db');

// ============================================
// RÉCAP DES GAINS DE L'HÔTE (O2)
// Brut encaissé, commission prélevée par la plateforme, net reversé.
// ============================================
const getGainsHote = async (req, res) => {
  const hote_id = req.user.id;

  try {
    // Totaux globaux
    const totaux = await pool.query(
      `SELECT
         COALESCE(SUM(pa.montant), 0)               AS total_brut,
         COALESCE(SUM(pa.commission_plateforme), 0) AS total_commission,
         COALESCE(SUM(pa.montant_hote), 0)          AS total_net,
         COUNT(pa.id)                               AS nb_paiements
       FROM paiements pa
       JOIN reservations r ON pa.reservation_id = r.idReservation
       JOIN annonces a ON r.annonce_id = a.id
       WHERE a.hote_id = $1`,
      [hote_id]
    );

    // Détail par annonce
    const parAnnonce = await pool.query(
      `SELECT a.id AS annonce_id, a.titre,
              COALESCE(SUM(pa.montant), 0)      AS brut,
              COALESCE(SUM(pa.montant_hote), 0) AS net,
              COUNT(pa.id)                      AS nb_paiements
       FROM annonces a
       LEFT JOIN reservations r ON r.annonce_id = a.id
       LEFT JOIN paiements pa ON pa.reservation_id = r.idReservation
       WHERE a.hote_id = $1
       GROUP BY a.id, a.titre
       ORDER BY net DESC`,
      [hote_id]
    );

    return res.status(200).json({
      ...totaux.rows[0],
      par_annonce: parAnnonce.rows,
    });
  } catch (err) {
    console.error('Erreur gains hôte:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { getGainsHote };
