const pool = require('../config/db');
const { marquerReservationsTerminees } = require('./reservation.controller');

// ============================================
// LAISSER UN AVIS (Client — après réservation terminée)
// ============================================
const laisserAvis = async (req, res) => {
  const { reservation_id, note, commentaire } = req.body;
  const client_id = req.user.id;

  if (!reservation_id || !note) {
    return res.status(400).json({ message: 'reservation_id et note sont obligatoires' });
  }

  if (note < 1 || note > 5) {
    return res.status(400).json({ message: 'La note doit être entre 1 et 5' });
  }

  try {
    // Mettre à jour les statuts (réservations passées → TERMINEE) avant vérification
    await marquerReservationsTerminees();

    // Vérifier que la réservation appartient au client
    const reservation = await pool.query(
      `SELECT r.*, a.id AS annonce_id FROM reservations r
       JOIN annonces a ON r.annonce_id = a.id
       WHERE r.idReservation = $1 AND r.client_id = $2`,
      [reservation_id, client_id]
    );

    if (reservation.rows.length === 0) {
      return res.status(404).json({ message: 'Réservation introuvable' });
    }

    const resa = reservation.rows[0];

    // Vérifier que le séjour a réellement eu lieu (ou est en cours) :
    // - TERMINEE : toujours autorisé (le séjour est passé)
    // - CONFIRMEE : autorisé seulement si au moins 50% de la durée du séjour est écoulée
    // - EN_ATTENTE / ANNULEE / REFUSEE : jamais autorisé
    if (resa.statut !== 'TERMINEE' && resa.statut !== 'CONFIRMEE') {
      return res.status(400).json({
        message: 'Vous ne pouvez laisser un avis que pour une réservation confirmée ou terminée',
      });
    }

    if (resa.statut === 'CONFIRMEE') {
      const dateDebut = new Date(resa.datedebut);
      const dateFin = new Date(resa.datefin);
      const dureeMs = dateFin.getTime() - dateDebut.getTime();
      const dateMiDuree = new Date(dateDebut.getTime() + dureeMs / 2);

      if (new Date() < dateMiDuree) {
        return res.status(400).json({
          message: 'Vous pourrez laisser un avis à partir de la moitié de la durée de votre séjour',
          date_a_partir_de: dateMiDuree.toISOString(),
        });
      }
    }

    // Vérifier qu'un avis n'existe pas déjà pour cette réservation
    const avisExistant = await pool.query(
      'SELECT id FROM evaluations WHERE reservation_id = $1',
      [reservation_id]
    );
    if (avisExistant.rows.length > 0) {
      return res.status(409).json({ message: 'Vous avez déjà laissé un avis pour cette réservation' });
    }

    const result = await pool.query(
      `INSERT INTO evaluations (client_id, annonce_id, reservation_id, note, commentaire)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [client_id, resa.annonce_id, reservation_id, note, commentaire || null]
    );

    return res.status(201).json({
      message: 'Avis publié avec succès',
      avis: result.rows[0],
    });
  } catch (err) {
    console.error('Erreur avis:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ============================================
// AVIS D'UNE ANNONCE (Public)
// ============================================
const getAvisAnnonce = async (req, res) => {
  const { annonce_id } = req.params;

  try {
    const result = await pool.query(
      `SELECT av.*, p.nom AS client_nom, p.prenom AS client_prenom
       FROM evaluations av
       JOIN utilisateurs p ON av.client_id = p.id
       WHERE av.annonce_id = $1
       ORDER BY av.dateEvaluation DESC`,
      [annonce_id]
    );

    // Calculer la note moyenne
    const moyenne = result.rows.length > 0
      ? result.rows.reduce((sum, a) => sum + a.note, 0) / result.rows.length
      : 0;

    return res.status(200).json({
      avis: result.rows,
      note_moyenne: parseFloat(moyenne.toFixed(1)),
      nb_avis: result.rows.length,
    });
  } catch (err) {
    console.error('Erreur avis annonce:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ============================================
// MES AVIS (Client)
// ============================================
const getMesAvis = async (req, res) => {
  const client_id = req.user.id;

  try {
    const result = await pool.query(
      `SELECT av.*, a.titre AS annonce_titre, a.ville
       FROM evaluations av
       JOIN annonces a ON av.annonce_id = a.id
       WHERE av.client_id = $1
       ORDER BY av.dateEvaluation DESC`,
      [client_id]
    );

    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('Erreur mes avis:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ============================================
// PEUT-ON NOTER CETTE RÉSERVATION ? (Client)
// Expose la même règle que laisserAvis, sans créer l'avis :
// permet au frontend d'afficher ou non le formulaire de notation.
// ============================================
const peutNoter = async (req, res) => {
  const { id } = req.params; // id de la réservation
  const client_id = req.user.id;

  try {
    await marquerReservationsTerminees();

    const reservation = await pool.query(
      `SELECT r.*, a.id AS annonce_id FROM reservations r
       JOIN annonces a ON r.annonce_id = a.id
       WHERE r.idReservation = $1 AND r.client_id = $2`,
      [id, client_id]
    );

    if (reservation.rows.length === 0) {
      return res.status(404).json({ message: 'Réservation introuvable', peut_noter: false });
    }

    const resa = reservation.rows[0];

    const avisExistant = await pool.query(
      'SELECT id FROM evaluations WHERE reservation_id = $1',
      [id]
    );
    if (avisExistant.rows.length > 0) {
      return res.status(200).json({ peut_noter: false, raison: 'AVIS_DEJA_LAISSE' });
    }

    if (resa.statut === 'TERMINEE') {
      return res.status(200).json({ peut_noter: true });
    }

    if (resa.statut !== 'CONFIRMEE') {
      return res.status(200).json({ peut_noter: false, raison: 'RESERVATION_NON_CONFIRMEE' });
    }

    const dateDebut = new Date(resa.datedebut);
    const dateFin = new Date(resa.datefin);
    const dureeMs = dateFin.getTime() - dateDebut.getTime();
    const dateMiDuree = new Date(dateDebut.getTime() + dureeMs / 2);

    if (new Date() < dateMiDuree) {
      return res.status(200).json({
        peut_noter: false,
        raison: 'MI_DUREE_NON_ATTEINTE',
        date_a_partir_de: dateMiDuree.toISOString(),
      });
    }

    return res.status(200).json({ peut_noter: true });
  } catch (err) {
    console.error('Erreur peutNoter:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { laisserAvis, getAvisAnnonce, getMesAvis, peutNoter };