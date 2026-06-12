const pool = require('../config/db');

// ============================================
// CRÉER UNE RÉSERVATION (Client)
// ============================================
const creerReservation = async (req, res) => {
  const { annonce_id, date_debut, date_fin, nb_personnes } = req.body;
  const client_id = req.user.id;

  if (!annonce_id || !date_debut || !date_fin || !nb_personnes) {
    return res.status(400).json({ message: 'Tous les champs sont obligatoires' });
  }

  if (new Date(date_fin) <= new Date(date_debut)) {
    return res.status(400).json({ message: 'La date de fin doit être après la date de début' });
  }

  try {
    // Vérifier que l'annonce existe et est disponible
    const annonce = await pool.query(
      'SELECT * FROM annonces WHERE id = $1 AND disponible = true',
      [annonce_id]
    );
    if (annonce.rows.length === 0) {
      return res.status(404).json({ message: 'Annonce introuvable ou indisponible' });
    }

    // Vérifier capacité
    if (nb_personnes > annonce.rows[0].capacite) {
      return res.status(400).json({
        message: `La chambre accepte maximum ${annonce.rows[0].capacite} personne(s)`,
      });
    }

    // Vérifier qu'il n'y a pas de conflit de dates
    const conflit = await pool.query(
      `SELECT id FROM reservations
       WHERE annonce_id = $1
       AND statut NOT IN ('ANNULEE')
       AND (date_debut, date_fin) OVERLAPS ($2::date, $3::date)`,
      [annonce_id, date_debut, date_fin]
    );
    if (conflit.rows.length > 0) {
      return res.status(409).json({ message: 'La chambre est déjà réservée pour ces dates' });
    }

    // Vérifier que le client ne réserve pas sa propre annonce
    if (annonce.rows[0].hote_id === client_id) {
      return res.status(400).json({ message: 'Vous ne pouvez pas réserver votre propre chambre' });
    }

    const result = await pool.query(
      `INSERT INTO reservations (client_id, annonce_id, date_debut, date_fin, nb_personnes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [client_id, annonce_id, date_debut, date_fin, nb_personnes]
    );

    const reservation = result.rows[0];

    // Émettre socket event — notifier le hôte
    const io = req.app.get('io');
    if (io) {
      io.to(`hote_${annonce.rows[0].hote_id}`).emit('nouvelle_reservation', {
        message: 'Nouvelle réservation reçue !',
        reservation,
      });
    }

    return res.status(201).json({
      message: 'Réservation créée, en attente de confirmation',
      reservation,
    });
  } catch (err) {
    console.error('Erreur création réservation:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ============================================
// MES RÉSERVATIONS (Client)
// ============================================
const getMesReservations = async (req, res) => {
  const client_id = req.user.id;

  try {
    const result = await pool.query(
      `SELECT r.*,
              a.titre AS annonce_titre,
              a.ville,
              a.quartier,
              a.prix,
              p.nom AS hote_nom,
              p.prenom AS hote_prenom,
              ARRAY_AGG(ai.url) FILTER (WHERE ai.url IS NOT NULL) AS images
       FROM reservations r
       JOIN annonces a ON r.annonce_id = a.id
       JOIN personnes p ON a.hote_id = p.id
       LEFT JOIN annonce_images ai ON a.id = ai.annonce_id
       WHERE r.client_id = $1
       GROUP BY r.id, a.titre, a.ville, a.quartier, a.prix, p.nom, p.prenom
       ORDER BY r.created_at DESC`,
      [client_id]
    );

    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('Erreur mes réservations:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ============================================
// RÉSERVATIONS DE L'HÔTE (pour ses annonces)
// ============================================
const getReservationsHote = async (req, res) => {
  const hote_id = req.user.id;

  try {
    const result = await pool.query(
      `SELECT r.*,
              a.titre AS annonce_titre,
              a.ville,
              a.prix,
              p.nom AS client_nom,
              p.prenom AS client_prenom,
              p.email AS client_email
       FROM reservations r
       JOIN annonces a ON r.annonce_id = a.id
       JOIN personnes p ON r.client_id = p.id
       WHERE a.hote_id = $1
       ORDER BY r.created_at DESC`,
      [hote_id]
    );

    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('Erreur réservations hôte:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ============================================
// CONFIRMER UNE RÉSERVATION (Hôte)
// ============================================
const confirmerReservation = async (req, res) => {
  const { id } = req.params;
  const hote_id = req.user.id;

  try {
    // Vérifier que la réservation concerne bien une annonce de cet hôte
    const check = await pool.query(
      `SELECT r.*, a.hote_id FROM reservations r
       JOIN annonces a ON r.annonce_id = a.id
       WHERE r.id = $1 AND a.hote_id = $2`,
      [id, hote_id]
    );

    if (check.rows.length === 0) {
      return res.status(403).json({ message: 'Réservation introuvable ou non autorisé' });
    }

    if (check.rows[0].statut !== 'EN_ATTENTE') {
      return res.status(400).json({ message: 'Seules les réservations EN_ATTENTE peuvent être confirmées' });
    }

    const result = await pool.query(
      `UPDATE reservations SET statut = 'CONFIRMEE', updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id]
    );

    const reservation = result.rows[0];

    // Notifier le client via socket
    const io = req.app.get('io');
    if (io) {
      io.to(`client_${reservation.client_id}`).emit('reservation_confirmee', {
        message: 'Votre réservation a été confirmée !',
        reservation,
      });
    }

    return res.status(200).json({
      message: 'Réservation confirmée',
      reservation,
    });
  } catch (err) {
    console.error('Erreur confirmation réservation:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ============================================
// ANNULER UNE RÉSERVATION (Client ou Hôte)
// ============================================
const annulerReservation = async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  try {
    let check;
    if (user.role === 'CLIENT') {
      check = await pool.query(
        'SELECT * FROM reservations WHERE id = $1 AND client_id = $2',
        [id, user.id]
      );
    } else {
      check = await pool.query(
        `SELECT r.* FROM reservations r
         JOIN annonces a ON r.annonce_id = a.id
         WHERE r.id = $1 AND a.hote_id = $2`,
        [id, user.id]
      );
    }

    if (check.rows.length === 0) {
      return res.status(403).json({ message: 'Réservation introuvable ou non autorisé' });
    }

    const reservation = check.rows[0];

    if (reservation.statut === 'ANNULEE') {
      return res.status(400).json({ message: 'Réservation déjà annulée' });
    }

    if (reservation.statut === 'TERMINEE') {
      return res.status(400).json({ message: 'Impossible d\'annuler une réservation terminée' });
    }

    const result = await pool.query(
      `UPDATE reservations SET statut = 'ANNULEE', updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id]
    );

    // Notifier l'autre partie via socket
    const io = req.app.get('io');
    if (io) {
      const notifyId = user.role === 'CLIENT' ? `hote_` : `client_`;
      const notifyUserId = user.role === 'CLIENT' ? reservation.annonce_hote_id : reservation.client_id;
      io.to(`${notifyId}${notifyUserId}`).emit('reservation_annulee', {
        message: 'Une réservation a été annulée',
        reservation: result.rows[0],
      });
    }

    return res.status(200).json({
      message: 'Réservation annulée',
      reservation: result.rows[0],
    });
  } catch (err) {
    console.error('Erreur annulation réservation:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  creerReservation,
  getMesReservations,
  getReservationsHote,
  confirmerReservation,
  annulerReservation,
};
