const pool = require('../config/db');

// ============================================
// LISTER LES TYPES DE CHAMBRE (Public) — T1
// Liste fixe seedée dans initDB. Alimente le sélecteur de type
// à la publication d'une annonce et les filtres de recherche.
// ============================================
const getTypesChambre = async (req, res) => {
  try {
    const result = await pool.query('SELECT id, code, nom FROM types_chambre ORDER BY id ASC');
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('Erreur liste types de chambre:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { getTypesChambre };
