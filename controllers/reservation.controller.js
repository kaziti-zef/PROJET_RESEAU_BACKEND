const pool = require('../config/db');

// ============================================
// HELPER — Transition automatique CONFIRMEE → TERMINEE
// Une réservation payée dont la date de fin est passée devient TERMINEE.
// Indispensable pour autoriser le dépôt d'avis (RG15).
// ============================================
const marquerReservationsTerminees = async () => {
  await pool.query(
    `UPDATE reservations SET statut = 'TERMINEE'
     WHERE statut = 'CONFIRMEE' AND dateFin < CURRENT_DATE`
  );
};

// ============================================
// CRÉER UNE RÉSERVATION (Client)
// ============================================
const creerReservation = async (req, res) => {
  const { annonce_id, dateDebut, dateFin, nombrePersonnes } = req.body;
  const client_id = req.user.id;

  if (!annonce_id || !dateDebut || !dateFin || !nombrePersonnes) {
    return res.status(400).json({ message: 'Tous les champs sont obligatoires' });
  }

  if (new Date(dateFin) <= new Date(dateDebut)) {
    return res.status(400).json({ message: 'La date de fin doit être après la date de début' });
  }

  if (Number(nombrePersonnes) < 1) {
    return res.status(400).json({ message: 'Le nombre de personnes doit être au moins 1' });
  }

  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  if (new Date(dateDebut) < aujourdhui) {
    return res.status(400).json({ message: "La date d'arrivée ne peut pas être dans le passé" });
  }

  try {
    const annonce = await pool.query(
      "SELECT * FROM annonces WHERE id = $1 AND statut = 'DISPONIBLE'",
      [annonce_id]
    );
    if (annonce.rows.length === 0) {
      return res.status(404).json({ message: 'Annonce introuvable ou indisponible' });
    }

    if (nombrePersonnes > annonce.rows[0].capacite) {
      return res.status(400).json({
        message: `La chambre accepte maximum ${annonce.rows[0].capacite} personne(s)`,
      });
    }

    if (annonce.rows[0].hote_id === client_id) {
      return res.status(400).json({ message: 'Vous ne pouvez pas réserver votre propre chambre' });
    }

    // Conflit de dates — exclure annulées et refusées
    const conflit = await pool.query(
      `SELECT idReservation FROM reservations
       WHERE annonce_id = $1
       AND statut NOT IN ('ANNULEE', 'REFUSEE')
       AND (dateDebut, dateFin) OVERLAPS ($2::date, $3::date)`,
      [annonce_id, dateDebut, dateFin]
    );
    if (conflit.rows.length > 0) {
      return res.status(409).json({ message: 'La chambre est déjà réservée pour ces dates' });
    }

    const diffTime = Math.abs(new Date(dateFin) - new Date(dateDebut));
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const montantTotal = diffDays * annonce.rows[0].prixparnuit;

    const result = await pool.query(
      `INSERT INTO reservations (client_id, annonce_id, dateDebut, dateFin, nombrePersonnes, montantTotal)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [client_id, annonce_id, dateDebut, dateFin, nombrePersonnes, montantTotal]
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
    await marquerReservationsTerminees();
    const result = await pool.query(
      `SELECT r.*,
              a.titre AS annonce_titre, a.ville, a.quartier, a.prixParNuit,
              p.nom AS hote_nom, p.prenom AS hote_prenom,
              ARRAY_AGG(ai.url) FILTER (WHERE ai.url IS NOT NULL) AS images
       FROM reservations r
       JOIN annonces a ON r.annonce_id = a.id
       JOIN utilisateurs p ON a.hote_id = p.id
       LEFT JOIN annonce_images ai ON a.id = ai.annonce_id
       WHERE r.client_id = $1
       GROUP BY r.idReservation, a.titre, a.ville, a.quartier, a.prixParNuit, p.nom, p.prenom
       ORDER BY r.idReservation DESC`,
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
      'SELECT * FROM reservations WHERE idReservation = $1 AND client_id = $2',
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
    const dateDebut   = req.body.dateDebut   || resa.datedebut;
    const dateFin     = req.body.dateFin     || resa.datefin;
    const nombrePersonnes = req.body.nombrePersonnes || resa.nombrepersonnes;

    if (new Date(dateFin) <= new Date(dateDebut)) {
      return res.status(400).json({ message: 'La date de fin doit être après la date de début' });
    }

    // Vérifier capacité
    const annonce = await pool.query('SELECT capacite, prixParNuit FROM annonces WHERE id = $1', [resa.annonce_id]);
    if (nombrePersonnes > annonce.rows[0].capacite) {
      return res.status(400).json({
        message: `La chambre accepte maximum ${annonce.rows[0].capacite} personne(s)`,
      });
    }

    // Vérifier conflit de dates (en excluant la réservation actuelle)
    const conflit = await pool.query(
      `SELECT idReservation FROM reservations
       WHERE annonce_id = $1
       AND idReservation != $2
       AND statut NOT IN ('ANNULEE', 'REFUSEE')
       AND (dateDebut, dateFin) OVERLAPS ($3::date, $4::date)`,
      [resa.annonce_id, id, dateDebut, dateFin]
    );
    if (conflit.rows.length > 0) {
      return res.status(409).json({ message: 'La chambre est déjà réservée pour ces dates' });
    }

    const diffTime = Math.abs(new Date(dateFin) - new Date(dateDebut));
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const montantTotal = diffDays * annonce.rows[0].prixparnuit;

    const result = await pool.query(
      `UPDATE reservations
       SET dateDebut = $1, dateFin = $2, nombrePersonnes = $3, montantTotal = $4
       WHERE idReservation = $5
       RETURNING *`,
      [dateDebut, dateFin, nombrePersonnes, montantTotal, id]
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
    await marquerReservationsTerminees();
    const result = await pool.query(
      `SELECT r.*,
              a.titre AS annonce_titre, a.ville, a.prixParNuit,
              p.nom AS client_nom, p.prenom AS client_prenom, p.email AS client_email
       FROM reservations r
       JOIN annonces a ON r.annonce_id = a.id
       JOIN utilisateurs p ON r.client_id = p.id
       WHERE a.hote_id = $1
       ORDER BY r.idReservation DESC`,
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
       WHERE r.idReservation = $1 AND a.hote_id = $2`,
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
      `UPDATE reservations SET statut = 'REFUSEE'
       WHERE idReservation = $1 RETURNING *`,
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
  const role = user.role || user.typeCompte;

  try {
    let check;
    if (role === 'CLIENT') {
      check = await pool.query(
        'SELECT * FROM reservations WHERE idReservation = $1 AND client_id = $2',
        [id, user.id]
      );
    } else {
      check = await pool.query(
        `SELECT r.* FROM reservations r
         JOIN annonces a ON r.annonce_id = a.id
         WHERE r.idReservation = $1 AND a.hote_id = $2`,
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
      `UPDATE reservations SET statut = 'ANNULEE'
       WHERE idReservation = $1 RETURNING *`,
      [id]
    );

    // Notifier l'autre partie
    const io = req.app.get('io');
    if (io) {
      if (role === 'CLIENT') {
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
  marquerReservationsTerminees,
};
