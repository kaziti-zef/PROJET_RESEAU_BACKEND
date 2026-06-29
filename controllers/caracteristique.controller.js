const pool = require('../config/db');

// ============================================
// LISTER LES CARACTÉRISTIQUES (Public) — C1
// Attributs intrinsèques du logement (bord de lac, douche privative…).
// Distinct des équipements fournis. Alimente les cases à cocher du
// formulaire de publication et sert de préférences au modèle de scoring.
// ============================================
const getCaracteristiques = async (req, res) => {
  try {
    const result = await pool.query('SELECT id, code, nom FROM caracteristiques ORDER BY id ASC');
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('Erreur liste caractéristiques:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { getCaracteristiques };
