const pool = require('../config/db');

// ============================================
// LISTER LES ÉQUIPEMENTS DISPONIBLES (Public) — R1
// Liste fixe seedée dans initDB. Sert à alimenter les
// cases à cocher du formulaire de publication d'annonce.
// ============================================
const getEquipements = async (req, res) => {
  try {
    const result = await pool.query('SELECT id, code, nom FROM equipements ORDER BY id ASC');
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('Erreur liste équipements:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { getEquipements };
