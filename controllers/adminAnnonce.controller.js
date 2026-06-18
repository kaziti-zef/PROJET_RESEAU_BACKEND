const pool = require('../config/db');

// ============================================
// LISTER TOUTES LES ANNONCES (Admin)
// Sans filtre de statut ni de propriétaire, contrairement à
// la route publique GET /api/annonces.
// ============================================
const getAnnoncesAdmin = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, p.nom AS hote_nom, p.prenom AS hote_prenom, p.email AS hote_email,
              COALESCE(AVG(av.note), 0) AS note_moyenne,
              COUNT(DISTINCT av.id) AS nb_avis
       FROM annonces a
       JOIN utilisateurs p ON a.hote_id = p.id
       LEFT JOIN evaluations av ON a.id = av.annonce_id
       GROUP BY a.id, p.nom, p.prenom, p.email
       ORDER BY a.datePublication DESC`
    );
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('Erreur liste annonces admin:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ============================================
// SUPPRIMER UNE ANNONCE (Admin)
// Pas de vérification de propriétaire (contrairement à
// supprimerAnnonce de annonce.controller.js réservé à l'hôte).
// ============================================
const supprimerAnnonceAdmin = async (req, res) => {
  const { id } = req.params;

  try {
    const check = await pool.query('SELECT id FROM annonces WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ message: 'Annonce introuvable' });
    }

    await pool.query('DELETE FROM annonces WHERE id = $1', [id]);

    return res.status(200).json({ message: 'Annonce supprimée par un administrateur' });
  } catch (err) {
    console.error('Erreur suppression annonce admin:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { getAnnoncesAdmin, supprimerAnnonceAdmin };