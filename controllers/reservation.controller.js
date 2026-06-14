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
    const annonce = await pool.query(
      'SELECT * FROM annonces WHERE id = $1 AND disponible = true',
      [annonce_id]
    );
    if (annonce.rows.length === 0) {
      return res.status(404).json({ message: 'Annonce introuvable ou indisponible' });
    }

    if (nb_personnes > annonce.rows[0].capacite) {
      return res.status(400).json({
        message: `La chambre accepte maximum ${annonce.rows[0].capacite} personne(s)`,
      });
    }

    if (annonce.rows[0].hote_id === client_id) {
      return res.status(400).json({ message: 'Vous ne pouvez pas réserver votre propre chambre' });
    }

    // Conflit de dates — exclure annulées et refusées
    const conflit = await pool.query(
      `SELECT id FROM reservations
       WHERE annonce_id = $1
       AND statut NOT IN ('ANNULEE', 'REFUSEE')
       AND (date_debut, date_fin) OVERLAPS ($2::date, $3::date)`,
      [annonce_id, date_debut, date_fin]
    );
    if (conflit.rows.length > 0) {
      return res.status(409).json({ message: 'La chambre est déjà réservée pour ces dates' });
    }

    const result = await pool.query(
      `INSERT INTO reservations (client_id, annonce_id, date_debut, date_fin, nb_personnes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [client_id, annonce_id, date_debut, date_fin, nb_personnes]
    );

    const reservation = result.rows[0];

    // Notifier l'hôte
    const io = req.app.get('io');
    if (io) {
      io.to(`hote_${annonce.rows[0].hote_id}`).emit('nouvelle_reservation', {
        message: 'Nouvelle réservation reçue !',
        reservation,
      });
    }

    return res.status(201).json({
      message: 'Réservation créée. Procédez au paiement pour la confirmer.',
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
              a.titre AS annonce_titre, a.ville, a.quartier, a.prix,
              p.nom AS hote_nom, p.prenom AS hote_prenom,
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
// MODIFIER UNE RÉSERVATION (Client)
// Possible uniquement si statut = EN_ATTENTE
// ============================================
const modifierReservation = async (req, res) => {
  const { id } = req.params;
  const client_id = req.user.id;

  try {
    const actuelle = await pool.query(
      'SELECT * FROM reservations WHERE id = $1 AND client_id = $2',
      [id, client_id]
    );

    if (actuelle.rows.length === 0) {
      return res.status(404).json({ message: 'Réservation introuvable' });
    }

    const resa = actuelle.rows[0];

    if (resa.statut !== 'EN_ATTENTE') {
      return res.status(400).json({
        message: 'Seules les réservations EN_ATTENTE peuvent être modifiées',
      });
    }

    // Fusionner avec les valeurs actuelles
    const date_debut   = req.body.date_debut   || resa.date_debut;
    const date_fin     = req.body.date_fin     || resa.date_fin;
    const nb_personnes = req.body.nb_personnes || resa.nb_personnes;

    if (new Date(date_fin) <= new Date(date_debut)) {
      return res.status(400).json({ message: 'La date de fin doit être après la date de début' });
    }

    // Vérifier capacité
    const annonce = await pool.query('SELECT capacite FROM annonces WHERE id = $1', [resa.annonce_id]);
    if (nb_personnes > annonce.rows[0].capacite) {
      return res.status(400).json({
        message: `La chambre accepte maximum ${annonce.rows[0].capacite} personne(s)`,
      });
    }

    // Vérifier conflit de dates (en excluant la réservation actuelle)
    const conflit = await pool.query(
      `SELECT id FROM reservations
       WHERE annonce_id = $1
       AND id != $2
       AND statut NOT IN ('ANNULEE', 'REFUSEE')
       AND (date_debut, date_fin) OVERLAPS ($3::date, $4::date)`,
      [resa.annonce_id, id, date_debut, date_fin]
    );
    if (conflit.rows.length > 0) {
      return res.status(409).json({ message: 'La chambre est déjà réservée pour ces dates' });
    }

    const result = await pool.query(
      `UPDATE reservations
       SET date_debut = $1, date_fin = $2, nb_personnes = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [date_debut, date_fin, nb_personnes, id]
    );

    return res.status(200).json({
      message: 'Réservation modifiée avec succès',
      reservation: result.rows[0],
    });
  } catch (err) {
    console.error('Erreur modification réservation:', err);
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
              a.titre AS annonce_titre, a.ville, a.prix,
              p.nom AS client_nom, p.prenom AS client_prenom, p.email AS client_email
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
// REFUSER UNE RÉSERVATION (Hôte)
// Possible uniquement si EN_ATTENTE (pas encore payée)
// ============================================
const refuserReservation = async (req, res) => {
  const { id } = req.params;
  const hote_id = req.user.id;

  try {
    const check = await pool.query(
      `SELECT r.* FROM reservations r
       JOIN annonces a ON r.annonce_id = a.id
       WHERE r.id = $1 AND a.hote_id = $2`,
      [id, hote_id]
    );

    if (check.rows.length === 0) {
      return res.status(403).json({ message: 'Réservation introuvable ou non autorisé' });
    }

    const resa = check.rows[0];

    if (resa.statut !== 'EN_ATTENTE') {
      return res.status(400).json({
        message: 'Impossible de refuser : la réservation n\'est plus en attente',
      });
    }

    const result = await pool.query(
      `UPDATE reservations SET statut = 'REFUSEE', updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id]
    );

    // Notifier le client
    const io = req.app.get('io');
    if (io) {
      io.to(`client_${resa.client_id}`).emit('reservation_refusee', {
        message: 'Votre réservation a été refusée par l\'hôte',
        reservation: result.rows[0],
      });
    }

    return res.status(200).json({
      message: 'Réservation refusée',
      reservation: result.rows[0],
    });
  } catch (err) {
    console.error('Erreur refus réservation:', err);
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

    const resa = check.rows[0];

    if (['ANNULEE', 'TERMINEE', 'REFUSEE'].includes(resa.statut)) {
      return res.status(400).json({ message: `Impossible d'annuler une réservation ${resa.statut}` });
    }

    const result = await pool.query(
      `UPDATE reservations SET statut = 'ANNULEE', updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id]
    );

    // Notifier l'autre partie
    const io = req.app.get('io');
    if (io) {
      if (user.role === 'CLIENT') {
        // Récupérer hote_id via l'annonce
        const annonceInfo = await pool.query(
          'SELECT hote_id FROM annonces WHERE id = $1', [resa.annonce_id]
        );
        if (annonceInfo.rows.length > 0) {
          io.to(`hote_${annonceInfo.rows[0].hote_id}`).emit('reservation_annulee', {
            message: 'Un client a annulé sa réservation',
            reservation: result.rows[0],
          });
        }
      } else {
        io.to(`client_${resa.client_id}`).emit('reservation_annulee', {
          message: 'L\'hôte a annulé votre réservation',
          reservation: result.rows[0],
        });
      }
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
  modifierReservation,
  getReservationsHote,
  refuserReservation,
  annulerReservation,
};
